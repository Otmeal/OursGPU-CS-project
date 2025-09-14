import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { JobStatus } from '@prisma/client';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  list(
    @Query('wallet') wallet?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.users.list({ wallet, skip: skip ? Number(skip) : undefined, take: take ? Number(take) : undefined });
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.users.findById(id);
  }

  @Get(':id/jobs')
  jobs(
    @Param('id') id: string,
    @Query('status') status?: JobStatus,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.users.jobsForUser(id, {
      status,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }

  @Get('wallet/:wallet')
  getByWallet(@Param('wallet') wallet: string) {
    return this.users.findById(wallet);
  }

  @Get('wallet/:wallet/jobs')
  async jobsByWallet(
    @Param('wallet') wallet: string,
    @Query('status') status?: JobStatus,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.users.jobsForUser(wallet, {
      status,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }
}
