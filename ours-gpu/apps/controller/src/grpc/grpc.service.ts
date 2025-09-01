import { Injectable } from '@nestjs/common';
import { WorkersService } from '../workers/workers.service';
import { MinioService } from '../minio/minio.service';

@Injectable()
export class GrpcService {
  constructor(private readonly workerService: WorkersService, private readonly minio: MinioService) {}

  register({ id, orgId, concurrency }) {
    this.workerService.register({ id, orgId, concurrency, lastSeen: Date.now(), running: 0 });
    return { ok: true, note: 'registered' };
  }

  async heartbeat({ id, running }) {
    const ok = await this.workerService.heartbeat(id, running);
    return { ok };
  }

  pullJob({ id }) {
    return this.workerService.pullJob(id) ?? {};
  }

  jobStream({ id }: { id: string }) {
    // Return a server-streaming Observable of Job for this worker
    return this.workerService.subscribe(id);
  }

  report({ jobId, success, solution, metricsJson }: { jobId: string; success: boolean; solution?: string; metricsJson?: string }) {
    return { ok: this.workerService.report(jobId, success, solution, metricsJson) };
  }

  async presignOutput({ jobId, fileName, expiresSeconds }: { jobId: string; fileName: string; expiresSeconds?: number }) {
    const bucket = process.env.MINIO_BUCKET_JOBS ?? 'jobs';
    const objectKey = `outputs/${jobId}/${fileName}`;
    const [putUrl, getUrl] = await Promise.all([
      this.minio.presignPut(objectKey, expiresSeconds ?? 3600),
      this.minio.presignGet(objectKey, expiresSeconds ?? 3600),
    ]);
    return { bucket, objectKey, putUrl, getUrl };
  }
}
