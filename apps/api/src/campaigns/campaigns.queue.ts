import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';

export type CampaignSendJobData = {
  tenantId: string;
  campaignId: string;
};

export const CAMPAIGN_SEND_QUEUE = 'campaign-send-queue';

function getRedisConnectionOptions() {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl && process.env.NODE_ENV === 'production') {
    throw new Error('REDIS_URL is required for campaign queue in production');
  }

  return {
    url: redisUrl || 'redis://localhost:6379',
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: redisUrl?.startsWith('rediss://') ? {} : undefined,
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

  async addCampaignSendJob(
    data: CampaignSendJobData,
    options?: {
      delay?: number;
    },
  ) {
    await this.removeCampaignJobs(data.campaignId);

    return this.queue.add('send-campaign', data, {
      delay: Math.max(0, options?.delay || 0),
      jobId: `campaign-${data.campaignId}-${Date.now()}`,
    });
  }

  async removeCampaignJobs(campaignId: string) {
    const jobs = await this.queue.getJobs([
      'delayed',
      'waiting',
      'paused',
      'prioritized',
    ]);

    let removedCount = 0;

    for (const job of jobs) {
      if (job.data?.campaignId === campaignId) {
        await job.remove();
        removedCount += 1;
      }
    }

    return removedCount;
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}