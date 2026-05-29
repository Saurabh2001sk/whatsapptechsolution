function registerCrmRoutes(app, ctx) {
  const {
    axios,
    bcrypt,
    crypto,
    fs,
    path,
    query,
    healthCheck,
    asyncHandler,
    rateLimit,
    maskValue,
    maskEmail,
    maskId,
    hasRealValue,
    toFiniteNumber,
    isStrongPassword,
    strongPasswordError,
    normalizeUserText,
    isReplyWindowOpen,
    isOptOutMessage,
    encryptSecret,
    decryptSecret,
    safeMetaError,
    safeErrorLog,
    cleanList,
    WEEK_DAYS,
    DEFAULT_VOICE_WEEKLY_HOURS,
    cleanVoiceWeeklyHours,
    cleanUnavailableHours,
    mediaRoot,
    port,
    isProduction,
    jwtSecret,
    signUser,
    publicUser,
    setAuthCookie,
    clearAuthCookie,
    requireAuth,
    isSuperAdmin,
    canMonitor,
    requireSuperAdmin,
    normalizeTenantSlug,
    publicTenant,
    countActiveTenantAdmins,
    getDemoTenantId,
    ensureDefaultWhatsAppAccountMapping,
    getEnvWhatsAppAccountStatus,
    getTenantIdForWebhookValue,
    recordAudit,
    recordAssignmentHistory,
    loginAttempts,
    MAX_LOGIN_ATTEMPTS,
    LOGIN_LOCK_MS,
    MAX_WHATSAPP_TEXT_LENGTH,
    DEFAULT_APP_SETTINGS,
    PRODUCT_FIELD_ALIASES,
    serverStartedAt,
    isWhatsAppConfigured,
    shouldAllowLocalMessageQueue,
    getLoginAttemptKey,
    isLoginLocked,
    recordFailedLogin,
    clearLoginAttempts,
    validateRuntimeConfig,
    normalizeAppSettings,
    getAppSettings,
    saveAppSettings,
    normalizeProduct,
    normalizeHeader,
    findProductValue,
    productFromImportRow,
    normalizeKnowledgeBaseItem,
    shouldUseKnowledgeBase,
    knowledgeSearchTerms,
    findKnowledgeMatches,
    buildKnowledgeReply,
    verifyMetaWebhookSignature,
    categorizeMessage,
    extractEnquiry,
    getBotIntent,
    botProductSearchTerms,
    findBotProductMatches,
    formatBotProductLine,
    buildBotReplyText,
    buildBotReply,
    shouldSendMainMenu,
    buildMainMenuInteractive,
    menuPayloadToText,
    getProductCategoriesForTenant,
    buildCategoryMenuInteractive,
    findExactProductCategory,
    buildCategoryProductsReply,
    buildMenuSelectionReply,
    hasQuoteRequestSignal,
    hasEnoughQuoteDetails,
    buildMissingQuoteDetailsReply,
    findBestProductForQuote,
    createStructuredQuoteDraft,
    buildStructuredQuoteConfirmation,
    parseQuantity,
    normalizeSalesItem,
    sumItems,
    validateSalesItemsForTenant,
    validateContactForTenant,
    validateTemplateRetryAllowed,
    extractText,
    normalizeWhatsAppMessage,
    extensionFromMime,
    downloadWhatsAppMedia,
    getLeastLoadedSalesUser,
    upsertContact,
    addMessage,
    updateMessageStatus,
    createEnquiryDraft,
    maybeSendBotAutoReply,
    processInboundMessage,
    findContact,
    canAccessContact,
    canAccessContactId,
    canAccessDraft,
    getEnquiryDraftById,
    createQuotation,
    createSalesOrder,
    getWhatsAppSendConfig,
    getWhatsAppTemplateSyncConfig,
    extractMetaTemplateBody,
    normalizeMetaTemplateStatus,
    normalizeMetaTemplateCategory,
    whatsappMessagesUrl,
    whatsappHeaders,
    createOutboundMessageRecord,
    markOutboundSending,
    markOutboundSent,
    markOutboundFailed,
    sleep,
    isRetryableWhatsAppError,
    postWhatsAppMessage,
    sendWhatsAppText,
    sendWhatsAppInteractiveList,
    sendWhatsAppTemplate,
    sendWhatsAppTemplateToNumber,
    formatQuotationItemsForApproval,
    recordQuotationApprovalEvent,
    sendOrderAcknowledgementToCustomer,
    isManagerApproveText,
    isManagerRejectText,
    findLatestManagerQuote,
    sendManagerApprovalSystemReply,
    handleManagerApprovalInbound,
    isCustomerQuoteApproveText,
    isCustomerQuoteRejectText,
    findLatestCustomerSentQuote,
    sendCustomerQuoteSystemReply,
    handleCustomerQuoteInbound,
  } = ctx;

app.get('/api/dashboard', requireAuth, asyncHandler(async (req, res) => {
  const params = [req.user.tenantId];
  const where = ['c.tenant_id = $1'];
  if (!canMonitor(req.user)) {
    params.push(req.user.id);
    where.push(`c.assigned_to = $${params.length}`);
  }
  const scopeWhere = `WHERE ${where.join(' AND ')}`;
  const summary = await query(
    `SELECT
      COUNT(*)::int AS total_conversations,
      COUNT(*) FILTER (WHERE c.assigned_to IS NULL)::int AS unassigned,
      COUNT(*) FILTER (WHERE c.last_inbound_at >= now() - interval '24 hours')::int AS open_windows,
      COUNT(*) FILTER (WHERE c.last_inbound_at IS NULL OR c.last_inbound_at < now() - interval '24 hours')::int AS expired_windows
     FROM contacts c ${scopeWhere}`,
    params,
  );
  const labels = await query(
    `SELECT c.label, COUNT(*)::int AS count FROM contacts c ${scopeWhere} GROUP BY c.label ORDER BY count DESC`,
    params,
  );
  res.json({ ...summary.rows[0], labels: labels.rows });
}));

// =========================================================
// ROUTES — CONVERSATIONS / CONTACTS
// =========================================================

app.get('/api/conversations', requireAuth, asyncHandler(async (req, res) => {
  const { assigned } = req.query;
  const label = String(req.query?.label || '').trim().slice(0, 80);
  const q = String(req.query?.q || '').trim().slice(0, 80);
  const windowFilter = String(req.query?.window || '').trim().toLowerCase();

  const params = [req.user.tenantId];
  const where = ['c.tenant_id = $1'];
  if (!canMonitor(req.user)) {
    params.push(req.user.id);
    where.push(`c.assigned_to = $${params.length}`);
  }

  if (label && label !== 'all') {
    params.push(label);
    where.push(`c.label = $${params.length}`);
  }

  if (assigned === 'unassigned') {
    if (!canMonitor(req.user)) {
      return res.status(403).json({ error: 'Only manager/admin can view unassigned conversations' });
    }

    where.push('c.assigned_to IS NULL');
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(`(c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR c.company ILIKE $${params.length})`);
  }

  if (windowFilter && !['all', 'open', 'expired'].includes(windowFilter)) {
    return res.status(400).json({ error: 'Invalid conversation window filter' });
  }

  if (windowFilter === 'open') where.push(`c.last_inbound_at >= now() - interval '24 hours'`);
  if (windowFilter === 'expired') where.push(`(c.last_inbound_at IS NULL OR c.last_inbound_at < now() - interval '24 hours')`);

  const result = await query(
    `SELECT c.*, u.name AS assigned_name,
      m.body AS last_message, m.created_at AS last_message_at,
      CASE WHEN c.last_inbound_at >= now() - interval '24 hours' THEN true ELSE false END AS reply_window_open,
      COALESCE(unread.count, 0) AS unread_count
     FROM contacts c
     LEFT JOIN users u ON u.id = c.assigned_to AND u.tenant_id = c.tenant_id
     LEFT JOIN LATERAL (SELECT body, created_at FROM messages WHERE contact_id = c.id AND tenant_id = c.tenant_id ORDER BY created_at DESC LIMIT 1) m ON true
     LEFT JOIN LATERAL (SELECT COUNT(*)::int AS count FROM messages WHERE contact_id = c.id AND tenant_id = c.tenant_id AND direction = 'inbound' AND status = 'received') unread ON true
     WHERE ${where.join(' AND ')}
     ORDER BY COALESCE(m.created_at, c.updated_at) DESC
     LIMIT 100`,
    params,
  );
  res.json(result.rows);
}));

app.get('/api/contacts/:id/assignment-history', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });
  const contact = await findContact(req.params.id, req.user.tenantId);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  const result = await query(
    `SELECT ah.*, from_user.name AS from_user_name, to_user.name AS to_user_name, changed_user.name AS changed_by_name
     FROM assignment_history ah
     LEFT JOIN users from_user ON from_user.id = ah.from_user_id AND from_user.tenant_id = ah.tenant_id
     LEFT JOIN users to_user ON to_user.id = ah.to_user_id AND to_user.tenant_id = ah.tenant_id
     LEFT JOIN users changed_user ON changed_user.id = ah.changed_by AND changed_user.tenant_id = ah.tenant_id
     WHERE ah.contact_id = $1 AND ah.tenant_id = $2
     ORDER BY ah.created_at DESC`,
    [req.params.id, req.user.tenantId],
  );
  res.json(result.rows);
}));

app.get('/api/contacts/:id/timeline', requireAuth, asyncHandler(async (req, res) => {
  const contact = await findContact(req.params.id, req.user.tenantId);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  if (!canAccessContact(req.user, contact)) return res.status(403).json({ error: 'Conversation assigned to another user' });
  const [messageRows, quoteRows, orderRows, auditRows] = await Promise.all([
    query('SELECT id, direction, type, body, status, created_at, status_updated_at FROM messages WHERE contact_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 25', [req.params.id, req.user.tenantId]),
    query('SELECT id, quote_no, status, amount, created_at FROM quotations WHERE contact_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 20', [req.params.id, req.user.tenantId]),
    query('SELECT id, order_no, status, payment_status, dispatch_status, amount, created_at FROM sales_orders WHERE contact_id = $1 AND tenant_id = $2 ORDER BY created_at DESC LIMIT 20', [req.params.id, req.user.tenantId]),
    query(
      `SELECT ae.*, u.name AS actor_name FROM audit_events ae
       LEFT JOIN users u ON u.id = ae.actor_user_id AND u.tenant_id = ae.tenant_id
       WHERE ae.tenant_id = $2 AND ((ae.entity_type = 'contact' AND ae.entity_id = $1) OR (ae.metadata->>'contactId' = $1::text))
       ORDER BY ae.created_at DESC LIMIT 25`,
      [req.params.id, req.user.tenantId],
    ),
  ]);
  const rows = [
    ...messageRows.rows.map((item) => ({ kind: 'message', at: item.created_at, title: `${item.direction} ${item.type}`, text: item.body, status: item.status })),
    ...quoteRows.rows.map((item) => ({ kind: 'quotation', at: item.created_at, title: item.quote_no, text: `Amount ${item.amount}`, status: item.status })),
    ...orderRows.rows.map((item) => ({ kind: 'order', at: item.created_at, title: item.order_no, text: `Pay ${item.payment_status} / Dispatch ${item.dispatch_status}`, status: item.status })),
    ...auditRows.rows.map((item) => ({ kind: 'audit', at: item.created_at, title: item.action, text: item.actor_name || 'System', status: item.entity_type })),
  ];
  res.json(rows.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 50));
}));

app.get('/api/conversations/:id/messages', requireAuth, asyncHandler(async (req, res) => {
  const contact = await findContact(req.params.id, req.user.tenantId);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  if (!canAccessContact(req.user, contact)) return res.status(403).json({ error: 'Conversation assigned to another user' });
  const result = await query(
    `SELECT *
     FROM (
       SELECT id, tenant_id, contact_id, wa_message_id, direction, type, body, status, template_name,
              caption, media_id, media_url, mime_type, file_name, file_size,
              interactive_payload, button_payload, status_updated_at, created_at
       FROM messages
       WHERE contact_id = $1
         AND tenant_id = $2
       ORDER BY created_at DESC
       LIMIT 200
     ) recent_messages
     ORDER BY created_at ASC`,
    [req.params.id, req.user.tenantId],
  );
  res.json(result.rows);
}));

app.post('/api/conversations/:id/read', requireAuth, asyncHandler(async (req, res) => {
  const contact = await findContact(req.params.id, req.user.tenantId);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  if (!canAccessContact(req.user, contact)) return res.status(403).json({ error: 'Conversation assigned to another user' });
  const result = await query(
    `UPDATE messages SET status = 'read' WHERE contact_id = $1 AND tenant_id = $2 AND direction = 'inbound' AND status = 'received' RETURNING id`,
    [req.params.id, req.user.tenantId],
  );
  res.json({ ok: true, updated: result.rowCount });
}));

app.patch('/api/contacts/:id', requireAuth, asyncHandler(async (req, res) => {
  const contact = await findContact(req.params.id, req.user.tenantId);

  if (!contact) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  if (!canAccessContact(req.user, contact)) {
    return res.status(403).json({ error: 'Conversation assigned to another user' });
  }

  const settings = await getAppSettings(req.user.tenantId);

  function cleanOptionalText(value, maxLength) {
    if (value === undefined) return undefined;

    const cleanValue = String(value || '').trim();

    if (!cleanValue) return null;

    return cleanValue.slice(0, maxLength);
  }

  const cleanName = cleanOptionalText(req.body?.name, 120);
  const cleanCompany = cleanOptionalText(req.body?.company, 160);
  const cleanOwner = cleanOptionalText(req.body?.owner, 120);
  const cleanNotes = cleanOptionalText(req.body?.notes, 2000);
  const cleanAssignmentReason = cleanOptionalText(req.body?.assignment_reason, 500);

  let cleanStage;

  if (req.body?.stage !== undefined) {
    cleanStage = String(req.body.stage || '').trim().toLowerCase();

    const allowedStages = new Set(
      (settings.stages || DEFAULT_APP_SETTINGS.stages)
        .map((item) => String(item || '').trim().toLowerCase())
        .filter(Boolean),
    );

    if (!cleanStage || !allowedStages.has(cleanStage)) {
      return res.status(400).json({ error: 'Invalid contact stage' });
    }
  }

  let cleanLabel;

  if (req.body?.label !== undefined) {
    cleanLabel = String(req.body.label || '').trim();

    const allowedLabels = new Set(
      (settings.labels || DEFAULT_APP_SETTINGS.labels)
        .map((item) => String(item || '').trim().toLowerCase())
        .filter(Boolean),
    );

    if (!cleanLabel || !allowedLabels.has(cleanLabel.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid contact label' });
    }

    cleanLabel = cleanLabel.slice(0, 80);
  }

  const shouldUpdateAssignment = req.body?.assigned_to !== undefined;

  if (shouldUpdateAssignment && !canMonitor(req.user)) {
    return res.status(403).json({ error: 'Only manager/admin can assign' });
  }

  const assignedToValue = shouldUpdateAssignment
    ? String(req.body.assigned_to || '').trim() || null
    : null;

  if (assignedToValue) {
    const assignedUser = await query(
      `SELECT id
       FROM users
       WHERE id = $1
         AND tenant_id = $2
         AND active = true
         AND role IN ('admin', 'manager', 'sales')
       LIMIT 1`,
      [assignedToValue, req.user.tenantId],
    );

    if (!assignedUser.rows[0]) {
      return res.status(400).json({ error: 'Assigned user not found for this company' });
    }
  }

  const before = await query(
    'SELECT assigned_to FROM contacts WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.user.tenantId],
  );

  const result = await query(
    `UPDATE contacts
     SET name = CASE WHEN $2::boolean THEN $3 ELSE name END,
         company = CASE WHEN $4::boolean THEN $5 ELSE company END,
         stage = CASE WHEN $6::boolean THEN $7 ELSE stage END,
         owner = CASE WHEN $8::boolean THEN $9 ELSE owner END,
         notes = CASE WHEN $10::boolean THEN $11 ELSE notes END,
         label = CASE WHEN $12::boolean THEN $13 ELSE label END,
         assigned_to = CASE WHEN $14::boolean THEN $15::uuid ELSE assigned_to END,
         updated_at = now()
     WHERE id = $1
       AND tenant_id = $16
     RETURNING *`,
    [
      req.params.id,
      req.body?.name !== undefined,
      cleanName,
      req.body?.company !== undefined,
      cleanCompany,
      req.body?.stage !== undefined,
      cleanStage,
      req.body?.owner !== undefined,
      cleanOwner,
      req.body?.notes !== undefined,
      cleanNotes,
      req.body?.label !== undefined,
      cleanLabel,
      shouldUpdateAssignment,
      assignedToValue,
      req.user.tenantId,
    ],
  );

  const updatedContact = result.rows[0];

  await recordAssignmentHistory({
    tenantId: req.user.tenantId,
    contactId: req.params.id,
    fromUserId: before.rows[0]?.assigned_to,
    toUserId: updatedContact?.assigned_to,
    changedBy: req.user.id,
    reason: cleanAssignmentReason,
  });

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'contact.updated',
    entityType: 'contact',
    entityId: updatedContact.id,
    metadata: {
      changedFields: Object.keys(req.body || {}).filter((key) => key !== 'assignment_reason'),
      assignedToChanged: before.rows[0]?.assigned_to !== updatedContact.assigned_to,
    },
  });

  res.json(updatedContact);
}));

app.get('/api/contacts/opt-outs', requireAuth, async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const role = req.user?.role;

    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant session missing' });
    }

    if (!['admin', 'manager'].includes(role)) {
      return res.status(403).json({ error: 'Admin/manager access required' });
    }

    const result = await query(
      `
      SELECT
        id,
        name,
        phone,
        wa_id,
        company,
        label,
        stage,
        opted_out,
        opted_out_at,
        opted_out_reason,
        updated_at,
        last_inbound_at
      FROM contacts
      WHERE tenant_id = $1
        AND opted_out = true
      ORDER BY opted_out_at DESC NULLS LAST, updated_at DESC
      LIMIT 500
      `,
      [tenantId]
    );

    return res.json(result.rows);
  } catch (error) {
    console.error('Load opt-out contacts failed:', {
      message: error.message,
      code: error.code || null,
    });

    return res.status(500).json({
      error: 'Unable to load opt-out contacts',
    });
  }
});

app.patch('/api/contacts/:id/opt-out', requireAuth, async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    const role = req.user?.role;
    const contactId = req.params.id;
    const optedOut = Boolean(req.body?.optedOut);
    const reason = String(req.body?.reason || '').trim();

    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Tenant session missing' });
    }

    if (!['admin', 'manager'].includes(role)) {
      return res.status(403).json({ error: 'Admin/manager access required' });
    }

    const existingResult = await query(
      `
      SELECT id, name, phone, opted_out
      FROM contacts
      WHERE id = $1
        AND tenant_id = $2
      LIMIT 1
      `,
      [contactId, tenantId]
    );

    const existingContact = existingResult.rows[0];

    if (!existingContact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    if (optedOut && reason.length < 3) {
      return res.status(400).json({
        error: 'Manual opt-out reason is required for compliance audit.',
      });
    }

    if (!optedOut && reason.length < 8) {
      return res.status(400).json({
        error: 'Manual opt-in proof is required before enabling WhatsApp messages again.',
      });
    }

    const updateResult = await query(
      `
UPDATE contacts
      SET
        opted_out = $1,
        opted_out_at = CASE
          WHEN $1 = true THEN COALESCE(opted_out_at, now())
          ELSE NULL
        END,
        opted_out_reason = CASE
          WHEN $1 = true THEN NULLIF($2, '')
          ELSE NULL
        END,
        marketing_opted_in = CASE
          WHEN $1 = true THEN false
          WHEN $1 = false THEN true
          ELSE marketing_opted_in
        END,
        marketing_opted_in_at = CASE
          WHEN $1 = true THEN NULL
          WHEN $1 = false THEN COALESCE(marketing_opted_in_at, now())
          ELSE marketing_opted_in_at
        END,
        marketing_opt_in_source = CASE
          WHEN $1 = true THEN 'manual_admin_opt_out'
          WHEN $1 = false THEN 'manual_admin_opt_in'
          ELSE marketing_opt_in_source
        END,
        marketing_opt_in_proof = CASE
          WHEN $1 = true THEN NULL
          WHEN $1 = false THEN LEFT($2, 500)
          ELSE marketing_opt_in_proof
        END,
        updated_at = now()
      WHERE id = $3
        AND tenant_id = $4
      RETURNING
        id,
        name,
        phone,
        wa_id,
        company,
        label,
        stage,
        opted_out,
        opted_out_at,
        opted_out_reason,
        marketing_opted_in,
        marketing_opted_in_at,
        marketing_opt_in_source,
        updated_at,
        last_inbound_at
      `,
      [optedOut, reason, contactId, tenantId]
    );

    const updatedContact = updateResult.rows[0];

if (optedOut) {
      await query(
        `
        INSERT INTO contact_consents (
          tenant_id,
          contact_id,
          consent_type,
          channel,
          status,
          source,
          proof_text,
          recorded_by
        )
        VALUES ($1, $2, 'marketing', 'whatsapp', 'opted_out', 'manual_admin_opt_out', $3, $4)
        `,
        [tenantId, contactId, reason.slice(0, 500), userId]
      );
    } else {
      await query(
        `
        INSERT INTO contact_consents (
          tenant_id,
          contact_id,
          consent_type,
          channel,
          status,
          source,
          proof_text,
          recorded_by
        )
        VALUES ($1, $2, 'marketing', 'whatsapp', 'opted_in', 'manual_admin_opt_in', $3, $4)
        `,
        [tenantId, contactId, reason.slice(0, 500), userId]
      );
    }

    await query(
      `
      INSERT INTO audit_events (
        tenant_id,
        actor_user_id,
        action,
        entity_type,
        entity_id,
        metadata
      )
      VALUES ($1, $2, $3, 'contact', $4, $5::jsonb)
      `,
      [
        tenantId,
        userId,
        optedOut ? 'contact_manual_opt_out' : 'contact_manual_opt_in',
        contactId,
        JSON.stringify({
          phone: maskValue(existingContact.phone),
          name: existingContact.name,
          previousOptedOut: existingContact.opted_out,
          newOptedOut: optedOut,
          reason,
        }),
      ]
    );

    return res.json(updatedContact);
  } catch (error) {
    console.error('Update contact opt-out failed:', {
      message: error.message,
      code: error.code || null,
    });

    return res.status(500).json({
      error: 'Unable to update contact opt-out status',
    });
  }
});

app.post('/api/conversations/:id/messages', rateLimit({
  bucketName: 'conversation-message-send',
  maxRequests: 120,
  windowMs: 60 * 60 * 1000,
}), requireAuth, asyncHandler(async (req, res) => {
  const { text, templateName, language } = req.body;

  const contact = await findContact(req.params.id, req.user.tenantId);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

  if (!canAccessContact(req.user, contact)) {
    return res.status(403).json({ error: 'Conversation assigned to another user' });
  }

  if (contact.opted_out) {
    return res.status(403).json({
      error: 'Customer has opted out. Do not send WhatsApp messages to this contact.',
    });
  }

  const cleanText = String(text || '').trim();
  const cleanTemplateName = String(templateName || '').trim();
  const cleanLanguage = String(language || 'en').trim() || 'en';

  if (!cleanText && !cleanTemplateName) {
    return res.status(400).json({ error: 'Message text or template is required' });
  }

  if (cleanText && !cleanTemplateName && cleanText.length > MAX_WHATSAPP_TEXT_LENGTH) {
    return res.status(400).json({
      error: `WhatsApp text message is too long. Maximum ${MAX_WHATSAPP_TEXT_LENGTH} characters allowed.`,
    });
  }

  if (cleanText && cleanTemplateName) {
    return res.status(400).json({ error: 'Send either text or template, not both' });
  }

  const replyWindowOpen = isReplyWindowOpen(contact);

  if (!replyWindowOpen && !cleanTemplateName) {
    return res.status(400).json({
      error: '24-hour reply window expired. Use an approved WhatsApp template.',
    });
  }

  let templateRecord = null;

  if (cleanTemplateName) {
    const templateResult = await query(
      `SELECT id, name, language, body, meta_status
       FROM whatsapp_templates
       WHERE tenant_id = $1
         AND name = $2
         AND language = $3
         AND active = true
         AND ($4::boolean = false OR meta_status = 'approved')
       LIMIT 1`,
      [req.user.tenantId, cleanTemplateName, cleanLanguage, isProduction],
    );

    templateRecord = templateResult.rows[0];

    if (!templateRecord) {
      return res.status(400).json({
        error: isProduction
          ? 'Template is not approved by Meta for this company. Sync approved templates from Meta before sending.'
          : 'Template is not active or not found for this company',
      });
    }
  }

  let waMessageId = null;
  let body = cleanText;
  let type = 'text';

  const outboundPayload = cleanTemplateName
    ? {
        messaging_product: 'whatsapp',
        to: contact.wa_id,
        type: 'template',
        template: {
          name: cleanTemplateName,
          language: { code: cleanLanguage },
        },
      }
    : {
        messaging_product: 'whatsapp',
        to: contact.wa_id,
        type: 'text',
        text: { body: cleanText },
      };

  const outboundRecord = await createOutboundMessageRecord({
    tenantId: req.user.tenantId,
    contactId: contact.id,
    toPhone: contact.wa_id || contact.phone,
    messageType: cleanTemplateName ? 'template' : 'text',
    templateName: cleanTemplateName || null,
    language: cleanTemplateName ? cleanLanguage : null,
    body: cleanTemplateName ? `[Template] ${cleanTemplateName}` : cleanText,
    payload: outboundPayload,
    createdBy: req.user.id,
  });

  await markOutboundSending(outboundRecord?.id, req.user.tenantId);

  try {
    if (cleanTemplateName) {
      waMessageId = await sendWhatsAppTemplate(contact, cleanTemplateName, cleanLanguage, req.user.tenantId);
      body = `[Template] ${cleanTemplateName}`;
      type = 'template';
    } else {
      waMessageId = await sendWhatsAppText(contact, cleanText, req.user.tenantId);
    }

    await markOutboundSent(outboundRecord?.id, req.user.tenantId, waMessageId);
  } catch (error) {
    await markOutboundFailed(outboundRecord?.id, req.user.tenantId, error);

    return res.status(400).json({
      error: error.response?.data?.error?.message || error.message || 'WhatsApp message failed',
      outboundMessageId: outboundRecord?.id || null,
    });
  }

  const status = waMessageId ? 'sent' : 'queued-local';

  if (!waMessageId && !shouldAllowLocalMessageQueue()) {
    return res.status(400).json({ error: 'WhatsApp message was not sent.' });
  }

  const message = await addMessage({
    tenantId: req.user.tenantId,
    contactId: contact.id,
    waMessageId,
    direction: 'outbound',
    type,
    body,
    status,
    templateName: cleanTemplateName || null,
    normalizedText: body,
  });

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'message.sent',
    entityType: 'message',
    entityId: message?.id,
    metadata: {
      contactId: contact.id,
      status,
      type,
      replyWindowOpen,
      templateId: templateRecord?.id || null,
    },
  });

  res.status(201).json(message);
}));

// =========================================================
// ROUTES — TEMPLATES
// =========================================================

app.get('/api/templates', requireAuth, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT id, name, language, body, active, category, meta_status, last_synced_at, created_at
     FROM whatsapp_templates
     WHERE tenant_id = $1
       AND active = true
       AND ($2::boolean = false OR meta_status = 'approved')
     ORDER BY name, language`,
    [req.user.tenantId, isProduction],
  );

  res.json(result.rows);
}));

app.get('/api/templates/manage', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) {
    return res.status(403).json({ error: 'Manager/Admin only' });
  }

  const result = await query(
    `SELECT id, name, language, body, active, category, meta_status, last_synced_at, created_at
     FROM whatsapp_templates
     WHERE tenant_id = $1
     ORDER BY active DESC, name, language`,
    [req.user.tenantId],
  );

  res.json(result.rows);
}));

app.post('/api/templates', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) {
    return res.status(403).json({ error: 'Manager/Admin only' });
  }

  const cleanName = String(req.body?.name || '').trim().toLowerCase();
  const cleanLanguage = String(req.body?.language || 'en').trim() || 'en';
  const cleanBody = String(req.body?.body || '').trim();
  const active = isProduction ? false : (req.body?.active === undefined ? true : Boolean(req.body.active));

  if (!cleanName || !cleanBody) {
    return res.status(400).json({ error: 'Template name and body required' });
  }

  if (!/^[a-z0-9_]{2,80}$/.test(cleanName)) {
    return res.status(400).json({
      error: 'Template name should match Meta template name format: lowercase letters, numbers, underscore only',
    });
  }

  if (!/^[a-z]{2,3}(?:_[a-z]{2})?$/i.test(cleanLanguage)) {
    return res.status(400).json({ error: 'Invalid language code. Example: en, en_US, hi' });
  }

  if (cleanBody.length > 1000) {
    return res.status(400).json({ error: 'Template body maximum 1000 characters allowed' });
  }

  const result = await query(
    `INSERT INTO whatsapp_templates (tenant_id, name, language, body, active, category, meta_status)
     VALUES ($1, $2, $3, $4, $5, 'manual', 'manual')
     ON CONFLICT (tenant_id, name, language)
     DO UPDATE SET body = EXCLUDED.body,
                   active = EXCLUDED.active,
                   meta_status = COALESCE(NULLIF(whatsapp_templates.meta_status, ''), 'manual')
     RETURNING id, name, language, body, active, category, meta_status, last_synced_at, created_at`,
    [req.user.tenantId, cleanName, cleanLanguage, cleanBody, active],
  );

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'template.saved',
    entityType: 'whatsapp_template',
    entityId: result.rows[0].id,
    metadata: {
      name: cleanName,
      language: cleanLanguage,
      active,
    },
  });

  res.status(201).json(result.rows[0]);
}));

app.post('/api/templates/sync-meta', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) {
    return res.status(403).json({ error: 'Manager/Admin only' });
  }

  const config = await getWhatsAppTemplateSyncConfig(req.user.tenantId);

  if (!config) {
    return res.status(400).json({
      error: 'Meta template sync is not configured. Connect WhatsApp through Embedded Signup or set WHATSAPP_WABA_ID + WHATSAPP_ACCESS_TOKEN for local/demo.',
    });
  }

  const response = await axios.get(
    `https://graph.facebook.com/${config.apiVersion}/${config.wabaId}/message_templates`,
    {
      headers: { Authorization: `Bearer ${config.accessToken}` },
      params: {
        fields: 'name,language,status,category,components',
        limit: 100,
      },
      timeout: 15000,
    },
  );

  const templates = Array.isArray(response.data?.data) ? response.data.data : [];
  const synced = [];

  for (const template of templates) {
    const cleanName = String(template.name || '').trim().toLowerCase();
    const cleanLanguage = String(template.language || 'en').trim() || 'en';

    if (!cleanName || !/^[a-z0-9_]{2,80}$/.test(cleanName)) {
      continue;
    }

    const body = extractMetaTemplateBody(template) || `[${cleanName}]`;
    const metaStatus = normalizeMetaTemplateStatus(template.status);
    const category = normalizeMetaTemplateCategory(template.category);
    const active = metaStatus === 'approved';

    const result = await query(
      `INSERT INTO whatsapp_templates
         (tenant_id, name, language, body, active, category, meta_status, last_synced_at, meta_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8)
       ON CONFLICT (tenant_id, name, language)
       DO UPDATE SET body = EXCLUDED.body,
                     active = EXCLUDED.active,
                     category = EXCLUDED.category,
                     meta_status = EXCLUDED.meta_status,
                     last_synced_at = now(),
                     meta_payload = EXCLUDED.meta_payload
       RETURNING id, name, language, body, active, category, meta_status, last_synced_at, created_at`,
      [
        req.user.tenantId,
        cleanName,
        cleanLanguage,
        body.slice(0, 1000),
        active,
        category,
        metaStatus,
        template,
      ],
    );

    synced.push(result.rows[0]);
  }

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'template.synced_from_meta',
    entityType: 'whatsapp_template',
    metadata: {
      syncedCount: synced.length,
      metaCount: templates.length,
      source: config.source,
    },
  });

  res.json({
    ok: true,
    syncedCount: synced.length,
    metaCount: templates.length,
    templates: synced,
  });
}));

app.patch('/api/templates/:id', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) {
    return res.status(403).json({ error: 'Manager/Admin only' });
  }

  const existingResult = await query(
    `SELECT id, name, language, body, active, meta_status
     FROM whatsapp_templates
     WHERE id = $1
       AND tenant_id = $2
     LIMIT 1`,
    [req.params.id, req.user.tenantId],
  );

  const existing = existingResult.rows[0];

  if (!existing) {
    return res.status(404).json({ error: 'Template not found' });
  }

  const cleanName = req.body?.name === undefined
    ? existing.name
    : String(req.body.name || '').trim().toLowerCase();

  const cleanLanguage = req.body?.language === undefined
    ? existing.language
     : String(req.body.language || 'en').trim() || 'en';

  const cleanBody = req.body?.body === undefined
    ? existing.body
    : String(req.body.body || '').trim();

  const requestedActive = req.body?.active === undefined ? existing.active : Boolean(req.body.active);
  const active = isProduction && existing.meta_status !== 'approved' ? false : requestedActive;

  if (!cleanName || !cleanBody) {
    return res.status(400).json({ error: 'Template name and body required' });
  }

  if (!/^[a-z0-9_]{2,80}$/.test(cleanName)) {
    return res.status(400).json({
      error: 'Template name should match Meta template name format: lowercase letters, numbers, underscore only',
    });
  }

  if (!/^[a-z]{2,3}(?:_[a-z]{2})?$/i.test(cleanLanguage)) {
    return res.status(400).json({ error: 'Invalid language code. Example: en, en_US, hi' });
  }

  if (cleanBody.length > 1000) {
    return res.status(400).json({ error: 'Template body maximum 1000 characters allowed' });
  }

    const duplicateTemplate = await query(
    `SELECT id
     FROM whatsapp_templates
     WHERE tenant_id = $1
       AND name = $2
       AND language = $3
       AND id <> $4
     LIMIT 1`,
    [req.user.tenantId, cleanName, cleanLanguage, req.params.id],
  );

  if (duplicateTemplate.rows[0]) {
    return res.status(409).json({ error: 'Template with this name and language already exists' });
  }

  const result = await query(
    `UPDATE whatsapp_templates
     SET name = $3,
         language = $4,
         body = $5,
         active = $6
     WHERE id = $1
       AND tenant_id = $2
     RETURNING id, name, language, body, active, category, meta_status, last_synced_at, created_at`,
    [req.params.id, req.user.tenantId, cleanName, cleanLanguage, cleanBody, active],
  );

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'template.updated',
    entityType: 'whatsapp_template',
    entityId: result.rows[0].id,
    metadata: {
      name: cleanName,
      language: cleanLanguage,
      active,
    },
  });

  res.json(result.rows[0]);
}));

// =========================================================
// ROUTES — ENQUIRY DRAFTS
// =========================================================

app.get('/api/enquiry-drafts', requireAuth, asyncHandler(async (req, res) => {
  const params = [req.user.tenantId];
  const where = ['e.tenant_id = $1'];
  if (!canMonitor(req.user)) {
    params.push(req.user.id);
    where.push(`c.assigned_to = $${params.length}`);
  }
  const result = await query(
    `SELECT e.*, c.name AS contact_name, c.phone
     FROM enquiry_drafts e
     LEFT JOIN contacts c ON c.id = e.contact_id AND c.tenant_id = e.tenant_id
     WHERE ${where.join(' AND ')}
     ORDER BY e.created_at DESC`,
    params,
  );
  res.json(result.rows);
}));

app.post('/api/enquiry-drafts/:id/create-erp', requireAuth, asyncHandler(async (req, res) => {
  const draft = await getEnquiryDraftById(req.params.id, req.user.tenantId);
  if (!draft) return res.status(404).json({ error: 'Enquiry draft not found' });
  if (!(await canAccessDraft(req.user, draft))) return res.status(403).json({ error: 'Enquiry draft assigned to another user' });
  const result = await query(
    `UPDATE enquiry_drafts SET status = 'erp_created', erp_enquiry_no = COALESCE(erp_enquiry_no, $2), reviewed_by = $3
     WHERE id = $1 AND tenant_id = $4
     RETURNING *`,
    [req.params.id, `ERP-WA-${Date.now()}`, req.user.id, req.user.tenantId],
  );
  res.json(result.rows[0]);
}));

app.post('/api/enquiry-drafts/:id/create-quote', requireAuth, asyncHandler(async (req, res) => {
  const draft = await getEnquiryDraftById(req.params.id, req.user.tenantId);
  if (!draft) return res.status(404).json({ error: 'Enquiry draft not found' });
  if (!(await canAccessDraft(req.user, draft))) return res.status(403).json({ error: 'Enquiry draft assigned to another user' });
  const rate = toFiniteNumber(req.body.rate, 0);
  const item = normalizeSalesItem({ description: [draft.shape, draft.grade, draft.size].filter(Boolean).join(' ') || 'WhatsApp enquiry item', grade: draft.grade, size: draft.size, shape: draft.shape, quantity: draft.quantity, rate });
  const quote = await createQuotation({ tenantId: req.user.tenantId, contactId: draft.contact_id, notes: req.body.notes || `Created from WhatsApp enquiry ${draft.id}`, items: [item], source: 'WhatsApp Auto', validUntil: req.body.valid_until });
  await query('UPDATE enquiry_drafts SET status = $2, reviewed_by = $3 WHERE id = $1 AND tenant_id = $4', [draft.id, 'quoted', req.user.id, req.user.tenantId]);
  await recordAudit({ tenantId: req.user.tenantId, actorUserId: req.user.id, action: 'quotation.created_from_draft', entityType: 'quotation', entityId: quote.id, metadata: { draftId: draft.id, contactId: draft.contact_id } });
  res.status(201).json(quote);
}));

// =========================================================
// ROUTES — PRODUCTS
// =========================================================

function validateProductPayload(product = {}) {
  if (!product.sku || !product.name) {
    return 'SKU and product name required';
  }

  if (Number(product.price || 0) < 0) {
    return 'Product price cannot be negative';
  }

  if (Number(product.stock_qty || 0) < 0) {
    return 'Product stock cannot be negative';
  }

  return '';
}

app.get('/api/products', requireAuth, asyncHandler(async (req, res) => {
  const { q, active } = req.query;
  const params = [req.user.tenantId];
  const where = ['tenant_id = $1'];
  if (q) { params.push(`%${q}%`); where.push(`(sku ILIKE $${params.length} OR name ILIKE $${params.length} OR category ILIKE $${params.length} OR grade ILIKE $${params.length} OR size ILIKE $${params.length} OR shape ILIKE $${params.length})`); }
  if (active === 'true' || active === 'false') { params.push(active === 'true'); where.push(`active = $${params.length}`); }
  const result = await query(`SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY active DESC, created_at DESC LIMIT 500`, params);
  res.json(result.rows);
}));

app.post('/api/products', requireAuth, rateLimit({
  bucketName: 'product-create',
  maxRequests: 120,
  windowMs: 60 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });
  const product = normalizeProduct(req.body);
  const productError = validateProductPayload(product);

  if (productError) {
    return res.status(400).json({ error: productError });
  }

  const existing = await query('SELECT id FROM products WHERE tenant_id = $1 AND lower(sku) = lower($2) LIMIT 1', [req.user.tenantId, product.sku]);
  if (existing.rows[0]) return res.status(409).json({ error: 'Product SKU already exists' });
  const result = await query(
    'INSERT INTO products (tenant_id, sku, name, category, grade, size, shape, unit, price, stock_qty, active, custom_fields) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',
    [req.user.tenantId, product.sku, product.name, product.category, product.grade, product.size, product.shape, product.unit, product.price, product.stock_qty, product.active, product.custom_fields],
  );
  await recordAudit({ tenantId: req.user.tenantId, actorUserId: req.user.id, action: 'product.created', entityType: 'product', entityId: result.rows[0].id, metadata: { sku: product.sku } });
  res.status(201).json(result.rows[0]);
}));

app.patch('/api/products/:id', requireAuth, rateLimit({
  bucketName: 'product-update',
  maxRequests: 180,
  windowMs: 60 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });
  const product = normalizeProduct(req.body);
  const productError = validateProductPayload(product);

  if (productError) {
    return res.status(400).json({ error: productError });
  }
  
    const duplicate = await query(
    `SELECT id
     FROM products
     WHERE tenant_id = $1
       AND lower(sku) = lower($2)
       AND id <> $3
     LIMIT 1`,
    [req.user.tenantId, product.sku, req.params.id],
  );

  if (duplicate.rows[0]) {
    return res.status(409).json({ error: 'Product SKU already exists' });
  }

  const result = await query(
    'UPDATE products SET sku=$3, name=$4, category=$5, grade=$6, size=$7, shape=$8, unit=$9, price=$10, stock_qty=$11, active=$12, custom_fields=$13 WHERE id=$1 AND tenant_id=$2 RETURNING *',
    [req.params.id, req.user.tenantId, product.sku, product.name, product.category, product.grade, product.size, product.shape, product.unit, product.price, product.stock_qty, product.active, product.custom_fields],
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Product not found' });
  await recordAudit({ tenantId: req.user.tenantId, actorUserId: req.user.id, action: 'product.updated', entityType: 'product', entityId: result.rows[0].id, metadata: { sku: product.sku } });
  res.json(result.rows[0]);
}));

app.post('/api/products/import', requireAuth, rateLimit({
  bucketName: 'product-import',
  maxRequests: 10,
  windowMs: 60 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });
  const rows = Array.isArray(req.body.rows) ? req.body.rows : [];

  if (!rows.length) {
    return res.status(400).json({ error: 'CSV rows required' });
  }

  if (rows.length > 1000) {
    return res.status(400).json({ error: 'Maximum 1000 products can be imported at once' });
  }
  let inserted = 0;
  let updated = 0;
  const skipped = [];
  for (const [index, row] of rows.entries()) {
    const product = productFromImportRow(row);
    const productError = validateProductPayload(product);

    if (productError) {
      skipped.push({ row: index + 1, reason: productError });
      continue;
    }

    const result = await query(
      `INSERT INTO products (tenant_id, sku, name, category, grade, size, shape, unit, price, stock_qty, active, custom_fields)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (tenant_id, sku)
       DO UPDATE SET name=EXCLUDED.name, category=EXCLUDED.category, grade=EXCLUDED.grade, size=EXCLUDED.size,
                     shape=EXCLUDED.shape, unit=EXCLUDED.unit, price=EXCLUDED.price, stock_qty=EXCLUDED.stock_qty,
                     active=EXCLUDED.active, custom_fields=EXCLUDED.custom_fields
       RETURNING (xmax = 0) AS inserted`,
      [req.user.tenantId, product.sku, product.name, product.category, product.grade, product.size, product.shape, product.unit, product.price, product.stock_qty, product.active, product.custom_fields],
    );
    if (result.rows[0]?.inserted) inserted += 1;
    else updated += 1;
  }
  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'product.imported',
    entityType: 'product',
    entityId: null,
    metadata: {
      inserted,
      updated,
      skippedCount: skipped.length,
      totalRows: rows.length,
      skippedSample: skipped.slice(0, 20),
    },
  });

  res.json({ inserted, updated, skipped });
}));

app.delete('/api/products/:id', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });
  const linked = await query(
    `SELECT
       EXISTS (
         SELECT 1 FROM quotation_items
         WHERE tenant_id = $1 AND product_id = $2
       ) AS used_in_quotation,
       EXISTS (
         SELECT 1 FROM sales_order_items
         WHERE tenant_id = $1 AND product_id = $2
       ) AS used_in_order`,
    [req.user.tenantId, req.params.id],
  );

  if (linked.rows[0]?.used_in_quotation || linked.rows[0]?.used_in_order) {
    return res.status(409).json({
      error: 'Product is used in quotation/order history. Deactivate it instead of deleting.',
    });
  }

  const result = await query(
    'DELETE FROM products WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [req.params.id, req.user.tenantId],
  );
  if (!result.rows[0]) return res.status(404).json({ error: 'Product not found' });
  await recordAudit({ tenantId: req.user.tenantId, actorUserId: req.user.id, action: 'product.deleted', entityType: 'product', entityId: result.rows[0].id, metadata: {} });
  res.json({ ok: true });
}));

// =========================================================
// ROUTES — QUOTATIONS
// =========================================================
}

module.exports = {
  registerCrmRoutes,
};
