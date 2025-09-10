import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Account,
  defineChain,
} from 'viem';
import { foundry } from 'viem/chains';
import { mnemonicToAccount, privateKeyToAccount } from 'viem/accounts';
import {
  CHAIN_ACCOUNT,
  CHAIN_PUBLIC_CLIENT,
  CHAIN_WALLET_CLIENT,
} from './chain.tokens';

function parseChainId(cfg: ConfigService): number | undefined {
  const raw = cfg.get<string>('CHAIN_ID');
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function resolveChain(cfg: ConfigService, rpcUrl: string) {
  const id = parseChainId(cfg);
  if (!id) return undefined;
  if (id === foundry.id) return foundry;
  // Define a minimal custom chain with the provided RPC
  return defineChain({
    id,
    name: 'local',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] }, public: { http: [rpcUrl] } },
  });
}

function buildAccount(cfg: ConfigService): Account | undefined {
  const pk = cfg.get<string>('WALLET_PRIVATE_KEY');
  const mnemonic = cfg.get<string>('WALLET_MNEMONIC');
  const index = Number(cfg.get<string>('WALLET_INDEX') ?? '0');

  if (pk && /^0x[0-9a-fA-F]{64}$/.test(pk)) {
    return privateKeyToAccount(pk as `0x${string}`);
  }
  if (mnemonic) {
    // Prefer structured indices to avoid strict path typing issues in viem
    // This maps to the standard BIP44 path m/44'/60'/0'/0/<index>
    const addressIndex = index;
    const changeIndex = 0;
    const accountIndex = 0;
    return mnemonicToAccount(mnemonic, {
      accountIndex,
      changeIndex,
      addressIndex,
    });
  }
  return undefined;
}

export const chainProviders: Provider[] = [
  {
    provide: CHAIN_PUBLIC_CLIENT,
    inject: [ConfigService],
    useFactory: (cfg: ConfigService): PublicClient => {
      const url = cfg.get<string>('CHAIN_RPC_URL') || 'http://localhost:8545';
      const chain = resolveChain(cfg, url);
      return createPublicClient({ transport: http(url), chain });
    },
  },
  {
    provide: CHAIN_ACCOUNT,
    inject: [ConfigService],
    useFactory: (cfg: ConfigService): Account | undefined => {
      return buildAccount(cfg);
    },
  },
  {
    provide: CHAIN_WALLET_CLIENT,
    inject: [ConfigService, CHAIN_PUBLIC_CLIENT, CHAIN_ACCOUNT],
    useFactory: (
      cfg: ConfigService,
      publicClient: PublicClient,
      account?: Account,
    ): WalletClient => {
      const url = cfg.get<string>('CHAIN_RPC_URL') || 'http://localhost:8545';
      const chain = resolveChain(cfg, url);
      // If no account configured, create a wallet client without a default account.
      return createWalletClient({
        transport: http(url),
        chain,
        account,
      });
    },
  },
];
