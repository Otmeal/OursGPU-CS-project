import { Injectable } from '@nestjs/common';
import { JobsService } from '../jobs/jobs.service';
import { MinioService } from '../minio/minio.service';
import { Job } from '@prisma/client';
import { Observable, ReplaySubject } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { JobManagerChainService } from '../chain/job-manager.service';

type Worker = {
  id: string;
  orgId: string;
  concurrency: number;
  lastSeen: number;
  running: number;
};
type WorkerJobPayload = {
  jobId: string;
  jobType: string;
  objectKey: string;
  entryCommand?: string;
  // Convenience URLs/prefix for storage
  payloadUrl?: string;
  outputPrefix: string;
  status:
    | 'REQUESTED'
    | 'SCHEDULED'
    | 'PROCESSING'
    | 'VERIFYING'
    | 'DONE'
    | 'FAILED';
  workerId?: string;
  solution?: string;
  metricsJson?: string;
};

@Injectable()
export class WorkersService {
  private jobQueue: WorkerJobPayload[] = [];
  private jobs = new Map<string, WorkerJobPayload>();
  private streams = new Map<string, ReplaySubject<WorkerJobPayload>>();
  private workerWallets = new Map<string, string>();

  constructor(
    private readonly jobsSvc: JobsService,
    private readonly minio: MinioService,
    private readonly prisma: PrismaService,
    private readonly jmChain: JobManagerChainService,
  ) {}

  async register(w: Worker & { wallet?: string }) {
    // Resolve canonical orgId (numeric) and name from chain if wallet is present
    let resolvedOrgId: bigint | null = null;
    let resolvedOrgName: string | null = null;
    const wallet = w.wallet && /^0x[0-9a-fA-F]{40}$/.test(w.wallet)
      ? (w.wallet.toLowerCase())
      : undefined;
    if (wallet) {
      try {
        const org = await this.jmChain.getNodeOrg(wallet as any);
        if (org && org > 0n) {
          resolvedOrgId = org;
          try {
            const info = await this.jmChain.getOrgInfo(org);
            if (info && info.name) resolvedOrgName = info.name;
          } catch {}
        }
      } catch {}
    }
    // Fallback: accept only pure numeric orgId strings; strip any prefixes
    const numericOrgId = /^\d+$/.test(String(w.orgId)) ? String(w.orgId) : undefined;
    await this.prisma.worker.upsert({
      where: { id: w.id },
      create: {
        id: w.id,
        orgId: resolvedOrgId ? resolvedOrgId.toString() : (numericOrgId ?? '0'),
        orgName: resolvedOrgName ?? undefined,
        wallet: wallet ?? undefined,
        concurrency: w.concurrency,
        running: w.running,
        lastSeen: new Date(w.lastSeen || Date.now()),
      },
      update: {
        orgId: resolvedOrgId ? resolvedOrgId.toString() : (numericOrgId ?? '0'),
        orgName: resolvedOrgName ?? undefined,
        wallet: wallet ?? undefined,
        concurrency: w.concurrency,
        running: w.running,
        lastSeen: new Date(),
      },
    });
    if (wallet) {
      this.workerWallets.set(w.id, wallet);
    }
  }
  async heartbeat(id: string, running: number) {
    try {
      await this.prisma.worker.update({
        where: { id },
        data: { running, lastSeen: new Date() },
      });
      return true;
    } catch {
      return false;
    }
  }
  enqueue(job: WorkerJobPayload) {
    this.jobQueue.push(job);
    this.jobs.set(job.jobId, job);
  }
  subscribe(workerId: string): Observable<WorkerJobPayload> {
    let subj = this.streams.get(workerId);
    if (!subj) {
      subj = new ReplaySubject<WorkerJobPayload>(1);
      this.streams.set(workerId, subj);
    }
    return subj.asObservable();
  }

  private getOrCreateStream(workerId: string) {
    if (!this.streams.has(workerId))
      this.streams.set(workerId, new ReplaySubject<WorkerJobPayload>(1));
    return this.streams.get(workerId)!;
  }

  async dispatch(job: Job, workerId: string) {

    const payloadUrl = await this.minio.presignGet(job.objectKey);

    const j: WorkerJobPayload = {
      jobId: job.id,
      jobType: job.jobType,
      objectKey: job.objectKey,
      entryCommand: job.entryCommand ?? undefined,
      payloadUrl,
      outputPrefix: `outputs/${job.id}/`,
      status: 'SCHEDULED',
      workerId,
    };
    this.jobs.set(j.jobId, j);
    this.getOrCreateStream(workerId).next(j);
    return j;
  }
  async report(
    jobId: string,
    ok: boolean,
    solution?: string,
    metricsJson?: string,
  ) {
    const j = this.jobs.get(jobId);
    if (!j) return false;
    j.solution = solution;
    j.metricsJson = metricsJson;
    j.status = ok ? 'DONE' : 'FAILED';
    this.jobs.set(jobId, j);
    // Persist status first
    await this.jobsSvc.markResult(jobId, ok);
    // On success, attempt to finalize on-chain payout if chainJobId is present in metadata
    try {
      if (ok) {
        const job = await this.prisma.job.findUnique({ where: { id: jobId } });
        const meta: any = job?.metadata as any;
        const chainJobId = meta?.chainJobId ?? meta?.chain?.jobId;
        if (chainJobId !== undefined && chainJobId !== null) {
          const idBig = BigInt(chainJobId);
          // Fire and forget
          this.jmChain
            .completeJob(idBig)
            .catch((e) =>
              console.warn(`completeJob failed for ${chainJobId}: ${e?.message}`),
            );
        }
      }
    } catch (e) {
      // best-effort
    }
    // If solution is provided, persist it to MinIO and store object key in DB
    try {
      if (solution && solution.length > 0) {
        const resultKey = `outputs/${jobId}/result.txt`;
        await this.minio.putObject(
          resultKey,
          solution,
          'text/plain; charset=utf-8',
        );
        await this.jobsSvc.setOutputKey(jobId, resultKey);
      }
    } catch (e) {
      // Best-effort: do not fail the report if upload/storage fails
      // eslint-disable-next-line no-console
      console.warn(
        `Upload result failed for job ${jobId}: ${(e as Error)?.message}`,
      );
    }
    return true;
  }

  listWorkers() {
    // Merge persisted workers with ephemeral wallet mapping for convenience; prefer live map when present
    return this.prisma.worker
      .findMany({ orderBy: { lastSeen: 'desc' } })
      .then((list) =>
        list.map((w) => {
          const m = /^org-(\d+)$/.exec(String(w.orgId || ''));
          const cleanOrgId = /^\d+$/.test(String(w.orgId))
            ? String(w.orgId)
            : (m ? m[1] : String(w.orgId || '0'));
          return {
            ...w,
            orgId: cleanOrgId,
            wallet: this.workerWallets.get(w.id) || w.wallet || null,
          } as any;
        }),
      );
  }
  listJobs() {
    return [...this.jobs.values()];
  }
  listJobsByWorker(workerId: string) {
    return [...this.jobs.values()].filter((j) => j.workerId === workerId);
  }

  // Get a specific in-memory job payload by jobId (if present)
  getJob(jobId: string) {
    return this.jobs.get(jobId);
  }
}
