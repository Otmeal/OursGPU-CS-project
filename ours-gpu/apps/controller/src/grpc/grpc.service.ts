import { Injectable, Logger } from '@nestjs/common';
import { WorkersService } from '../workers/workers.service';
import { MinioService } from '../minio/minio.service';
import {
  ChainService,
  RegisterTypes,
  buildRegisterDomain,
  buildRegisterMessage,
  formatRegisterDebug,
} from '@ours-gpu/shared';
import { isAddress, verifyTypedData, recoverTypedDataAddress } from 'viem';
import { randomBytes } from 'crypto';

@Injectable()
export class GrpcService {
  private readonly logger = new Logger(GrpcService.name);
  private readonly challenges = new Map<
    string,
    {
      nonce: `0x${string}`;
      expires: number;
      wallet: `0x${string}`;
      salt: `0x${string}`;
      name: string;
      version: string;
      chainId: number;
    }
  >();

  constructor(
    private readonly workerService: WorkersService,
    private readonly minio: MinioService,
    private readonly chain: ChainService,
  ) {}

  async getRegisterChallenge({ id, wallet }: { id: string; wallet: string }) {
    try {
      if (!wallet || !isAddress(wallet)) {
        return {
          nonce: '',
          expires: 0,
          chainId: 0,
          name: 'OursGPU',
          version: '1',
          salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
        };
      }
      const ttl = Number.parseInt(
        process.env.REGISTER_CHALLENGE_TTL_SECONDS ?? '300',
        10,
      );
      this.logger.debug(
        `GetRegisterChallenge invoked: expired in ${ttl} seconds`,
      );
      const now = Math.floor(Date.now() / 1000);
      const expires = now + ttl;
      const nonce = `0x${randomBytes(32).toString('hex')}` as `0x${string}`;
      const chainId = await this.chain.getPublicClient().getChainId();
      // Domain salt: use fixed env if provided; otherwise random per challenge (bytes32)
      let salt = process.env.SIGN_DOMAIN_SALT as `0x${string}` | undefined;
      if (!salt || !/^0x[0-9a-fA-F]{64}$/.test(salt)) {
        salt = `0x${randomBytes(32).toString('hex')}`;
      }
      const name = process.env.SIGN_DOMAIN_NAME ?? 'OursGPU';
      const version = process.env.SIGN_DOMAIN_VERSION ?? '1';
      const key = `${id}:${wallet.toLowerCase()}`;
      this.challenges.set(key, {
        nonce,
        expires,
        wallet: wallet,
        salt,
        name,
        version,
        chainId,
      });
      // Cleanup after expiry (best-effort)
      setTimeout(
        () => {
          const cur = this.challenges.get(key);
          const now2 = Math.floor(Date.now() / 1000);
          if (cur && cur.expires <= now2) this.challenges.delete(key);
        },
        Math.max(1, expires - now + 5) * 1000,
      ).unref?.();
      return { nonce, expires, chainId, name, version, salt };
    } catch (e) {
      this.logger.warn(`GetRegisterChallenge error: ${(e as Error).message}`);
      return {
        nonce: '',
        expires: 0,
        chainId: 0,
        name: 'OursGPU',
        version: '1',
        salt: '0x0000000000000000000000000000000000000000000000000000000000000000',
      };
    }
  }

  async register({
    id,
    orgId,
    concurrency,
    wallet,
    nonce,
    expires,
    signature,
  }: {
    id: string;
    orgId: string;
    concurrency: number;
    wallet?: string;
    nonce?: string;
    expires?: number;
    signature?: string;
  }) {
    // Enforce worker staking threshold before accepting registration
    const requireStakeTokens = Number.parseInt(
      process.env.STAKE_MIN_TOKENS ?? '100',
      10,
    );
    const decimals = Number.parseInt(
      process.env.STAKE_TOKEN_DECIMALS ?? '18',
      10,
    );
    const workerMgr = process.env.WORKER_MANAGER_ADDRESS as
      | `0x${string}`
      | undefined;

    if (!wallet || !isAddress(wallet)) {
      this.logger.warn(`Register rejected: invalid wallet for worker id=${id}`);
      return { ok: false, note: 'invalid or missing wallet address' };
    }

    // 1) Verify EIP-712 signature against a recently issued challenge
    try {
      const key = `${id}:${wallet.toLowerCase()}`;
      const ch = this.challenges.get(key);
      if (!ch) return { ok: false, note: 'no challenge issued' };
      if (!nonce || !expires || !signature)
        return { ok: false, note: 'missing nonce/expires/signature' };
      const now = Math.floor(Date.now() / 1000);
      if (expires <= now) return { ok: false, note: 'challenge expired' };
      if (ch.nonce.toLowerCase() !== nonce.toLowerCase())
        return { ok: false, note: 'nonce mismatch' };
      if (Number(expires) !== Number(ch.expires)) {
        this.logger.warn(
          `expires mismatch (client=${expires} server=${ch.expires}) — using server value for verification`,
        );
      }

      const domain = buildRegisterDomain({
        name: ch.name,
        version: ch.version,
        chainId: ch.chainId,
        salt: ch.salt,
      });
      // Build message strictly from server-issued challenge to avoid any client-side drift
      const message = buildRegisterMessage({
        workerId: id,
        nonce: ch.nonce,
        expires: ch.expires,
      });
      this.logger.debug(`Verify: ${formatRegisterDebug(domain, message)}`);
      const okSig = await verifyTypedData({
        address: wallet,
        domain,
        types: RegisterTypes,
        primaryType: 'Register',
        message,
        signature: signature as `0x${string}`,
      });
      if (!okSig) {
        try {
          const recovered = await recoverTypedDataAddress({
            domain,
            types: RegisterTypes,
            primaryType: 'Register',
            message,
            signature: signature as `0x${string}`,
          });
          this.logger.warn(
            `Invalid signature: expected wallet ${wallet}, recovered ${recovered}`,
          );
        } catch (err) {
          this.logger.debug(
            `Recover signer failed (likely malformed signature): ${
              (err as Error)?.message ?? String(err)
            }`,
          );
        }
        return { ok: false, note: 'invalid signature' };
      }
      // one-time use
      this.challenges.delete(key);
    } catch (e) {
      this.logger.warn(`Signature verify failed: ${(e as Error).message}`);
      return { ok: false, note: 'signature verification failed' };
    }

    try {
      const required = BigInt(requireStakeTokens) * 10n ** BigInt(decimals);
      const publicClient = this.chain.getPublicClient();
      // Minimal ABI for WorkerManager.stakeOf(address) -> uint256
      const workerManagerAbi = [
        {
          type: 'function',
          name: 'stakeOf',
          stateMutability: 'view',
          inputs: [{ name: 'worker', type: 'address' }],
          outputs: [{ name: '', type: 'uint256' }],
        },
      ] as const;

      let staked = 0n;
      if (workerMgr) {
        staked = await publicClient.readContract({
          address: workerMgr,
          abi: workerManagerAbi,
          functionName: 'stakeOf',
          args: [wallet],
        });
      } else {
        this.logger.warn('Stake check skipped: WORKER_MANAGER_ADDRESS not set');
      }

      if (workerMgr && staked < required) {
        const msg = `insufficient stake: requires ${requireStakeTokens} tokens`;
        this.logger.warn(
          `Register rejected for ${id} (${wallet}): staked=${staked} required=${required}`,
        );
        return { ok: false, note: msg };
      }

      await this.workerService.register({
        id,
        orgId,
        concurrency,
        lastSeen: Date.now(),
        running: 0,
        wallet,
      });
      return { ok: true, note: 'registered' };
    } catch (e) {
      this.logger.warn(`Stake check failed: ${(e as Error).message}`);
      return { ok: false, note: 'stake check failed' };
    }
  }

  async heartbeat({ id, running }: { id: string; running: number }) {
    const ok = await this.workerService.heartbeat(id, running);
    return { ok };
  }

  jobStream({ id }: { id: string }) {
    // Return a server-streaming Observable of Job for this worker
    return this.workerService.subscribe(id);
  }

  report({
    jobId,
    success,
    solution,
    metricsJson,
    executionSeconds,
    terminated,
    endAt,
    executedAt,
  }: {
    jobId: string;
    success: boolean;
    solution?: string;
    metricsJson?: string;
    executionSeconds?: number;
    terminated?: boolean;
    endAt?: number;
    executedAt?: number;
  }) {
    return this.workerService.report(
      jobId,
      success,
      solution,
      metricsJson,
      executionSeconds,
      terminated,
      endAt,
      executedAt,
    ).then((ok) => ({ ok }));
  }

  async presignOutput({
    jobId,
    fileName,
    expiresSeconds,
  }: {
    jobId: string;
    fileName: string;
    expiresSeconds?: number;
  }) {
    const bucket = process.env.MINIO_BUCKET_JOBS ?? 'jobs';
    const objectKey = `outputs/${jobId}/${fileName}`;
    const [putUrl, getUrl] = await Promise.all([
      this.minio.presignPut(objectKey, expiresSeconds ?? 3600),
      this.minio.presignGet(objectKey, expiresSeconds ?? 3600),
    ]);
    return { bucket, objectKey, putUrl, getUrl };
  }

  async listScheduled({ id }: { id: string }) {
    const jobs = await this.workerService.listScheduledJobs(id);
    return { jobs };
  }
}
