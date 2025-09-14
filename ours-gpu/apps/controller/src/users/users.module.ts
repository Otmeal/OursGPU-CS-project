import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [],
  providers: [PrismaService, UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}

