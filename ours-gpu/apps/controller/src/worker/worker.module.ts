import { Module } from '@nestjs/common';
import { WorkerService } from './worker.service';
import { WorkerController } from './worker.controller';

@Module({
    providers: [WorkerService],
    exports: [WorkerService],
    controllers: [WorkerController],
})
export class WorkerModule {}
