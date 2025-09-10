import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, Job, JobStatus } from '@prisma/client';

// Prefer Prisma-generated input type for creation, omitting server-controlled fields
export type CreateJobDto = Omit<
  Prisma.JobCreateInput,
  'status' | 'assignedWorkerId' | 'createdAt' | 'updatedAt' | 'id'
>;

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateJobDto): Promise<Job> {
    return this.prisma.job.create({
      data: { ...dto, status: JobStatus.REQUESTED },
    });
  }

  list(): Promise<Job[]> {
    return this.prisma.job.findMany({ orderBy: { createdAt: 'desc' } });
  }

  findById(id: string): Promise<Job | null> {
    return this.prisma.job.findUnique({ where: { id } });
  }

  nextSchedulable(): Promise<Job | null> {
    return this.prisma.job.findFirst({
      where: { status: JobStatus.REQUESTED },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }

  markScheduled(id: string, workerId: string) {
    return this.prisma.job.update({
      where: { id },
      data: { status: JobStatus.SCHEDULED, assignedWorkerId: workerId },
    });
  }

  markResult(id: string, success: boolean) {
    return this.prisma.job.update({
      where: { id },
      data: { status: success ? JobStatus.DONE : JobStatus.FAILED },
    });
  }
}
