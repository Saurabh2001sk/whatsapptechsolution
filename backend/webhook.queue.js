const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');

const DEFAULT_QUEUE_NAME = 'webhook-processing';

function getRedisUrl() {
  return String(process.env.WEBHOOK_REDIS_URL || process.env.REDIS_URL || '').trim();
}

function isWebhookQueueConfigured() {
  const redisUrl = getRedisUrl();
  return Boolean(redisUrl) && !redisUrl.startsWith('your-') && !redisUrl.startsWith('change-');
}

function shouldStartWorker() {
  return String(process.env.WEBHOOK_WORKER_ENABLED || '').trim().toLowerCase() === 'true';
}

function createRedisConnection() {
  return new IORedis(getRedisUrl(), {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 10000,
    tls: getRedisUrl().startsWith('rediss://') ? {} : undefined,
  });
}

function createWebhookQueueTools({
  query,
  processWhatsAppWebhookPayload,
  markWebhookEventProcessing,
  markWebhookEventProcessed,
  markWebhookEventFailed,
  safeErrorLog,
  logger = console,
}) {
  const queueName = String(process.env.WEBHOOK_QUEUE_NAME || DEFAULT_QUEUE_NAME).trim() || DEFAULT_QUEUE_NAME;
  const maxAttempts = Math.max(Number(process.env.WEBHOOK_JOB_ATTEMPTS || 5), 1);
  const concurrency = Math.max(Number(process.env.WEBHOOK_WORKER_CONCURRENCY || 2), 1);

  let queueConnection = null;
  let workerConnection = null;
  let queue = null;
  let worker = null;

  function getQueue() {
    if (!queue) {
      queueConnection = createRedisConnection();
      queue = new Queue(queueName, {
        connection: queueConnection,
        defaultJobOptions: {
          attempts: maxAttempts,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 1000 },
        },
      });
    }

    return queue;
  }

  async function enqueueWebhookEvent({ webhookEventId, tenantId }) {
    if (!isWebhookQueueConfigured()) return null;

    return getQueue().add(
      'process-webhook-event',
      { webhookEventId, tenantId: tenantId || null },
      { jobId: `webhook:${webhookEventId}` },
    );
  }

  async function processWebhookEventJob({ webhookEventId, tenantId }) {
    const result = await query(
      `SELECT id, tenant_id, payload, status
       FROM webhook_events
       WHERE id = $1
         AND tenant_id IS NOT DISTINCT FROM $2
       LIMIT 1`,
      [webhookEventId, tenantId || null],
    );

    const event = result.rows[0];

    if (!event) {
      throw new Error('Webhook event not found for queue processing');
    }

    if (event.status === 'processed') {
      return { ok: true, skipped: true, reason: 'already_processed' };
    }

    await markWebhookEventProcessing(event.id, event.tenant_id);

    try {
      await processWhatsAppWebhookPayload(event.payload);
      await markWebhookEventProcessed(event.id, event.tenant_id);

      return {
        ok: true,
        webhookEventId: event.id,
      };
    } catch (error) {
      await markWebhookEventFailed(event.id, event.tenant_id, error);
      throw error;
    }
  }

  function startWorkerIfEnabled() {
    if (!isWebhookQueueConfigured()) {
      logger.warn('Webhook worker not started because Redis URL is missing.');
      return null;
    }

    if (!shouldStartWorker()) {
      logger.info('Webhook worker disabled. Set WEBHOOK_WORKER_ENABLED=true on worker service.');
      return null;
    }

    if (worker) return worker;

    workerConnection = createRedisConnection();

    worker = new Worker(
      queueName,
      async (job) => processWebhookEventJob(job.data),
      {
        connection: workerConnection,
        concurrency,
      },
    );

    worker.on('failed', (job, error) => {
      logger.error('Webhook queue job failed:', {
        jobId: job?.id || null,
        attemptsMade: job?.attemptsMade || 0,
        message: error.message,
      });
    });

    worker.on('error', (error) => {
      logger.error('Webhook worker error:', safeErrorLog ? safeErrorLog(error) : { message: error.message });
    });

    logger.info(`Webhook worker started for queue "${queueName}"`);
    return worker;
  }

  async function close() {
    if (worker) await worker.close();
    if (queue) await queue.close();
    if (workerConnection) await workerConnection.quit();
    if (queueConnection) await queueConnection.quit();
  }

  return {
    enqueueWebhookEvent,
    startWorkerIfEnabled,
    close,
  };
}

module.exports = {
  createWebhookQueueTools,
  isWebhookQueueConfigured,
};