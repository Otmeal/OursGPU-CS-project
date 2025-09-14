import { Module, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { MinioService } from '../minio/minio.service';
import { WorkersModule } from '../workers/workers.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [forwardRef(() => WorkersModule), UsersModule],
  providers: [PrismaService, JobsService, MinioService],
  controllers: [JobsController],
  exports: [JobsService, MinioService, PrismaService],
})
export class JobsModule {}
