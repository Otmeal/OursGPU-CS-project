import { Module, forwardRef } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { MinioService } from '../minio/minio.service';
import { WorkersModule } from '../workers/workers.module';
import { WalletsModule } from '../wallets/wallets.module';
import { ChainModule } from '@ours-gpu/shared';
import { JobManagerChainService } from '../chain/job-manager.service';

@Module({
  imports: [forwardRef(() => WorkersModule), WalletsModule, ChainModule],
  providers: [PrismaService, JobsService, MinioService, JobManagerChainService],
  controllers: [JobsController],
  exports: [JobsService, MinioService, PrismaService, JobManagerChainService],
})
export class JobsModule {}
