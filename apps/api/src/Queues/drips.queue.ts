import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { env } from '../env';

export type DripSendJobData = {
  tenantId: string;
  dripMessageId: string;
};

export type DripExistingContactsEnrollmentJobData = {
  tenantId: string;
  workflowId: string;
  actorUserId: string | null;
  afterContactId?: string | null;
  batchSize?: number;
};

export const DRIP_SEND_QUEUE = 'drip-send-queue';
export const DRIP_EXISTING_CONTACT_ENROLLMENT_QUEUE =
  'drip-existing-contact-enrollment-queue';

function getRedisConnectionOptions() {
  if (!env.redisUrl && env.isProduction) {
    throw new Error('REDIS_URL is required for drip queue in production');
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
export class DripsQueue implements OnModuleDestroy {
  readonly queue = new Queue<DripSendJobData>(DRIP_SEND_QUEUE, {
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

  readonly existingContactsEnrollmentQueue =
    new Queue<DripExistingContactsEnrollmentJobData>(
      DRIP_EXISTING_CONTACT_ENROLLMENT_QUEUE,
      {
        connection: getRedisConnectionOptions(),
        defaultJobOptions: {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 10000,
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
      },
    );

  private getJobId(dripMessageId: string) {
    return `drip-message-${dripMessageId}`;
  }

  async addDripMessageJob(
    data: DripSendJobData,
    options?: {
      delay?: number;
    },
  ) {
    const jobId = this.getJobId(data.dripMessageId);
    const existingJob = await this.queue.getJob(jobId);

    if (existingJob) {
      const state = await existingJob.getState();

      if (state === 'active') {
        return existingJob;
      }

      await existingJob.remove();
    }

    return this.queue.add('send-drip-message', data, {
      jobId,
      delay: Math.max(0, options?.delay || 0),
    });
  }

  async removeDripMessageJob(dripMessageId: string) {
    const job = await this.queue.getJob(this.getJobId(dripMessageId));

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

  async addExistingContactsEnrollmentBatchJob(
    data: DripExistingContactsEnrollmentJobData,
    options?: {
      delay?: number;
    },
  ) {
    const afterContactId = data.afterContactId || 'start';
    const jobId = `drip-existing-contacts-${data.workflowId}-${afterContactId}`;
    const existingJob =
      await this.existingContactsEnrollmentQueue.getJob(jobId);

    if (existingJob) {
      const state = await existingJob.getState();

      if (state === 'active') {
        return existingJob;
      }

      await existingJob.remove();
    }

    return this.existingContactsEnrollmentQueue.add(
      'enroll-existing-contacts',
      data,
      {
        jobId,
        delay: Math.max(0, options?.delay || 0),
      },
    );
  }

  async onModuleDestroy() {
    await this.queue.close();
    await this.existingContactsEnrollmentQueue.close();
  }
}
