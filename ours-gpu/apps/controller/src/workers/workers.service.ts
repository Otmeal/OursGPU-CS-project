import { Injectable } from '@nestjs/common';
import { JobsService } from '../jobs/jobs.service';
import { MinioService } from '../minio/minio.service';
import { Job, JobStatus } from '@prisma/client';
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
  startAt?: number;
  killAt?: number;
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

    const startSeconds = Math.floor(new Date(job.startAt).getTime() / 1000);
    const killSeconds = Math.floor(new Date(job.killAt).getTime() / 1000);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresSeconds = Math.max(
      3600,
      killSeconds > nowSeconds ? killSeconds - nowSeconds + 3600 : 7200,
    );
    const payloadUrl = await this.minio.presignGet(job.objectKey, expiresSeconds);

    const j: WorkerJobPayload = {
      jobId: job.id,
      jobType: job.jobType,
      objectKey: job.objectKey,
      entryCommand: job.entryCommand ?? undefined,
      payloadUrl,
      outputPrefix: `outputs/${job.id}/`,
      startAt: startSeconds,
      killAt: killSeconds,
      status: 'SCHEDULED',
      workerId,
    };
    this.jobs.set(j.jobId, j);
    this.getOrCreateStream(workerId).next(j);
    return j;
  }

  async markProcessing(jobId: string, workerId?: string, executedAtSeconds?: number) {
    const j = this.jobs.get(jobId);
    if (j) {
      j.status = 'PROCESSING';
      if (workerId) j.workerId = workerId;
      this.jobs.set(jobId, j);
    }
    await this.jobsSvc.markProcessing(jobId, executedAtSeconds);
    return true;
  }
  async report(
    jobId: string,
    ok: boolean,
    solution?: string,
    metricsJson?: string,
    executionSeconds?: number,
    terminated?: boolean,
    endAtSeconds?: number,
    executedAtSeconds?: number,
  ) {
    const j = this.jobs.get(jobId);
    if (j) {
      j.solution = solution;
      j.metricsJson = metricsJson;
      j.status = ok ? 'DONE' : 'FAILED';
      this.jobs.set(jobId, j);
    }
    const seconds = this.extractExecutionSeconds(metricsJson, executionSeconds);
    let actualStartSeconds = executedAtSeconds ?? null;
    let observedEndSeconds = typeof endAtSeconds === 'number' && endAtSeconds > 0
      ? Math.floor(endAtSeconds)
      : Math.floor(Date.now() / 1000);
    let effectiveSeconds = seconds ?? undefined;
    let payFull = terminated === true;
    let chainJobId: number | null = null;
    let startSeconds = 0;
    let killSeconds = 0;

    try {
      const job = await this.prisma.job.findUnique({ where: { id: jobId } });
      const meta: any = job?.metadata as any;
      chainJobId = (meta?.chainJobId ?? meta?.chain?.jobId) ?? null;
      startSeconds = job?.startAt ? Math.floor(new Date(job.startAt).getTime() / 1000) : 0;
      killSeconds = job?.killAt
        ? Math.floor(new Date(job.killAt).getTime() / 1000)
        : 0;
      if (actualStartSeconds === null && startSeconds > 0) {
        actualStartSeconds = startSeconds;
      }
      if (terminated === true && killSeconds > 0) {
        observedEndSeconds = killSeconds;
      }
      const maxWindowSeconds = killSeconds > startSeconds ? killSeconds - startSeconds : 0;
      if (effectiveSeconds === undefined) {
        const baselineStart = actualStartSeconds ?? startSeconds ?? observedEndSeconds;
        effectiveSeconds = Math.max(0, observedEndSeconds - baselineStart);
      }
      if (maxWindowSeconds > 0 && effectiveSeconds > maxWindowSeconds) {
        effectiveSeconds = maxWindowSeconds;
      }
      payFull = payFull || (killSeconds > 0 && Math.floor(Date.now() / 1000) >= killSeconds);
    } catch (e) {
      // best-effort: fall back to defaults
    }

    await this.jobsSvc.markResult(
      jobId,
      ok,
      effectiveSeconds ?? seconds ?? undefined,
      observedEndSeconds,
      executedAtSeconds,
    );
    // On success, attempt to finalize on-chain payout if chainJobId is present in metadata
    if (chainJobId !== null) {
      const baselineStart = actualStartSeconds ?? startSeconds;
      const effectiveSecondsForChain = effectiveSeconds ?? Math.max(0, observedEndSeconds - baselineStart);
      const idBig = BigInt(chainJobId);
      // Fire and forget
      this.jmChain
        .completeJob(idBig, BigInt(observedEndSeconds), BigInt(effectiveSecondsForChain), payFull, ok)
        .catch((e) =>
          console.warn(`completeJob failed for ${chainJobId}: ${e?.message}`),
        );
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

  private extractExecutionSeconds(metricsJson?: string, fallback?: number) {
    if (typeof fallback === 'number' && fallback > 0) return fallback;
    if (!metricsJson) return undefined;
    try {
      const parsed = JSON.parse(metricsJson);
      const ms = (parsed as any)?.ms;
      if (typeof ms === 'number' && ms >= 0) {
        const seconds = Math.round(ms / 1000);
        return seconds > 0 ? seconds : 1;
      }
    } catch {
      // ignore parse errors
    }
    return undefined;
  }

  async listScheduledJobs(workerId: string) {
    const now = Date.now();
    const windowStart = new Date(now - 5 * 60 * 1000);
    const jobs = await this.prisma.job.findMany({
      where: {
        workerId,
        status: { in: [JobStatus.REQUESTED, JobStatus.SCHEDULED, JobStatus.PROCESSING] },
        startAt: { gte: windowStart },
      },
      orderBy: { startAt: 'asc' },
      take: 50,
    });
    const nowSeconds = Math.floor(Date.now() / 1000);
    const result: WorkerJobPayload[] = [];
    for (const job of jobs) {
      const startSeconds = Math.floor(new Date(job.startAt).getTime() / 1000);
      const killSeconds = Math.floor(new Date(job.killAt).getTime() / 1000);
      const expiresSeconds = Math.max(
        3600,
        killSeconds > nowSeconds ? killSeconds - nowSeconds + 3600 : 7200,
      );
      let payloadUrl: string | undefined;
      try {
        payloadUrl = await this.minio.presignGet(job.objectKey, expiresSeconds);
      } catch {
        // ignore presign errors here; worker can retry later
      }
      result.push({
        jobId: job.id,
        jobType: job.jobType,
        objectKey: job.objectKey,
        entryCommand: job.entryCommand ?? undefined,
        payloadUrl,
        outputPrefix: `outputs/${job.id}/`,
        startAt: startSeconds,
        killAt: killSeconds,
        status: (job.status as any) ?? 'REQUESTED',
        workerId,
      });
    }
    return result;
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
