import { Injectable } from '@nestjs/common';
import { JobsService } from '../jobs/jobs.service';
import { MinioService } from '../minio/minio.service';
import { VerificationMethod } from '@prisma/client';
import { Observable, ReplaySubject } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';

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
  verification: 'BUILTIN_HASH' | 'USER_PROGRAM';
  verifierObjectKey?: string;
  verifierCommand?: string;
  // Convenience URLs/prefix for storage
  payloadUrl?: string;
  verifierUrl?: string;
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

  constructor(
    private readonly jobsSvc: JobsService,
    private readonly minio: MinioService,
    private readonly prisma: PrismaService,
  ) {}

  async register(w: Worker) {
    await this.prisma.worker.upsert({
      where: { id: w.id },
      create: {
        id: w.id,
        orgId: w.orgId,
        concurrency: w.concurrency,
        running: w.running,
        lastSeen: new Date(w.lastSeen || Date.now()),
      },
      update: {
        orgId: w.orgId,
        concurrency: w.concurrency,
        running: w.running,
        lastSeen: new Date(),
      },
    });
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

  async dispatch(jobId: string, workerId: string) {
    // Mark the specific job as scheduled for this worker
    await this.jobsSvc.markScheduled(jobId, workerId);
    // Retrieve latest job row to build payload
    const refreshed = await this.jobsSvc.findById(jobId);
    if (!refreshed) return;

    const payloadUrl = await this.minio.presignGet(refreshed.objectKey);
    let verifierUrl: string | undefined;
    if (
      refreshed.verification === VerificationMethod.USER_PROGRAM &&
      refreshed.verifierObjectKey
    ) {
      verifierUrl = await this.minio.presignGet(refreshed.verifierObjectKey);
    }

    const j: WorkerJobPayload = {
      jobId: refreshed.id,
      jobType: refreshed.jobType,
      objectKey: refreshed.objectKey,
      entryCommand: refreshed.entryCommand ?? undefined,
      verification: refreshed.verification,
      verifierObjectKey: refreshed.verifierObjectKey ?? undefined,
      verifierCommand: refreshed.verifierCommand ?? undefined,
      payloadUrl,
      verifierUrl,
      outputPrefix: `outputs/${refreshed.id}/`,
      status: 'SCHEDULED',
      workerId,
    };
    this.jobs.set(j.jobId, j);
    this.getOrCreateStream(workerId).next(j);
    return j;
  }
  async pullJob(workerId: string): Promise<WorkerJobPayload | undefined> {
    const w = await this.prisma.worker.findUnique({ where: { id: workerId } });
    if (!w) return;

    // First use DB-backed scheduling to fetch one job
    const dbJob = await this.jobsSvc.nextSchedulable();
    if (!dbJob) return;
    await this.jobsSvc.markScheduled(dbJob.id, workerId);

    // Presign payload and optional verifier for convenience
    const payloadUrl = await this.minio.presignGet(dbJob.objectKey);
    let verifierUrl: string | undefined;
    if (
      dbJob.verification === VerificationMethod.USER_PROGRAM &&
      dbJob.verifierObjectKey
    ) {
      verifierUrl = await this.minio.presignGet(dbJob.verifierObjectKey);
    }

    const j: WorkerJobPayload = {
      jobId: dbJob.id,
      jobType: dbJob.jobType,
      objectKey: dbJob.objectKey,
      entryCommand: dbJob.entryCommand ?? undefined,
      verification: dbJob.verification,
      verifierObjectKey: dbJob.verifierObjectKey ?? undefined,
      verifierCommand: dbJob.verifierCommand ?? undefined,
      payloadUrl,
      verifierUrl,
      outputPrefix: `outputs/${dbJob.id}/`,
      status: 'SCHEDULED',
      workerId,
    };
    this.jobs.set(j.jobId, j);
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
    await this.jobsSvc.markResult(jobId, ok);
    return true;
  }

  listWorkers() {
    return this.prisma.worker.findMany({ orderBy: { lastSeen: 'desc' } });
  }
  listJobs() {
    return [...this.jobs.values()];
  }
  listJobsByWorker(workerId: string) {
    return [...this.jobs.values()].filter((j) => j.workerId === workerId);
  }
}
