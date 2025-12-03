import { BadRequestException, Controller, Get, Param, Post } from '@nestjs/common';
import { UserInfoService } from './user-info.service';

@Controller('user-info')
export class UserInfoController {
  constructor(private readonly userInfo: UserInfoService) {}

  @Post('shuffle')
  shuffle() {
    return this.userInfo.shuffleTable();
  }

  @Get('wallet/:wallet')
  recover(@Param('wallet') wallet: string) {
    if (!wallet || !wallet.trim()) {
      throw new BadRequestException('wallet is required');
    }
    return this.userInfo.recoverForWallet(wallet);
  }
}
