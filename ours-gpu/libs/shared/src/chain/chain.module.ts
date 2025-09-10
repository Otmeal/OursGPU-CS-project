import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChainService } from './chain.service';
import { chainProviders } from './chain.providers';
import {
  CHAIN_PUBLIC_CLIENT,
  CHAIN_WALLET_CLIENT,
  CHAIN_ACCOUNT,
} from './chain.tokens';

@Module({
  imports: [ConfigModule],
  providers: [...chainProviders, ChainService],
  exports: [
    CHAIN_PUBLIC_CLIENT,
    CHAIN_WALLET_CLIENT,
    CHAIN_ACCOUNT,
    ChainService,
  ],
})
export class ChainModule {}
