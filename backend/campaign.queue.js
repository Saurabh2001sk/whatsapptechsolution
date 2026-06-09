const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');

const DEFAULT_QUEUE_NAME = 'campaign-delivery';

function getCampaignRedisUrl() {
  return String(process.env.CAMPAIGN_REDIS_URL || process.env.REDIS_URL || '').trim();
}

function isCampaignQueueConfigured() {
  const redisUrl = getCampaignRedisUrl();
  return Boolean(redisUrl)
    && !redisUrl.startsWith('your-')
    && !redisUrl.startsWith('change-');
}

function getCampaignQueueName() {
  return String(process.env.CAMPAIGN_QUEUE_NAME || DEFAULT_QUEUE_NAME).trim() || DEFAULT_QUEUE_NAME;
}

function getCampaignWorkerConcurrency() {
  const value = Number(process.env.CAMPAIGN_WORKER_CONCURRENCY || 1);
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.min(Math.floor(value), 5);
}

function getCampaignJobAttempts() {
  const value = Number(process.env.CAMPAIGN_JOB_ATTEMPTS || 3);
  if (!Number.isFinite(value) || value < 1) return 3;
  return Math.min(Math.floor(value), 10);
}

function shouldStartCampaignWorker() {
  return String(process.env.CAMPAIGN_WORKER_ENABLED || '').trim().toLowerCase() === 'true';
}

function createRedisConnection() {
  const redisUrl = getCampaignRedisUrl();

  if (!redisUrl) {
    throw new Error('REDIS_URL or CAMPAIGN_REDIS_URL is required for campaign queue');
  }

  return new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 10000,
    tls: redisUrl.startsWith('rediss://') ? {} : undefined,
  });
}

function createCampaignQueueTools({ processCampaignDelivery, logger = console }) {
  if (typeof processCampaignDelivery !== 'function') {
    throw new Error('processCampaignDelivery is required for campaign queue');
  }

  const queueName = getCampaignQueueName();
  let queueConnection = null;
  let queue = null;
  let workerConnection = null;
  let worker = null;

  function getQueue() {
    if (!queue) {
      queueConnection = createRedisConnection();
      queue = new Queue(queueName, {
        connection: queueConnection,
        defaultJobOptions: {
          attempts: getCampaignJobAttempts(),
          backoff: {
            type: 'exponential',
            delay: 60 * 1000,
          },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 1000 },
        },
      });
    }

    return queue;
  }

  async function enqueueCampaignDelivery({ tenantId, campaignId, actorUserId = null, scheduledAt = null }) {
    if (!isCampaignQueueConfigured()) {
      const error = new Error('Campaign queue is not configured');
      error.statusCode = 503;
      throw error;
    }

    const scheduledTime = scheduledAt ? new Date(scheduledAt).getTime() : 0;
    const delay = scheduledTime ? Math.max(scheduledTime - Date.now(), 0) : 0;

    return getQueue().add(
      'deliver-campaign',
      {
        tenantId,
        campaignId,
        actorUserId,
      },
      {
        jobId: `campaign:${campaignId}`,
        delay,
      },
    );
  }

  function startWorkerIfEnabled() {
    if (!isCampaignQueueConfigured()) {
      logger.warn('Campaign worker not started because REDIS_URL/CAMPAIGN_REDIS_URL is missing.');
      return null;
    }

    if (!shouldStartCampaignWorker()) {
      logger.info('Campaign worker disabled. Set CAMPAIGN_WORKER_ENABLED=true on the Render worker service.');
      return null;
    }

    if (worker) {
      return worker;
    }

    workerConnection = createRedisConnection();
    worker = new Worker(
      queueName,
      async (job) => processCampaignDelivery(job.data),
      {
        connection: workerConnection,
        concurrency: getCampaignWorkerConcurrency(),
      },
    );

    worker.on('completed', (job) => {
      logger.info(`Campaign queue job completed: ${job.id}`);
    });

    worker.on('failed', (job, error) => {
      logger.error('Campaign queue job failed:', {
        jobId: job?.id || null,
        message: error?.message || 'Unknown campaign queue error',
      });
    });

    logger.info(`Campaign worker started for queue "${queueName}"`);
    return worker;
  }

  async function close() {
    if (worker) {
      await worker.close();
      worker = null;
    }

    if (queue) {
      await queue.close();
      queue = null;
    }

    if (workerConnection) {
      await workerConnection.quit();
      workerConnection = null;
    }

    if (queueConnection) {
      await queueConnection.quit();
      queueConnection = null;
    }
  }

  return {
    enqueueCampaignDelivery,
    startWorkerIfEnabled,
    close,
  };
}

module.exports = {
  createCampaignQueueTools,
  isCampaignQueueConfigured,
};
