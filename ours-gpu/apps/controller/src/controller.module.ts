import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JobsModule } from './jobs/jobs.module';
import { ControllerController } from './controller.controller';
import { ControllerService } from './controller.service';
import { WorkersModule } from './workers/workers.module';
import { GrpcModule } from './grpc/grpc.module';
import { ChainModule } from '@ours-gpu/shared';
import { WalletsModule } from './wallets/wallets.module';
import { UserInfoModule } from './user-info/user-info.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ChainModule,
    WorkersModule,
    GrpcModule,
    JobsModule,
    WalletsModule,
    UserInfoModule,
  ],
  controllers: [ControllerController],
  providers: [ControllerService],
})
export class ControllerModule {}
