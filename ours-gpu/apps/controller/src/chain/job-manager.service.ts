import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChainService } from '@ours-gpu/shared';
import { JobManagerAbi, CreateJobParams } from '@ours-gpu/shared';
import { OrgRegistryAbi } from '@ours-gpu/shared/contracts/orgRegistry';
import type { Abi, AbiEvent } from 'viem';
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

  async getDistance(userOrg: bigint, nodeOrg: bigint): Promise<bigint> {
    const publicClient = this.chain.getPublicClient();
    const orgRegistry = await this.getOrgRegistryAddress();
    const dist = await publicClient.readContract({
      address: orgRegistry,
      abi: OrgRegistryAbi,
      functionName: 'getDistanceToLCA',
      args: [nodeOrg, userOrg],
    });
    return dist as bigint;
  }

  /**
   * Quote the staked reward required to cover the scheduled window from startTime to killTime.
   */
  async quoteReward(
    requester: Address,
    worker: Address,
    startTime: bigint,
    killTime: bigint,
  ): Promise<{
    reward: bigint;
    tokenDecimals: number;
    userOrg: bigint;
    workerOrg: bigint;
    feeRate: bigint;
    distance: bigint;
  }>{
    const [decimals, userOrg, workerOrg] = await Promise.all([
      this.getTokenDecimals(),
      this.getUserOrg(requester),
      this.getNodeOrg(worker),
    ]);
    const feeRate = await this.getFeeRate(userOrg, workerOrg);
    const distance = await this.getDistance(userOrg, workerOrg);
    const durationSeconds = killTime > startTime ? (killTime - startTime) : 0n;
    const reward = durationSeconds === 0n
      ? 0n
      : ((feeRate * durationSeconds + 3599n) / 3600n); // ceil
    return { reward, tokenDecimals: decimals, userOrg, workerOrg, feeRate, distance };
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

  private getJobSettledEvent(): AbiEvent | null {
    const ev = (JobManagerAbi as any[]).find(
      (item: any) => item?.type === 'event' && item?.name === 'JobSettled',
    );
    return (ev as AbiEvent) ?? null;
  }

  private derivePayoutFromWorkerAmount(workerAmount: bigint): bigint {
    // Mirror JobManager's PLATFORM_FEE_BPS (10%) to reconstruct gross payout from worker amount
    const PLATFORM_FEE_BPS = 1_000n;
    const DENOMINATOR = 10_000n;
    if (workerAmount <= 0n) return 0n;
    const numerator = workerAmount * DENOMINATOR + (DENOMINATOR - PLATFORM_FEE_BPS - 1n);
    return numerator / (DENOMINATOR - PLATFORM_FEE_BPS);
  }

  async getJobFinancials(jobId: bigint): Promise<{
    reward: bigint;
    feePerHour: bigint;
    actualExecutionSeconds: bigint;
    actualEndTime: bigint;
    staked?: bigint | null;
    spent?: bigint | null;
    payoutToWorker?: bigint | null;
    refundToRequester?: bigint | null;
    paidFullStake?: boolean;
    tokenDecimals?: number | null;
  } | null> {
    try {
      const publicClient = this.chain.getPublicClient();
      const [job, tokenDecimals] = await Promise.all([
        publicClient.readContract({
          address: this.getAddress(),
          abi: JobManagerAbi,
          functionName: 'getJob',
          args: [jobId],
        }),
        this.getTokenDecimals().catch(() => null),
      ]);
      const reward = BigInt((job as any)?.reward ?? 0);
      const feePerHour = BigInt((job as any)?.feePerHour ?? 0);
      const actualExecutionSeconds = BigInt((job as any)?.actualExecutionSeconds ?? 0);
      const actualEndTime = BigInt((job as any)?.actualEndTime ?? 0);

      let staked: bigint | null = reward > 0n ? reward : null;
      let spent: bigint | null = null;
      // Provisional spend based on recorded runtime and fee rate
      if (feePerHour > 0n && actualExecutionSeconds > 0n) {
        const payout = (feePerHour * actualExecutionSeconds) / 3600n;
        spent = staked !== null && payout > staked ? staked : payout;
      }

      // If settled on-chain, derive payout/refund from JobSettled log
      try {
        const event = this.getJobSettledEvent();
        if (event) {
          const logs = await publicClient.getLogs({
            address: this.getAddress(),
            event,
            args: { jobId },
            fromBlock: 0n,
          });
          const last = logs[logs.length - 1];
          const args = (last as any)?.args;
          if (args) {
            const payoutToWorker = BigInt(args.payoutToWorker ?? 0);
            const refundToRequester = BigInt(args.refundToRequester ?? 0);
            const paidFullStake = Boolean(args.paidFullStake);
            const payoutGross = this.derivePayoutFromWorkerAmount(payoutToWorker);
            spent = payoutGross;
            staked = payoutGross + refundToRequester;
            return {
              reward,
              feePerHour,
              actualExecutionSeconds,
              actualEndTime,
              staked,
              spent,
              payoutToWorker,
              refundToRequester,
              paidFullStake,
              tokenDecimals,
            };
          }
        }
      } catch {
        // Ignore settlement log errors; fall back to provisional values
      }

      return {
        reward,
        feePerHour,
        actualExecutionSeconds,
        actualEndTime,
        staked,
        spent,
        tokenDecimals,
      };
    } catch {
      return null;
    }
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
    // Compute reward deterministically from fee + schedule unless caller overrides
    const quote = await this.quoteReward(
      params.requester,
      params.worker,
      params.startTime,
      params.killTime,
    );
    const reward = params.reward ?? quote.reward;
    if (reward <= 0n) throw new Error('Quoted reward is zero; check schedule');

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
        { name: 'startTime', type: 'uint256' },
        { name: 'killTime', type: 'uint256' },
      ],
    } as const;

    const msg: CreateJobParams = {
      requester: params.requester,
      orgId: params.orgId,
      target: params.target,
      difficulty: params.difficulty,
      reward,
      worker: params.worker,
      nonce,
      deadline: params.deadline,
      controller,
      startTime: params.startTime,
      killTime: params.killTime,
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

  async completeJob(
    jobId: bigint,
    actualEndTime: bigint,
    actualExecutionSeconds: bigint,
    payFull: boolean,
    success: boolean,
  ): Promise<`0x${string}`> {
    const wallet = this.chain.getWalletClient();
    const publicClient = this.chain.getPublicClient();
    const account = this.chain.getAccount();
    if (!account) throw new Error('Wallet account not configured');
    const hash = await wallet.writeContract({
      address: this.getAddress(),
      abi: JobManagerAbi,
      functionName: 'completeJob',
      args: [jobId, actualEndTime, actualExecutionSeconds, payFull, success],
      account,
      // Provide chain to satisfy viem's WriteContractParameters typing
      chain: publicClient.chain,
    });
    this.logger.log(`completeJob(${jobId}) end=${actualEndTime} seconds=${actualExecutionSeconds} payFull=${payFull} tx=${hash}`);
    return hash as `0x${string}`;
  }
}
