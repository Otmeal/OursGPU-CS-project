import { Module } from '@nestjs/common';
import { WorkersService } from './workers.service';
import { WorkersController } from './workers.controller';
import { JobsModule } from '../jobs/jobs.module';

@Module({
  imports: [JobsModule],
  providers: [WorkersService],
  exports: [WorkersService],
  controllers: [WorkersController],
})
export class WorkersModule {}
