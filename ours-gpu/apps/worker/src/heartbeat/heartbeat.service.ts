import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { randomUUID } from 'crypto';
import { exec } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Observable, firstValueFrom, Subscription } from 'rxjs';
import {
  ChainService,
  RegisterTypes,
  buildRegisterDomain,
  buildRegisterMessage,
  formatRegisterDebug,
} from '@ours-gpu/shared';

// DTO types aligned with libs/shared/proto/worker.proto
type WorkerInfo = {
  id: string;
  orgId: string;
  concurrency: number;
  wallet?: string;
  nonce?: string;
  expires?: number;
  signature?: string;
};
type RegisterReply = { ok: boolean; note?: string };
type HeartbeatReq = { id: string; running: number };
type HeartbeatReply = { ok: boolean };
type Job = {
  jobId: string;
  jobType: string;
  objectKey: string;
  entryCommand?: string;
  // Convenience URLs and output prefix from controller
  payloadUrl?: string;
  outputPrefix?: string;
  startAt?: number;
  killAt?: number;
};
type JobResult = {
  jobId: string;
  workerId: string;
  solution: string;
  success: boolean;
  metricsJson?: string;
  executionSeconds?: number;
  terminated?: boolean;
  endAt?: number;
  executedAt?: number;
};
type ReportReply = { ok: boolean };

// gRPC client service stub (methods are lowerCamelCase)
interface WorkerGrpcClient {
  register(data: WorkerInfo): Observable<RegisterReply>;
  getRegisterChallenge(data: { id: string; wallet: string }): Observable<{
    nonce: string;
    expires: number;
    chainId: number;
    name: string;
    version: string;
    salt: string;
  }>;
  heartbeat(data: HeartbeatReq): Observable<HeartbeatReply>;
  reportResult(data: JobResult): Observable<ReportReply>;
  presignOutput(data: {
    jobId: string;
    fileName: string;
    expiresSeconds?: number;
  }): Observable<{
    bucket: string;
    objectKey: string;
    putUrl: string;
    getUrl: string;
  }>;
  jobStream(data: { id: string }): Observable<Job>;
  listScheduled(data: { id: string }): Observable<{ jobs?: Job[] }>;
}

@Injectable()
export class HeartbeatService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HeartbeatService.name);
  private svc!: WorkerGrpcClient;
  private interval?: NodeJS.Timeout;
  private id = process.env.WORKER_ID ?? randomUUID();
  private registered = false;
  private destroyed = false;
  // Backoff used only as a default seed; the active loop uses a local copy
  private regBackoffSeedMs = Number.parseInt(
    process.env.REGISTER_BACKOFF_MS ?? '1000',
    10,
  );
  private streamBackoffMs = Number.parseInt(
    process.env.STREAM_BACKOFF_MS ?? '1000',
    10,
  );
  private maxBackoffMs = Number.parseInt(
    process.env.MAX_BACKOFF_MS ?? '30000',
    10,
  );
  private scheduledPollMs = Number.parseInt(
    process.env.SCHEDULED_POLL_MS ?? '5000',
    10,
  );
  private payloadPrefetchMs = Number.parseInt(
    process.env.PAYLOAD_PREFETCH_MS ?? `${5 * 60 * 1000}`,
    10,
  );
  private jobStreamSub?: Subscription;
  private registering = false;
  private scheduled = new Map<
    string,
    {
      job: Job;
      payloadPromise?: Promise<string | undefined>;
      timer?: NodeJS.Timeout;
      payloadTimer?: NodeJS.Timeout;
      workDir?: string;
    }
  >();
  private scheduledPoll?: NodeJS.Timeout;
  private scheduledPollInFlight?: Promise<void>;

  constructor(
    @Inject('GRPC_CLIENT') private readonly client: ClientGrpc,
    private readonly chain: ChainService,
  ) {}

  onModuleInit() {
    this.svc = this.client.getService<WorkerGrpcClient>('WorkerService');
    try {
      const methods = Object.keys(this.svc as object);
      this.logger.debug(`gRPC client ready. Methods: ${methods.join(', ')}`);
    } catch (err: unknown) {
      const e = err as Error;
      this.logger.debug(
        `gRPC client introspection failed: ${e?.message ?? String(err)}`,
      );
    }
    const orgId = process.env.ORG_ID ?? '0';
    const concurrency = Number.parseInt(process.env.CONCURRENCY ?? '1', 10);
    const heartbeatMs = Number.parseInt(process.env.HEARTBEAT_MS ?? '2000', 10);

    // Start register retry loop (non-blocking)
    this.ensureRegisterLoop(orgId, concurrency);

    // Start heartbeat loop (no pulling)
    this.interval = setInterval(() => {
      void this.pulse();
    }, heartbeatMs);

    // Subscribe to server-pushed jobs with automatic retry
    this.startJobStream();
    // Periodically refresh scheduled jobs to ensure future executions are queued
    this.startScheduledPoll();
  }

  onModuleDestroy() {
    this.destroyed = true;
    if (this.interval) clearInterval(this.interval);
    if (this.jobStreamSub) this.jobStreamSub.unsubscribe();
    for (const entry of this.scheduled.values()) {
      if (entry.timer) clearTimeout(entry.timer);
      if (entry.payloadTimer) clearTimeout(entry.payloadTimer);
    }
    if (this.scheduledPoll) clearTimeout(this.scheduledPoll);
  }

  private async pulse() {
    try {
      const reply = await firstValueFrom(
        this.svc.heartbeat({ id: this.id, running: 0 }),
      );
      if (!reply?.ok) {
        // Controller does not recognize us; re-register with backoff
        if (this.registered)
          this.logger.warn('Heartbeat not accepted; re-registering');
        this.registered = false;
        const orgId = process.env.ORG_ID ?? '1';
        const concurrency = Number.parseInt(process.env.CONCURRENCY ?? '1', 10);
        this.ensureRegisterLoop(orgId, concurrency);
      }
    } catch (err: unknown) {
      const e = err as Error;
      this.logger.debug(`Pulse error: ${e?.message ?? String(err)}`);
    }
  }

  private ensureRegisterLoop(orgId: string, concurrency: number) {
    if (this.destroyed || this.registered || this.registering) return;
    this.registering = true;
    // Fire and forget; the loop controls its own backoff
    this.registerLoop(orgId, concurrency)
      .catch((err: unknown) => {
        const e = err as Error;
        this.logger.debug(`registerLoop error: ${e?.message ?? String(err)}`);
      })
      .finally(() => {
        this.registering = false;
      });
  }

  private async registerLoop(orgId: string, concurrency: number) {
    // Use a local backoff value so resets elsewhere won't cause jittery logs
    let backoffMs = this.regBackoffSeedMs;
    while (!this.destroyed && !this.registered) {
      try {
        // Resolve local signing account and use its address for registration
        const account = this.chain.getAccount();
        if (!account) throw new Error('no local account configured');
        const wallet = account.address;
        // If an env override is present and mismatched, warn user but proceed with signer address
        const envWallet = (process.env.WALLET_ADDRESS as string) || '';
        if (envWallet && envWallet.toLowerCase() !== wallet.toLowerCase()) {
          this.logger.warn(
            `WALLET_ADDRESS(${envWallet}) does not match signer ${wallet}; using signer address.`,
          );
        }
        this.logger.debug(
          `Register: requesting challenge id=${this.id} wallet=${wallet}`,
        );
        // Fetch challenge from controller
        const ch = await firstValueFrom(
          this.svc.getRegisterChallenge({ id: this.id, wallet }),
        );
        if (!ch?.nonce || !ch?.expires)
          throw new Error('failed to obtain challenge');
        this.logger.debug(
          `Register: got challenge expires=${ch.expires} chainId=${ch.chainId} salt=${ch.salt?.slice?.(0, 10) ?? ''}...`,
        );
        // Build EIP-712 typed data and sign (shared helpers ensure identical encoding)
        const walletClient = this.chain.getWalletClient();
        const domain = buildRegisterDomain({
          name: ch.name,
          version: ch.version,
          chainId: ch.chainId,
          salt: ch.salt,
        });
        const message = buildRegisterMessage({
          workerId: this.id,
          nonce: ch.nonce,
          expires: ch.expires,
        });
        this.logger.debug(
          `Register: signing typed data ${formatRegisterDebug(domain, message)}`,
        );
        const signature = await walletClient.signTypedData({
          account,
          domain,
          types: RegisterTypes,
          primaryType: 'Register',
          message,
        });

        this.logger.debug(
          `Register: submitting registration id=${this.id} org=${orgId} conc=${concurrency}`,
        );
        const reply = await firstValueFrom(
          this.svc.register({
            id: this.id,
            orgId,
            concurrency,
            wallet,
            nonce: ch.nonce,
            expires: ch.expires,
            signature,
          }),
        );
        if (reply?.ok) {
          this.registered = true;
          this.logger.log(
            `Registered worker ${this.id} (org=${orgId}, conc=${concurrency})`,
          );
          // Pull scheduled jobs immediately on first registration so we do not wait for the poll interval
          void this.fetchScheduledJobs('register');
          break;
        }
        const note = reply?.note || 'registration rejected';
        throw new Error(note);
      } catch (err: unknown) {
        const e = err as Error;
        this.logger.warn(
          `Register failed: ${e?.message ?? String(err)}. Retrying in ${backoffMs}ms`,
        );
        await this.delay(backoffMs);
        backoffMs = Math.min(this.maxBackoffMs, backoffMs * 2);
      }
    }
  }

  private startJobStream() {
    const subscribe = () => {
      if (this.destroyed) return;
      try {
        if (this.jobStreamSub) this.jobStreamSub.unsubscribe();
      } catch (err: unknown) {
        const e = err as Error;
        this.logger.debug(
          `jobStreamSub cleanup failed: ${e?.message ?? String(err)}`,
        );
      }
      this.jobStreamSub = this.svc.jobStream({ id: this.id }).subscribe({
        next: (job) => {
          // reset backoff on activity
          this.streamBackoffMs = Number.parseInt(
            process.env.STREAM_BACKOFF_MS ?? '1000',
            10,
          );
          if (job?.jobId) {
            this.logger.debug(`Pushed job ${job.jobId} type=${job.jobType}`);
            this.scheduleJob(job).catch((err: unknown) => {
              const e = err as Error;
              this.logger.warn(
                `scheduleJob error: ${e?.message ?? String(err)}`,
              );
            });
          }
        },
        error: (err: unknown) => {
          const e = err as Error;
          this.logger.warn(
            `JobStream error: ${e?.message ?? String(err)}. Reconnecting in ${this.streamBackoffMs}ms`,
          );
          void this.fetchScheduledJobs('jobStream-error');
          setTimeout(() => {
            this.streamBackoffMs = Math.min(
              this.maxBackoffMs,
              this.streamBackoffMs * 2,
            );
            subscribe();
          }, this.streamBackoffMs);
        },
        complete: () => {
          this.logger.warn('JobStream completed. Reconnecting...');
          void this.fetchScheduledJobs('jobStream-complete');
          setTimeout(() => subscribe(), this.streamBackoffMs);
        },
      });
    };
    subscribe();
  }

  private fetchScheduledJobs(reason: string) {
    if (this.destroyed || !this.registered) return Promise.resolve();
    if (this.scheduledPollInFlight) return this.scheduledPollInFlight;
    this.scheduledPollInFlight = (async () => {
      const res = await firstValueFrom(this.svc.listScheduled({ id: this.id }));
      for (const job of res?.jobs ?? []) {
        await this.scheduleJob(job);
      }
    })()
      .catch((err: unknown) => {
        const e = err as Error;
        this.logger.debug(
          `ListScheduled(${reason}) error: ${e?.message ?? String(err)}`,
        );
      })
      .finally(() => {
        this.scheduledPollInFlight = undefined;
      });
    return this.scheduledPollInFlight;
  }

  private startScheduledPoll() {
    const poll = async () => {
      if (this.destroyed) return;
      await this.fetchScheduledJobs('poll');
      const interval = this.registered
        ? this.scheduledPollMs
        : Math.min(5000, this.scheduledPollMs);
      if (!this.destroyed) {
        this.scheduledPoll = setTimeout(() => poll(), interval);
      }
    };
    void poll();
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async scheduleJob(job: Job) {
    if (!job?.jobId) return;
    const nowMs = Date.now();
    const startSeconds = Number(job.startAt ?? Math.floor(nowMs / 1000));
    const killSeconds = Number(job.killAt ?? 0);
    const startMs = startSeconds * 1000;
    const killMs = killSeconds > 0 ? killSeconds * 1000 : 0;
    if (killMs > 0 && killMs <= nowMs) {
      this.logger.warn(
        `Skipping job ${job.jobId}: kill time already passed`,
      );
      return;
    }
    // Cancel existing timer if rescheduling
    const existing = this.scheduled.get(job.jobId);
    if (existing?.timer) clearTimeout(existing.timer);
    if (existing?.payloadTimer) clearTimeout(existing.payloadTimer);

    let workDir = existing?.workDir;
    let payloadPromise = existing?.payloadPromise;
    let payloadTimer: NodeJS.Timeout | undefined;
    let timer: NodeJS.Timeout | undefined;
    const ensureWorkDir = async () => {
      if (!workDir) {
        workDir = await fs.mkdtemp(path.join(os.tmpdir(), `oursgpu-${job.jobId}-`));
      }
      return workDir;
    };

    const startPayloadPrefetch = async () => {
      try {
        payloadTimer = undefined;
        const dir = await ensureWorkDir();
        payloadPromise = this.preparePayload(job, dir).catch((err: unknown) => {
          const e = err as Error;
          this.logger.warn(
            `Prefetch payload failed for job=${job.jobId}: ${e?.message ?? String(err)}`,
          );
          return undefined;
        });
        this.scheduled.set(job.jobId, {
          job,
          payloadPromise,
          timer,
          payloadTimer,
          workDir: dir,
        });
        await payloadPromise;
      } catch (err: unknown) {
        const e = err as Error;
        this.logger.warn(
          `Prefetch payload failed for job=${job.jobId}: ${e?.message ?? String(err)}`,
        );
      }
    };

    const delayMs = Math.max(0, startMs - Date.now());
    if (delayMs === 0) {
      await this.runJob(job, workDir, payloadPromise);
      this.scheduled.delete(job.jobId);
      return;
    }

    // Prefetch payload only when we are within the lead window
    if (job.payloadUrl) {
      const prefetchDelayMs = Math.max(0, startMs - this.payloadPrefetchMs - Date.now());
      if (prefetchDelayMs === 0) {
        await startPayloadPrefetch();
      } else {
        payloadTimer = setTimeout(() => {
          void startPayloadPrefetch();
        }, prefetchDelayMs);
      }
    }

    timer = setTimeout(() => {
      this.runJob(job, workDir, payloadPromise)
        .catch((err: unknown) => {
          const e = err as Error;
          this.logger.warn(
            `executeJob error: ${e?.message ?? String(err)}`,
          );
        })
        .finally(() => this.scheduled.delete(job.jobId));
    }, delayMs);

    this.scheduled.set(job.jobId, {
      job,
      payloadPromise,
      timer,
      payloadTimer,
      workDir,
    });
    this.logger.debug(
      `Job ${job.jobId} scheduled to start in ~${Math.round(delayMs / 1000)}s`,
    );
  }

  private async preparePayload(job: Job, workDir: string): Promise<string | undefined> {
    if (!job.payloadUrl) return undefined;
    const res = await fetch(job.payloadUrl);
    if (!res.ok) throw new Error(`payload download failed: ${res.status}`);
    const arrayBuf = await res.arrayBuffer();
    const payloadPath = path.join(workDir, 'payload.bin');
    await fs.writeFile(payloadPath, Buffer.from(arrayBuf));
    return payloadPath;
  }

  private hasReachedKillTime(job: Job) {
    if (!job.killAt) return false;
    const nowSec = Math.floor(Date.now() / 1000);
    return nowSec >= Number(job.killAt ?? 0);
  }

  private async runJob(
    job: Job,
    workDir?: string,
    payloadPromise?: Promise<string | undefined>,
  ) {
    const start = Date.now();
    const executedAtSeconds = Math.floor(start / 1000);
    try {
      if (!job.entryCommand) {
        const endSeconds = Math.floor(Date.now() / 1000);
        await firstValueFrom(
          this.svc.reportResult({
            jobId: job.jobId,
            workerId: this.id,
            solution: 'noop',
            success: true,
            metricsJson: '{}',
            executionSeconds: 0,
            terminated: this.hasReachedKillTime(job),
            endAt: endSeconds,
            executedAt: executedAtSeconds,
          }),
        );
        return;
      }

      const effectiveWorkDir =
        workDir ?? (await fs.mkdtemp(path.join(os.tmpdir(), `oursgpu-${job.jobId}-`)));
      let payloadPath: string | undefined;
      if (payloadPromise) {
        payloadPath = await payloadPromise;
      } else if (job.payloadUrl) {
        payloadPath = await this.preparePayload(job, effectiveWorkDir);
      }

      const env = {
        ...process.env,
        JOB_ID: job.jobId,
        PAYLOAD_PATH: payloadPath ?? '',
        WORK_DIR: effectiveWorkDir,
        OUTPUT_PREFIX: job.outputPrefix ?? '',
      } as NodeJS.ProcessEnv;

      // Execute the entry command using a shell so env vars can be expanded
      const cmd = job.entryCommand;
      const { stdout, stderr, code } = await new Promise<{
        stdout: string;
        stderr: string;
        code: number;
      }>((resolve) => {
        exec(
          cmd,
          { env, cwd: effectiveWorkDir, shell: '/bin/sh' },
          (
            error: import('child_process').ExecException | null,
            stdout,
            stderr,
          ) => {
            const code = error?.code ?? 0;
            resolve({ stdout, stderr, code });
          },
        );
      });

      const ms = Date.now() - start;
      const ok = code === 0;
      const metrics = { ms, stderr: stderr?.slice(0, 4096) };
      const executionSeconds = Math.max(1, Math.round(ms / 1000));
      const endSeconds = Math.floor(Date.now() / 1000);
      await firstValueFrom(
        this.svc.reportResult({
          jobId: job.jobId,
          workerId: this.id,
          solution: stdout.trim(),
          success: ok,
          metricsJson: JSON.stringify(metrics),
          executionSeconds,
          terminated: this.hasReachedKillTime(job),
          endAt: endSeconds,
          executedAt: executedAtSeconds,
        }),
      );
      this.logger.debug(`Executed job=${job.jobId} code=${code} ms=${ms}`);
    } catch (err: unknown) {
      const ms = Date.now() - start;
      const e = err as Error;
      const metrics = { error: e?.message ?? String(err), ms };
      const executionSeconds = Math.max(1, Math.round(ms / 1000));
      const endSeconds = Math.floor(Date.now() / 1000);
      await firstValueFrom(
        this.svc.reportResult({
          jobId: job.jobId,
          workerId: this.id,
          solution: '',
          success: false,
          metricsJson: JSON.stringify(metrics),
          executionSeconds,
          terminated: this.hasReachedKillTime(job),
          endAt: endSeconds,
          executedAt: executedAtSeconds,
        }),
      );
      this.logger.warn(
        `Job failed job=${job.jobId}: ${e?.message ?? String(err)}`,
      );
    }
  }
}
