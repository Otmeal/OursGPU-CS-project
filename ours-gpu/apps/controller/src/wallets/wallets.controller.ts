import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { WalletsService } from './wallets.service';
import { JobStatus } from '@prisma/client';

@Controller('wallets')
export class WalletsController {
  constructor(private readonly wallets: WalletsService) {}

  @Post()
  async createWallet(
    @Body()
    body: {
      wallet: string;
      name: string;
      email: string;
      pepperVersion?: number | string;
    },
  ) {
    if (!body.wallet || typeof body.wallet !== 'string' || !body.wallet.trim()) {
      throw new BadRequestException('wallet is required');
    }
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      throw new BadRequestException('name is required');
    }
    if (!body.email || typeof body.email !== 'string' || !body.email.trim()) {
      throw new BadRequestException('email is required');
    }
    if (!/.+@.+\..+/.test(body.email)) {
      throw new BadRequestException('email must be a valid email address');
    }
    const pepperVersion =
      body.pepperVersion !== undefined ? Number(body.pepperVersion) : undefined;
    if (pepperVersion !== undefined && Number.isNaN(pepperVersion)) {
      throw new BadRequestException('pepperVersion must be a number when provided');
    }
    const existing = await this.wallets.findById(body.wallet);
    if (existing) {
      throw new BadRequestException('wallet is already registered');
    }
    return this.wallets.recordInfoAndLink(
      body.wallet,
      { fullName: body.name, email: body.email },
      { pepperVersion },
    );
  }

  @Get()
  list(
    @Query('wallet') wallet?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.wallets.list({ wallet, skip: skip ? Number(skip) : undefined, take: take ? Number(take) : undefined });
  }

  @Get(':id')
  getById(@Param('id') walletId: string) {
    return this.wallets.findById(walletId).then((w) => {
      if (!w) throw new NotFoundException('Wallet not found');
      return w;
    });
  }

  @Get(':id/jobs')
  jobs(
    @Param('id') walletId: string,
    @Query('status') status?: JobStatus,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.wallets.jobsForWallet(walletId, {
      status,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @Get('wallet/:wallet')
  getByWallet(@Param('wallet') wallet: string) {
    return this.wallets.findById(wallet).then((w) => {
      if (!w) throw new NotFoundException('Wallet not found');
      return w;
    });
  }

  @Get('wallet/:wallet/jobs')
  async jobsByWallet(
    @Param('wallet') wallet: string,
    @Query('status') status?: JobStatus,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.wallets.jobsForWallet(wallet, {
      status,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }
}
