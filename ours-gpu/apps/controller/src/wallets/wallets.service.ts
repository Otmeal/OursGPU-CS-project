import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  Prisma,
  Wallet,
  Job,
  JobStatus,
  UserInfo,
  UserIdentityHash,
} from '@prisma/client';

export type UserPersonalInfoInput = { fullName: string; email: string };

@Injectable()
export class WalletsService {
  constructor(private readonly prisma: PrismaService) {}

  normalizeWallet(addr: string): string {
    return addr.trim().toLowerCase();
  }

  private normalizePersonalInfo(info: UserPersonalInfoInput) {
    return {
      fullName: info.fullName.trim(),
      email: info.email.trim().toLowerCase(),
    };
  }

  async list(params?: { wallet?: string; skip?: number; take?: number }): Promise<Wallet[]> {
    const where: Prisma.WalletWhereInput = params?.wallet
      ? { id: this.normalizeWallet(params!.wallet) }
      : {};
    return this.prisma.wallet.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: params?.skip,
      take: params?.take ?? 50,
    });
  }

  async findById(id: string): Promise<Wallet | null> {
    return this.prisma.wallet.findUnique({ where: { id: this.normalizeWallet(id) } });
  }

  async upsert(wallet: string): Promise<Wallet> {
    const walletNormalized = this.normalizeWallet(wallet);
    return this.prisma.wallet.upsert({
      where: { id: walletNormalized },
      update: {},
      create: { id: walletNormalized },
    });
  }

  private getPepper(): string {
    const pepper = process.env.USER_INFO_PEPPER;
    if (!pepper) {
      throw new Error('USER_INFO_PEPPER env var is required for user info hashing');
    }
    return pepper;
  }

  hashUserInfo(
    info: UserPersonalInfoInput,
    pepperVersion = 1,
  ): { hash: string; algorithm: string; pepperVersion: number } {
    const normalized = this.normalizePersonalInfo(info);
    const canonical = JSON.stringify({
      fullName: normalized.fullName.toLowerCase(),
      email: normalized.email,
    });
    const algorithm = 'sha256';
    const pepper = this.getPepper();
    const hash = createHash(algorithm)
      .update(pepper)
      .update(':')
      .update(String(pepperVersion))
      .update(':')
      .update(canonical)
      .digest('hex');
    return { hash, algorithm, pepperVersion };
  }

  async recordUserInfo(info: UserPersonalInfoInput): Promise<UserInfo> {
    const normalized = this.normalizePersonalInfo(info);
    return this.prisma.userInfo.create({
      data: { fullName: normalized.fullName, email: normalized.email },
    });
  }

  async linkInfoHashToWallet(params: {
    wallet: string;
    infoHash: string;
    pepperVersion?: number;
    hashAlgorithm?: string;
  }): Promise<UserIdentityHash> {
    const walletId = this.normalizeWallet(params.wallet);
    await this.upsert(walletId);
    const hashAlgorithm = params.hashAlgorithm ?? 'sha256';
    const pepperVersion = params.pepperVersion ?? 1;
    return this.prisma.userIdentityHash.upsert({
      where: { walletId: walletId },
      update: { infoHash: params.infoHash, pepperVersion, hashAlgorithm },
      create: {
        infoHash: params.infoHash,
        walletId: walletId,
        pepperVersion,
        hashAlgorithm,
      },
    });
  }

  async recordInfoAndLink(
    wallet: string,
    info: UserPersonalInfoInput,
    opts?: { pepperVersion?: number },
  ): Promise<{ info: UserInfo; link: UserIdentityHash }> {
    const { hash, algorithm, pepperVersion } = this.hashUserInfo(info, opts?.pepperVersion ?? 1);
    const infoRecord = await this.recordUserInfo(info);
    const link = await this.linkInfoHashToWallet({
      wallet,
      infoHash: hash,
      hashAlgorithm: algorithm,
      pepperVersion,
    });
    return { info: infoRecord, link };
  }

  async jobsForWallet(
    walletId: string,
    opts?: { status?: JobStatus; skip?: number; take?: number },
  ): Promise<Job[]> {
    const exists = await this.findById(walletId);
    if (!exists) throw new NotFoundException('Wallet not found');
    return this.prisma.job.findMany({
      where: { walletId, ...(opts?.status ? { status: opts.status } : {}) },
      orderBy: { createdAt: 'desc' },
      skip: opts?.skip,
      take: opts?.take ?? 50,
    });
  }
}
