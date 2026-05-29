function registerWhatsAppRoutes(app, ctx) {
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

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!hasRealValue(verifyToken)) {
    return res.sendStatus(403);
  }

  if (mode === 'subscribe' && token === verifyToken) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

function stableJsonStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJsonStringify(item)).join(',')}]`;
  }

  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${stableJsonStringify(value[key])}`
  )).join(',')}}`;
}

function createPayloadHash(payload = {}) {
  return crypto
    .createHash('sha256')
    .update(stableJsonStringify(payload))
    .digest('hex');
}

function getWebhookPayloadSummary(payload = {}) {
  let phoneNumberId = null;
  let displayPhoneNumber = null;
  let messagesCount = 0;
  let statusesCount = 0;
  let contactsCount = 0;

  for (const entry of payload?.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};

      phoneNumberId = phoneNumberId || value?.metadata?.phone_number_id || null;
      displayPhoneNumber = displayPhoneNumber || value?.metadata?.display_phone_number || null;
      messagesCount += value?.messages?.length || 0;
      statusesCount += value?.statuses?.length || 0;
      contactsCount += value?.contacts?.length || 0;
    }
  }

  return {
    phoneNumberId,
    displayPhoneNumber,
    messagesCount,
    statusesCount,
    contactsCount,
  };
}

async function createWebhookEvent(payload = {}) {
  const summary = getWebhookPayloadSummary(payload);
  let tenantId = null;

  for (const entry of payload?.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const mappedTenantId = await getTenantIdForWebhookValue(value);

      if (mappedTenantId) {
        tenantId = mappedTenantId;
        break;
      }
    }

    if (tenantId) break;
  }

  const eventHash = createPayloadHash(payload);

  const result = await query(
    `INSERT INTO webhook_events
       (tenant_id, provider, phone_number_id, event_type, status, payload, event_hash)
     VALUES ($1, 'meta_whatsapp', $2, $3, 'received', $4, $5)
     ON CONFLICT (provider, event_hash) WHERE event_hash IS NOT NULL
     DO UPDATE SET received_at = webhook_events.received_at
     RETURNING id, tenant_id, status, received_at`,
    [
      tenantId,
      summary.phoneNumberId,
      summary.messagesCount > 0 ? 'message' : summary.statusesCount > 0 ? 'status' : 'webhook',
      payload,
      eventHash,
    ],
  );

  return result.rows[0];
}

async function markWebhookEventProcessing(eventId, tenantId) {
  if (!eventId) return;

  await query(
    `UPDATE webhook_events
     SET status = 'processing',
         attempts = attempts + 1,
         processing_started_at = now(),
         last_error = NULL
     WHERE id = $1
       AND tenant_id IS NOT DISTINCT FROM $2`,
    [eventId, tenantId || null],
  );
}

async function markWebhookEventProcessed(eventId, tenantId) {
  if (!eventId) return;

  await query(
    `UPDATE webhook_events
     SET status = 'processed',
         processed_at = now(),
         last_error = NULL
     WHERE id = $1
       AND tenant_id IS NOT DISTINCT FROM $2`,
    [eventId, tenantId || null],
  );
}

async function markWebhookEventFailed(eventId, tenantId, error) {
  if (!eventId) return;

  await query(
    `UPDATE webhook_events
     SET status = 'failed',
         last_error = $3
     WHERE id = $1
       AND tenant_id IS NOT DISTINCT FROM $2`,
    [
      eventId,
      tenantId || null,
      String(error?.message || error || 'Webhook processing failed').slice(0, 2000),
    ],
  );
}

async function processWhatsAppWebhookPayload(payload) {
  const entries = payload?.entry || [];

  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value || {};

      console.log('WA webhook change value:', {
        phoneNumberId: value?.metadata?.phone_number_id || null,
        displayPhoneNumber: value?.metadata?.display_phone_number || null,
        contactsCount: value?.contacts?.length || 0,
        messagesCount: value?.messages?.length || 0,
        statusesCount: value?.statuses?.length || 0,
      });

      const tenantId = await getTenantIdForWebhookValue(value);

      console.log('WA webhook tenant mapping:', {
        phoneNumberId: value?.metadata?.phone_number_id || null,
        tenantId,
      });

      if (!tenantId) {
        console.warn('Webhook ignored: no active tenant mapped for phone_number_id', {
          phoneNumberId: value?.metadata?.phone_number_id || null,
        });
        continue;
      }

      const contacts = value.contacts || [];
      const messages = value.messages || [];
      const statuses = value.statuses || [];

      for (const status of statuses) {
        await updateMessageStatus({
          tenantId,
          waMessageId: status.id,
          status: status.status,
          rawPayload: status,
        });
      }

      for (const message of messages) {
        const body = extractText(message);
        const profile = contacts.find((item) => item.wa_id === message.from);

        await processInboundMessage({
          tenantId,
          waId: message.from,
          name: profile?.profile?.name,
          body,
          waMessageId: message.id,
          rawPayload: message,
        });
      }
    }
  }
}

app.post('/webhook', rateLimit({
  bucketName: 'meta-webhook',
  maxRequests: 3000,
  windowMs: 5 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  console.log('WA webhook received:', {
    object: req.body?.object || null,
    entries: req.body?.entry?.length || 0,
    hasSignature: Boolean(req.headers['x-hub-signature-256']),
  });

  if (!verifyMetaWebhookSignature(req)) {
    console.warn('WA webhook rejected: invalid signature');
    return res.status(403).json({ error: 'Invalid webhook signature' });
  }

  const payload = req.body;
  const webhookEvent = await createWebhookEvent(payload);

  res.sendStatus(200);

  setImmediate(async () => {
    try {
      await markWebhookEventProcessing(webhookEvent.id, webhookEvent.tenant_id);

      await processWhatsAppWebhookPayload(payload);

      await markWebhookEventProcessed(webhookEvent.id, webhookEvent.tenant_id);
    } catch (error) {
console.error('WA webhook async processing failed:', {
  webhookEventId: webhookEvent?.id || null,
  ...safeErrorLog(error),
});

      await markWebhookEventFailed(webhookEvent.id, webhookEvent.tenant_id, error);
    }
  });
}));

app.post('/api/local/inbound-message', requireAuth, asyncHandler(async (req, res) => {
  if (isProduction) {
    return res.status(403).json({ error: 'Local inbound simulator is disabled in production' });
  }

  if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });
  const cleanPhone = String(req.body.phone || '').replace(/\D/g, '');
  const body = String(req.body.message || '').trim();
  if (cleanPhone.length < 11 || !body) {
    return res.status(400).json({ error: 'Phone country code ke saath aur message required hai.' });
  }
  const result = await processInboundMessage({
    tenantId: req.user.tenantId,
    waId: cleanPhone,
    name: req.body.name || cleanPhone,
    body,
    waMessageId: `local.${Date.now()}.${Math.random().toString(16).slice(2)}`,
    rawPayload: { localSimulator: true, createdBy: req.user.id },
  });
  await recordAudit({ tenantId: req.user.tenantId, actorUserId: req.user.id, action: 'message.local_inbound_captured', entityType: 'contact', entityId: result.contact.id, metadata: { phone: cleanPhone } });
  res.status(201).json(result);
}));

app.post('/api/whatsapp/test-message', rateLimit({
  bucketName: 'whatsapp-test-message',
  maxRequests: 20,
  windowMs: 60 * 60 * 1000,
}), requireAuth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const { to, text } = req.body;
  const cleanTo = String(to || '').replace(/\D/g, '');
  const cleanText = String(text || '').trim();

  if (!cleanTo || !cleanText) {
    return res.status(400).json({ error: 'To number and text are required' });
  }

  if (cleanTo.length < 11 || cleanTo.length > 15) {
    return res.status(400).json({
      error: 'Number country code ke saath hona chahiye. India ke liye format: 91XXXXXXXXXX',
    });
  }

  if (cleanText.length > 500) {
    return res.status(400).json({ error: 'Test message maximum 500 characters ka ho sakta hai.' });
  }

  const allowedTestNumbers = String(process.env.WHATSAPP_TEST_NUMBERS || '')
    .split(',')
    .map((item) => item.replace(/\D/g, ''))
    .filter(Boolean);

  if (!allowedTestNumbers.includes(cleanTo)) {
    return res.status(403).json({
      error: 'This number is not allowed for WhatsApp test messages. Add it in WHATSAPP_TEST_NUMBERS env.',
    });
  }

  if (!isWhatsAppConfigured()) {
    return res.status(400).json({
      error: 'Real WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID .env me set karo, phir backend restart karo.',
    });
  }

  const contact = await upsertContact({
    tenantId: req.user.tenantId,
    waId: cleanTo,
    name: cleanTo,
    phone: cleanTo,
    label: 'Review Required',
    touchInbound: false,
  });

  if (contact.opted_out) {
    return res.status(403).json({
      error: 'Customer has opted out. Do not send WhatsApp messages to this contact.',
    });
  }

  if (!isReplyWindowOpen(contact)) {
    return res.status(400).json({
      error: '24-hour reply window expired. Free-form test message is not allowed. Ask customer to message first or use an approved WhatsApp template.',
    });
  }

  const config = await getWhatsAppSendConfig(req.user.tenantId);

  if (!config) {
    return res.status(400).json({
      error: 'WhatsApp is not configured. Message was not sent.',
    });
  }

  const response = await postWhatsAppMessage(
    config,
    {
      messaging_product: 'whatsapp',
      to: cleanTo,
      type: 'text',
      text: { body: cleanText },
    },
    { tenantId: req.user.tenantId, type: 'test_text' },
  );

  const messageId = response.data?.messages?.[0]?.id || null;

  const message = await addMessage({
    tenantId: req.user.tenantId,
    contactId: contact.id,
    waMessageId: messageId,
    direction: 'outbound',
    type: 'text',
    body: cleanText,
    status: messageId ? 'sent' : 'accepted',
    rawPayload: response.data,
  });

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'whatsapp.test_message_sent',
    entityType: 'message',
    entityId: message?.id,
    metadata: {
      to: cleanTo,
      messageId,
      contactId: contact.id,
    },
  });

  res.json({
    ok: true,
    to: cleanTo,
    contactId: contact.id,
    savedMessageId: message?.id || null,
    messageId,
  });
}));

// =========================================================
// ROUTES — USERS
// =========================================================

app.get('/api/users', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });
  const result = await query(
    'SELECT id, tenant_id, name, email, role, active FROM users WHERE tenant_id = $1 ORDER BY role, name',
    [req.user.tenantId],
  );
  res.json(result.rows.map(publicUser));
}));

app.post('/api/users', requireAuth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const cleanName = String(req.body?.name || '').trim();
  const cleanEmail = String(req.body?.email || '').trim().toLowerCase();
  const cleanRole = String(req.body?.role || '').trim().toLowerCase();
  const cleanPassword = String(req.body?.password || '');

  if (!cleanName || !cleanEmail || !cleanRole || !cleanPassword) {
    return res.status(400).json({ error: 'Name, email, role, password required' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  if (!['admin', 'manager', 'sales'].includes(cleanRole)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  if (!isStrongPassword(cleanPassword)) {
    return res.status(400).json({ error: strongPasswordError() });
  }

  const existingUser = await query(
    `SELECT id, tenant_id
     FROM users
     WHERE lower(email) = $1
     LIMIT 1`,
    [cleanEmail],
  );

  if (existingUser.rows[0]) {
    return res.status(409).json({ error: 'User with this email already exists' });
  }

  const hash = await bcrypt.hash(cleanPassword, 10);

  const result = await query(
    `INSERT INTO users (tenant_id, name, email, password_hash, role, active)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING id, tenant_id, name, email, role, active`,
    [req.user.tenantId, cleanName, cleanEmail, hash, cleanRole],
  );

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'user.created',
    entityType: 'user',
    entityId: result.rows[0].id,
    metadata: {
      email: cleanEmail,
      role: cleanRole,
    },
  });

  res.status(201).json(publicUser(result.rows[0]));
}));

app.patch('/api/users/:id', requireAuth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const { name, role, active, password } = req.body;

  if (role !== undefined && !['admin', 'manager', 'sales'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  if (password !== undefined && String(password || '') && !isStrongPassword(password)) {
    return res.status(400).json({ error: strongPasswordError() });
  }

  const existingResult = await query(
    `SELECT id, role, active
     FROM users
     WHERE id = $1
       AND tenant_id = $2
     LIMIT 1`,
    [req.params.id, req.user.tenantId],
  );

  const existingUser = existingResult.rows[0];

  if (!existingUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (req.params.id === req.user.id && active === false) {
    return res.status(400).json({ error: 'You cannot deactivate your own logged-in admin user' });
  }

  if (req.params.id === req.user.id && role !== undefined && role !== 'admin') {
    return res.status(400).json({ error: 'You cannot remove admin role from your own logged-in user' });
  }

  const nextRole = role !== undefined ? role : existingUser.role;
  const nextActive = active !== undefined ? active : existingUser.active;

  if (
    existingUser.role === 'admin'
    && existingUser.active === true
    && (nextRole !== 'admin' || nextActive === false)
  ) {
    const remainingAdmins = await countActiveTenantAdmins(req.user.tenantId, existingUser.id);

    if (remainingAdmins < 1) {
      return res.status(400).json({ error: 'At least one active admin is required for this company' });
    }
  }

  const passwordHash = password ? await bcrypt.hash(password, 10) : null;

  const result = await query(
    `UPDATE users
     SET name = COALESCE($3, name),
         role = COALESCE($4, role),
         active = COALESCE($5, active),
         password_hash = COALESCE($6, password_hash)
     WHERE id = $1
       AND tenant_id = $2
     RETURNING id, tenant_id, name, email, role, active`,
    [req.params.id, req.user.tenantId, name, role, active, passwordHash],
  );

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'user.updated',
    entityType: 'user',
    entityId: result.rows[0].id,
    metadata: {
      role: result.rows[0].role,
      active: result.rows[0].active,
    },
  });

  res.json(publicUser(result.rows[0]));
}));

app.delete('/api/users/:id', requireAuth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own logged-in user' });
  }

  const existingResult = await query(
    `SELECT id, role, active
     FROM users
     WHERE id = $1
       AND tenant_id = $2
     LIMIT 1`,
    [req.params.id, req.user.tenantId],
  );

  const existingUser = existingResult.rows[0];

  if (!existingUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (existingUser.role === 'admin' && existingUser.active === true) {
    const remainingAdmins = await countActiveTenantAdmins(req.user.tenantId, existingUser.id);

    if (remainingAdmins < 1) {
      return res.status(400).json({ error: 'At least one active admin is required for this company' });
    }
  }

  const result = await query(
    `UPDATE users
     SET active = false
     WHERE id = $1
       AND tenant_id = $2
     RETURNING id, tenant_id, name, email, role, active`,
    [req.params.id, req.user.tenantId],
  );

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'user.deleted',
    entityType: 'user',
    entityId: result.rows[0].id,
    metadata: {
      email: result.rows[0].email,
      role: result.rows[0].role,
    },
  });
     res.json({ ok: true, deleted: publicUser(result.rows[0]) });
}));

// =========================================================
// ROUTES — AUDIT
// =========================================================

app.get('/api/audit-events', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });
  const result = await query(
    `SELECT ae.*, u.name AS actor_name
     FROM audit_events ae
     LEFT JOIN users u ON u.id = ae.actor_user_id
     WHERE ae.tenant_id = $1
     ORDER BY ae.created_at DESC
     LIMIT 100`,
    [req.user.tenantId],
  );
  res.json(result.rows);
}));

app.get('/api/webhook-events/failed', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) {
    return res.status(403).json({ error: 'Manager/Admin only' });
  }

  const result = await query(
    `SELECT
       id,
       tenant_id,
       provider,
       phone_number_id,
       event_type,
       status,
       attempts,
       last_error,
       received_at,
       processing_started_at,
       processed_at
     FROM webhook_events
     WHERE tenant_id = $1
       AND status = 'failed'
     ORDER BY received_at DESC
     LIMIT 100`,
    [req.user.tenantId],
  );

  res.json(result.rows);
}));

app.post('/api/webhook-events/cleanup', requireAuth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const retentionDays = Math.min(
    Math.max(Number(req.body?.retentionDays || process.env.WEBHOOK_EVENT_RETENTION_DAYS || 30), 7),
    180,
  );

  const result = await query(
    `DELETE FROM webhook_events
     WHERE tenant_id = $1
       AND status = 'processed'
       AND received_at < now() - ($2::int * interval '1 day')
     RETURNING id`,
    [req.user.tenantId, retentionDays],
  );

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'webhook_events.cleanup',
    entityType: 'webhook_event',
    entityId: null,
    metadata: {
      retentionDays,
      deletedCount: result.rowCount,
    },
  });

  res.json({
    ok: true,
    retentionDays,
    deletedCount: result.rowCount,
  });
}));

app.post('/api/webhook-events/recover-stuck', requireAuth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const stuckMinutes = Math.min(
    Math.max(Number(req.body?.stuckMinutes || process.env.WEBHOOK_STUCK_MINUTES || 10), 5),
    120,
  );

  const result = await query(
    `UPDATE webhook_events
     SET status = 'failed',
         last_error = COALESCE(last_error, 'Recovered from stuck processing state')
     WHERE tenant_id = $1
       AND status = 'processing'
       AND processing_started_at < now() - ($2::int * interval '1 minute')
     RETURNING id`,
    [req.user.tenantId, stuckMinutes],
  );

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'webhook_events.recover_stuck',
    entityType: 'webhook_event',
    entityId: null,
    metadata: {
      stuckMinutes,
      recoveredCount: result.rowCount,
    },
  });

  res.json({
    ok: true,
    stuckMinutes,
    recoveredCount: result.rowCount,
  });
}));

app.post('/api/system/maintenance', requireAuth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const webhookRetentionDays = Math.min(
    Math.max(Number(req.body?.webhookRetentionDays || process.env.WEBHOOK_EVENT_RETENTION_DAYS || 30), 7),
    180,
  );

  const outboundRetentionDays = Math.min(
    Math.max(Number(req.body?.outboundRetentionDays || process.env.OUTBOUND_MESSAGE_RETENTION_DAYS || 60), 14),
    365,
  );

  const stuckMinutes = Math.min(
    Math.max(Number(req.body?.stuckMinutes || process.env.WEBHOOK_STUCK_MINUTES || 10), 5),
    120,
  );

  const [deletedWebhookEvents, deletedOutboundMessages, recoveredStuckWebhooks] = await Promise.all([
    query(
      `DELETE FROM webhook_events
       WHERE tenant_id = $1
         AND status = 'processed'
         AND received_at < now() - ($2::int * interval '1 day')
       RETURNING id`,
      [req.user.tenantId, webhookRetentionDays],
    ),
    query(
      `DELETE FROM outbound_messages
       WHERE tenant_id = $1
         AND status = 'sent'
         AND created_at < now() - ($2::int * interval '1 day')
       RETURNING id`,
      [req.user.tenantId, outboundRetentionDays],
    ),
    query(
      `UPDATE webhook_events
       SET status = 'failed',
           last_error = COALESCE(last_error, 'Recovered from stuck processing state by maintenance')
       WHERE tenant_id = $1
         AND status = 'processing'
         AND processing_started_at < now() - ($2::int * interval '1 minute')
       RETURNING id`,
      [req.user.tenantId, stuckMinutes],
    ),
  ]);

  const result = {
    webhookRetentionDays,
    outboundRetentionDays,
    stuckMinutes,
    deletedWebhookEvents: deletedWebhookEvents.rowCount,
    deletedOutboundMessages: deletedOutboundMessages.rowCount,
    recoveredStuckWebhooks: recoveredStuckWebhooks.rowCount,
  };

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'system.maintenance_run',
    entityType: 'system',
    entityId: null,
    metadata: result,
  });

  res.json({
    ok: true,
    ...result,
  });
}));

app.post('/api/webhook-events/:id/retry', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) {
    return res.status(403).json({ error: 'Manager/Admin only' });
  }

  const eventResult = await query(
    `SELECT id, tenant_id, status, payload, attempts
     FROM webhook_events
     WHERE id = $1
       AND tenant_id = $2
     LIMIT 1`,
    [req.params.id, req.user.tenantId],
  );

  const event = eventResult.rows[0];

  if (!event) {
    return res.status(404).json({ error: 'Webhook event not found' });
  }

  if (event.status !== 'failed') {
    return res.status(400).json({
      error: `Only failed webhook events can be retried. Current status: ${event.status}`,
    });
  }

  const maxRetryAttempts = Number(process.env.WEBHOOK_EVENT_MAX_RETRY_ATTEMPTS || 5);

  if (Number(event.attempts || 0) >= maxRetryAttempts) {
    await recordAudit({
      tenantId: req.user.tenantId,
      actorUserId: req.user.id,
      action: 'webhook_event.retry_blocked',
      entityType: 'webhook_event',
      entityId: event.id,
      metadata: {
        attempts: event.attempts,
        maxRetryAttempts,
      },
    });

    return res.status(429).json({
      error: `Retry limit reached for this webhook event. Attempts: ${event.attempts}/${maxRetryAttempts}`,
    });
  }

  const eventTenantId = event.tenant_id;

  await markWebhookEventProcessing(event.id, eventTenantId);

  try {
    await processWhatsAppWebhookPayload(event.payload);
    await markWebhookEventProcessed(event.id, eventTenantId);

    await recordAudit({
      tenantId: req.user.tenantId,
      actorUserId: req.user.id,
      action: 'webhook_event.retried',
      entityType: 'webhook_event',
      entityId: event.id,
      metadata: {
        previousAttempts: event.attempts,
        result: 'processed',
        eventTenantId,
      },
    });

    return res.json({
      ok: true,
      id: event.id,
      status: 'processed',
      message: 'Webhook event retried successfully.',
    });
  } catch (error) {
    await markWebhookEventFailed(event.id, eventTenantId, error);

    await recordAudit({
      tenantId: req.user.tenantId,
      actorUserId: req.user.id,
      action: 'webhook_event.retry_failed',
      entityType: 'webhook_event',
      entityId: event.id,
      metadata: {
        previousAttempts: event.attempts,
        result: 'failed',
        eventTenantId,
        error: String(error.message || error).slice(0, 500),
      },
    });

    return res.status(500).json({
      ok: false,
      id: event.id,
      status: 'failed',
      error: 'Webhook retry failed. Check failed webhook events for last_error.',
    });
  }
}));

app.get('/api/outbound-messages/failed', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) {
    return res.status(403).json({ error: 'Manager/Admin only' });
  }

  const result = await query(
    `SELECT
       id,
       tenant_id,
       contact_id,
       wa_message_id,
       to_phone,
       message_type,
       template_name,
       language,
       body,
       status,
       attempts,
       last_error,
       sent_at,
       created_at,
       updated_at
     FROM outbound_messages
     WHERE tenant_id = $1
       AND status = 'failed'
     ORDER BY updated_at DESC
     LIMIT 100`,
    [req.user.tenantId],
  );

  res.json(result.rows);
}));

app.post('/api/outbound-messages/:id/retry', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) {
    return res.status(403).json({ error: 'Manager/Admin only' });
  }

  const result = await query(
    `SELECT *
     FROM outbound_messages
     WHERE id = $1
       AND tenant_id = $2
     LIMIT 1`,
    [req.params.id, req.user.tenantId],
  );

  const outbound = result.rows[0];

  if (!outbound) {
    return res.status(404).json({ error: 'Outbound message not found' });
  }

  if (outbound.status !== 'failed') {
    return res.status(400).json({
      error: `Only failed outbound messages can be retried. Current status: ${outbound.status}`,
    });
  }

  const maxAttempts = Number(process.env.OUTBOUND_MESSAGE_MAX_RETRY_ATTEMPTS || 5);

  if (Number(outbound.attempts || 0) >= maxAttempts) {
    return res.status(429).json({
      error: `Retry limit reached. Attempts: ${outbound.attempts}/${maxAttempts}`,
    });
  }

  let contact = null;

  if (outbound.contact_id) {
    contact = await findContact(outbound.contact_id, req.user.tenantId);
  }

  if (!contact) {
    const contactResult = await query(
      `SELECT *
       FROM contacts
       WHERE tenant_id = $1
         AND wa_id = $2
       LIMIT 1`,
      [req.user.tenantId, outbound.to_phone],
    );

    contact = contactResult.rows[0] || null;
  }

  if (!contact) {
    return res.status(404).json({ error: 'Contact not found for outbound retry' });
  }

  if (contact.opted_out) {
    return res.status(403).json({
      error: 'Customer has opted out. Do not retry WhatsApp message to this contact.',
    });
  }

  if (!['text', 'template'].includes(outbound.message_type)) {
    return res.status(400).json({
      error: `Retry is not supported for outbound message type: ${outbound.message_type}`,
    });
  }

  if (outbound.message_type === 'text' && String(outbound.body || '').length > MAX_WHATSAPP_TEXT_LENGTH) {
    return res.status(400).json({
      error: `WhatsApp text message is too long. Maximum ${MAX_WHATSAPP_TEXT_LENGTH} characters allowed.`,
    });
  }

  if (outbound.message_type === 'text' && !isReplyWindowOpen(contact)) {
    return res.status(400).json({
      error: '24-hour reply window expired. Text retry is not allowed. Use approved template.',
    });
  }
  if (outbound.message_type === 'template') {
    await validateTemplateRetryAllowed(
      req.user.tenantId,
      outbound.template_name,
      outbound.language || 'en',
    );
  }

  await markOutboundSending(outbound.id, req.user.tenantId);

  try {
    let waMessageId = null;

    if (outbound.message_type === 'template') {
      waMessageId = await sendWhatsAppTemplate(
        contact,
        outbound.template_name,
        outbound.language || 'en',
        req.user.tenantId,
      );
    } else {
      waMessageId = await sendWhatsAppText(
        contact,
        outbound.body,
        req.user.tenantId,
      );
    }

    await markOutboundSent(outbound.id, req.user.tenantId, waMessageId);

    const message = await addMessage({
      tenantId: req.user.tenantId,
      contactId: contact.id,
      waMessageId,
      direction: 'outbound',
      type: outbound.message_type === 'template' ? 'template' : 'text',
      body: outbound.body,
      status: waMessageId ? 'sent' : 'accepted',
      templateName: outbound.template_name || null,
      rawPayload: {
        retriedOutboundMessageId: outbound.id,
      },
      normalizedText: outbound.body,
    });

    await recordAudit({
      tenantId: req.user.tenantId,
      actorUserId: req.user.id,
      action: 'outbound_message.retried',
      entityType: 'outbound_message',
      entityId: outbound.id,
      metadata: {
        contactId: contact.id,
        messageRowId: message?.id || null,
        waMessageId,
      },
    });

    return res.json({
      ok: true,
      id: outbound.id,
      status: 'sent',
      waMessageId,
      message,
    });
  } catch (error) {
    await markOutboundFailed(outbound.id, req.user.tenantId, error);

    await recordAudit({
      tenantId: req.user.tenantId,
      actorUserId: req.user.id,
      action: 'outbound_message.retry_failed',
      entityType: 'outbound_message',
      entityId: outbound.id,
      metadata: {
        error: String(error.response?.data?.error?.message || error.message || error).slice(0, 500),
      },
    });

    return res.status(500).json({
      ok: false,
      error: error.response?.data?.error?.message || error.message || 'Outbound retry failed',
    });
  }
}));

app.get('/api/system/message-health', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) {
    return res.status(403).json({ error: 'Manager/Admin only' });
  }

  const [
    webhookStatus,
    outboundStatus,
    messageStatus,
  ] = await Promise.all([
    query(
      `SELECT status, COUNT(*)::int AS count
       FROM webhook_events
       WHERE tenant_id = $1
         AND received_at >= now() - interval '7 days'
       GROUP BY status
       ORDER BY status`,
      [req.user.tenantId],
    ),
    query(
      `SELECT status, COUNT(*)::int AS count
       FROM outbound_messages
       WHERE tenant_id = $1
         AND created_at >= now() - interval '7 days'
       GROUP BY status
       ORDER BY status`,
      [req.user.tenantId],
    ),
    query(
      `SELECT direction, status, COUNT(*)::int AS count
       FROM messages
       WHERE tenant_id = $1
         AND created_at >= now() - interval '7 days'
       GROUP BY direction, status
       ORDER BY direction, status`,
      [req.user.tenantId],
    ),
  ]);

  res.json({
    webhookEvents: webhookStatus.rows,
    outboundMessages: outboundStatus.rows,
    messages: messageStatus.rows,
    window: '7 days',
    timestamp: new Date().toISOString(),
  });
}));

app.get('/api/system/status', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) {
    return res.status(403).json({ error: 'Manager/Admin only' });
  }

  const db = await healthCheck();
  const accountStatus = await getEnvWhatsAppAccountStatus(req.user.tenantId);
  const warnings = validateRuntimeConfig();

  const [webhookCounts, outboundCounts, recentFailures] = await Promise.all([
    query(
      `SELECT status, COUNT(*)::int AS count
       FROM webhook_events
       WHERE tenant_id = $1
         AND received_at >= now() - interval '24 hours'
       GROUP BY status`,
      [req.user.tenantId],
    ),
    query(
      `SELECT status, COUNT(*)::int AS count
       FROM outbound_messages
       WHERE tenant_id = $1
         AND created_at >= now() - interval '24 hours'
       GROUP BY status`,
      [req.user.tenantId],
    ),
    query(
      `SELECT
         'webhook' AS source,
         id::text AS id,
         last_error,
         received_at AS at
       FROM webhook_events
       WHERE tenant_id = $1
         AND status = 'failed'
       UNION ALL
       SELECT
         'outbound' AS source,
         id::text AS id,
         last_error,
         updated_at AS at
       FROM outbound_messages
       WHERE tenant_id = $1
         AND status = 'failed'
       ORDER BY at DESC
       LIMIT 10`,
      [req.user.tenantId],
    ),
  ]);

  res.json({
    ok: db.ok,
    database: db,
    whatsapp: {
      configured: isWhatsAppConfigured(),
      phoneNumberMapped: accountStatus.phoneNumberMapped,
      phoneNumberMappedToCurrentTenant: accountStatus.phoneNumberMappedToCurrentTenant,
      phoneNumberMappedTenantSlug: accountStatus.phoneNumberMappedTenantSlug,
      webhookVerifyTokenSet: hasRealValue(process.env.WHATSAPP_VERIFY_TOKEN),
      webhookAppSecretSet: hasRealValue(process.env.WHATSAPP_APP_SECRET),
    },
    counts24h: {
      webhookEvents: webhookCounts.rows,
      outboundMessages: outboundCounts.rows,
    },
    recentFailures: recentFailures.rows,
    warnings,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}));

app.post('/api/outbound-messages/retry-failed', rateLimit({
  bucketName: 'outbound-retry-failed',
  maxRequests: 20,
  windowMs: 60 * 60 * 1000,
}), requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) {
    return res.status(403).json({ error: 'Manager/Admin only' });
  }

  const limit = Math.min(Math.max(Number(req.body?.limit || 10), 1), 50);
  const maxAttempts = Number(process.env.OUTBOUND_MESSAGE_MAX_RETRY_ATTEMPTS || 5);

  const failedResult = await query(
    `SELECT *
     FROM outbound_messages
     WHERE tenant_id = $1
       AND status = 'failed'
       AND attempts < $2
     ORDER BY updated_at ASC
     LIMIT $3`,
    [req.user.tenantId, maxAttempts, limit],
  );

  const summary = {
    picked: failedResult.rows.length,
    retried: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  for (const outbound of failedResult.rows) {
    try {
      let contact = null;

      if (outbound.contact_id) {
        contact = await findContact(outbound.contact_id, req.user.tenantId);
      }

      if (!contact) {
        const contactResult = await query(
          `SELECT *
           FROM contacts
           WHERE tenant_id = $1
             AND wa_id = $2
           LIMIT 1`,
          [req.user.tenantId, outbound.to_phone],
        );

        contact = contactResult.rows[0] || null;
      }

      if (!contact) {
        summary.skipped += 1;
        summary.errors.push({
          id: outbound.id,
          reason: 'contact_not_found',
        });
        continue;
      }

      if (contact.opted_out) {
        summary.skipped += 1;
        summary.errors.push({
          id: outbound.id,
          reason: 'contact_opted_out',
        });
        continue;
      }

      if (!['text', 'template'].includes(outbound.message_type)) {
        summary.skipped += 1;
        summary.errors.push({
          id: outbound.id,
          reason: 'unsupported_message_type',
          messageType: outbound.message_type,
        });
        continue;
      }

      if (outbound.message_type === 'text' && String(outbound.body || '').length > MAX_WHATSAPP_TEXT_LENGTH) {
        summary.skipped += 1;
        summary.errors.push({
          id: outbound.id,
          reason: 'text_too_long',
        });
        continue;
      }

      if (outbound.message_type === 'text' && !isReplyWindowOpen(contact)) {
        summary.skipped += 1;
        summary.errors.push({
          id: outbound.id,
          reason: 'reply_window_expired',
        });
        continue;
      }

      if (outbound.message_type === 'template') {
        try {
          await validateTemplateRetryAllowed(
            req.user.tenantId,
            outbound.template_name,
            outbound.language || 'en',
          );
        } catch (error) {
          summary.skipped += 1;
          summary.errors.push({
            id: outbound.id,
            reason: 'template_not_active',
            error: String(error.message || error).slice(0, 300),
          });
          continue;
        }
      }

      await markOutboundSending(outbound.id, req.user.tenantId);
      summary.retried += 1;

      let waMessageId = null;

      if (outbound.message_type === 'template') {
        waMessageId = await sendWhatsAppTemplate(
          contact,
          outbound.template_name,
          outbound.language || 'en',
          req.user.tenantId,
        );
      } else {
        waMessageId = await sendWhatsAppText(
          contact,
          outbound.body,
          req.user.tenantId,
        );
      }

      await markOutboundSent(outbound.id, req.user.tenantId, waMessageId);

      await addMessage({
        tenantId: req.user.tenantId,
        contactId: contact.id,
        waMessageId,
        direction: 'outbound',
        type: outbound.message_type === 'template' ? 'template' : 'text',
        body: outbound.body,
        status: waMessageId ? 'sent' : 'accepted',
        templateName: outbound.template_name || null,
        rawPayload: {
          batchRetriedOutboundMessageId: outbound.id,
        },
        normalizedText: outbound.body,
      });

      summary.sent += 1;
    } catch (error) {
      summary.failed += 1;

      await markOutboundFailed(outbound.id, req.user.tenantId, error);

      summary.errors.push({
        id: outbound.id,
        reason: String(error.response?.data?.error?.message || error.message || error).slice(0, 300),
      });
    }
  }

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'outbound_messages.retry_failed_batch',
    entityType: 'outbound_message',
    entityId: null,
    metadata: summary,
  });

  res.json({
    ok: true,
    ...summary,
  });
}));

// =========================================================
// ROUTES — DASHBOARD
// =========================================================
}

module.exports = {
  registerWhatsAppRoutes,
};
