import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Inject,
  forwardRef,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { JobsService } from './jobs.service';
import { VerificationMethod, Prisma } from '@prisma/client';
import { MinioService } from '../minio/minio.service';
import { WorkersService } from '../workers/workers.service';
import { WalletsService } from '../wallets/wallets.service';
import { JobManagerChainService } from '../chain/job-manager.service';

@Controller('jobs')
export class JobsController {
  constructor(
    private readonly jobs: JobsService,
    private readonly wallets: WalletsService,
    private readonly minio: MinioService,
    @Inject(forwardRef(() => WorkersService))
    private readonly workers: WorkersService,
    private readonly jmChain: JobManagerChainService,
  ) {}
  

  @Get()
  list() {
    return this.jobs.list();
  }

  @Get(['wallet', 'user'])
  listByWallet(
    @Query('walletId') walletId?: string,
    @Query('userId') userId?: string,
  ) {
    // List jobs for a given wallet id (legacy: userId).
    const id = (walletId ?? userId)?.trim().toLowerCase();
    if (!id) {
      throw new BadRequestException('walletId query param is required');
    }
    return this.jobs.jobsByWallet(id);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const job = await this.jobs.findById(id);
    if (!job) throw new NotFoundException('Job not found');
    // Merge in any in-memory runtime fields (solution/metrics/status) if available
    const runtime = this.workers.getJob(id);
    const result: any = { ...job };
    if (runtime) {
      result.status = runtime.status as any;
      if (runtime.workerId) result.workerId = runtime.workerId;
      if (runtime.solution) result.solution = runtime.solution;
      if (runtime.metricsJson) result.metricsJson = runtime.metricsJson;
    }
    // If an output object exists, attach a temporary public GET URL for convenience
    if ((job as any).outputObjectKey) {
      try {
        result.outputGetUrl = await this.minio.presignGet(
          (job as any).outputObjectKey,
          3600,
          { public: true },
        );
      } catch {
        // ignore presign error, leave url undefined
      }
    }
    return result;
  }

  @Post()
  async create(
    @Body()
    body: Prisma.JobUncheckedCreateInput & {
      wallet?: string;
      userWallet?: string; // legacy alias
    },
  ) {
    const { wallet, userWallet, ...jobInput } = body;
    const walletAddress = (wallet ?? userWallet)?.trim().toLowerCase();
    if (!walletAddress) {
      throw new BadRequestException('wallet (wallet address) is required');
    }
    // Verify primary job payload exists in MinIO
    try {
      await this.minio.stat(jobInput.objectKey);
    } catch {
      throw new NotFoundException('MinIO object not found: ' + jobInput.objectKey);
    }
    // If requesting user-program verification, the verifier assets should exist too
    if (
      jobInput.verification === VerificationMethod.USER_PROGRAM &&
      jobInput.verifierObjectKey
    ) {
      try {
        await this.minio.stat(jobInput.verifierObjectKey);
      } catch {
        throw new NotFoundException(
          'Verifier object not found: ' + jobInput.verifierObjectKey,
        );
      }
    }
    // If a wallet is provided, ensure it exists and attach to job
    const walletRecord = await this.wallets.findById(walletAddress);
    if (!walletRecord) {
      throw new BadRequestException(
        'wallet is not registered; create it first via POST /wallets with name and email',
      );
    }
    const createInput: Prisma.JobUncheckedCreateInput = {
      ...jobInput,
      walletId: walletRecord.id,
    } as Prisma.JobUncheckedCreateInput;

    const job = await this.jobs.create(createInput);
    await this.workers.dispatch(job, jobInput.workerId);
    await this.jobs.markScheduled(job.id, jobInput.workerId!);
    return job;
  }

  // Controller-signed EIP-712 approval for user-sent on-chain job creation
  @Post('sign-create')
  async signCreate(
    @Body()
    body: {
      requester: string;
      orgId?: number | string; // optional; will be resolved from chain if not provided
      target?: string;
      difficulty?: number | string;
      reward: string | number; // integer token units (will be ignored if quote flow is used)
      worker: string; // EVM address of worker
      deadline?: number; // unix seconds
      nonce?: string | number; // optional override
    },
  ) {
    const requester = (body.requester || '').toLowerCase();
    if (!/^0x[0-9a-fA-F]{40}$/.test(requester)) {
      throw new BadRequestException('invalid requester address');
    }
    const worker = (body.worker || '').toLowerCase();
    if (!/^0x[0-9a-fA-F]{40}$/.test(worker)) {
      throw new BadRequestException('invalid worker address');
    }
    // Resolve orgId from chain if not provided or invalid
    let orgId = BigInt(0);
    try {
      if (body.orgId !== undefined && !Number.isNaN(Number(body.orgId))) {
        orgId = BigInt(Number(body.orgId));
      } else {
        orgId = await this.jmChain.getUserOrg(requester as any);
      }
    } catch {}
    const target = (body.target && /^0x[0-9a-fA-F]{64}$/.test(body.target))
      ? (body.target as `0x${string}`)
      : ("0x" + '0'.repeat(64)) as `0x${string}`;
    const difficulty = BigInt(Number(body.difficulty ?? 0));
    const reward = BigInt(body.reward);
    const deadline = BigInt(body.deadline ?? Math.floor(Date.now() / 1000) + 3600);
    const nonce = body.nonce !== undefined ? BigInt(body.nonce) : undefined;

    const { signature, params, chainId } = await this.jmChain.signCreateJob({
      requester: requester as `0x${string}`,
      orgId,
      target,
      difficulty,
      reward,
      worker: worker as `0x${string}`,
      deadline,
      nonce,
    } as any);
    return {
      signature,
      params,
      domain: {
        name: 'JobManager',
        version: '1',
        chainId,
        verifyingContract: this.jmChain.getAddress(),
      },
      controller: this.jmChain.getControllerAddress(),
    };
  }

  @Post('presign')
  async presign(@Body() body: { objectKey: string; expiresSeconds?: number }) {
    const url = await this.minio.presignPut(
      body.objectKey,
      body.expiresSeconds ?? 3600,
      { public: true },
    );
    return {
      url,
      bucket: process.env.MINIO_BUCKET_JOBS ?? 'jobs',
      objectKey: body.objectKey,
    };
  }

  @Post(':jobId/outputs/presign')
  async presignOutput(
    @Param('jobId') jobId: string,
    @Body() body: { fileName: string; expiresSeconds?: number },
  ) {
    const bucket = process.env.MINIO_BUCKET_JOBS ?? 'jobs';
    const objectKey = `outputs/${jobId}/${body.fileName}`;
    const [putUrl, getUrl] = await Promise.all([
      this.minio.presignPut(objectKey, body.expiresSeconds ?? 3600, {
        public: true,
      }),
      this.minio.presignGet(objectKey, body.expiresSeconds ?? 3600, {
        public: true,
      }),
    ]);
    return { bucket, objectKey, putUrl, getUrl };
  }
}
