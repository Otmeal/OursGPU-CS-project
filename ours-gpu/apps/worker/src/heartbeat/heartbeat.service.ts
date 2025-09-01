import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { randomUUID } from 'crypto';
import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Observable, firstValueFrom, Subscription } from 'rxjs';

// DTO types aligned with libs/shared/proto/worker.proto
type WorkerInfo = { id: string; orgId: string; concurrency: number };
type RegisterReply = { ok: boolean; note?: string };
type HeartbeatReq = { id: string; running: number };
type HeartbeatReply = { ok: boolean };
type PullJobReq = { id: string };
type Job = {
  jobId: string;
  jobType: string;
  objectKey: string;
  entryCommand?: string;
  verification: 'BUILTIN_HASH' | 'USER_PROGRAM';
  verifierObjectKey?: string;
  verifierCommand?: string;
  // Convenience URLs and output prefix from controller
  payloadUrl?: string;
  verifierUrl?: string;
  outputPrefix?: string;
};
type JobResult = { jobId: string; workerId: string; solution: string; success: boolean; metricsJson?: string };
type ReportReply = { ok: boolean };

// gRPC client service stub (methods are lowerCamelCase)
interface WorkerGrpcClient {
  register(data: WorkerInfo): Observable<RegisterReply>;
  heartbeat(data: HeartbeatReq): Observable<HeartbeatReply>;
  pullJob(data: PullJobReq): Observable<Job | undefined>;
  reportResult(data: JobResult): Observable<ReportReply>;
  presignOutput(data: { jobId: string; fileName: string; expiresSeconds?: number }): Observable<{ bucket: string; objectKey: string; putUrl: string; getUrl: string }>;
  jobStream(data: { id: string }): Observable<Job>;
}

@Injectable()
export class HeartbeatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HeartbeatService.name);
  private svc!: WorkerGrpcClient;
  private interval?: NodeJS.Timeout;
  private id = process.env.WORKER_ID ?? randomUUID();
  private registered = false;
  private destroyed = false;
  private regBackoffMs = Number.parseInt(process.env.REGISTER_BACKOFF_MS ?? '1000', 10);
  private streamBackoffMs = Number.parseInt(process.env.STREAM_BACKOFF_MS ?? '1000', 10);
  private maxBackoffMs = Number.parseInt(process.env.MAX_BACKOFF_MS ?? '30000', 10);
  private jobStreamSub?: Subscription;

  constructor(@Inject('GRPC_CLIENT') private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.svc = this.client.getService<WorkerGrpcClient>('WorkerService');
    const orgId = process.env.ORG_ID ?? 'org-1';
    const concurrency = Number.parseInt(process.env.CONCURRENCY ?? '1', 10);
    const heartbeatMs = Number.parseInt(process.env.HEARTBEAT_MS ?? '2000', 10);

    // Start register retry loop (non-blocking)
    this.registerLoop(orgId, concurrency);

    // Start heartbeat loop (no pulling)
    this.interval = setInterval(() => this.pulse(), heartbeatMs);

    // Subscribe to server-pushed jobs with automatic retry
    this.startJobStream();
  }

  onModuleDestroy() {
    this.destroyed = true;
    if (this.interval) clearInterval(this.interval);
    if (this.jobStreamSub) this.jobStreamSub.unsubscribe();
  }

  private async pulse() {
    try {
      const reply = await firstValueFrom(this.svc.heartbeat({ id: this.id, running: 0 }));
      if (!reply?.ok) {
        // Controller does not recognize us; re-register with backoff
        if (this.registered) this.logger.warn('Heartbeat not accepted; re-registering');
        this.registered = false;
        const orgId = process.env.ORG_ID ?? 'org-1';
        const concurrency = Number.parseInt(process.env.CONCURRENCY ?? '1', 10);
        this.regBackoffMs = Number.parseInt(process.env.REGISTER_BACKOFF_MS ?? '1000', 10);
        this.registerLoop(orgId, concurrency);
      }
    } catch (err) {
      this.logger.debug(`Pulse error: ${err?.message ?? err}`);
    }
  }

  private async registerLoop(orgId: string, concurrency: number) {
    while (!this.destroyed && !this.registered) {
      try {
        await firstValueFrom(this.svc.register({ id: this.id, orgId, concurrency }));
        this.registered = true;
        this.logger.log(`Registered worker ${this.id} (org=${orgId}, conc=${concurrency})`);
        break;
      } catch (err) {
        this.logger.warn(
          `Register failed: ${(err as any)?.message ?? err}. Retrying in ${this.regBackoffMs}ms`,
        );
        await this.delay(this.regBackoffMs);
        this.regBackoffMs = Math.min(this.maxBackoffMs, this.regBackoffMs * 2);
      }
    }
  }

  private startJobStream() {
    const subscribe = () => {
      if (this.destroyed) return;
      try {
        if (this.jobStreamSub) this.jobStreamSub.unsubscribe();
      } catch {}
      this.jobStreamSub = this.svc.jobStream({ id: this.id }).subscribe({
        next: (job) => {
          // reset backoff on activity
          this.streamBackoffMs = Number.parseInt(process.env.STREAM_BACKOFF_MS ?? '1000', 10);
          if (job?.jobId) {
            this.logger.debug(`Pushed job ${job.jobId} type=${job.jobType}`);
            this.executeJob(job).catch((err) => this.logger.warn(`executeJob error: ${err?.message ?? err}`));
          }
        },
        error: (err) => {
          this.logger.warn(
            `JobStream error: ${(err as any)?.message ?? err}. Reconnecting in ${this.streamBackoffMs}ms`,
          );
          setTimeout(() => {
            this.streamBackoffMs = Math.min(this.maxBackoffMs, this.streamBackoffMs * 2);
            subscribe();
          }, this.streamBackoffMs);
        },
        complete: () => {
          this.logger.warn('JobStream completed. Reconnecting...');
          setTimeout(() => subscribe(), this.streamBackoffMs);
        },
      });
    };
    subscribe();
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async executeJob(job: Job) {
    const start = Date.now();
    try {
      if (!job.entryCommand) {
        await firstValueFrom(
          this.svc.reportResult({ jobId: job.jobId, workerId: this.id, solution: 'noop', success: true, metricsJson: '{}' }),
        );
        return;
      }

      // Prepare working directory and fetch payload if available
      const workDir = await fs.mkdtemp(path.join(os.tmpdir(), `oursgpu-${job.jobId}-`));
      let payloadPath: string | undefined;
      if (job.payloadUrl) {
        const res = await fetch(job.payloadUrl);
        if (!res.ok) throw new Error(`payload download failed: ${res.status}`);
        const arrayBuf = await res.arrayBuffer();
        payloadPath = path.join(workDir, 'payload.bin');
        await fs.writeFile(payloadPath, Buffer.from(arrayBuf));
      }

      const env = {
        ...process.env,
        JOB_ID: job.jobId,
        PAYLOAD_PATH: payloadPath ?? '',
        WORK_DIR: workDir,
        OUTPUT_PREFIX: job.outputPrefix ?? '',
      } as NodeJS.ProcessEnv;

      // Execute the entry command using a shell so env vars can be expanded
      const cmd = job.entryCommand;
      const { stdout, stderr, code } = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve) => {
        exec(cmd, { env, cwd: workDir, shell: '/bin/sh' }, (error, stdout, stderr) => {
          const code = (error as any)?.code ?? 0;
          resolve({ stdout, stderr, code });
        });
      });

      const ms = Date.now() - start;
      const ok = code === 0;
      const metrics = { ms, stderr: stderr?.slice(0, 4096) };
      await firstValueFrom(
        this.svc.reportResult({ jobId: job.jobId, workerId: this.id, solution: stdout.trim(), success: ok, metricsJson: JSON.stringify(metrics) }),
      );
      this.logger.debug(`Executed job=${job.jobId} code=${code} ms=${ms}`);
    } catch (err) {
      const ms = Date.now() - start;
      const metrics = { error: (err as any)?.message ?? String(err), ms };
      await firstValueFrom(
        this.svc.reportResult({ jobId: job.jobId, workerId: this.id, solution: '', success: false, metricsJson: JSON.stringify(metrics) }),
      );
      this.logger.warn(`Job failed job=${job.jobId}: ${(err as any)?.message ?? err}`);
    }
  }
}
