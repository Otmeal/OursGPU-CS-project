import { Module } from '@nestjs/common';
import { UserInfoService } from './user-info.service';
import { UserInfoController } from './user-info.controller';
import { PrismaService } from '../prisma/prisma.service';
import { WalletsModule } from '../wallets/wallets.module';

@Module({
  imports: [WalletsModule],
  providers: [PrismaService, UserInfoService],
  controllers: [UserInfoController],
  exports: [UserInfoService],
})
export class UserInfoModule {}
