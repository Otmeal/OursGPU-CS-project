import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { ControllerModule } from './controller.module';
import { join } from 'path';
import { existsSync } from 'fs';
import { Logger, LogLevel } from '@nestjs/common';

async function bootstrap() {
  // HTTP 給 Nuxt（REST）
  const logLevels: LogLevel[] =
    process.env.NODE_ENV === 'production'
      ? ['log', 'error', 'warn']
      : ['log', 'error', 'warn', 'debug', 'verbose'];
  const app = await NestFactory.create(ControllerModule, { cors: true, logger: logLevels });

  // 決定 .proto 路徑（優先 dist，否則退回原始碼路徑）
  const protoCandidates = [
    join(__dirname, '../../libs/shared/proto/worker.proto'), // dist 佈署位置
    join(process.cwd(), 'libs/shared/proto/worker.proto'), // 原始碼位置（開發）
  ];
  const workerProtoPath = protoCandidates.find((p) => existsSync(p)) ?? protoCandidates[0];
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
    },
  });

  await app.startAllMicroservices();
  logger.log('gRPC microservice started');
  await app.listen(3000);
  logger.log('HTTP server listening on 3000');
}
bootstrap();
