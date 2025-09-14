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
import { JobsService } from '../jobs/jobs.service';
import { MinioService } from '../minio/minio.service';

@Controller('workers')
export class WorkersController {
  constructor(
    private readonly workerService: WorkersService,
    private readonly jobs: JobsService,
    private readonly minio: MinioService,
  ) {}

  @Get()
  getWorkers() {
    return this.workerService.listWorkers();
  }

  // Debug/inspection: list in-memory jobs for a worker
  @Get(':workerId/jobs')
  getWorkerJobs(@Param('workerId') workerId: string) {
    return this.workerService.listJobsByWorker(workerId);
  }

}
