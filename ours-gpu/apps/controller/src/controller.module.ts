import { Module } from '@nestjs/common';
import { ControllerController } from './controller.controller';
import { ControllerService } from './controller.service';
import { WorkerModule } from './worker/worker.module';
import { GrpcModule } from './grpc/grpc.module';

@Module({
  imports: [WorkerModule, GrpcModule],
  controllers: [ControllerController],
  providers: [ControllerService],
})
export class ControllerModule {}
