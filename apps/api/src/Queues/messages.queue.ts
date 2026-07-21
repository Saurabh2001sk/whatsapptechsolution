import {
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { env } from '../env';

export type OutboundMessageJobData = {
  tenantId: string;
  whatsappMessageId: string;
};

export const OUTBOUND_MESSAGE_QUEUE =
  'outbound-message-send-queue';

function getRedisConnectionOptions() {
  if (
    !env.redisUrl &&
    env.isProduction
  ) {
    throw new Error(
      'REDIS_URL is required for outbound message queue in production',
    );
  }

  const redisUrl =
    env.redisUrl ||
    'redis://localhost:6379';

  return {
    url: redisUrl,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    tls: redisUrl.startsWith(
      'rediss://',
    )
      ? {}
      : undefined,
  };
}

@Injectable()
export class MessagesQueue
  implements OnModuleDestroy
{
  readonly queue =
    new Queue<OutboundMessageJobData>(
      OUTBOUND_MESSAGE_QUEUE,
      {
        connection:
          getRedisConnectionOptions(),
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: {
            age: 60 * 60 * 24,
            count: 5000,
          },
          removeOnFail: {
            age: 60 * 60 * 24 * 7,
            count: 10_000,
          },
        },
      },
    );

  private getMessageJobId(
    whatsappMessageId: string,
  ) {
    return `outbound-message-${whatsappMessageId}`;
  }

  async addOutboundMessageJob(
    data: OutboundMessageJobData,
    options?: {
      delay?: number;
    },
  ) {
    const jobId =
      this.getMessageJobId(
        data.whatsappMessageId,
      );

    const existingJob =
      await this.queue.getJob(jobId);

    if (existingJob) {
      const state =
        await existingJob.getState();

      const reusableStates =
        new Set([
          'active',
          'waiting',
          'delayed',
          'prioritized',
          'waiting-children',
        ]);

      /*
       * A live job must never be removed and
       * recreated.
       *
       * Reusing the same deterministic job
       * prevents duplicate sends.
       */
      if (
        reusableStates.has(state)
      ) {
        return existingJob;
      }

      /*
       * A completed or failed historical job
       * may be removed only when the service
       * has already decided a new retry is safe.
       */
      await existingJob.remove();
    }

    return this.queue.add(
      'send-outbound-message',
      data,
      {
        jobId,
        delay: Math.max(
          0,
          options?.delay || 0,
        ),
      },
    );
  }

  async removeOutboundMessageJob(
    whatsappMessageId: string,
  ) {
    const jobId =
      this.getMessageJobId(
        whatsappMessageId,
      );

    const job =
      await this.queue.getJob(jobId);

    if (!job) {
      return 0;
    }

    const state =
      await job.getState();

    /*
     * An active worker job must not be
     * forcefully removed.
     */
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