const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');

const DEFAULT_QUEUE_NAME = 'outbound-retry';

function getRedisUrl() {
  return String(process.env.OUTBOUND_REDIS_URL || process.env.REDIS_URL || '').trim();
}

function isOutboundQueueConfigured() {
  const redisUrl = getRedisUrl();
  return Boolean(redisUrl) && !redisUrl.startsWith('your-') && !redisUrl.startsWith('change-');
}

function shouldStartWorker() {
  return String(process.env.OUTBOUND_WORKER_ENABLED || '').trim().toLowerCase() === 'true';
}

function createRedisConnection() {
  return new IORedis(getRedisUrl(), {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 10000,
    tls: getRedisUrl().startsWith('rediss://') ? {} : undefined,
  });
}

function createOutboundQueueTools({
  query,
  findContact,
  isReplyWindowOpen,
  validateTemplateRetryAllowed,
  markOutboundSending,
  markOutboundSent,
  markOutboundFailed,
  sendWhatsAppText,
  sendWhatsAppTemplate,
  addMessage,
  recordAudit,
  MAX_WHATSAPP_TEXT_LENGTH,
  logger = console,
}) {
  const queueName = String(process.env.OUTBOUND_QUEUE_NAME || DEFAULT_QUEUE_NAME).trim() || DEFAULT_QUEUE_NAME;
  const maxAttempts = Math.max(Number(process.env.OUTBOUND_MESSAGE_MAX_RETRY_ATTEMPTS || 5), 1);
  const scanLimit = Math.min(Math.max(Number(process.env.OUTBOUND_RETRY_SCAN_LIMIT || 25), 1), 100);
  const scanEveryMs = Math.max(Number(process.env.OUTBOUND_RETRY_SCAN_EVERY_MS || 60 * 1000), 10 * 1000);

  let queueConnection = null;
  let workerConnection = null;
  let queue = null;
  let worker = null;
  let scannerTimer = null;

  function getQueue() {
    if (!queue) {
      queueConnection = createRedisConnection();
      queue = new Queue(queueName, {
        connection: queueConnection,
        defaultJobOptions: {
          attempts: 1,
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 1000 },
        },
      });
    }

    return queue;
  }

  async function enqueueRetry({ tenantId, outboundId }) {
    if (!isOutboundQueueConfigured()) return null;

    return getQueue().add(
      'retry-outbound-message',
      { tenantId, outboundId },
      { jobId: `outbound:${tenantId}:${outboundId}` },
    );
  }

  async function scanFailedOutboundMessages() {
    const result = await query(
      `SELECT id, tenant_id
       FROM outbound_messages
       WHERE status = 'failed'
         AND retryable = true
         AND attempts < $1
         AND (next_retry_at IS NULL OR next_retry_at <= now())
         AND updated_at <= now() - interval '30 seconds'
       ORDER BY COALESCE(next_retry_at, updated_at) ASC
       LIMIT $2`,
      [maxAttempts, scanLimit],
    );

    for (const row of result.rows) {
      await enqueueRetry({
        tenantId: row.tenant_id,
        outboundId: row.id,
      });
    }

    return result.rows.length;
  }

  async function retryOutboundMessage({ tenantId, outboundId }) {
    const result = await query(
      `SELECT *
       FROM outbound_messages
       WHERE id = $1
         AND tenant_id = $2
       LIMIT 1`,
      [outboundId, tenantId],
    );

    const outbound = result.rows[0];
    if (!outbound || outbound.status !== 'failed') return null;
    if (Number(outbound.attempts || 0) >= maxAttempts) return null;

    let contact = outbound.contact_id
      ? await findContact(outbound.contact_id, tenantId)
      : null;

    if (!contact) {
      const contactResult = await query(
        `SELECT *
         FROM contacts
         WHERE tenant_id = $1
           AND wa_id = $2
         LIMIT 1`,
        [tenantId, outbound.to_phone],
      );

      contact = contactResult.rows[0] || null;
    }

    if (!contact) throw new Error('Contact not found for outbound auto retry');
    if (contact.opted_out) throw new Error('Customer has opted out. Auto retry blocked.');
    if (!['text', 'template'].includes(outbound.message_type)) throw new Error(`Unsupported outbound type: ${outbound.message_type}`);

    if (outbound.message_type === 'text') {
      if (String(outbound.body || '').length > MAX_WHATSAPP_TEXT_LENGTH) throw new Error('WhatsApp text too long');
      if (!isReplyWindowOpen(contact)) throw new Error('24-hour reply window expired. Text auto retry blocked.');
    }

    if (outbound.message_type === 'template') {
      await validateTemplateRetryAllowed(tenantId, outbound.template_name, outbound.language || 'en');
    }

    await markOutboundSending(outbound.id, tenantId);

    try {
      const waMessageId = outbound.message_type === 'template'
        ? await sendWhatsAppTemplate(contact, outbound.template_name, outbound.language || 'en', tenantId)
        : await sendWhatsAppText(contact, outbound.body, tenantId);

      await markOutboundSent(outbound.id, tenantId, waMessageId);

      const message = await addMessage({
        tenantId,
        contactId: contact.id,
        waMessageId,
        direction: 'outbound',
        type: outbound.message_type === 'template' ? 'template' : 'text',
        body: outbound.body,
        status: waMessageId ? 'sent' : 'accepted',
        templateName: outbound.template_name || null,
        rawPayload: { autoRetriedOutboundMessageId: outbound.id },
        normalizedText: outbound.body,
      });

      await query(
        `UPDATE campaign_recipients
         SET status = 'sent',
             sent_at = now(),
             last_error = NULL,
             updated_at = now()
         WHERE tenant_id = $1
           AND outbound_message_id = $2`,
        [tenantId, outbound.id],
      );

      await recordAudit({
        tenantId,
        actorUserId: null,
        action: 'outbound_message.auto_retried',
        entityType: 'outbound_message',
        entityId: outbound.id,
        metadata: {
          contactId: contact.id,
          messageRowId: message?.id || null,
          waMessageId,
        },
      });

      return { ok: true, outboundId: outbound.id };
    } catch (error) {
      await markOutboundFailed(outbound.id, tenantId, error);

      await query(
        `UPDATE campaign_recipients
         SET status = 'failed',
             last_error = $3,
             updated_at = now()
         WHERE tenant_id = $1
           AND outbound_message_id = $2`,
        [tenantId, outbound.id, String(error.message || error).slice(0, 1000)],
      );

      throw error;
    }
  }

  function startWorkerIfEnabled() {
    if (!isOutboundQueueConfigured()) {
      logger.warn('Outbound retry worker not started because Redis URL is missing.');
      return null;
    }

    if (!shouldStartWorker()) {
      logger.info('Outbound retry worker disabled. Set OUTBOUND_WORKER_ENABLED=true on worker service.');
      return null;
    }

    if (worker) return worker;

    workerConnection = createRedisConnection();
    worker = new Worker(
      queueName,
      async (job) => {
        if (job.name === 'scan-outbound-retries') return scanFailedOutboundMessages();
        return retryOutboundMessage(job.data);
      },
      { connection: workerConnection, concurrency: 1 },
    );

    scannerTimer = setInterval(() => {
      getQueue().add('scan-outbound-retries', {}, { jobId: `scan:${Date.now()}` }).catch((error) => {
        logger.error('Outbound retry scan enqueue failed:', { message: error.message });
      });
    }, scanEveryMs);

    scannerTimer.unref();

    logger.info(`Outbound retry worker started for queue "${queueName}"`);
    return worker;
  }

  async function close() {
    if (scannerTimer) clearInterval(scannerTimer);
    if (worker) await worker.close();
    if (queue) await queue.close();
    if (workerConnection) await workerConnection.quit();
    if (queueConnection) await queueConnection.quit();
  }

  return {
    enqueueRetry,
    startWorkerIfEnabled,
    close,
  };
}

module.exports = {
  createOutboundQueueTools,
  isOutboundQueueConfigured,
};