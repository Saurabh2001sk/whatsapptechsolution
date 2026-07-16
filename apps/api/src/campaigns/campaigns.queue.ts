import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { env } from '../config/env';
import { Queue } from 'bullmq';

export type CampaignSendJobData = {
  tenantId: string;
  campaignId: string;
};

export const CAMPAIGN_SEND_QUEUE = 'campaign-send-queue';

function getRedisConnectionOptions() {
  if (!env.redisUrl && env.isProduction) {
    throw new Error(
      'REDIS_URL is required for campaign queue in production',
    );
  }

  const redisUrl =
    env.redisUrl || 'redis://localhost:6379';

  return {
    url: redisUrl,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: redisUrl.startsWith('rediss://')
      ? {}
      : undefined,
  };
}

@Injectable()
export class CampaignQueue implements OnModuleDestroy {
  readonly queue = new Queue<CampaignSendJobData>(CAMPAIGN_SEND_QUEUE, {
    connection: getRedisConnectionOptions(),
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: {
        age: 60 * 60 * 24,
        count: 1000,
      },
      removeOnFail: {
        age: 60 * 60 * 24 * 7,
        count: 5000,
      },
    },
  });

  private getCampaignJobId(campaignId: string) {
    return `campaign-${campaignId}`;
  }

  async addCampaignSendJob(
    data: CampaignSendJobData,
    options?: {
      delay?: number;
    },
  ) {
    const jobId = this.getCampaignJobId(
      data.campaignId,
    );

    const existingJob =
      await this.queue.getJob(jobId);

    if (existingJob) {
      const state = await existingJob.getState();

      /*
       * Active worker job ko remove nahi karte.
       * Same deterministic job ID duplicate active job
       * create hone se rokega.
       */
      if (state !== 'active') {
        await existingJob.remove();
      } else {
        return existingJob;
      }
    }

    return this.queue.add(
      'send-campaign',
      data,
      {
        delay: Math.max(
          0,
          options?.delay || 0,
        ),
        jobId,
      },
    );
  }

  async removeCampaignJobs(campaignId: string) {
    const jobId =
      this.getCampaignJobId(campaignId);

    const job = await this.queue.getJob(jobId);

    if (!job) {
      return 0;
    }

    const state = await job.getState();

    if (state === 'active') {
      return 0;
    }

    await job.remove();

    return 1;
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}