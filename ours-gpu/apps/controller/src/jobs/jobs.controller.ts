import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { JobsService } from './jobs.service';
import type { CreateJobDto } from './jobs.service';
import { VerificationMethod } from '@prisma/client';
import { MinioService } from '../minio/minio.service';

@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly minio: MinioService,
  ) {}

  @Get()
  list() {
    return this.jobs.list();
  }

  @Post()
  async create(@Body() body: CreateJobDto) {
    // Verify primary job payload exists in MinIO
    try {
      await this.minio.stat(body.objectKey);
    } catch {
      throw new NotFoundException('MinIO object not found: ' + body.objectKey);
    }
    // If requesting user-program verification, the verifier assets should exist too
    if (
      body.verification === VerificationMethod.USER_PROGRAM &&
      body.verifierObjectKey
    ) {
      try {
        await this.minio.stat(body.verifierObjectKey);
      } catch {
        throw new NotFoundException(
          'Verifier object not found: ' + body.verifierObjectKey,
        );
      }
    }
    return this.jobs.create(body);
  }

  @Post('presign')
  async presign(@Body() body: { objectKey: string; expiresSeconds?: number }) {
    const url = await this.minio.presignPut(
      body.objectKey,
      body.expiresSeconds ?? 3600,
      { public: true },
    );
    return {
      url,
      bucket: process.env.MINIO_BUCKET_JOBS ?? 'jobs',
      objectKey: body.objectKey,
    };
  }

  @Post(':jobId/outputs/presign')
  async presignOutput(
    @Param('jobId') jobId: string,
    @Body() body: { fileName: string; expiresSeconds?: number },
  ) {
    const bucket = process.env.MINIO_BUCKET_JOBS ?? 'jobs';
    const objectKey = `outputs/${jobId}/${body.fileName}`;
    const [putUrl, getUrl] = await Promise.all([
      this.minio.presignPut(objectKey, body.expiresSeconds ?? 3600, {
        public: true,
      }),
      this.minio.presignGet(objectKey, body.expiresSeconds ?? 3600, {
        public: true,
      }),
    ]);
    return { bucket, objectKey, putUrl, getUrl };
  }
}
