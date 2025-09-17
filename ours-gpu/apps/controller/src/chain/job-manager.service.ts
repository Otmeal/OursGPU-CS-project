import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChainService } from '@ours-gpu/shared';
import { JobManagerAbi, CreateJobParams } from '@ours-gpu/shared';
import { OrgRegistryAbi } from '@ours-gpu/shared/contracts/orgRegistry';
import type { Abi } from 'viem';
import type { Address } from 'viem';

@Injectable()
export class JobManagerChainService {
  private readonly logger = new Logger(JobManagerChainService.name);

  constructor(
    private readonly cfg: ConfigService,
    private readonly chain: ChainService,
  ) {}

  getAddress(): Address {
    const addr = this.cfg.get<string>('JOB_MANAGER_ADDRESS');
    if (!addr || !addr.startsWith('0x')) throw new Error('JOB_MANAGER_ADDRESS not set');
    return addr as Address;
  }

  getControllerAddress(): Address | undefined {
    const addr = this.chain.getAddress();
    return addr as Address | undefined;
  }

  async getTokenAddress(): Promise<Address> {
    const publicClient = this.chain.getPublicClient();
    const token = await publicClient.readContract({
      address: this.getAddress(),
      abi: JobManagerAbi,
      functionName: 'token',
    });
    return token as Address;
  }

  async getOrgRegistryAddress(): Promise<Address> {
    const publicClient = this.chain.getPublicClient();
    const addr = await publicClient.readContract({
      address: this.getAddress(),
      abi: JobManagerAbi,
      functionName: 'orgRegistry',
    });
    return addr as Address;
  }

  async getTokenDecimals(): Promise<number> {
    const publicClient = this.chain.getPublicClient();
    const tokenAddress = await this.getTokenAddress();
    const erc20Abi: Abi = [
      {
        type: 'function',
        name: 'decimals',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'uint8', name: '' }],
      },
    ];
    const d = await publicClient.readContract({
      address: tokenAddress,
      abi: erc20Abi,
      functionName: 'decimals',
    });
    return Number(d);
  }

  async getUserOrg(user: Address): Promise<bigint> {
    const publicClient = this.chain.getPublicClient();
    const orgRegistry = await this.getOrgRegistryAddress();
    const org = await publicClient.readContract({
      address: orgRegistry,
      abi: OrgRegistryAbi,
      functionName: 'userOrganizations',
      args: [user],
    });
    return org as bigint;
  }

  async getNodeOrg(node: Address): Promise<bigint> {
    const publicClient = this.chain.getPublicClient();
    const orgRegistry = await this.getOrgRegistryAddress();
    const org = await publicClient.readContract({
      address: orgRegistry,
      abi: OrgRegistryAbi,
      functionName: 'nodeOrganizations',
      args: [node],
    });
    return org as bigint;
  }

  async getOrgInfo(orgId: bigint): Promise<null | { parentOrg: bigint; name: string; baseRate: bigint; perLevelMarkup: bigint }>{
    try {
      const publicClient = this.chain.getPublicClient();
      const orgRegistry = await this.getOrgRegistryAddress();
      const info = await publicClient.readContract({
        address: orgRegistry,
        abi: OrgRegistryAbi,
        functionName: 'organizations',
        args: [orgId],
      }) as any;
      if (!info) return null;
      // viem returns a struct object with named fields when available
      const name = (info as any).name ?? (Array.isArray(info) ? info[1] : undefined);
      const parentOrg = (info as any).parentOrg ?? (Array.isArray(info) ? info[0] : undefined);
      const baseRate = (info as any).baseRate ?? (Array.isArray(info) ? info[2] : undefined);
      const perLevelMarkup = (info as any).perLevelMarkup ?? (Array.isArray(info) ? info[3] : undefined);
      if (name === undefined || parentOrg === undefined) return null;
      return {
        parentOrg: BigInt(parentOrg),
        name: String(name),
        baseRate: BigInt(baseRate ?? 0),
        perLevelMarkup: BigInt(perLevelMarkup ?? 0),
      };
    } catch {
      return null;
    }
  }

  async getFeeRate(userOrg: bigint, nodeOrg: bigint): Promise<bigint> {
    const publicClient = this.chain.getPublicClient();
    const orgRegistry = await this.getOrgRegistryAddress();
    const fee = await publicClient.readContract({
      address: orgRegistry,
      abi: OrgRegistryAbi,
      functionName: 'calculateFee',
      args: [userOrg, nodeOrg],
    });
    return fee as bigint;
  }

  /**
   * Quote a reward amount (in raw token units) using OrgRegistry fee rate and a base amount.
   * Formula: reward = BASE_TOKENS * 10^decimals
   * You can refine to include fee rate if desired, but keep it deterministic.
   */
  async quoteReward(requester: Address, worker: Address): Promise<{ reward: bigint; tokenDecimals: number; userOrg: bigint; workerOrg: bigint; feeRate: bigint }>{
    const [decimals, userOrg, workerOrg] = await Promise.all([
      this.getTokenDecimals(),
      this.getUserOrg(requester),
      this.getNodeOrg(worker),
    ]);
    const feeRate = await this.getFeeRate(userOrg, workerOrg);
    // Base tokens per job from env (default 1 token)
    const baseTokens = BigInt(process.env.REWARD_BASE_TOKENS ?? '1');
    const reward = baseTokens * (10n ** BigInt(decimals));
    return { reward, tokenDecimals: decimals, userOrg, workerOrg, feeRate };
  }

  async getNonce(owner: Address): Promise<bigint> {
    const publicClient = this.chain.getPublicClient();
    const nonce = await publicClient.readContract({
      address: this.getAddress(),
      abi: JobManagerAbi,
      functionName: 'nonces',
      args: [owner],
    });
    return nonce as bigint;
  }

  async signCreateJob(params: Omit<CreateJobParams, 'controller' | 'nonce'> & { nonce?: bigint }): Promise<{ signature: `0x${string}`; params: CreateJobParams; chainId: number }>
  {
    const controller = this.getControllerAddress();
    if (!controller) throw new Error('Controller wallet not configured');
    const publicClient = this.chain.getPublicClient();
    const wallet = this.chain.getWalletClient();
    const account = this.chain.getAccount();
    if (!account) throw new Error('Wallet account not configured');
    const chainId = await publicClient.getChainId();
    // If nonce not provided, read from contract
    const nonce = params.nonce ?? (await this.getNonce(params.requester));

    const domain = {
      name: 'JobManager',
      version: '1',
      chainId,
      verifyingContract: this.getAddress(),
    } as const;

    const types = {
      CreateJob: [
        { name: 'requester', type: 'address' },
        { name: 'orgId', type: 'uint256' },
        { name: 'target', type: 'bytes32' },
        { name: 'difficulty', type: 'uint256' },
        { name: 'reward', type: 'uint256' },
        { name: 'worker', type: 'address' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
        { name: 'controller', type: 'address' },
      ],
    } as const;

    const msg: CreateJobParams = {
      requester: params.requester,
      orgId: params.orgId,
      target: params.target,
      difficulty: params.difficulty,
      reward: params.reward,
      worker: params.worker,
      nonce,
      deadline: params.deadline,
      controller,
    };

    const signature = await wallet.signTypedData({
      account,
      domain,
      types,
      primaryType: 'CreateJob',
      message: msg,
    });

    return { signature, params: msg, chainId };
  }

  async completeJob(jobId: bigint): Promise<`0x${string}`> {
    const wallet = this.chain.getWalletClient();
    const publicClient = this.chain.getPublicClient();
    const account = this.chain.getAccount();
    if (!account) throw new Error('Wallet account not configured');
    const hash = await wallet.writeContract({
      address: this.getAddress(),
      abi: JobManagerAbi,
      functionName: 'completeJob',
      args: [jobId],
      account,
      // Provide chain to satisfy viem's WriteContractParameters typing
      chain: publicClient.chain,
    });
    this.logger.log(`completeJob(${jobId}) tx=${hash}`);
    return hash as `0x${string}`;
  }
}
