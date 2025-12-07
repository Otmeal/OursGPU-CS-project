import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, Job, JobStatus } from '@prisma/client';

// Prefer Prisma-generated input type for creation, omitting server-controlled fields
// Use Unchecked to allow plain scalar workerId while we also model relations

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: Prisma.JobUncheckedCreateInput): Promise<Job> {
    return this.prisma.job.create({
      data: {
        ...dto,
        status: JobStatus.REQUESTED,
      },
    });
  }

  list(walletId?: string): Promise<Job[]> {
    return this.prisma.job.findMany({
      orderBy: { createdAt: 'desc' },
      ...(walletId ? { where: { walletId } } : {}),
    });
  }

  findById(id: string): Promise<Job | null> {
    return this.prisma.job.findUnique({ where: { id } });
  }

  jobsByWallet(
    walletId: string,
    opts?: { status?: JobStatus; skip?: number; take?: number },
  ): Promise<Job[]> {
    return this.prisma.job.findMany({
      where: { walletId, ...(opts?.status ? { status: opts.status } : {}) },
      orderBy: { createdAt: 'desc' },
      skip: opts?.skip,
      take: opts?.take ?? 50,
    });
  }

  markScheduled(id: string, workerId: string) {
    return this.prisma.job.update({
      where: { id },
      data: { status: JobStatus.SCHEDULED, workerId },
    });
  }

  markResult(
    id: string,
    success: boolean,
    executedSeconds?: number,
    endAtSeconds?: number,
    executedAtSeconds?: number,
  ) {
    const endAt =
      endAtSeconds !== undefined
        ? new Date(endAtSeconds * 1000)
        : new Date();
    const executedAt =
      executedAtSeconds !== undefined
        ? new Date(executedAtSeconds * 1000)
        : executedSeconds !== undefined && endAtSeconds !== undefined
          ? new Date(Math.max(0, endAtSeconds - executedSeconds) * 1000)
          : undefined;
    return this.prisma.job.update({
      where: { id },
      data: {
        status: success ? JobStatus.DONE : JobStatus.FAILED,
        executedSeconds: executedSeconds ?? undefined,
        executedAt,
        endAt,
      },
    });
  }

  setOutputKey(id: string, outputObjectKey: string | null) {
    return this.prisma.job.update({
      where: { id },
      data: { outputObjectKey: outputObjectKey ?? undefined },
    });
  }
}
