import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { MinioService } from '../minio/minio.service';

@Module({
  providers: [PrismaService, JobsService, MinioService],
  controllers: [JobsController],
  exports: [JobsService, MinioService, PrismaService],
})
export class JobsModule {}
