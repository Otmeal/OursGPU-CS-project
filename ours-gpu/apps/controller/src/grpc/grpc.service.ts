import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { WorkerService } from '../worker/worker.service';

@Controller()
export class GrpcService {
  constructor(private readonly workerService: WorkerService) {}

  @GrpcMethod('WorkerService', 'Register')
  register({ id, orgId, concurrency }) {
    this.workerService.register({ id, orgId, concurrency, lastSeen: Date.now(), running: 0 });
    return { ok: true, note: 'registered' };
  }

  @GrpcMethod('WorkerService', 'Heartbeat')
  heartbeat({ id, running }) {
    return { ok: this.workerService.heartbeat(id, running) };
  }

  @GrpcMethod('WorkerService', 'PullJob')
  pullJob({ id }) {
    return this.workerService.pullJob(id) ?? {};
  }

  @GrpcMethod('WorkerService', 'ReportResult')
  report({ jobId, success }) {
    return { ok: this.workerService.report(jobId, success) };
  }
}
