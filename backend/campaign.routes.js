function normalizeCampaignPhone(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function getCampaignQualityFailureRateLimit() {
  const value = Number(process.env.WHATSAPP_CAMPAIGN_FAILURE_RATE_LIMIT || 0.2);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 1) : 0.2;
}

function getCampaignQualityMinimumSample() {
  const value = Number(process.env.WHATSAPP_CAMPAIGN_QUALITY_MIN_SAMPLE || 50);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 50;
}

function rowValue(row = {}, keys = []) {
  for (const key of keys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }

  return '';
}

function getCampaignDailyLimit() {
  const value = Number(process.env.WHATSAPP_CAMPAIGN_DAILY_LIMIT || 1000);

  if (!Number.isFinite(value) || value < 1) {
    return 1000;
  }

  return Math.min(Math.floor(value), 10000);
}

function getCampaignImmediateSendLimit() {
  const value = Number(process.env.WHATSAPP_CAMPAIGN_IMMEDIATE_SEND_LIMIT || 50);

  if (!Number.isFinite(value) || value < 1) {
    return 50;
  }

  return Math.min(Math.floor(value), 250);
}

function registerCampaignRoutes(app, ctx) {
  const {
    query,
    asyncHandler,
    rateLimit,
    requireAuth,
    canMonitor,
    isProduction,
    createOutboundMessageRecord,
    markOutboundSending,
    markOutboundSent,
    markOutboundFailed,
    sendWhatsAppTemplate,
    addMessage,
    recordAudit,
    enqueueCampaignDelivery,
    campaignQueueAvailable,
    assertCampaignRecipientLimit,
    assertDailyOutboundLimit,
  } = ctx;

  async function getCampaignTemplate(tenantId, templateName, language) {
    const result = await query(
      `SELECT id, name, language, body, active, meta_status
       FROM whatsapp_templates
       WHERE tenant_id = $1
         AND name = $2
         AND language = $3
         AND active = true
         AND lower(COALESCE(meta_status, '')) = 'approved'
       LIMIT 1`,
      [tenantId, templateName, language],
    );

    return result.rows[0] || null;
  }

  async function getCampaignQualityGuard(tenantId) {
    const result = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'sent')::int AS sent_count,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count
       FROM campaign_recipients
       WHERE tenant_id = $1
         AND updated_at >= now() - interval '24 hours'`,
      [tenantId],
    );

    const sentCount = Number(result.rows[0]?.sent_count || 0);
    const failedCount = Number(result.rows[0]?.failed_count || 0);
    const totalMeasured = sentCount + failedCount;
    const minimumSample = getCampaignQualityMinimumSample();
    const failureRateLimit = getCampaignQualityFailureRateLimit();
    const failureRate = totalMeasured ? failedCount / totalMeasured : 0;

    return {
      blocked: totalMeasured >= minimumSample && failureRate >= failureRateLimit,
      sentCount,
      failedCount,
      totalMeasured,
      minimumSample,
      failureRate,
      failureRateLimit,
    };
  }

  async function getCampaignDeliveryRecord(tenantId, campaignId) {
    const result = await query(
      `SELECT
         campaigns.*,
         whatsapp_templates.active AS template_active,
         whatsapp_templates.meta_status AS template_meta_status
       FROM campaigns
       LEFT JOIN whatsapp_templates
         ON whatsapp_templates.id = campaigns.template_id
        AND whatsapp_templates.tenant_id = campaigns.tenant_id
       WHERE campaigns.tenant_id = $1
         AND campaigns.id = $2
       LIMIT 1`,
      [tenantId, campaignId],
    );

    return result.rows[0] || null;
  }

  async function updateCampaignSummary(tenantId, campaignId, status) {
    const summaryResult = await query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'sent')::int AS sent,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
         COUNT(*) FILTER (WHERE status = 'skipped')::int AS skipped,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending
       FROM campaign_recipients
       WHERE tenant_id = $1
         AND campaign_id = $2`,
      [tenantId, campaignId],
    );

    const summary = summaryResult.rows[0] || {};
    const result = await query(
      `UPDATE campaigns
       SET status = $3,
           total_recipients = $4,
           sent_count = $5,
           failed_count = $6,
           skipped_count = $7,
           updated_at = now()
       WHERE tenant_id = $1
         AND id = $2
       RETURNING *`,
      [
        tenantId,
        campaignId,
        status,
        Number(summary.total || 0),
        Number(summary.sent || 0),
        Number(summary.failed || 0),
        Number(summary.skipped || 0),
      ],
    );

    return {
      campaign: result.rows[0],
      summary: {
        total: Number(summary.total || 0),
        sent: Number(summary.sent || 0),
        failed: Number(summary.failed || 0),
        skipped: Number(summary.skipped || 0),
        pending: Number(summary.pending || 0),
      },
    };
  }

  async function processCampaignDelivery({ campaignId, tenantId, actorUserId = null }) {
    const campaign = await getCampaignDeliveryRecord(tenantId, campaignId);

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (campaign.status === 'cancelled') {
      return updateCampaignSummary(tenantId, campaignId, 'cancelled');
    }

    if (['sent', 'partial_failed', 'failed'].includes(campaign.status)) {
      return updateCampaignSummary(tenantId, campaignId, campaign.status);
    }

    if (!campaign.template_active || String(campaign.template_meta_status || '').toLowerCase() !== 'approved') {
      await recordAudit({
        tenantId,
        actorUserId,
        action: 'campaign.blocked_template_not_approved',
        entityType: 'campaign',
        entityId: campaignId,
        metadata: {
          templateName: campaign.template_name,
          language: campaign.language,
        },
      });

      return updateCampaignSummary(tenantId, campaignId, 'failed');
    }

    const qualityGuard = await getCampaignQualityGuard(tenantId);

    if (qualityGuard.blocked) {
      await recordAudit({
        tenantId,
        actorUserId,
        action: 'campaign.blocked_quality_guard',
        entityType: 'campaign',
        entityId: campaignId,
        metadata: {
          sentCount: qualityGuard.sentCount,
          failedCount: qualityGuard.failedCount,
          failureRate: Number(qualityGuard.failureRate.toFixed(4)),
          failureRateLimit: qualityGuard.failureRateLimit,
        },
      });

      throw new Error(`Campaign sending paused. Recent failure rate is ${Math.round(qualityGuard.failureRate * 100)}%.`);
    }

    const dailyUsageResult = await query(
      `SELECT COUNT(*)::int AS sent_today
       FROM campaign_recipients
       WHERE tenant_id = $1
         AND status = 'sent'
         AND sent_at >= date_trunc('day', now())`,
      [tenantId],
    );

    const sentToday = Number(dailyUsageResult.rows[0]?.sent_today || 0);
    const remainingToday = Math.max(getCampaignDailyLimit() - sentToday, 0);

    if (remainingToday <= 0) {
      await recordAudit({
        tenantId,
        actorUserId,
        action: 'campaign.blocked_daily_limit',
        entityType: 'campaign',
        entityId: campaignId,
        metadata: {
          sentToday,
          dailyLimit: getCampaignDailyLimit(),
        },
      });

      throw new Error(`Daily WhatsApp campaign limit reached. Limit: ${getCampaignDailyLimit()}, sent today: ${sentToday}.`);
    }

    const recipientResult = await query(
      `SELECT
         campaign_recipients.*,
         contacts.id AS contact_id,
         contacts.phone AS contact_phone,
         contacts.wa_id AS contact_wa_id,
         contacts.name AS contact_name,
         contacts.opted_out AS contact_opted_out,
         contacts.marketing_opted_in AS contact_marketing_opted_in
       FROM campaign_recipients
       JOIN contacts
         ON contacts.id = campaign_recipients.contact_id
        AND contacts.tenant_id = campaign_recipients.tenant_id
       WHERE campaign_recipients.tenant_id = $1
         AND campaign_recipients.campaign_id = $2
         AND campaign_recipients.status = 'pending'
       ORDER BY campaign_recipients.created_at ASC
       LIMIT $3`,
      [tenantId, campaignId, remainingToday],
    );

    const sendableRecipients = recipientResult.rows;

    await query(
      `UPDATE campaigns
       SET status = 'sending',
           updated_at = now()
       WHERE tenant_id = $1
         AND id = $2
         AND status <> 'cancelled'`,
      [tenantId, campaignId],
    );

    if (!sendableRecipients.length) {
      const currentSummary = await updateCampaignSummary(tenantId, campaignId, 'failed');

      await recordAudit({
        tenantId,
        actorUserId,
        action: 'campaign.blocked_no_sendable_recipients',
        entityType: 'campaign',
        entityId: campaignId,
        metadata: {
          templateName: campaign.template_name,
          language: campaign.language,
          totalRecipients: currentSummary.summary.total,
          skippedCount: currentSummary.summary.skipped,
        },
      });

      return currentSummary;
    }

    for (const recipient of sendableRecipients) {
      const contact = {
        id: recipient.contact_id,
        phone: recipient.contact_phone || recipient.to_phone,
        wa_id: recipient.contact_wa_id,
        name: recipient.contact_name,
        opted_out: recipient.contact_opted_out,
        marketing_opted_in: recipient.contact_marketing_opted_in,
      };

      if (contact.opted_out || !contact.marketing_opted_in) {
        await query(
          `UPDATE campaign_recipients
           SET status = 'skipped',
               skip_reason = $3,
               updated_at = now()
           WHERE id = $1
             AND tenant_id = $2`,
          [
            recipient.id,
            tenantId,
            contact.opted_out ? 'contact_opted_out' : 'marketing_opt_in_missing',
          ],
        );
        continue;
      }

      await query(
        `UPDATE campaign_recipients
         SET status = 'sending',
             updated_at = now()
         WHERE id = $1
           AND tenant_id = $2`,
        [recipient.id, tenantId],
      );

      const payload = {
        messaging_product: 'whatsapp',
        to: contact.wa_id || contact.phone,
        type: 'template',
        template: {
          name: campaign.template_name,
          language: { code: campaign.language },
        },
      };

      const outboundRecord = await createOutboundMessageRecord({
        tenantId,
        contactId: contact.id,
        toPhone: contact.wa_id || contact.phone,
        messageType: 'template',
        templateName: campaign.template_name,
        language: campaign.language,
        body: `[Campaign Template] ${campaign.template_name}`,
        payload,
        createdBy: actorUserId,
      });

      await markOutboundSending(outboundRecord?.id, tenantId);

      try {
        const waMessageId = await sendWhatsAppTemplate(contact, campaign.template_name, campaign.language, tenantId);

        await markOutboundSent(outboundRecord?.id, tenantId, waMessageId);
        await addMessage({
          tenantId,
          contactId: contact.id,
          waMessageId,
          direction: 'outbound',
          type: 'template',
          body: `[Campaign Template] ${campaign.template_name}`,
          status: waMessageId ? 'sent' : 'accepted',
          templateName: campaign.template_name,
          normalizedText: `[Campaign Template] ${campaign.template_name}`,
        });

        await query(
          `UPDATE campaign_recipients
           SET status = 'sent',
               outbound_message_id = $3,
               sent_at = now(),
               last_error = NULL,
               updated_at = now()
           WHERE id = $1
             AND tenant_id = $2`,
          [recipient.id, tenantId, outboundRecord?.id || null],
        );
      } catch (error) {
        await markOutboundFailed(outboundRecord?.id, tenantId, error);

        await query(
          `UPDATE campaign_recipients
           SET status = 'failed',
               outbound_message_id = $3,
               last_error = $4,
               updated_at = now()
           WHERE id = $1
             AND tenant_id = $2`,
          [
            recipient.id,
            tenantId,
            outboundRecord?.id || null,
            String(error?.response?.data?.error?.message || error?.message || 'WhatsApp campaign send failed').slice(0, 1000),
          ],
        );
      }
    }

    const statusResult = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
         COUNT(*) FILTER (WHERE status = 'sent')::int AS sent_count,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count
       FROM campaign_recipients
       WHERE tenant_id = $1
         AND campaign_id = $2`,
      [tenantId, campaignId],
    );

    const pendingCount = Number(statusResult.rows[0]?.pending_count || 0);
    const sentCount = Number(statusResult.rows[0]?.sent_count || 0);
    const failedCount = Number(statusResult.rows[0]?.failed_count || 0);
    const finalStatus = pendingCount > 0
      ? 'scheduled'
      : failedCount && sentCount
        ? 'partial_failed'
        : sentCount
          ? 'sent'
          : 'failed';

    const finalSummary = await updateCampaignSummary(tenantId, campaignId, finalStatus);

    await recordAudit({
      tenantId,
      actorUserId,
      action: 'campaign.delivery_processed',
      entityType: 'campaign',
      entityId: campaignId,
      metadata: {
        templateName: campaign.template_name,
        language: campaign.language,
        ...finalSummary.summary,
      },
    });

    return finalSummary;
  }

  app.get('/api/campaigns', requireAuth, asyncHandler(async (req, res) => {
    if (!canMonitor(req.user)) {
      return res.status(403).json({ error: 'Manager/Admin only' });
    }

    const result = await query(
      `SELECT
         campaigns.*,
         whatsapp_templates.body AS template_body
       FROM campaigns
       LEFT JOIN whatsapp_templates
         ON whatsapp_templates.id = campaigns.template_id
        AND whatsapp_templates.tenant_id = campaigns.tenant_id
       WHERE campaigns.tenant_id = $1
       ORDER BY campaigns.created_at DESC
       LIMIT 50`,
      [req.user.tenantId],
    );

    res.json(result.rows);
  }));

  app.post('/api/campaigns', requireAuth, rateLimit({
    bucketName: 'campaign-create',
    maxRequests: 20,
    windowMs: 60 * 60 * 1000,
  }), asyncHandler(async (req, res) => {
    if (!canMonitor(req.user)) {
      return res.status(403).json({ error: 'Manager/Admin only' });
    }

    const name = String(req.body?.name || '').trim();
    const templateName = String(req.body?.templateName || '').trim().toLowerCase();
    const language = String(req.body?.language || 'en').trim() || 'en';
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const sendNow = Boolean(req.body?.sendNow);
    const scheduledAt = req.body?.scheduledAt ? new Date(req.body.scheduledAt) : null;

    if (!name) {
      return res.status(400).json({ error: 'Campaign name required' });
    }

    if (!templateName) {
      return res.status(400).json({ error: 'Approved WhatsApp template required for campaign' });
    }

    if (!rows.length) {
      return res.status(400).json({ error: 'Campaign contacts CSV required' });
    }

    const campaignDailyLimit = getCampaignDailyLimit();

    if (rows.length > campaignDailyLimit) {
      return res.status(400).json({
        error: `Maximum ${campaignDailyLimit} rows allowed per campaign for this tenant limit.`,
      });
    }

    const immediateSendLimit = getCampaignImmediateSendLimit();

    if (sendNow && !campaignQueueAvailable && rows.length > immediateSendLimit) {
      return res.status(400).json({
        error: `Send Now is limited to ${immediateSendLimit} recipients until the campaign queue worker is connected. Split the CSV or wait for queued campaign sending.`,
      });
    }

    if (!sendNow && !scheduledAt) {
      return res.status(400).json({
        error: 'Choose Send Now or provide a scheduled time.',
      });
    }

    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
      return res.status(400).json({ error: 'Invalid scheduled time' });
    }

    if (scheduledAt && scheduledAt.getTime() <= Date.now()) {
      return res.status(400).json({
        error: 'Scheduled time must be in the future.',
      });
    }

    if (scheduledAt && !campaignQueueAvailable) {
      return res.status(503).json({
        error: 'Campaign scheduling needs Redis/BullMQ. Set REDIS_URL and start the campaign worker.',
      });
    }

    const template = await getCampaignTemplate(req.user.tenantId, templateName, language);

    if (!template) {
      return res.status(400).json({
        error: 'Only active Meta-approved WhatsApp templates can be used for bulk campaigns. Sync approved templates before sending.',
      });
    }

    const cleanRows = rows.map((row) => ({
      phone: normalizeCampaignPhone(rowValue(row, ['phone', 'Phone', 'mobile', 'Mobile', 'whatsapp', 'WhatsApp'])),
      optInSource: rowValue(row, ['opt_in_source', 'Opt In Source', 'source', 'Source']).slice(0, 80),
      optInProof: rowValue(row, ['opt_in_proof', 'Opt In Proof', 'proof', 'Proof']).slice(0, 500),
    }));

    if (!cleanRows.length) {
      return res.status(400).json({ error: 'CSV must include a phone column' });
    }

    const missingPhoneRowIndex = cleanRows.findIndex((row) => !row.phone);

    if (missingPhoneRowIndex >= 0) {
      return res.status(400).json({
        error: `CSV row ${missingPhoneRowIndex + 1} is missing phone number.`,
      });
    }

    const invalidPhoneRow = cleanRows.find((row) => row.phone.length < 11 || row.phone.length > 15);

    if (invalidPhoneRow) {
      return res.status(400).json({
        error: `Invalid phone number ${invalidPhoneRow.phone}. Use country code format, e.g. 91XXXXXXXXXX.`,
      });
    }

    const phoneCounts = cleanRows.reduce((acc, row) => {
      acc.set(row.phone, (acc.get(row.phone) || 0) + 1);
      return acc;
    }, new Map());

    const duplicatePhones = [...phoneCounts.entries()]
      .filter(([, count]) => count > 1)
      .map(([phone]) => phone);

    if (duplicatePhones.length) {
      return res.status(400).json({
        error: `Duplicate phone numbers found in CSV. Remove duplicates before campaign sending. First duplicate: ${duplicatePhones[0]}`,
      });
    }

    const missingConsentRow = cleanRows.find((row) => !row.optInSource || !row.optInProof);

    if (missingConsentRow) {
      return res.status(400).json({
        error: `Opt-in source and proof are required for ${missingConsentRow.phone}.`,
      });
    }

    const weakProofRow = cleanRows.find((row) => row.optInProof.length < 8);

    if (weakProofRow) {
      return res.status(400).json({
        error: `Opt-in proof is too short for ${weakProofRow.phone}. Add clear proof like "Customer replied START on WhatsApp".`,
      });
    }

    const qualityGuard = await getCampaignQualityGuard(req.user.tenantId);

    if (qualityGuard.blocked) {
      await recordAudit({
        tenantId: req.user.tenantId,
        actorUserId: req.user.id,
        action: 'campaign.blocked_quality_guard',
        entityType: 'campaign',
        entityId: null,
        metadata: {
          sentCount: qualityGuard.sentCount,
          failedCount: qualityGuard.failedCount,
          failureRate: Number(qualityGuard.failureRate.toFixed(4)),
          failureRateLimit: qualityGuard.failureRateLimit,
        },
      });

      return res.status(429).json({
        error: `Campaign sending is paused for this tenant because recent failure rate is ${Math.round(qualityGuard.failureRate * 100)}%. Fix failed messages before sending another campaign.`,
      });
    }

    const dailyUsageResult = await query(
      `SELECT COUNT(*)::int AS sent_today
       FROM campaign_recipients
       WHERE tenant_id = $1
         AND status = 'sent'
         AND sent_at >= date_trunc('day', now())`,
      [req.user.tenantId],
    );

    const sentToday = Number(dailyUsageResult.rows[0]?.sent_today || 0);
    const remainingToday = Math.max(campaignDailyLimit - sentToday, 0);

    if (remainingToday <= 0) {
      return res.status(429).json({
        error: `Daily WhatsApp campaign limit reached. Limit: ${campaignDailyLimit}, sent today: ${sentToday}.`,
      });
    }

    if (cleanRows.length > remainingToday) {
      return res.status(429).json({
        error: `This campaign has ${cleanRows.length} rows, but only ${remainingToday} sends are remaining today. Reduce CSV size or increase verified WhatsApp messaging limit.`,
      });
    }

    await assertCampaignRecipientLimit({
  tenantId: req.user.tenantId,
  recipientCount: cleanRows.length,
});

await assertDailyOutboundLimit({
  tenantId: req.user.tenantId,
  add: cleanRows.length,
});

    const uniquePhones = [...new Set(cleanRows.map((row) => row.phone))];
    const contactResult = await query(
      `SELECT *
       FROM contacts
       WHERE tenant_id = $1
         AND regexp_replace(phone, '\\D', '', 'g') = ANY($2::text[])`,
      [req.user.tenantId, uniquePhones],
    );

    const contactsByPhone = new Map(
      contactResult.rows.map((contact) => [normalizeCampaignPhone(contact.phone), contact]),
    );

    const campaignStatus = scheduledAt && !sendNow ? 'scheduled' : sendNow ? 'sending' : 'draft';
    const campaignResult = await query(
      `INSERT INTO campaigns
         (tenant_id, name, template_id, template_name, language, status, scheduled_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        req.user.tenantId,
        name.slice(0, 120),
        template.id,
        template.name,
        template.language,
        campaignStatus,
        scheduledAt || null,
        req.user.id,
      ],
    );

    const campaign = campaignResult.rows[0];
    const recipients = [];
    const skipped = [];

    for (const row of cleanRows) {
      const contact = contactsByPhone.get(row.phone);
      let status = 'pending';
      let skipReason = '';

      if (!contact) {
        status = 'skipped';
        skipReason = 'contact_not_found';
      } else if (contact.opted_out) {
        status = 'skipped';
        skipReason = 'contact_opted_out';
      } else if (!contact.marketing_opted_in && (!row.optInSource || !row.optInProof)) {
        status = 'skipped';
        skipReason = 'marketing_opt_in_missing';
      }

      if (contact && !contact.marketing_opted_in && row.optInProof && status === 'pending') {
        await query(
          `UPDATE contacts
           SET marketing_opted_in = true,
               marketing_opted_in_at = COALESCE(marketing_opted_in_at, now()),
               marketing_opt_in_source = $3,
               marketing_opt_in_proof = $4,
               updated_at = now()
           WHERE id = $1
             AND tenant_id = $2`,
          [
            contact.id,
            req.user.tenantId,
            row.optInSource || 'campaign_csv',
            row.optInProof.slice(0, 500),
          ],
        );

        await query(
          `INSERT INTO contact_consents
             (tenant_id, contact_id, consent_type, channel, status, source, proof_text, recorded_by)
           VALUES ($1, $2, 'marketing', 'whatsapp', 'opted_in', $3, $4, $5)`,
          [
            req.user.tenantId,
            contact.id,
            row.optInSource || 'campaign_csv',
            row.optInProof.slice(0, 500),
            req.user.id,
          ],
        );

        contact.marketing_opted_in = true;
      }

      const recipientResult = await query(
        `INSERT INTO campaign_recipients
           (tenant_id, campaign_id, contact_id, to_phone, status, skip_reason)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          req.user.tenantId,
          campaign.id,
          contact?.id || null,
          row.phone,
          status,
          skipReason || null,
        ],
      );

      const recipient = recipientResult.rows[0];
      recipients.push({ ...recipient, contact });
      if (status === 'skipped') skipped.push(recipient);
    }

    const skippedCount = skipped.length;
    const pendingCount = Math.max(recipients.length - skippedCount, 0);

    const preparedCampaignResult = await query(
      `UPDATE campaigns
       SET status = $3,
           total_recipients = $4,
           sent_count = 0,
           failed_count = 0,
           skipped_count = $7,
           updated_at = now()
       WHERE id = $1
         AND tenant_id = $2
       RETURNING *`,
      [
        campaign.id,
        req.user.tenantId,
        campaignStatus,
        recipients.length,
        0,
        0,
        skippedCount,
      ],
    );

    if (skipped.length > 0) {
      await recordAudit({
        tenantId: req.user.tenantId,
        actorUserId: req.user.id,
        action: 'campaign.skipped_recipients_detected',
        entityType: 'campaign',
        entityId: campaign.id,
        metadata: {
          skippedCount: skipped.length,
          skippedReasons: skipped.slice(0, 20).map((item) => item.skip_reason || 'unknown'),
        },
      });
    }

    if (pendingCount <= 0) {
      const failedSummary = await updateCampaignSummary(req.user.tenantId, campaign.id, 'failed');

      await recordAudit({
        tenantId: req.user.tenantId,
        actorUserId: req.user.id,
        action: 'campaign.blocked_no_sendable_recipients',
        entityType: 'campaign',
        entityId: campaign.id,
        metadata: {
          templateName: template.name,
          language: template.language,
          totalRecipients: recipients.length,
          skippedCount,
        },
      });

      return res.status(400).json({
        error: 'Campaign has no sendable recipients. Check opt-in, opt-out, and contact matching.',
        campaign: failedSummary.campaign,
        summary: failedSummary.summary,
      });
    }

    if (campaignQueueAvailable && (sendNow || scheduledAt)) {
      const job = await enqueueCampaignDelivery({
        tenantId: req.user.tenantId,
        campaignId: campaign.id,
        actorUserId: req.user.id,
        scheduledAt: sendNow ? null : scheduledAt,
      });

      await recordAudit({
        tenantId: req.user.tenantId,
        actorUserId: req.user.id,
        action: sendNow ? 'campaign.queued' : 'campaign.scheduled',
        entityType: 'campaign',
        entityId: campaign.id,
        metadata: {
          templateName: template.name,
          language: template.language,
          totalRecipients: recipients.length,
          skippedCount,
          pendingCount,
          jobId: job?.id || null,
          scheduledAt: sendNow ? null : scheduledAt,
        },
      });

      return res.status(201).json({
        campaign: preparedCampaignResult.rows[0],
        queue: {
          enabled: true,
          jobId: job?.id || null,
          status: sendNow ? 'queued' : 'scheduled',
        },
        summary: {
          total: recipients.length,
          sent: 0,
          failed: 0,
          skipped: skippedCount,
          pending: pendingCount,
        },
      });
    }

    const processed = await processCampaignDelivery({
      campaignId: campaign.id,
      tenantId: req.user.tenantId,
      actorUserId: req.user.id,
    });

    await recordAudit({
      tenantId: req.user.tenantId,
      actorUserId: req.user.id,
      action: 'campaign.sent',
      entityType: 'campaign',
      entityId: campaign.id,
      metadata: {
        templateName: template.name,
        language: template.language,
        ...processed.summary,
      },
    });

    res.status(201).json({
      campaign: processed.campaign,
      queue: {
        enabled: false,
        status: 'processed_without_queue',
      },
      summary: processed.summary,
    });
  }));

  return {
    processCampaignDelivery,
  };
}

module.exports = {
  registerCampaignRoutes,
};
