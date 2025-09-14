import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JobsModule } from './jobs/jobs.module';
import { ControllerController } from './controller.controller';
import { ControllerService } from './controller.service';
import { WorkersModule } from './workers/workers.module';
import { GrpcModule } from './grpc/grpc.module';
import { ChainModule } from '@ours-gpu/shared';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ChainModule,
    WorkersModule,
    GrpcModule,
    JobsModule,
    UsersModule,
  ],
  controllers: [ControllerController],
  providers: [ControllerService],
})
export class ControllerModule {}
