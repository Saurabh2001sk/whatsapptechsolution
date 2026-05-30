function normalizeCampaignPhone(value = '') {
  return String(value || '').replace(/\D/g, '');
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

    if (!sendNow) {
      return res.status(400).json({
        error: 'Draft/scheduled campaigns are locked until the campaign queue worker is connected. Use Send Now only.',
      });
    }

    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
      return res.status(400).json({ error: 'Invalid scheduled time' });
    }

    if (scheduledAt) {
      return res.status(400).json({
        error: 'Campaign scheduling is not enabled yet. Use Send Now only until the queue worker is connected.',
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

    let sentCount = 0;
    let failedCount = 0;

    if (sendNow) {
      const sendableRecipients = recipients.filter((recipient) => recipient.status === 'pending');

      if (!sendableRecipients.length) {
            if (sendNow && skipped.length > 0) {
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
        const skippedCount = skipped.length;

        const updatedCampaignResult = await query(
          `UPDATE campaigns
           SET status = 'failed',
               total_recipients = $3,
               sent_count = 0,
               failed_count = 0,
               skipped_count = $4,
               updated_at = now()
           WHERE id = $1
             AND tenant_id = $2
           RETURNING *`,
          [campaign.id, req.user.tenantId, recipients.length, skippedCount],
        );

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
          campaign: updatedCampaignResult.rows[0],
          summary: {
            total: recipients.length,
            sent: 0,
            failed: 0,
            skipped: skippedCount,
            pending: 0,
          },
        });
      }

      for (const recipient of sendableRecipients) {
        const contact = recipient.contact;

        await query(
          `UPDATE campaign_recipients
           SET status = 'sending',
               updated_at = now()
           WHERE id = $1
             AND tenant_id = $2`,
          [recipient.id, req.user.tenantId],
        );

        const payload = {
          messaging_product: 'whatsapp',
          to: contact.wa_id || contact.phone,
          type: 'template',
          template: {
            name: template.name,
            language: { code: template.language },
          },
        };

        const outboundRecord = await createOutboundMessageRecord({
          tenantId: req.user.tenantId,
          contactId: contact.id,
          toPhone: contact.wa_id || contact.phone,
          messageType: 'template',
          templateName: template.name,
          language: template.language,
          body: `[Campaign Template] ${template.name}`,
          payload,
          createdBy: req.user.id,
        });

        await markOutboundSending(outboundRecord?.id, req.user.tenantId);

        try {
          const waMessageId = await sendWhatsAppTemplate(contact, template.name, template.language, req.user.tenantId);

          await markOutboundSent(outboundRecord?.id, req.user.tenantId, waMessageId);
          await addMessage({
            tenantId: req.user.tenantId,
            contactId: contact.id,
            waMessageId,
            direction: 'outbound',
            type: 'template',
            body: `[Campaign Template] ${template.name}`,
            status: waMessageId ? 'sent' : 'accepted',
            templateName: template.name,
            normalizedText: `[Campaign Template] ${template.name}`,
          });

          await query(
            `UPDATE campaign_recipients
             SET status = 'sent',
                 outbound_message_id = $3,
                 sent_at = now(),
                 updated_at = now()
             WHERE id = $1
               AND tenant_id = $2`,
            [recipient.id, req.user.tenantId, outboundRecord?.id || null],
          );

          sentCount += 1;
        } catch (error) {
          await markOutboundFailed(outboundRecord?.id, req.user.tenantId, error);

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
              req.user.tenantId,
              outboundRecord?.id || null,
              String(error?.response?.data?.error?.message || error?.message || 'WhatsApp campaign send failed').slice(0, 1000),
            ],
          );

          failedCount += 1;
        }
      }
    }

    const skippedCount = skipped.length;
    const pendingCount = Math.max(recipients.length - skippedCount - sentCount - failedCount, 0);

    const finalStatus = failedCount && sentCount
      ? 'partial_failed'
      : sentCount
        ? 'sent'
        : 'failed';

    const updatedCampaignResult = await query(
      `UPDATE campaigns
       SET status = $3,
           total_recipients = $4,
           sent_count = $5,
           failed_count = $6,
           skipped_count = $7,
           updated_at = now()
       WHERE id = $1
         AND tenant_id = $2
       RETURNING *`,
      [
        campaign.id,
        req.user.tenantId,
        finalStatus,
        recipients.length,
        sentCount,
        failedCount,
        skippedCount,
      ],
    );

    await recordAudit({
      tenantId: req.user.tenantId,
      actorUserId: req.user.id,
      action: sendNow ? 'campaign.sent' : 'campaign.created',
      entityType: 'campaign',
      entityId: campaign.id,
      metadata: {
        templateName: template.name,
        language: template.language,
        totalRecipients: recipients.length,
        sentCount,
        failedCount,
        skippedCount,
      },
    });

    res.status(201).json({
      campaign: updatedCampaignResult.rows[0],
      summary: {
        total: recipients.length,
        sent: sentCount,
        failed: failedCount,
        skipped: skippedCount,
        pending: pendingCount,
      },
    });
  }));
}

module.exports = {
  registerCampaignRoutes,
};
