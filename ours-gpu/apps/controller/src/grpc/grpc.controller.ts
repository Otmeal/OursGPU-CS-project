import { Controller, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { GrpcService } from './grpc.service';

@Controller()
export class GrpcController {
  private readonly logger = new Logger(GrpcController.name);

  constructor(private readonly grpcService: GrpcService) {}

  @GrpcMethod('WorkerService', 'Register')
  register(payload: {
    id: string;
    orgId: string;
    concurrency: number;
    wallet?: string;
    nonce?: string;
    expires?: number;
    signature?: string;
  }) {
    this.logger.log(
      `Register called: id=${payload?.id} org=${payload?.orgId} conc=${payload?.concurrency}`,
    );
    return this.grpcService.register(payload);
  }

  @GrpcMethod('WorkerService', 'GetRegisterChallenge')
  getRegisterChallenge(payload: { id: string; wallet: string }) {
    return this.grpcService.getRegisterChallenge(payload);
  }

  @GrpcMethod('WorkerService', 'Heartbeat')
  heartbeat(payload: { id: string; running: number }) {
    return this.grpcService.heartbeat(payload);
  }

  @GrpcMethod('WorkerService', 'JobStream')
  jobStream(payload: { id: string }) {
    this.logger.log(`JobStream subscribed: id=${payload?.id}`);
    return this.grpcService.jobStream(payload);
  }

  @GrpcMethod('WorkerService', 'ReportResult')
  report(payload: {
    jobId: string;
    success: boolean;
    solution?: string;
    metricsJson?: string;
    workerId?: string;
  }) {
    this.logger.log(
      `ReportResult called: jobId=${payload?.jobId} success=${payload?.success}`,
    );
    return this.grpcService.report(payload);
  }

  @GrpcMethod('WorkerService', 'PresignOutput')
  presignOutput(payload: {
    jobId: string;
    fileName: string;
    expiresSeconds?: number;
  }) {
    this.logger.debug(
      `PresignOutput called: jobId=${payload?.jobId} file=${payload?.fileName}`,
    );
    return this.grpcService.presignOutput(payload);
  }
}
