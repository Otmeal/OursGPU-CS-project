import { Module } from '@nestjs/common';
import { GrpcClientModule } from '../grpc/grpc-client.module';
import { HeartbeatService } from './heartbeat.service';

@Module({
  imports: [GrpcClientModule],
  providers: [HeartbeatService],
})
export class HeartbeatModule {}

