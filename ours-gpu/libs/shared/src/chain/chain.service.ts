import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PublicClient, WalletClient, Account } from 'viem';
import {
  CHAIN_PUBLIC_CLIENT,
  CHAIN_WALLET_CLIENT,
  CHAIN_ACCOUNT,
} from './chain.tokens';

@Injectable()
export class ChainService {
  private readonly logger = new Logger(ChainService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(CHAIN_PUBLIC_CLIENT) private readonly publicClient: PublicClient,
    @Inject(CHAIN_WALLET_CLIENT) private readonly walletClient: WalletClient,
    @Inject(CHAIN_ACCOUNT) private readonly account?: Account,
  ) {}

  getPublicClient(): PublicClient {
    return this.publicClient;
  }

  getWalletClient(): WalletClient {
    return this.walletClient;
  }

  getAccount(): Account | undefined {
    return this.account;
  }

  getAddress(): string | undefined {
    return this.account?.address;
  }

  async logSummary(prefix = ''): Promise<void> {
    try {
      const addr = this.account?.address;
      const [chainId, bal] = await Promise.all([
        this.publicClient.getChainId(),
        addr
          ? this.publicClient.getBalance({ address: addr })
          : Promise.resolve(0n),
      ]);
      this.logger.log(
        `${prefix}wallet=${addr ?? 'N/A'} chainId=${chainId} balance=${bal.toString()}`,
      );
    } catch (e) {
      this.logger.warn(
        `Failed to query chain summary: ${(e as Error).message}`,
      );
    }
  }
}
