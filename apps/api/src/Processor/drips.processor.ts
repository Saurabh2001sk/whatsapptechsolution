import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { env } from '../env';
import {
  DRIP_EXISTING_CONTACT_ENROLLMENT_QUEUE,
  DRIP_SEND_QUEUE,
  DripExistingContactsEnrollmentJobData,
  DripSendJobData,
} from '../Queues/drips.queue';
import { DripsService } from '../services/drips.service';

function getRedisConnectionOptions() {
  if (!env.redisUrl && env.isProduction) {
    throw new Error(
      'REDIS_URL is required for drip worker in production',
    );
  }

  const redisUrl = env.redisUrl || 'redis://localhost:6379';

  return {
    url: redisUrl,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: redisUrl.startsWith('rediss://') ? {} : undefined,
  };
}

@Injectable()
export class DripsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DripsProcessor.name);
  private worker: Worker<DripSendJobData> | null = null;
  private existingContactsEnrollmentWorker: Worker<DripExistingContactsEnrollmentJobData> | null =
    null;
  private recoveryTimer: NodeJS.Timeout | null = null;

  constructor(private readonly dripsService: DripsService) {}

  onModuleInit() {
    this.worker = new Worker<DripSendJobData>(
      DRIP_SEND_QUEUE,
      async (job: Job<DripSendJobData>) => {
        try {
          return await this.dripsService.processDripSendJob(job.data);
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : 'Drip worker failed';

          const maximumAttempts = Number(job.opts.attempts || 1);
          const attemptsRemain =
            job.attemptsMade + 1 < maximumAttempts;

          const shouldRetry =
            attemptsRemain &&
            this.dripsService.isRetryableDripError(
              error,
            );

          await this.dripsService.markDripMessageFailed({
            tenantId: job.data.tenantId,
            dripMessageId: job.data.dripMessageId,
            errorMessage,
            shouldRetry,
          });

          throw error;
        }
      },
      {
        connection: getRedisConnectionOptions(),
        concurrency: 2,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`Drip job completed ${job.id}`);
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Drip job failed ${job?.id || 'unknown'}: ${error.message}`,
      );
    });

    this.existingContactsEnrollmentWorker =
      new Worker<DripExistingContactsEnrollmentJobData>(
        DRIP_EXISTING_CONTACT_ENROLLMENT_QUEUE,
        async (job: Job<DripExistingContactsEnrollmentJobData>) =>
          this.dripsService.processExistingContactsEnrollmentBatch(job.data),
        {
          connection: getRedisConnectionOptions(),
          concurrency: 1,
        },
      );

    this.existingContactsEnrollmentWorker.on('completed', (job) => {
      this.logger.log(`Drip existing-contact enrollment batch completed ${job.id}`);
    });

    this.existingContactsEnrollmentWorker.on('failed', (job, error) => {
      this.logger.error(
        `Drip existing-contact enrollment batch failed ${job?.id || 'unknown'}: ${error.message}`,
      );
    });

    void this.recoverDripMessages();

    this.recoveryTimer = setInterval(() => {
      void this.recoverDripMessages();
    }, 60_000);
  }

  private async recoverDripMessages() {
    try {
      const result =
        await this.dripsService.enqueueDueAndStuckDripMessages();

      if (result.queuedDue > 0 || result.recoveredStuck > 0) {
        this.logger.log(
          `Drip recovery queued ${result.queuedDue} due and recovered ${result.recoveredStuck} stuck messages`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Drip recovery failed: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
    }
  }

  async onModuleDestroy() {
    if (this.recoveryTimer) {
      clearInterval(this.recoveryTimer);
      this.recoveryTimer = null;
    }

    await this.worker?.close();
    await this.existingContactsEnrollmentWorker?.close();
  }
}
