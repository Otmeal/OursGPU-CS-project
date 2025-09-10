import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HeartbeatModule } from './heartbeat/heartbeat.module';
import { GrpcClientModule } from './grpc/grpc-client.module';
import { ChainModule } from '@ours-gpu/shared';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ChainModule,
    GrpcClientModule,
    HeartbeatModule,
  ],
})
export class WorkerModule {}
