import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { ChainService } from '@ours-gpu/shared';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  // Log wallet/chain info
  try {
    const chain = app.get(ChainService);
    await chain.logSummary('worker: ');
  } catch (e) {
    console.warn(`ChainService not available: ${(e as Error).message}`);
  }
}
void bootstrap();
