import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, User, Job, JobStatus } from '@prisma/client';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  normalizeWallet(addr: string): string {
    return addr.trim().toLowerCase();
  }

  async list(params?: { wallet?: string; skip?: number; take?: number }): Promise<User[]> {
    const where: Prisma.UserWhereInput = params?.wallet
      ? { id: this.normalizeWallet(params!.wallet) }
      : {};
    return this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: params?.skip,
      take: params?.take ?? 50,
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async upsert(wallet: string): Promise<User> {
    const walletNormalized = this.normalizeWallet(wallet);
    return this.prisma.user.upsert({
      where: { id: walletNormalized },
      update: {},
      create: { id: walletNormalized },
    });
  }

  async jobsForUser(
    userId: string,
    opts?: { status?: JobStatus; skip?: number; take?: number },
  ): Promise<Job[]> {
    const exists = await this.findById(userId);
    if (!exists) throw new NotFoundException('User not found');
    return this.prisma.job.findMany({
      where: { userId, ...(opts?.status ? { status: opts.status } : {}) },
      orderBy: { createdAt: 'desc' },
      skip: opts?.skip,
      take: opts?.take ?? 50,
    });
  }
}
