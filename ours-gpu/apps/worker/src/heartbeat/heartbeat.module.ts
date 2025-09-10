import { Module } from '@nestjs/common';
import { GrpcClientModule } from '../grpc/grpc-client.module';
import { HeartbeatService } from './heartbeat.service';
import { ChainModule } from '@ours-gpu/shared';

@Module({
  imports: [GrpcClientModule, ChainModule],
  providers: [HeartbeatService],
})
export class HeartbeatModule {}
