import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { DripsWorkerModule } from '../modules/drips-worker.module';
import { RedactingLogger } from '../security/redacting-logger';

async function bootstrap() {
  const logger = new RedactingLogger('DripWorker');

  const app = await NestFactory.createApplicationContext(DripsWorkerModule, {
    bufferLogs: true,
  });

  app.useLogger(logger);

  logger.log('Drip worker started');

  process.on('SIGINT', async () => {
    logger.log('Stopping drip worker...');
    await app.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.log('Stopping drip worker...');
    await app.close();
    process.exit(0);
  });
}

bootstrap().catch((error) => {
  const logger = new RedactingLogger('DripWorker');
  logger.error(error instanceof Error ? error.message : 'Drip worker failed');
  process.exit(1);
});
