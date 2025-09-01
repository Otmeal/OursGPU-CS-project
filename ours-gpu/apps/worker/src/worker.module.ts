import { Module } from '@nestjs/common';
import { HeartbeatModule } from './heartbeat/heartbeat.module';
import { GrpcClientModule } from './grpc/grpc-client.module';

@Module({
  imports: [GrpcClientModule, HeartbeatModule],
})
export class WorkerModule {}
