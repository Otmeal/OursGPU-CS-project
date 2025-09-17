import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { ControllerModule } from './controller.module';
import { join } from 'path';
import { existsSync } from 'fs';
import { Logger, LogLevel } from '@nestjs/common';
import { ChainService } from '@ours-gpu/shared';

async function bootstrap() {
  // HTTP 給 Nuxt（REST）
  const logLevels: LogLevel[] =
    process.env.NODE_ENV === 'production'
      ? ['log', 'error', 'warn']
      : ['log', 'error', 'warn', 'debug', 'verbose'];
  const app = await NestFactory.create<NestExpressApplication>(ControllerModule, {
    cors: true,
    logger: logLevels,
  });

  // Globally convert BigInt values to strings in JSON responses
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('json replacer', (_key: string, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value,
  );

  // 決定 .proto 路徑（優先 dist，否則退回原始碼路徑）
  const protoCandidates = [
    join(__dirname, '../../libs/shared/proto/worker.proto'), // dist 佈署位置
    join(process.cwd(), 'libs/shared/proto/worker.proto'), // 原始碼位置（開發）
  ];
  const workerProtoPath =
    protoCandidates.find((p) => existsSync(p)) ?? protoCandidates[0];
  const grpcUrl = process.env.CONTROLLER_GRPC ?? '0.0.0.0:50051';
  const logger = new Logger('Bootstrap');
  logger.log(`gRPC proto: ${workerProtoPath}`);
  logger.log(`gRPC bind: ${grpcUrl}`);

  // gRPC 給 workers
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'ours_gpu',
      protoPath: workerProtoPath,
      url: grpcUrl,
      // Ensure uint64 fields (e.g., expires, chainId) are delivered as JS numbers
      loader: { longs: Number },
    },
  });

  await app.startAllMicroservices();
  logger.log('gRPC microservice started');
  // Log wallet/chain info
  try {
    const chain = app.get(ChainService);
    await chain.logSummary('controller: ');
  } catch (e) {
    logger.warn(`ChainService not available: ${(e as Error).message}`);
  }
  await app.listen(3000);
  logger.log('HTTP server listening on 3000');
}
void bootstrap();
