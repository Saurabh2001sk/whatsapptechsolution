import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CampaignsWorkerModule } from '../modules/campaigns-worker.module';
import { RedactingLogger } from '../security/redacting-logger';

async function bootstrap() {
  const logger = new RedactingLogger('CampaignWorker');

  const app = await NestFactory.createApplicationContext(CampaignsWorkerModule, {
    bufferLogs: true,
  });

  app.useLogger(logger);

  logger.log('Campaign worker started');

  process.on('SIGINT', async () => {
    logger.log('Stopping campaign worker...');
    await app.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.log('Stopping campaign worker...');
    await app.close();
    process.exit(0);
  });
}

bootstrap().catch((error) => {
  const logger = new RedactingLogger('CampaignWorker');
  logger.error(error instanceof Error ? error.message : 'Campaign worker failed');
  process.exit(1);
});