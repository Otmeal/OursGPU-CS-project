import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserInfo } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletsService } from '../wallets/wallets.service';

type UserInfoRow = { id: string; fullName: string; email: string };

@Injectable()
export class UserInfoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallets: WalletsService,
  ) {}

  private shuffle<T>(items: T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  async shuffleTable(): Promise<{ shuffled: number }> {
    return this.prisma.$transaction(async (tx) => {
      const rows: UserInfoRow[] = await tx.userInfo.findMany({
        orderBy: { id: 'asc' },
        select: { id: true, fullName: true, email: true },
      });

      if (!rows.length) {
        return { shuffled: 0 };
      }

      const shuffled = this.shuffle(rows);
      for (let i = 0; i < rows.length; i++) {
        const current = rows[i];
        const next = shuffled[i];
        if (
          current.fullName === next.fullName &&
          current.email === next.email
        ) {
          continue;
        }
        await tx.userInfo.update({
          where: { id: current.id },
          data: {
            fullName: next.fullName,
            email: next.email,
          },
        });
      }

      return { shuffled: rows.length };
    });
  }

  async recoverForWallet(wallet: string): Promise<UserInfo> {
    const walletId = this.wallets.normalizeWallet(wallet);
    const identity = await this.prisma.userIdentityHash.findUnique({
      where: { walletId },
    });
    if (!identity) {
      throw new NotFoundException('Wallet has no linked identity');
    }
    if (identity.hashAlgorithm !== 'sha256') {
      throw new BadRequestException(
        `Unsupported hash algorithm: ${identity.hashAlgorithm}`,
      );
    }

    const infos = await this.prisma.userInfo.findMany({
      orderBy: { id: 'asc' },
    });
    for (const info of infos) {
      const { hash } = this.wallets.hashUserInfo(
        { fullName: info.fullName, email: info.email },
        identity.pepperVersion,
      );
      if (hash === identity.infoHash) {
        return info;
      }
    }

    throw new NotFoundException('User info not found for wallet');
  }
}
