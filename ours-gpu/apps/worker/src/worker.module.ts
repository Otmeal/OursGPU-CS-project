import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'GRPC_CLIENT',
        transport: Transport.GRPC,
        options: {
          package: 'gpu',
          protoPath: join(__dirname, '../../libs/shared/proto/worker.proto'),
          url: process.env.CONTROLLER_GRPC ?? 'controller:50051',
        },
      },
    ]),
  ],
})
export class AppModule {}
