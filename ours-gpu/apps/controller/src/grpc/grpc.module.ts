import { Module } from '@nestjs/common';
import { WorkersModule } from '../workers/workers.module';
import { JobsModule } from '../jobs/jobs.module';
import { GrpcService } from './grpc.service';
import { GrpcController } from './grpc.controller';
import { ChainModule } from '@ours-gpu/shared';

@Module({
  imports: [WorkersModule, JobsModule, ChainModule],
  controllers: [GrpcController],
  providers: [GrpcService],
  exports: [GrpcService],
})
export class GrpcModule {}
