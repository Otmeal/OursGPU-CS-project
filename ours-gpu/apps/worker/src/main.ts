import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { ChainService } from '@ours-gpu/shared';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  // If this worker ever exposes HTTP (Nest application instead of context),
  // configure Express to serialize BigInt as strings globally.
  const httpAdapter = (app as any).getHttpAdapter?.();
  const instance = httpAdapter?.getInstance?.();
  instance?.set?.('json replacer', (_key: string, value: unknown) =>
    typeof value === 'bigint' ? value.toString() : value,
  );
  // Log wallet/chain info
  try {
    const chain = app.get(ChainService);
    await chain.logSummary('worker: ');
  } catch (e) {
    console.warn(`ChainService not available: ${(e as Error).message}`);
  }
}
void bootstrap();
