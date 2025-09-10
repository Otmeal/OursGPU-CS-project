import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { existsSync } from 'fs';
import { join } from 'path';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'GRPC_CLIENT',
        transport: Transport.GRPC,
        options: {
          package: 'ours_gpu',
          protoPath:
            [
              join(__dirname, '../../libs/shared/proto/worker.proto'),
              join(process.cwd(), 'libs/shared/proto/worker.proto'),
            ].find((p) => existsSync(p)) ??
            join(__dirname, '../../libs/shared/proto/worker.proto'),
          url: process.env.CONTROLLER_GRPC ?? 'controller1:50051',
          // Align uint64 wire types to JS numbers
          loader: { longs: Number },
        },
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class GrpcClientModule {}
