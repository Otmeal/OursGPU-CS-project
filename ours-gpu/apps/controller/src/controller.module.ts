import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JobsModule } from './jobs/jobs.module';
import { ControllerController } from './controller.controller';
import { ControllerService } from './controller.service';
import { WorkersModule } from './workers/workers.module';
import { GrpcModule } from './grpc/grpc.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), WorkersModule, GrpcModule, JobsModule],
  controllers: [ControllerController],
  providers: [ControllerService],
})
export class ControllerModule {}
