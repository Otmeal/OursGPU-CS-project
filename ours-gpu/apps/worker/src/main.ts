import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ClientGrpc, Client, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { randomUUID } from 'crypto';

interface WorkerClient {
  Register(data: any): Promise<any>;
  Heartbeat(data: any): Promise<any>;
  PullJob(data: any): Promise<any>;
  ReportResult(data: any): Promise<any>;
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const client = app.get<ClientGrpc>('GRPC_CLIENT');
  const svc = client.getService<WorkerClient>('WorkerService');

  const id = process.env.WORKER_ID ?? randomUUID();
  await svc.Register({ id, orgId: process.env.ORG_ID ?? 'org-1', concurrency: 1 });

  // 心跳 + 拉任務（超簡單輪詢）
  setInterval(async () => {
    await svc.Heartbeat({ id, running: 0 });
    const job = await svc.PullJob({ id });
    if (job?.jobId) {
      // 模擬計算（此處放你的雜湊/nonce 搜尋）
      const ok = true; // 假裝成功
      await svc.ReportResult({ jobId: job.jobId, workerId: id, solution: 'nonce123', success: ok });
    }
  }, 2000);
}
bootstrap();
