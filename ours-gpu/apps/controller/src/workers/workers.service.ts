import { Injectable } from '@nestjs/common';
import { JobsService } from '../jobs/jobs.service';
import { MinioService } from '../minio/minio.service';
import { Job } from '@prisma/client';
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
    return this.prisma.worker.findMany({ orderBy: { lastSeen: 'desc' } });
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
