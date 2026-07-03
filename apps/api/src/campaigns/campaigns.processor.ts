import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import {
  CAMPAIGN_SEND_QUEUE,
  CampaignSendJobData,
} from './campaigns.queue';
import { CampaignsService } from './campaigns.service';

function getRedisConnectionOptions() {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl && process.env.NODE_ENV === 'production') {
    throw new Error('REDIS_URL is required for campaign worker in production');
  }

  return {
    url: redisUrl || 'redis://localhost:6379',
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: redisUrl?.startsWith('rediss://') ? {} : undefined,
  };
}

@Injectable()
export class CampaignsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CampaignsProcessor.name);
  private worker: Worker<CampaignSendJobData> | null = null;
  private recoveryTimer: NodeJS.Timeout | null = null;

  constructor(private readonly campaignsService: CampaignsService) {}

  onModuleInit() {
    this.worker = new Worker<CampaignSendJobData>(
      CAMPAIGN_SEND_QUEUE,
      async (job: Job<CampaignSendJobData>) => {
        this.logger.log(`Processing campaign job ${job.id}`);

        try {
          return await this.campaignsService.processCampaignSendJob(job.data);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Campaign worker failed';

        const maxAttempts = Number(job.opts.attempts || 1);
        const shouldRetry = job.attemptsMade + 1 < maxAttempts;

        await this.campaignsService.markCampaignJobFailed({
          tenantId: job.data.tenantId,
          campaignId: job.data.campaignId,
          errorMessage,
          shouldRetry,
        });
          throw error;
        }
      },
      {
        connection: getRedisConnectionOptions(),
        concurrency: 1,
      },
    );

    this.worker.on('completed', (job) => {
      this.logger.log(`Campaign job completed ${job.id}`);
    });

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `Campaign job failed ${job?.id || 'unknown'}: ${error.message}`,
      );
    });


    void this.recoverDueCampaigns();

    this.recoveryTimer = setInterval(() => {
      void this.recoverDueCampaigns();
    }, 60_000);
  }

  private async recoverDueCampaigns() {
    try {
      const result = await this.campaignsService.enqueueDueAndStuckCampaigns();

      if (result.queuedScheduled > 0 || result.requeuedStuck > 0) {
        this.logger.log(
          `Campaign recovery queued ${result.queuedScheduled} due scheduled and ${result.requeuedStuck} stuck campaigns`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Campaign recovery failed: ${
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
  }
}