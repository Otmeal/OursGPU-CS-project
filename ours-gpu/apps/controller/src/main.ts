import { NestFactory } from '@nestjs/core';
import { Transport, MicroserviceOptions } from '@nestjs/microservices';
import { ControllerModule } from './controller.module';
import { join } from 'path';

async function bootstrap() {
  // HTTP 給 Nuxt（REST）
  const app = await NestFactory.create(ControllerModule, { cors: true });

  // gRPC 給 workers
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.GRPC,
    options: {
      package: 'gpu',
      protoPath: join(__dirname, '../../libs/shared/proto/worker.proto'),
      url: '0.0.0.0:50051',
    },
  });

  await app.startAllMicroservices();
  await app.listen(3000);
}
bootstrap();
