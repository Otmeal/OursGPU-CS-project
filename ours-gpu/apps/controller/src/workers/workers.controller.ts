import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Logger,
} from '@nestjs/common';
import { WorkersService } from './workers.service';
import { JobsService, type CreateJobDto } from '../jobs/jobs.service';
import { MinioService } from '../minio/minio.service';
import { VerificationMethod } from '@prisma/client';

@Controller('workers')
export class WorkersController {
  constructor(
    private readonly workerService: WorkersService,
    private readonly jobs: JobsService,
    private readonly minio: MinioService,
  ) {}

  @Get()
  getWorkers() {
    const promise = this.workerService.listWorkers();
    // Log when resolved to show current workers
    promise
      .then((workers) => {
        const logger = new Logger(WorkersController.name);
        logger.log(`Workers count=${workers.length}`);
        if (workers.length) {
          logger.debug(
            `Workers: ${workers
              .map(
                (w) =>
                  `${w.id}@${w.orgId} running=${w.running} conc=${w.concurrency}`,
              )
              .join(', ')}`,
          );
        }
      })
      .catch((err: unknown) => {
        const logger = new Logger(WorkersController.name);
        const e = err as Error;
        logger.warn(`Failed to list workers: ${e?.message ?? String(err)}`);
      });
    return promise;
  }

  // Debug/inspection: list in-memory jobs for a worker
  @Get(':workerId/jobs')
  getWorkerJobs(@Param('workerId') workerId: string) {
    return this.workerService.listJobsByWorker(workerId);
  }

  // Create a job and dispatch to a specific worker (push model)
  @Post(':workerId/jobs')
  async dispatch(
    @Param('workerId') workerId: string,
    @Body() body: CreateJobDto & { workerId?: string },
  ) {
    // Verify payload exists in MinIO
    try {
      await this.minio.stat(body.objectKey);
    } catch {
      throw new NotFoundException('MinIO object not found: ' + body.objectKey);
    }
    if (
      body.verification === VerificationMethod.USER_PROGRAM &&
      body.verifierObjectKey
    ) {
      try {
        await this.minio.stat(body.verifierObjectKey);
      } catch {
        throw new NotFoundException(
          'Verifier object not found: ' + body.verifierObjectKey,
        );
      }
    }
    // Do not allow arbitrary workerId in job creation payload; assignment is managed separately
    // Strip any accidental workerId field coming from clients/e2e scripts
    const payload = { ...body };
    delete (payload as { workerId?: string }).workerId;
    const job = await this.jobs.create(payload as CreateJobDto);
    await this.workerService.dispatch(job.id, workerId);
    return { id: job.id, workerId };
  }
}
