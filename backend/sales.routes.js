function registerSalesRoutes(app, ctx) {
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

app.get('/api/quotations', requireAuth, asyncHandler(async (req, res) => {
  const params = [req.user.tenantId];
  const where = ['q.tenant_id = $1'];
  if (!canMonitor(req.user)) { params.push(req.user.id); where.push(`c.assigned_to = $${params.length}`); }
  const result = await query(
    `SELECT q.*, c.name AS contact_name, c.phone,
      COALESCE(json_agg(qi ORDER BY qi.created_at) FILTER (WHERE qi.id IS NOT NULL), '[]') AS items
     FROM quotations q
     LEFT JOIN contacts c ON c.id = q.contact_id AND c.tenant_id = q.tenant_id
     LEFT JOIN quotation_items qi ON qi.quotation_id = q.id AND qi.tenant_id = q.tenant_id
     WHERE ${where.join(' AND ')}
     GROUP BY q.id, c.name, c.phone
     ORDER BY q.created_at DESC`,
    params,
  );
  res.json(result.rows);
}));

app.post('/api/quotations', requireAuth, asyncHandler(async (req, res) => {
  if (!(await canAccessContactId(req.user, req.body.contact_id))) return res.status(403).json({ error: 'Quotation contact assigned to another user' });
  const items = Array.isArray(req.body.items) && req.body.items.length
    ? req.body.items
    : [{ description: req.body.notes || 'Manual quotation item', quantity: 1, rate: toFiniteNumber(req.body.amount, 0) }];
  const quote = await createQuotation({ tenantId: req.user.tenantId, contactId: req.body.contact_id, notes: req.body.notes, items, source: req.body.source || 'WhatsApp', validUntil: req.body.valid_until });
  await recordAudit({ tenantId: req.user.tenantId, actorUserId: req.user.id, action: 'quotation.created', entityType: 'quotation', entityId: quote.id, metadata: { contactId: req.body.contact_id || null } });
  res.status(201).json(quote);
}));

app.post('/api/quotations/:id/send-manager-approval', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) {
    return res.status(403).json({ error: 'Manager/Admin only' });
  }

  const settings = await getAppSettings(req.user.tenantId);

  if (!settings.quoteApprovalEnabled) {
    return res.status(400).json({ error: 'Quotation approval workflow is disabled in Settings.' });
  }

  const managerPhone = String(settings.quoteApprovalManagerPhone || '').replace(/\D/g, '');

  if (managerPhone.length < 11 || managerPhone.length > 15) {
    return res.status(400).json({
      error: 'Manager WhatsApp number is missing/invalid. Add it in Settings > Quotation Approval Workflow.',
    });
  }

  const templateName = String(settings.quoteApprovalTemplateName || '').trim().toLowerCase();
  const templateLanguage = String(settings.quoteApprovalTemplateLanguage || 'en').trim() || 'en';

  if (!templateName) {
    return res.status(400).json({ error: 'Manager approval template name is missing in Settings.' });
  }

  const templateResult = await query(
    `SELECT id, name, language, active
     FROM whatsapp_templates
     WHERE tenant_id = $1
       AND name = $2
       AND language = $3
       AND active = true
     LIMIT 1`,
    [req.user.tenantId, templateName, templateLanguage],
  );

  const templateRecord = templateResult.rows[0];

  if (!templateRecord) {
    return res.status(400).json({
      error: 'Manager approval template is not active/found in Templates. Add the approved Meta template name and language first.',
    });
  }

  const quoteResult = await query(
    `SELECT q.*, c.name AS contact_name, c.phone, c.company
     FROM quotations q
     LEFT JOIN contacts c ON c.id = q.contact_id AND c.tenant_id = q.tenant_id
     WHERE q.id = $1
       AND q.tenant_id = $2
     LIMIT 1`,
    [req.params.id, req.user.tenantId],
  );

  const quote = quoteResult.rows[0];

  if (!quote) {
    return res.status(404).json({ error: 'Quotation not found' });
  }

  if (!(await canAccessContactId(req.user, quote.contact_id))) {
    return res.status(403).json({ error: 'Quotation assigned to another user' });
  }

  if (['converted', 'lost', 'accepted'].includes(String(quote.status || '').toLowerCase())) {
    return res.status(400).json({ error: 'This quotation is already closed/converted and cannot be sent for manager approval.' });
  }

  const itemResult = await query(
    `SELECT *
     FROM quotation_items
     WHERE quotation_id = $1
       AND tenant_id = $2
     ORDER BY created_at`,
    [quote.id, req.user.tenantId],
  );

  const items = itemResult.rows;
  const customerName = quote.company || quote.contact_name || quote.phone || 'Customer';
  const amountText = `${settings.currency || 'INR'} ${Number(quote.amount || 0).toLocaleString('en-IN')}`;
  const revisionText = `Rev ${Number(quote.revision_no || 0)}`;
  const itemSummary = formatQuotationItemsForApproval(items);

  const managerContact = await upsertContact({
    tenantId: req.user.tenantId,
    waId: managerPhone,
    name: settings.quoteApprovalManagerName || 'Quote Approval Manager',
    phone: managerPhone,
    label: 'Review Required',
    touchInbound: false,
  });

  let waMessageId = null;

  try {
    waMessageId = await sendWhatsAppTemplateToNumber({
      tenantId: req.user.tenantId,
      to: managerPhone,
      templateName,
      language: templateLanguage,
      bodyParams: [
        quote.quote_no,
        customerName,
        amountText,
        revisionText,
      ],
    });
  } catch (error) {
    await recordQuotationApprovalEvent({
      tenantId: req.user.tenantId,
      quotationId: quote.id,
      actorType: 'sales',
      actorUserId: req.user.id,
      actorPhone: null,
      action: 'sent_to_manager',
      reason: 'manager_send_failed',
      rawPayload: {
        status: error.response?.status || null,
        message: error.response?.data?.error?.message || error.message,
      },
    });

    return res.status(400).json({
      error: error.response?.data?.error?.message || error.message || 'Manager approval WhatsApp message failed',
    });
  }

  const outboundBody = [
    `[Manager Approval] ${quote.quote_no}`,
    `Customer: ${customerName}`,
    `Amount: ${amountText}`,
    revisionText,
    '',
    itemSummary,
  ].filter(Boolean).join('\n');

  const message = await addMessage({
    tenantId: req.user.tenantId,
    contactId: managerContact.id,
    waMessageId,
    direction: 'outbound',
    type: 'template',
    body: outboundBody,
    status: waMessageId ? 'sent' : 'accepted',
    templateName,
    rawPayload: {
      templateName,
      templateLanguage,
      quoteId: quote.id,
      quoteNo: quote.quote_no,
      bodyParams: [quote.quote_no, customerName, amountText, revisionText],
    },
    normalizedText: outboundBody,
  });

  const updatedQuoteResult = await query(
    `UPDATE quotations
     SET status = 'pending_manager_approval',
         approval_status = 'pending_manager_approval',
         manager_approval_status = 'pending',
         manager_approval_requested_at = now(),
         manager_phone = $3
     WHERE id = $1
       AND tenant_id = $2
     RETURNING *`,
    [quote.id, req.user.tenantId, managerPhone],
  );

  await recordQuotationApprovalEvent({
    tenantId: req.user.tenantId,
    quotationId: quote.id,
    actorType: 'sales',
    actorUserId: req.user.id,
    actorPhone: null,
    action: 'sent_to_manager',
    reason: null,
    rawPayload: {
      managerPhone: maskValue(managerPhone),
      templateName,
      templateLanguage,
      messageId: waMessageId,
      messageRowId: message?.id || null,
    },
  });

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'quotation.sent_to_manager',
    entityType: 'quotation',
    entityId: quote.id,
    metadata: {
      managerPhone: maskValue(managerPhone),
      templateName,
      messageId: waMessageId,
      messageRowId: message?.id || null,
    },
  });

  res.json({
    ok: true,
    quotation: updatedQuoteResult.rows[0],
    managerContactId: managerContact.id,
    messageId: waMessageId,
  });
}));

app.post('/api/quotations/:id/send-to-customer', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) {
    return res.status(403).json({ error: 'Manager/Admin only' });
  }

  const settings = await getAppSettings(req.user.tenantId);

  const quoteResult = await query(
    `SELECT q.*, c.id AS contact_id, c.name AS contact_name, c.wa_id, c.phone, c.company, c.opted_out, c.last_inbound_at
     FROM quotations q
     JOIN contacts c ON c.id = q.contact_id AND c.tenant_id = q.tenant_id
     WHERE q.id = $1
       AND q.tenant_id = $2
     LIMIT 1`,
    [req.params.id, req.user.tenantId],
  );

  const quote = quoteResult.rows[0];

  if (!quote) {
    return res.status(404).json({ error: 'Quotation not found' });
  }

  if (!(await canAccessContactId(req.user, quote.contact_id))) {
    return res.status(403).json({ error: 'Quotation assigned to another user' });
  }

  if (quote.opted_out) {
    return res.status(403).json({
      error: 'Customer has opted out. Do not send WhatsApp quotation to this contact.',
    });
  }

  if (settings.quoteApprovalEnabled && quote.manager_approval_status !== 'approved') {
    return res.status(400).json({
      error: 'Manager approval is required before sending this quotation to customer.',
    });
  }

  if (['converted', 'lost', 'accepted'].includes(String(quote.status || '').toLowerCase())) {
    return res.status(400).json({
      error: 'This quotation is already closed/converted and cannot be sent to customer.',
    });
  }

  const templateName = String(settings.customerQuoteTemplateName || '').trim().toLowerCase();
  const templateLanguage = String(settings.customerQuoteTemplateLanguage || 'en').trim() || 'en';

  if (!templateName) {
    return res.status(400).json({
      error: 'Customer quote template name is missing in Settings.',
    });
  }

  const templateResult = await query(
    `SELECT id, name, language, active
     FROM whatsapp_templates
     WHERE tenant_id = $1
       AND name = $2
       AND language = $3
       AND active = true
     LIMIT 1`,
    [req.user.tenantId, templateName, templateLanguage],
  );

  const templateRecord = templateResult.rows[0];

  if (!templateRecord) {
    return res.status(400).json({
      error: 'Customer quote template is not active/found in Templates. Add the approved Meta template name and language first.',
    });
  }

  const itemResult = await query(
    `SELECT *
     FROM quotation_items
     WHERE quotation_id = $1
       AND tenant_id = $2
     ORDER BY created_at`,
    [quote.id, req.user.tenantId],
  );

  const items = itemResult.rows;
  const customerName = quote.company || quote.contact_name || quote.phone || 'Customer';
  const amountText = `${settings.currency || 'INR'} ${Number(quote.amount || 0).toLocaleString('en-IN')}`;
  const validUntilText = quote.valid_until
    ? new Date(quote.valid_until).toLocaleDateString('en-IN')
    : 'As per quotation';
  const itemSummary = formatQuotationItemsForApproval(items);

  let waMessageId = null;

  try {
    waMessageId = await sendWhatsAppTemplateToNumber({
      tenantId: req.user.tenantId,
      to: quote.wa_id || quote.phone,
      templateName,
      language: templateLanguage,
      bodyParams: [
        customerName,
        quote.quote_no,
        amountText,
        validUntilText,
      ],
    });
  } catch (error) {
    return res.status(400).json({
      error: error.response?.data?.error?.message || error.message || 'Customer quote WhatsApp message failed',
    });
  }

  const outboundBody = [
    `[Customer Quote] ${quote.quote_no}`,
    `Customer: ${customerName}`,
    `Amount: ${amountText}`,
    `Valid Until: ${validUntilText}`,
    '',
    itemSummary,
  ].filter(Boolean).join('\n');

  const message = await addMessage({
    tenantId: req.user.tenantId,
    contactId: quote.contact_id,
    waMessageId,
    direction: 'outbound',
    type: 'template',
    body: outboundBody,
    status: waMessageId ? 'sent' : 'accepted',
    templateName,
    rawPayload: {
      templateName,
      templateLanguage,
      quoteId: quote.id,
      quoteNo: quote.quote_no,
      bodyParams: [customerName, quote.quote_no, amountText, validUntilText],
    },
    normalizedText: outboundBody,
  });

  const updatedQuoteResult = await query(
    `UPDATE quotations
     SET status = 'customer_sent',
         approval_status = 'customer_sent',
         customer_sent_at = now()
     WHERE id = $1
       AND tenant_id = $2
     RETURNING *`,
    [quote.id, req.user.tenantId],
  );

  await recordQuotationApprovalEvent({
    tenantId: req.user.tenantId,
    quotationId: quote.id,
    actorType: 'sales',
    actorUserId: req.user.id,
    actorPhone: null,
    action: 'sent_to_customer',
    reason: null,
    rawPayload: {
      templateName,
      templateLanguage,
      messageId: waMessageId,
      messageRowId: message?.id || null,
    },
  });

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'quotation.sent_to_customer',
    entityType: 'quotation',
    entityId: quote.id,
    metadata: {
      templateName,
      messageId: waMessageId,
      messageRowId: message?.id || null,
      contactId: quote.contact_id,
    },
  });

  res.json({
    ok: true,
    quotation: updatedQuoteResult.rows[0],
    messageId: waMessageId,
    messageRowId: message?.id || null,
  });
}));

app.patch('/api/quotations/:id', requireAuth, asyncHandler(async (req, res) => {
  const { status, valid_until, notes } = req.body;

  if (status !== undefined) {
    const allowedQuotationStatuses = new Set([
      'draft',
      'pending_manager_approval',
      'manager_approved',
      'manager_rejected_waiting_reason',
      'revision_required',
      'sent',
      'customer_sent',
      'accepted',
      'rejected',
      'expired',
      'converted',
      'lost',
    ]);    const cleanStatus = String(status || '').trim().toLowerCase();

    if (!allowedQuotationStatuses.has(cleanStatus)) {
      return res.status(400).json({ error: 'Invalid quotation status' });
    }
  }

  const existingQuote = (await query('SELECT * FROM quotations WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenantId])).rows[0];
  if (!existingQuote) return res.status(404).json({ error: 'Quotation not found' });
  if (!(await canAccessContactId(req.user, existingQuote.contact_id))) return res.status(403).json({ error: 'Quotation assigned to another user' });
  const result = await query(
    'UPDATE quotations SET status=COALESCE($2,status), valid_until=COALESCE($3,valid_until), notes=COALESCE($4,notes) WHERE id=$1 AND tenant_id=$5 RETURNING *',
    [req.params.id, status, valid_until, notes, req.user.tenantId],
  );
  await recordAudit({ tenantId: req.user.tenantId, actorUserId: req.user.id, action: 'quotation.updated', entityType: 'quotation', entityId: result.rows[0].id, metadata: { status: result.rows[0].status } });
  res.json(result.rows[0]);
}));

app.get('/api/quotations/:id/print-text', requireAuth, asyncHandler(async (req, res) => {
  const settings = await getAppSettings(req.user.tenantId);
  const quoteResult = await query(
    'SELECT q.*, c.name AS contact_name, c.phone, c.company FROM quotations q LEFT JOIN contacts c ON c.id = q.contact_id AND c.tenant_id = q.tenant_id WHERE q.id = $1 AND q.tenant_id = $2',
    [req.params.id, req.user.tenantId],
  );
  const quote = quoteResult.rows[0];
  if (!quote) return res.status(404).json({ error: 'Quotation not found' });
  if (!(await canAccessContactId(req.user, quote.contact_id))) return res.status(403).json({ error: 'Quotation assigned to another user' });
  const itemResult = await query('SELECT * FROM quotation_items WHERE quotation_id = $1 AND tenant_id = $2 ORDER BY created_at', [quote.id, req.user.tenantId]);
  const items = itemResult.rows;
  const lines = [
    settings.companyName,
    `Quotation: ${quote.quote_no}`,
    `Customer: ${quote.contact_name || quote.phone || 'Customer'}`,
    quote.company ? `Company: ${quote.company}` : '',
    `Status: ${quote.status}`,
    `Amount: ${settings.currency} ${Number(quote.amount || 0).toLocaleString('en-IN')}`,
    '',
    'Items:',
    ...items.map((item, index) => `${index + 1}. ${item.description} | ${item.quantity} ${item.unit} x ${item.rate} = ${item.amount}`),
    '',
    quote.notes ? `Notes: ${quote.notes}` : '',
  ].filter((line) => line !== '');
  res.type('text/plain').send(lines.join('\n'));
}));

app.post('/api/quotations/:id/convert-order', requireAuth, asyncHandler(async (req, res) => {
  const quoteResult = await query(
    `SELECT *
     FROM quotations
     WHERE id = $1
       AND tenant_id = $2
     LIMIT 1`,
    [req.params.id, req.user.tenantId],
  );

  const quote = quoteResult.rows[0];

  if (!quote) {
    return res.status(404).json({ error: 'Quotation not found' });
  }

  if (!(await canAccessContactId(req.user, quote.contact_id))) {
    return res.status(403).json({ error: 'Quotation assigned to another user' });
  }

  if (quote.status !== 'accepted' || quote.approval_status !== 'customer_approved') {
    return res.status(400).json({
      error: 'Order can be created only after customer approves the quotation.',
    });
  }

  const existingOrderCheck = await query(
    `SELECT id, order_no
     FROM sales_orders
     WHERE tenant_id = $1
       AND notes ILIKE $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [req.user.tenantId, `%Converted from quotation ${quote.quote_no}%`],
  );

  if (existingOrderCheck.rows[0]) {
    return res.status(409).json({
      error: `Order already exists for this quotation: ${existingOrderCheck.rows[0].order_no}`,
    });
  }

  const itemResult = await query(
    `SELECT *
     FROM quotation_items
     WHERE quotation_id = $1
       AND tenant_id = $2
     ORDER BY created_at`,
    [quote.id, req.user.tenantId],
  );

  if (!itemResult.rows.length) {
    return res.status(400).json({ error: 'Quotation has no items. Cannot create order.' });
  }

  const order = await createSalesOrder({
    tenantId: req.user.tenantId,
    contactId: quote.contact_id,
    notes: req.body.notes || `Converted from quotation ${quote.quote_no}`,
    items: itemResult.rows,
    source: 'WhatsApp Quote',
    paymentStatus: req.body.payment_status || 'pending',
    dispatchStatus: req.body.dispatch_status || 'pending',
  });

  const updatedQuote = await query(
    `UPDATE quotations
     SET status = 'converted',
         approval_status = 'converted_to_order'
     WHERE id = $1
       AND tenant_id = $2
     RETURNING *`,
    [quote.id, req.user.tenantId],
  );

  await recordQuotationApprovalEvent({
    tenantId: req.user.tenantId,
    quotationId: quote.id,
    actorType: 'sales',
    actorUserId: req.user.id,
    action: 'converted_to_order',
    reason: null,
    rawPayload: {
      orderId: order.id,
      orderNo: order.order_no,
    },
  });

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'quotation.converted_to_order',
    entityType: 'sales_order',
    entityId: order.id,
    metadata: {
      quoteId: quote.id,
      quoteNo: quote.quote_no,
      contactId: quote.contact_id,
      orderNo: order.order_no,
      quotationStatus: updatedQuote.rows[0]?.status,
      approvalStatus: updatedQuote.rows[0]?.approval_status,
    },
  });

  let acknowledgement = { sent: false, reason: 'not_attempted' };

  try {
    acknowledgement = await sendOrderAcknowledgementToCustomer({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      order,
      quote,
    });
  } catch (error) {
    acknowledgement = {
      sent: false,
      reason: error.response?.data?.error?.message || error.message || 'acknowledgement_failed',
    };

    await recordAudit({
      tenantId: req.user.tenantId,
      actorUserId: req.user.id,
      action: 'order.acknowledgement_failed',
      entityType: 'sales_order',
      entityId: order.id,
      metadata: {
        quoteId: quote.id,
        quoteNo: quote.quote_no,
        orderNo: order.order_no,
        reason: acknowledgement.reason,
      },
    });
  }

  res.status(201).json({
    ...order,
    acknowledgement,
  });
}));

// =========================================================
// ROUTES — ORDERS
// =========================================================

app.get('/api/orders', requireAuth, asyncHandler(async (req, res) => {
  const params = [req.user.tenantId];
  const where = ['o.tenant_id = $1'];
  if (!canMonitor(req.user)) { params.push(req.user.id); where.push(`c.assigned_to = $${params.length}`); }
  const result = await query(
    `SELECT o.*, c.name AS contact_name, c.phone,
      COALESCE(json_agg(soi ORDER BY soi.created_at) FILTER (WHERE soi.id IS NOT NULL), '[]') AS items
     FROM sales_orders o
     LEFT JOIN contacts c ON c.id = o.contact_id AND c.tenant_id = o.tenant_id
     LEFT JOIN sales_order_items soi ON soi.order_id = o.id AND soi.tenant_id = o.tenant_id
     WHERE ${where.join(' AND ')}
     GROUP BY o.id, c.name, c.phone
     ORDER BY o.created_at DESC`,
    params,
  );
  res.json(result.rows);
}));

app.post('/api/orders', requireAuth, asyncHandler(async (req, res) => {
  if (!(await canAccessContactId(req.user, req.body.contact_id))) return res.status(403).json({ error: 'Order contact assigned to another user' });
  const items = Array.isArray(req.body.items) && req.body.items.length
    ? req.body.items
    : [{ description: req.body.notes || 'Manual order item', quantity: 1, rate: toFiniteNumber(req.body.amount, 0) }];
  const order = await createSalesOrder({ tenantId: req.user.tenantId, contactId: req.body.contact_id, notes: req.body.notes, items, source: req.body.source || 'WhatsApp', paymentStatus: req.body.payment_status || 'pending', dispatchStatus: req.body.dispatch_status || 'pending' });
  await recordAudit({ tenantId: req.user.tenantId, actorUserId: req.user.id, action: 'order.created', entityType: 'sales_order', entityId: order.id, metadata: { contactId: req.body.contact_id || null } });
  res.status(201).json(order);
}));

app.patch('/api/orders/:id', requireAuth, asyncHandler(async (req, res) => {
  const { status, payment_status, dispatch_status, notes } = req.body;

  if (status !== undefined) {
    const allowedOrderStatuses = new Set(['pending', 'confirmed', 'processing', 'completed', 'closed', 'cancelled']);
    const cleanStatus = String(status || '').trim().toLowerCase();

    if (!allowedOrderStatuses.has(cleanStatus)) {
      return res.status(400).json({ error: 'Invalid order status' });
    }
  }

  if (payment_status !== undefined) {
    const allowedPaymentStatuses = new Set(['pending', 'partial', 'paid', 'overdue', 'cancelled']);

    if (!allowedPaymentStatuses.has(String(payment_status || '').trim().toLowerCase())) {
      return res.status(400).json({ error: 'Invalid payment status' });
    }
  }

  if (dispatch_status !== undefined) {
    const allowedDispatchStatuses = new Set(['pending', 'packed', 'dispatched', 'delivered', 'cancelled']);

    if (!allowedDispatchStatuses.has(String(dispatch_status || '').trim().toLowerCase())) {
      return res.status(400).json({ error: 'Invalid dispatch status' });
    }
  }

  const existingOrder = (await query('SELECT * FROM sales_orders WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenantId])).rows[0];
  if (!existingOrder) return res.status(404).json({ error: 'Order not found' });
  if (!(await canAccessContactId(req.user, existingOrder.contact_id))) return res.status(403).json({ error: 'Order assigned to another user' });
  const result = await query(
    'UPDATE sales_orders SET status=COALESCE($2,status), payment_status=COALESCE($3,payment_status), dispatch_status=COALESCE($4,dispatch_status), notes=COALESCE($5,notes) WHERE id=$1 AND tenant_id=$6 RETURNING *',
    [req.params.id, status, payment_status, dispatch_status, notes, req.user.tenantId],
  );
  await recordAudit({ tenantId: req.user.tenantId, actorUserId: req.user.id, action: 'order.updated', entityType: 'sales_order', entityId: result.rows[0].id, metadata: { status: result.rows[0].status, paymentStatus: result.rows[0].payment_status, dispatchStatus: result.rows[0].dispatch_status } });
  res.json(result.rows[0]);
}));
}

module.exports = {
  registerSalesRoutes,
};
