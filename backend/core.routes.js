function registerCoreRoutes(app, ctx) {
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
    createTotpEnrollment,
    verifyTotp,
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

    const ALLOWED_TENANT_PLANS = new Set(['starter', 'growth', 'business', 'enterprise', 'internal']);
  const ALLOWED_TENANT_STATUSES = new Set(['active', 'inactive', 'suspended']);

    function signTotpLoginChallenge(user) {
    return signUser({
      id: user.id,
      tenant_id: user.tenant_id,
      name: user.name,
      email: user.email,
      role: user.role,
      totp_challenge: true,
    });
  }

  function verifyTotpLoginChallenge(token) {
    try {
      const decoded = require('jsonwebtoken').verify(String(token || ''), jwtSecret);

      if (!decoded?.id || !decoded?.tenantId || decoded?.totp_challenge !== true) {
        return null;
      }

      return decoded;
    } catch (error) {
      return null;
    }
  }

  function cleanPlatformText(value = '', maxLength = 120) {
    return String(value || '').trim().slice(0, maxLength);
  }

  function cleanPlatformPlan(value = 'starter') {
    const cleanValue = String(value || 'starter').trim().toLowerCase() || 'starter';
    return ALLOWED_TENANT_PLANS.has(cleanValue) ? cleanValue : null;
  }

  function cleanPlatformStatus(value = 'active') {
    const cleanValue = String(value || 'active').trim().toLowerCase() || 'active';
    return ALLOWED_TENANT_STATUSES.has(cleanValue) ? cleanValue : null;
  }

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'bos-whatsapp-backend',
    uptimeSeconds: Math.round(process.uptime()),
    startedAt: serverStartedAt.toISOString(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/ready', asyncHandler(async (req, res) => {
  const db = await healthCheck();

  const envWhatsAppConfigured = Boolean(
    hasRealValue(process.env.WHATSAPP_VERIFY_TOKEN)
    && hasRealValue(process.env.WHATSAPP_ACCESS_TOKEN)
    && hasRealValue(process.env.WHATSAPP_PHONE_NUMBER_ID)
    && (!isProduction || hasRealValue(process.env.WHATSAPP_APP_SECRET))
  );

  let whatsappConfigured = envWhatsAppConfigured;

  if (isProduction && db.ok) {
    const accountResult = await query(
      `SELECT 1
       FROM whatsapp_accounts
       WHERE active = true
         AND phone_number_id IS NOT NULL
         AND access_token_encrypted IS NOT NULL
         AND access_token_iv IS NOT NULL
         AND access_token_tag IS NOT NULL
       LIMIT 1`,
    );

    whatsappConfigured = Boolean(
      hasRealValue(process.env.WHATSAPP_VERIFY_TOKEN)
      && hasRealValue(process.env.WHATSAPP_APP_SECRET)
      && accountResult.rows[0],
    );
  }

  const ready = Boolean(db.ok);

  return res.status(ready ? 200 : 503).json({
    ok: ready,
    service: 'bos-whatsapp-backend',
    databaseReady: Boolean(db.ok),
    whatsappConfigured,
    timestamp: new Date().toISOString(),
  });
}));

app.get('/api/test-db', asyncHandler(async (req, res) => {
  if (isProduction) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const result = await query('SELECT now() AS server_time');
    return res.json({
      ok: true,
      mode: 'postgres',
      message: 'PostgreSQL connection working hai.',
      serverTime: result.rows[0].server_time,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      mode: 'postgres',
      message: 'PostgreSQL connect nahi ho raha.',
      error: error.message,
    });
  }
}));

app.get('/api/public/app-settings', asyncHandler(async (req, res) => {
  const requestedSlug = normalizeTenantSlug(req.query?.tenantSlug || req.query?.slug || '');

  const tenantResult = await query(
    `SELECT id
     FROM tenants
     WHERE slug = COALESCE(NULLIF($1, ''), 'demo')
       AND status = 'active'
     LIMIT 1`,
    [requestedSlug],
  );

  const tenantId = tenantResult.rows[0]?.id;

  if (!tenantId) {
    return res.json({
      appName: DEFAULT_APP_SETTINGS.appName,
      companyName: DEFAULT_APP_SETTINGS.companyName,
      industry: DEFAULT_APP_SETTINGS.industry,
      primaryColor: DEFAULT_APP_SETTINGS.primaryColor,
    });
  }

  const settings = await getAppSettings(tenantId);

  return res.json({
    appName: settings.appName,
    companyName: settings.companyName,
    industry: settings.industry,
    primaryColor: settings.primaryColor,
  });
}));

// =========================================================
// ROUTES — AUTH
// =========================================================

app.post('/api/auth/login', rateLimit({
  bucketName: 'login',
  maxRequests: 20,
  windowMs: 15 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  const cleanEmail = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!cleanEmail || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

    if (isLoginLocked(req, cleanEmail)) {
    return res.status(429).json({ error: 'Too many failed login attempts. Please try again later.' });
  }

  const result = await query(
    `SELECT
  users.id,
  users.tenant_id,
  users.name,
  users.email,
  users.password_hash,
  users.role,
  users.active,
  users.totp_enabled,
  users.totp_secret_encrypted,
  users.totp_secret_iv,
  users.totp_secret_tag,
  tenants.status AS tenant_status
     FROM users
     JOIN tenants ON tenants.id = users.tenant_id
     WHERE lower(users.email) = $1
     LIMIT 1`,
    [cleanEmail],
  );

  const user = result.rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    recordFailedLogin(req, cleanEmail);
    return res.status(401).json({ error: 'Invalid login' });
  }

  clearLoginAttempts(req, cleanEmail);

  if (!user.active) {
    return res.status(403).json({ error: 'User is inactive' });
  }

  if (user.tenant_status !== 'active') {
    return res.status(403).json({ error: 'Company account is inactive' });
  }

if (
  user.role === 'admin'
  && user.totp_enabled
) {
  return res.json({
    requiresTotp: true,
    totpChallenge: signTotpLoginChallenge(user),
  });
}

await recordAudit({
  tenantId: user.tenant_id,
  actorUserId: user.id,
  action: 'auth.login',
  entityType: 'user',
  entityId: user.id,
  metadata: {
    email: maskEmail(user.email),
    role: user.role,
    totpEnabled: Boolean(user.totp_enabled),
  },
});

setAuthCookie(res, user);

return res.json({
  user: publicUser(user),
});
}));

app.post('/api/auth/register', rateLimit({
  bucketName: 'register',
  maxRequests: 5,
  windowMs: 60 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  const companyName = String(req.body?.companyName || '').trim();
  const industry = String(req.body?.industry || 'General Sales').trim() || 'General Sales';
  const adminName = String(req.body?.adminName || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const acceptedPolicy = req.body?.acceptedPolicy === true;

  if (companyName.length < 2 || companyName.length > 120) {
    return res.status(400).json({ error: 'Business name must be between 2 and 120 characters' });
  }

  if (industry.length > 80) {
    return res.status(400).json({ error: 'Industry must be 80 characters or fewer' });
  }

  if (adminName.length < 2 || adminName.length > 100) {
    return res.status(400).json({ error: 'Your name must be between 2 and 100 characters' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid work email required' });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({
      error: strongPasswordError(),
    });
  }

  if (!acceptedPolicy) {
    return res.status(400).json({ error: 'Accept the platform and WhatsApp policy requirements to continue' });
  }

  const slugPrefix = normalizeTenantSlug(companyName).slice(0, 45) || 'business';
  const tenantSlug = `${slugPrefix}-${crypto.randomBytes(4).toString('hex')}`;
  const passwordHash = await bcrypt.hash(password, 12);

  try {
    const result = await query(
      `WITH created_tenant AS (
         INSERT INTO tenants
           (name, slug, industry, status, plan, business_email, onboarding_status, updated_at)
         VALUES
           ($1, $2, $3, 'active', 'starter', $4, 'admin_created', now())
         RETURNING id
       ),
       created_user AS (
         INSERT INTO users (tenant_id, name, email, password_hash, role, active)
         SELECT id, $5, $4, $6, 'admin', true
         FROM created_tenant
         RETURNING id, tenant_id, name, email, role, active
       ),
       created_settings AS (
         INSERT INTO app_settings (tenant_id, key, value, updated_at)
         SELECT id, 'customization',
                jsonb_build_object('companyName', $1, 'industry', $3),
                now()
         FROM created_tenant
       ),
       created_audit AS (
         INSERT INTO audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
         SELECT tenant_id, id, 'account.registered', 'tenant', tenant_id,
                jsonb_build_object('onboardingStatus', 'admin_created', 'plan', 'starter')
         FROM created_user
       )
       SELECT id, tenant_id, name, email, role, active
       FROM created_user`,
      [companyName, tenantSlug, industry, email, adminName, passwordHash],
    );

    const user = result.rows[0];

    setAuthCookie(res, user);

    return res.status(201).json({
      user: publicUser(user),
      nextStep: 'connect_whatsapp',
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    throw error;
  }
}));

app.get('/api/me', requireAuth, (req, res) => res.json(req.user));

app.post('/api/auth/totp/setup', requireAuth, rateLimit({
  bucketName: 'totp-setup',
  maxRequests: 10,
  windowMs: 15 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const userResult = await query(
    `SELECT id, tenant_id, email, role, totp_enabled
     FROM users
     WHERE id = $1
       AND tenant_id = $2
     LIMIT 1`,
    [req.user.id, req.user.tenantId],
  );

  const user = userResult.rows[0];

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (user.totp_enabled) {
    return res.status(400).json({ error: '2FA is already enabled' });
  }

  const enrollment = await createTotpEnrollment(user.email);
  const encryptedSecret = encryptSecret(enrollment.secret);

  await query(
    `UPDATE users
     SET totp_secret_encrypted = $3,
         totp_secret_iv = $4,
         totp_secret_tag = $5
     WHERE id = $1
       AND tenant_id = $2`,
    [
      user.id,
      user.tenant_id,
      encryptedSecret.encrypted,
      encryptedSecret.iv,
      encryptedSecret.tag,
    ],
  );

  await recordAudit({
    tenantId: user.tenant_id,
    actorUserId: user.id,
    action: 'admin.totp_setup_started',
    entityType: 'user',
    entityId: user.id,
  });

  return res.json({
    qrCodeDataUrl: enrollment.qrCodeDataUrl,
  });
}));

app.post('/api/auth/totp/enable', requireAuth, rateLimit({
  bucketName: 'totp-enable',
  maxRequests: 10,
  windowMs: 15 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const token = String(req.body?.token || '');

  const userResult = await query(
    `SELECT *
     FROM users
     WHERE id = $1
       AND tenant_id = $2
     LIMIT 1`,
    [req.user.id, req.user.tenantId],
  );

  const user = userResult.rows[0];

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (!user.totp_secret_encrypted || !user.totp_secret_iv || !user.totp_secret_tag) {
    return res.status(400).json({ error: 'Start 2FA setup first' });
  }

  const secret = decryptSecret({
    encrypted: user.totp_secret_encrypted,
    iv: user.totp_secret_iv,
    tag: user.totp_secret_tag,
  });

  if (!verifyTotp(secret, token)) {
    await recordAudit({
      tenantId: user.tenant_id,
      actorUserId: user.id,
      action: 'admin.totp_enable_failed',
      entityType: 'user',
      entityId: user.id,
    });

    return res.status(401).json({ error: 'Invalid code' });
  }

  const updatedResult = await query(
    `UPDATE users
     SET totp_enabled = true,
         totp_enabled_at = now()
     WHERE id = $1
       AND tenant_id = $2
     RETURNING id, tenant_id, name, email, role, active, totp_enabled`,
    [user.id, user.tenant_id],
  );

  await recordAudit({
    tenantId: user.tenant_id,
    actorUserId: user.id,
    action: 'admin.totp_enabled',
    entityType: 'user',
    entityId: user.id,
  });

  return res.json({
    ok: true,
    user: publicUser(updatedResult.rows[0]),
  });
}));

app.post('/api/auth/totp/login', rateLimit({
  bucketName: 'totp-login',
  maxRequests: 15,
  windowMs: 15 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  const challenge = verifyTotpLoginChallenge(req.body?.totpChallenge);
  const token = String(req.body?.token || '');

  if (!challenge) {
    return res.status(401).json({
      error: 'Invalid or expired 2FA challenge',
    });
  }

  const result = await query(
    `SELECT *
     FROM users
     WHERE id = $1
       AND tenant_id = $2
       AND active = true
     LIMIT 1`,
    [challenge.id, challenge.tenantId],
  );

  const user = result.rows[0];

  if (!user || !user.totp_enabled) {
    return res.status(400).json({
      error: '2FA not enabled',
    });
  }

  const secret = decryptSecret({
    encrypted: user.totp_secret_encrypted,
    iv: user.totp_secret_iv,
    tag: user.totp_secret_tag,
  });

  const valid = verifyTotp(secret, token);

  if (!valid) {
    await recordAudit({
      tenantId: user.tenant_id,
      actorUserId: user.id,
      action: 'admin.totp_login_failed',
      entityType: 'user',
      entityId: user.id,
    });

    return res.status(401).json({
      error: 'Invalid code',
    });
  }

  await recordAudit({
    tenantId: user.tenant_id,
    actorUserId: user.id,
    action: 'admin.totp_login_success',
    entityType: 'user',
    entityId: user.id,
  });

  setAuthCookie(res, user);

  return res.json({
    success: true,
    user: publicUser(user),
  });
}));

app.post('/api/auth/totp/disable', requireAuth, rateLimit({
  bucketName: 'totp-disable',
  maxRequests: 10,
  windowMs: 15 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const token = String(req.body?.token || '');

  const userResult = await query(
    `SELECT *
     FROM users
     WHERE id = $1
       AND tenant_id = $2
     LIMIT 1`,
    [req.user.id, req.user.tenantId],
  );

  const user = userResult.rows[0];

  if (!user || !user.totp_enabled) {
    return res.status(400).json({ error: '2FA is not enabled' });
  }

  const secret = decryptSecret({
    encrypted: user.totp_secret_encrypted,
    iv: user.totp_secret_iv,
    tag: user.totp_secret_tag,
  });

  if (!verifyTotp(secret, token)) {
    return res.status(401).json({ error: 'Invalid code' });
  }

  const updatedResult = await query(
    `UPDATE users
     SET totp_enabled = false,
         totp_enabled_at = NULL,
         totp_secret_encrypted = NULL,
         totp_secret_iv = NULL,
         totp_secret_tag = NULL
     WHERE id = $1
       AND tenant_id = $2
     RETURNING id, tenant_id, name, email, role, active, totp_enabled`,
    [user.id, user.tenant_id],
  );

  await recordAudit({
    tenantId: user.tenant_id,
    actorUserId: user.id,
    action: 'admin.totp_disabled',
    entityType: 'user',
    entityId: user.id,
  });

  return res.json({
    ok: true,
    user: publicUser(updatedResult.rows[0]),
  });
}));

app.post('/api/auth/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

// =========================================================
// ROUTES — PLATFORM / SUPER ADMIN
// =========================================================

app.get('/api/platform/tenants', requireAuth, requireSuperAdmin, asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT
       tenants.id,
       tenants.name,
       tenants.slug,
       tenants.industry,
       tenants.status,
       tenants.plan,
       tenants.logo_url,
       tenants.business_phone,
       tenants.business_email,
       tenants.meta_business_id,
       tenants.onboarding_status,
       tenants.created_at,
       tenants.updated_at,
       COUNT(users.id)::int AS user_count,
       COUNT(users.id) FILTER (WHERE users.active = true)::int AS active_user_count
     FROM tenants
     LEFT JOIN users ON users.tenant_id = tenants.id
     GROUP BY tenants.id
     ORDER BY tenants.created_at DESC`,
  );

  res.json(result.rows.map((tenant) => ({
    ...publicTenant(tenant),
    userCount: tenant.user_count,
    activeUserCount: tenant.active_user_count,
  })));
}));

app.post('/api/platform/tenants', requireAuth, requireSuperAdmin, rateLimit({
  bucketName: 'platform-create-tenant',
  maxRequests: 20,
  windowMs: 60 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  const cleanName = cleanPlatformText(req.body?.name, 120);
  const cleanIndustry = cleanPlatformText(req.body?.industry || 'General', 80) || 'General';
  const cleanPlan = cleanPlatformPlan(req.body?.plan || 'starter');
  const cleanStatus = cleanPlatformStatus(req.body?.status || 'active');
  const cleanSlug = normalizeTenantSlug(req.body?.slug || cleanName);

  const businessPhone = cleanPlatformText(req.body?.businessPhone, 30).replace(/[^\d+ -]/g, '').slice(0, 30);
  const businessEmail = cleanPlatformText(req.body?.businessEmail, 140).toLowerCase();
  const logoUrl = cleanPlatformText(req.body?.logoUrl, 300);
  const metaBusinessId = cleanPlatformText(req.body?.metaBusinessId, 120);

  if (!cleanName || !cleanSlug) {
    return res.status(400).json({ error: 'Client company name and slug are required' });
  }

  if (!cleanStatus) {
    return res.status(400).json({ error: 'Invalid tenant status' });
  }

  if (!cleanPlan) {
    return res.status(400).json({ error: 'Invalid tenant plan' });
  }

  if (businessEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(businessEmail)) {
    return res.status(400).json({ error: 'Valid business email required' });
  }

  const result = await query(
    `INSERT INTO tenants
       (name, slug, industry, status, plan, logo_url, business_phone, business_email, meta_business_id, onboarding_status, updated_at)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'tenant_created', now())
     RETURNING *`,
    [
      cleanName,
      cleanSlug,
      cleanIndustry,
      cleanStatus,
      cleanPlan,
      logoUrl || null,
      businessPhone || null,
      businessEmail || null,
      metaBusinessId || null,
    ],
  );

  const tenant = result.rows[0];

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'platform.tenant_created',
    entityType: 'tenant',
    entityId: tenant.id,
    metadata: {
      tenantId: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      plan: tenant.plan,
      status: tenant.status,
    },
  });

  res.status(201).json(publicTenant(tenant));
}));

app.patch('/api/platform/tenants/:tenantId', requireAuth, requireSuperAdmin, rateLimit({
  bucketName: 'platform-update-tenant',
  maxRequests: 60,
  windowMs: 60 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  const tenantId = req.params.tenantId;

  const existingResult = await query(
    `SELECT *
     FROM tenants
     WHERE id = $1
     LIMIT 1`,
    [tenantId],
  );

  const existingTenant = existingResult.rows[0];

  if (!existingTenant) {
    return res.status(404).json({ error: 'Client company not found' });
  }

  if (existingTenant.slug === 'platform') {
    return res.status(400).json({ error: 'Platform tenant cannot be edited from this route' });
  }

  const cleanName = req.body?.name !== undefined ? cleanPlatformText(req.body.name, 120) : existingTenant.name;
  const cleanIndustry = req.body?.industry !== undefined ? cleanPlatformText(req.body.industry, 80) : existingTenant.industry;
  const cleanStatus = req.body?.status !== undefined ? cleanPlatformStatus(req.body.status) : existingTenant.status;
  const cleanPlan = req.body?.plan !== undefined ? cleanPlatformPlan(req.body.plan) : existingTenant.plan;

  const businessPhone = req.body?.businessPhone !== undefined
    ? cleanPlatformText(req.body.businessPhone, 30).replace(/[^\d+ -]/g, '').slice(0, 30)
    : existingTenant.business_phone;

  const businessEmail = req.body?.businessEmail !== undefined
    ? cleanPlatformText(req.body.businessEmail, 140).toLowerCase()
    : existingTenant.business_email;

  const logoUrl = req.body?.logoUrl !== undefined ? cleanPlatformText(req.body.logoUrl, 300) : existingTenant.logo_url;
  const metaBusinessId = req.body?.metaBusinessId !== undefined ? cleanPlatformText(req.body.metaBusinessId, 120) : existingTenant.meta_business_id;
  const onboardingStatus = req.body?.onboardingStatus !== undefined ? cleanPlatformText(req.body.onboardingStatus, 80) : existingTenant.onboarding_status;

  if (!cleanName) {
    return res.status(400).json({ error: 'Client company name is required' });
  }

  if (!cleanStatus) {
    return res.status(400).json({ error: 'Invalid tenant status' });
  }

  if (!cleanPlan) {
    return res.status(400).json({ error: 'Invalid tenant plan' });
  }

  if (businessEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(businessEmail)) {
    return res.status(400).json({ error: 'Valid business email required' });
  }

  const result = await query(
    `UPDATE tenants
     SET name = $2,
         industry = $3,
         status = $4,
         plan = $5,
         business_phone = $6,
         business_email = $7,
         logo_url = $8,
         meta_business_id = $9,
         onboarding_status = $10,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      tenantId,
      cleanName,
      cleanIndustry || 'General',
      cleanStatus,
      cleanPlan || 'starter',
      businessPhone || null,
      businessEmail || null,
      logoUrl || null,
      metaBusinessId || null,
      onboardingStatus || 'pending',
    ],
  );

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'platform.tenant_updated',
    entityType: 'tenant',
    entityId: tenantId,
    metadata: {
      tenantId,
      status: cleanStatus,
      plan: cleanPlan,
      onboardingStatus,
    },
  });

  res.json(publicTenant(result.rows[0]));
}));

app.post('/api/platform/tenants/:tenantId/remove-access', requireAuth, requireSuperAdmin, rateLimit({
  bucketName: 'platform-remove-client-access',
  maxRequests: 20,
  windowMs: 15 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  const tenantId = req.params.tenantId;

  const tenantResult = await query(
    `SELECT id, slug, name, status
     FROM tenants
     WHERE id = $1
     LIMIT 1`,
    [tenantId],
  );

  const tenant = tenantResult.rows[0];

  if (!tenant) {
    return res.status(404).json({ error: 'Client company not found' });
  }

  if (tenant.slug === 'platform') {
    return res.status(400).json({ error: 'Platform tenant access cannot be removed from this route' });
  }

  const updatedTenantResult = await query(
    `UPDATE tenants
     SET status = 'suspended',
         onboarding_status = 'access_removed',
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [tenantId],
  );

  await query(
    `UPDATE users
     SET active = false
     WHERE tenant_id = $1`,
    [tenantId],
  );

  await query(
    `UPDATE whatsapp_accounts
     SET active = false,
         updated_at = now()
     WHERE tenant_id = $1`,
    [tenantId],
  );

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'platform.client_access_removed',
    entityType: 'tenant',
    entityId: tenantId,
    metadata: {
      clientTenantId: tenantId,
      clientTenantName: tenant.name,
      previousStatus: tenant.status,
      newStatus: 'suspended',
      usersDeactivated: true,
      whatsappAccountsDeactivated: true,
      reason: 'Super admin removed client access',
    },
  });

  res.json({
    ok: true,
    tenant: publicTenant(updatedTenantResult.rows[0]),
  });
}));

app.post('/api/platform/tenants/:tenantId/admin', requireAuth, requireSuperAdmin, rateLimit({
  bucketName: 'platform-create-client-admin',
  maxRequests: 30,
  windowMs: 60 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  const tenantId = req.params.tenantId;

  const cleanName = cleanPlatformText(req.body?.name, 100);
  const cleanEmail = cleanPlatformText(req.body?.email, 140).toLowerCase();
  const cleanPassword = String(req.body?.password || '');

  if (!cleanName || cleanName.length < 2 || !cleanEmail || !cleanPassword) {
    return res.status(400).json({ error: 'Admin name, email and password are required' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'Valid admin email required' });
  }

  if (!isStrongPassword(cleanPassword)) {
    return res.status(400).json({ error: strongPasswordError() });
  }

  const tenantResult = await query(
    `SELECT id, slug, status
     FROM tenants
     WHERE id = $1
     LIMIT 1`,
    [tenantId],
  );

  const tenant = tenantResult.rows[0];

  if (!tenant) {
    return res.status(404).json({ error: 'Client company not found' });
  }

  if (tenant.slug === 'platform') {
    return res.status(400).json({ error: 'Use platform super admin setup for platform users' });
  }

  if (tenant.status !== 'active') {
    return res.status(400).json({ error: 'Client company must be active before creating an admin user' });
  }

  const existingUser = await query(
    `SELECT id
     FROM users
     WHERE lower(email) = $1
     LIMIT 1`,
    [cleanEmail],
  );

  if (existingUser.rows[0]) {
    return res.status(409).json({ error: 'User with this email already exists' });
  }

  const hash = await bcrypt.hash(cleanPassword, 12);

  const result = await query(
    `INSERT INTO users (tenant_id, name, email, password_hash, role, active)
     VALUES ($1, $2, $3, $4, 'admin', true)
     RETURNING id, tenant_id, name, email, role, active`,
    [tenantId, cleanName, cleanEmail, hash],
  );

  await query(
    `UPDATE tenants
     SET onboarding_status = 'admin_created',
         updated_at = now()
     WHERE id = $1`,
    [tenantId],
  );

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'platform.client_admin_created',
    entityType: 'user',
    entityId: result.rows[0].id,
    metadata: {
      tenantId,
      email: maskEmail(cleanEmail),
      role: 'admin',
    },
  });

  res.status(201).json(publicUser(result.rows[0]));
}));

app.post('/api/platform/tenants/:tenantId/enter-crm', requireAuth, requireSuperAdmin, rateLimit({
  bucketName: 'platform-enter-client-crm',
  maxRequests: 20,
  windowMs: 15 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  if (isProduction && process.env.ENABLE_PLATFORM_ENTER_CRM !== 'true') {
    return res.status(403).json({
      error: 'Platform support access is disabled in production. Set ENABLE_PLATFORM_ENTER_CRM=true only for approved support sessions.',
    });
  }

  const tenantId = req.params.tenantId;

  const tenantResult = await query(
    `SELECT id, slug, name, status
     FROM tenants
     WHERE id = $1
     LIMIT 1`,
    [tenantId],
  );

  const tenant = tenantResult.rows[0];

  if (!tenant) {
    return res.status(404).json({ error: 'Client company not found' });
  }

  if (tenant.slug === 'platform') {
    return res.status(400).json({ error: 'Platform tenant cannot be opened as client CRM' });
  }

  if (tenant.status !== 'active') {
    return res.status(400).json({ error: 'Client company is not active' });
  }

  const adminResult = await query(
    `SELECT id, tenant_id, name, email, role, active
     FROM users
     WHERE tenant_id = $1
       AND role = 'admin'
       AND active = true
     ORDER BY created_at ASC
     LIMIT 1`,
    [tenantId],
  );

  const clientAdmin = adminResult.rows[0];

  if (!clientAdmin) {
    return res.status(400).json({
      error: 'No active client admin found. Create first client admin before opening CRM.',
    });
  }

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'platform.enter_client_crm',
    entityType: 'tenant',
    entityId: tenant.id,
    metadata: {
      clientTenantId: tenant.id,
      clientTenantName: tenant.name,
      clientAdminUserId: clientAdmin.id,
      clientAdminEmail: maskEmail(clientAdmin.email),
      reason: 'Super admin entered client CRM for setup/testing/video verification',
    },
  });

  setAuthCookie(res, clientAdmin);

  res.json({
    user: publicUser(clientAdmin),
    supportMode: true,
    tenant: publicTenant(tenant),
  });
}));

app.get('/api/platform/tenants/:tenantId/status', requireAuth, requireSuperAdmin, asyncHandler(async (req, res) => {
  const tenantId = req.params.tenantId;

  const tenantResult = await query(
    `SELECT *
     FROM tenants
     WHERE id = $1
     LIMIT 1`,
    [tenantId],
  );

  const tenant = tenantResult.rows[0];

  if (!tenant) {
    return res.status(404).json({ error: 'Client company not found' });
  }

  const usersResult = await query(
    `SELECT role, active, COUNT(*)::int AS count
     FROM users
     WHERE tenant_id = $1
     GROUP BY role, active
     ORDER BY role, active DESC`,
    [tenantId],
  );

  const whatsappResult = await query(
    `SELECT id, phone_number_id, display_phone_number, waba_id, active, created_at
     FROM whatsapp_accounts
     WHERE tenant_id = $1
     ORDER BY created_at DESC`,
    [tenantId],
  );

  const contactResult = await query(
    `SELECT COUNT(*)::int AS count
     FROM contacts
     WHERE tenant_id = $1`,
    [tenantId],
  );

  const messageResult = await query(
    `SELECT COUNT(*)::int AS count
     FROM messages
     WHERE tenant_id = $1`,
    [tenantId],
  );

  res.json({
    tenant: publicTenant(tenant),
    users: usersResult.rows,
    whatsappAccounts: whatsappResult.rows.map((account) => ({
      id: account.id,
      phoneNumberId: maskValue(account.phone_number_id || ''),
      displayPhoneNumber: account.display_phone_number || '',
      wabaId: maskValue(account.waba_id || ''),
      active: account.active,
      createdAt: account.created_at,
    })),
    totals: {
      contacts: contactResult.rows[0]?.count || 0,
      messages: messageResult.rows[0]?.count || 0,
    },
  });
}));

// =========================================================
// ROUTES — SETTINGS
// =========================================================

app.get('/api/app-settings', requireAuth, asyncHandler(async (req, res) => {
  res.json(await getAppSettings(req.user.tenantId));
}));

app.put('/api/app-settings', requireAuth, rateLimit({
  bucketName: 'app-settings-update',
  maxRequests: 60,
  windowMs: 60 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) {
    return res.status(403).json({ error: 'Manager/Admin only' });
  }

  const input = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body
    : {};

  const sensitiveSettingKeys = new Set([
    'quoteApprovalEnabled',
    'quoteApprovalManagerName',
    'quoteApprovalManagerPhone',
    'quoteApprovalTemplateName',
    'quoteApprovalTemplateLanguage',
    'customerQuoteTemplateName',
    'customerQuoteTemplateLanguage',
    'orderAcknowledgementTemplateName',
    'orderAcknowledgementTemplateLanguage',
    'ftpAccessEnabled',
    'twoFactorEnabled',
    'wabaMmLiteEnabled',
    'wabaHealthyRetryEnabled',
    'wabaConversionEventsEnabled',
    'billingBusinessName',
    'billingGstNumber',
    'billingPanNumber',
    'billingCountry',
    'billingState',
    'billingCity',
    'billingAddress',
    'billingPinCode',
    'billingEmail',
    'billingContactNumber',
    'voiceCallsEnabled',
    'voiceCallbackEnabled',
    'voiceDisplayCallButtons',
    'voiceCallHoursMode',
    'voiceTimeZone',
    'voiceWeeklyHours',
    'voiceUnavailableHours',
    'inboxAutoAssign',
  ]);

  if (req.user.role !== 'admin') {
    const existingSettings = await getAppSettings(req.user.tenantId);

    const changedSensitiveKeys = Object.keys(input).filter((key) => {
      if (!sensitiveSettingKeys.has(key)) return false;

      return JSON.stringify(input[key] ?? null) !== JSON.stringify(existingSettings[key] ?? null);
    });

    if (changedSensitiveKeys.length) {
      return res.status(403).json({
        error: `Admin only setting change blocked: ${changedSensitiveKeys.slice(0, 5).join(', ')}`,
      });
    }
  }

  const savedSettings = await saveAppSettings(req.user.tenantId, input);

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'settings.updated',
    entityType: 'app_settings',
    entityId: null,
    metadata: {
      changedKeys: Object.keys(input).slice(0, 80),
      appName: savedSettings.appName,
      companyName: savedSettings.companyName,
      adminOnlyGuardApplied: req.user.role !== 'admin',
    },
  });

  res.json(savedSettings);
}));

// =========================================================
// ROUTES — KNOWLEDGE BASE
// =========================================================

app.get('/api/knowledge-base', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });

  const result = await query(
    `SELECT id, title, category, content, keywords, active, created_at, updated_at
     FROM knowledge_base
     WHERE tenant_id = $1
     ORDER BY active DESC, updated_at DESC
     LIMIT 200`,
    [req.user.tenantId],
  );

  res.json(result.rows);
}));

app.post('/api/knowledge-base', requireAuth, rateLimit({
  bucketName: 'knowledge-create',
  maxRequests: 80,
  windowMs: 60 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });

  const item = normalizeKnowledgeBaseItem(req.body || {});

  if (!item.title || !item.content) {
    return res.status(400).json({ error: 'Knowledge title and content required' });
  }

  const result = await query(
    `INSERT INTO knowledge_base (tenant_id, title, category, content, keywords, active, created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
     RETURNING id, title, category, content, keywords, active, created_at, updated_at`,
    [req.user.tenantId, item.title, item.category, item.content, item.keywords, item.active, req.user.id],
  );

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'knowledge.created',
    entityType: 'knowledge_base',
    entityId: result.rows[0].id,
    metadata: { title: item.title, category: item.category },
  });

  res.status(201).json(result.rows[0]);
}));

app.patch('/api/knowledge-base/:id', requireAuth, rateLimit({
  bucketName: 'knowledge-update',
  maxRequests: 120,
  windowMs: 60 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });

  const existingResult = await query(
    `SELECT id
     FROM knowledge_base
     WHERE id = $1
       AND tenant_id = $2
     LIMIT 1`,
    [req.params.id, req.user.tenantId],
  );

  if (!existingResult.rows[0]) {
    return res.status(404).json({ error: 'Knowledge item not found' });
  }

  const item = normalizeKnowledgeBaseItem(req.body || {});

  if (!item.title || !item.content) {
    return res.status(400).json({ error: 'Knowledge title and content required' });
  }

  const result = await query(
    `UPDATE knowledge_base
     SET title = $3,
         category = $4,
         content = $5,
         keywords = $6,
         active = $7,
         updated_by = $8,
         updated_at = now()
     WHERE id = $1
       AND tenant_id = $2
     RETURNING id, title, category, content, keywords, active, created_at, updated_at`,
    [req.params.id, req.user.tenantId, item.title, item.category, item.content, item.keywords, item.active, req.user.id],
  );

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'knowledge.updated',
    entityType: 'knowledge_base',
    entityId: result.rows[0].id,
    metadata: { title: item.title, category: item.category, active: item.active },
  });

  res.json(result.rows[0]);
}));

app.delete('/api/knowledge-base/:id', requireAuth, rateLimit({
  bucketName: 'knowledge-delete',
  maxRequests: 60,
  windowMs: 60 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });

  const result = await query(
    `UPDATE knowledge_base
     SET active = false,
         updated_by = $3,
         updated_at = now()
     WHERE id = $1
       AND tenant_id = $2
     RETURNING id, title, category, active`,
    [req.params.id, req.user.tenantId, req.user.id],
  );

  if (!result.rows[0]) {
    return res.status(404).json({ error: 'Knowledge item not found' });
  }

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'knowledge.deactivated',
    entityType: 'knowledge_base',
    entityId: result.rows[0].id,
    metadata: { title: result.rows[0].title, category: result.rows[0].category },
  });

  res.json({ ok: true, item: result.rows[0] });
}));

app.get('/api/settings/status', requireAuth, asyncHandler(async (req, res) => {
  const settings = await getAppSettings(req.user.tenantId);
  const accountStatus = await getEnvWhatsAppAccountStatus(req.user.tenantId);
  const warnings = [...validateRuntimeConfig()];

  if (hasRealValue(process.env.WHATSAPP_PHONE_NUMBER_ID) && !accountStatus.phoneNumberMapped) {
    warnings.push('WHATSAPP_PHONE_NUMBER_ID is not mapped to an active tenant. Incoming webhooks will be ignored.');
  }

  res.json({
    database: 'Connected through DATABASE_URL',
    webhookSignatureRequired: isProduction,
    webhookVerifyTokenSet: hasRealValue(process.env.WHATSAPP_VERIFY_TOKEN),
    webhookAppSecretSet: hasRealValue(process.env.WHATSAPP_APP_SECRET),
    whatsappTokenSet: hasRealValue(process.env.WHATSAPP_ACCESS_TOKEN),
    phoneNumberIdSet: hasRealValue(process.env.WHATSAPP_PHONE_NUMBER_ID),
    whatsappTestNumbersSet: hasRealValue(process.env.WHATSAPP_TEST_NUMBERS),
    phoneNumberMapped: accountStatus.phoneNumberMapped,
    phoneNumberMappedToCurrentTenant: accountStatus.phoneNumberMappedToCurrentTenant,
    phoneNumberMappedTenantSlug: canMonitor(req.user) ? accountStatus.phoneNumberMappedTenantSlug : null,
    webhookUrl: '/webhook',
    labels: settings.labels,
    warnings,
  });
}));

app.get('/api/whatsapp/config', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) {
    return res.status(403).json({ error: 'Manager/Admin only' });
  }

  const accountStatus = await getEnvWhatsAppAccountStatus(req.user.tenantId);
  const envFallbackAllowed = !isProduction;
  const accessTokenSet = envFallbackAllowed && hasRealValue(process.env.WHATSAPP_ACCESS_TOKEN);
  const phoneNumberIdSet = envFallbackAllowed && hasRealValue(process.env.WHATSAPP_PHONE_NUMBER_ID);
  const callbackUrl = process.env.PUBLIC_BASE_URL
    ? `${process.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/webhook`
    : 'Set PUBLIC_BASE_URL to show full webhook URL';

  res.json({
    configured: accessTokenSet && phoneNumberIdSet,
    accessTokenSet,
    phoneNumberIdSet,
    phoneNumberMapped: accountStatus.phoneNumberMapped,
    phoneNumberMappedToCurrentTenant: accountStatus.phoneNumberMappedToCurrentTenant,
    phoneNumberMappedTenantSlug: accountStatus.phoneNumberMappedTenantSlug,
    verifyTokenSet: hasRealValue(process.env.WHATSAPP_VERIFY_TOKEN),
    appSecretSet: hasRealValue(process.env.WHATSAPP_APP_SECRET),
    webhookSignatureRequired: isProduction,
    testNumbersSet: hasRealValue(process.env.WHATSAPP_TEST_NUMBERS),
    callbackUrl,
    webhookPath: '/webhook',
  });
}));

app.get('/api/whatsapp/health', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) {
    return res.status(403).json({ error: 'Manager/Admin only' });
  }

  const callbackUrl = process.env.PUBLIC_BASE_URL
    ? `${process.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/webhook`
    : '';

  const accountResult = await query(
    `SELECT
       id,
       phone_number_id,
       display_phone_number,
       waba_id,
       active,
       access_token_encrypted,
       access_token_iv,
       access_token_tag,
       connected_at,
       updated_at
     FROM whatsapp_accounts
     WHERE tenant_id = $1
     ORDER BY active DESC, connected_at DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [req.user.tenantId],
  );

  const account = accountResult.rows[0] || null;

  const hasTenantEncryptedToken = Boolean(
    account?.access_token_encrypted &&
    account?.access_token_iv &&
    account?.access_token_tag,
  );

  const envTokenConfigured = !isProduction && isWhatsAppConfigured();
  const tokenMode = hasTenantEncryptedToken
    ? 'tenant_embedded_signup'
    : envTokenConfigured
      ? 'env_fallback'
      : 'not_configured';

  const [lastInbound, lastOutbound, webhookRecent, outboundRecent] = await Promise.all([
    query(
      `SELECT created_at
       FROM messages
       WHERE tenant_id = $1
         AND direction = 'inbound'
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.user.tenantId],
    ),
    query(
      `SELECT COALESCE(sent_at, updated_at, created_at) AS at
       FROM outbound_messages
       WHERE tenant_id = $1
         AND status = 'sent'
       ORDER BY COALESCE(sent_at, updated_at, created_at) DESC
       LIMIT 1`,
      [req.user.tenantId],
    ),
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
  ]);

  const connected = Boolean(
    account?.active &&
    account?.phone_number_id &&
    (hasTenantEncryptedToken || envTokenConfigured),
  );

  const setupIssues = [];

  if (!account?.phone_number_id && !hasRealValue(process.env.WHATSAPP_PHONE_NUMBER_ID)) {
    setupIssues.push('No WhatsApp phone number is connected.');
  }

  if (!hasTenantEncryptedToken && !envTokenConfigured) {
    setupIssues.push('No tenant token or environment fallback token is configured.');
  }

  if (!hasRealValue(process.env.WHATSAPP_VERIFY_TOKEN)) {
    setupIssues.push('WHATSAPP_VERIFY_TOKEN is missing.');
  }

  if (isProduction && !hasRealValue(process.env.WHATSAPP_APP_SECRET)) {
    setupIssues.push('WHATSAPP_APP_SECRET is missing. Production webhooks need signature verification.');
  }

  if (!callbackUrl) {
    setupIssues.push('PUBLIC_BASE_URL is missing, so webhook callback URL cannot be shown.');
  }

  res.json({
    connected,
    setupComplete: connected && setupIssues.length === 0,
    tokenMode,
    webhookUrl: callbackUrl || 'Set PUBLIC_BASE_URL to show full webhook URL',
    webhookPath: '/webhook',
    signatureRequired: isProduction,
    verifyTokenSet: hasRealValue(process.env.WHATSAPP_VERIFY_TOKEN),
    appSecretSet: hasRealValue(process.env.WHATSAPP_APP_SECRET),
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v24.0',
    account: account
      ? {
          id: account.id,
          active: account.active,
          phoneNumberId: maskValue(account.phone_number_id || ''),
          displayPhoneNumber: account.display_phone_number || '',
          wabaId: maskValue(account.waba_id || ''),
          connectedAt: account.connected_at,
          updatedAt: account.updated_at,
          tokenStored: hasTenantEncryptedToken,
        }
      : null,
    activity: {
      lastInboundAt: lastInbound.rows[0]?.created_at || null,
      lastOutboundAt: lastOutbound.rows[0]?.at || null,
      webhookEvents24h: webhookRecent.rows,
      outboundMessages24h: outboundRecent.rows,
    },
    setupIssues,
    timestamp: new Date().toISOString(),
  });
}));

app.get('/api/whatsapp/onboarding', requireAuth, asyncHandler(async (req, res) => {
  const tenantResult = await query(
    `SELECT id, name, slug, onboarding_status
     FROM tenants
     WHERE id = $1
     LIMIT 1`,
    [req.user.tenantId],
  );

  const tenant = tenantResult.rows[0];

  if (!tenant) {
    return res.status(404).json({ error: 'Company not found' });
  }

  const accountResult = await query(
    `SELECT
       id,
       phone_number_id,
       display_phone_number,
       waba_id,
       active,
       access_token_encrypted,
       access_token_iv,
       access_token_tag,
       connected_at
     FROM whatsapp_accounts
     WHERE tenant_id = $1
       AND active = true
     ORDER BY connected_at DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [req.user.tenantId],
  );

  const account = accountResult.rows[0] || null;

  const securelyConnected = Boolean(
    account?.phone_number_id &&
    account?.waba_id &&
    account?.access_token_encrypted &&
    account?.access_token_iv &&
    account?.access_token_tag &&
    account?.connected_at
  );

  res.json({
    connected: securelyConnected,
    connectionMode: securelyConnected ? 'embedded_signup' : 'not_connected',
    metaAppId: process.env.META_APP_ID || '',
    embeddedSignupConfigId: process.env.META_EMBEDDED_SIGNUP_CONFIG_ID || '',
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      onboardingStatus: securelyConnected ? 'whatsapp_mapped' : tenant.onboarding_status || 'pending',
    },
    whatsappAccount: account
      ? {
          id: account.id,
          phoneNumberId: maskValue(account.phone_number_id || ''),
          displayPhoneNumber: account.display_phone_number || '',
          wabaId: maskValue(account.waba_id || ''),
          active: account.active,
          connected: securelyConnected,
          connectedAt: account.connected_at,
        }
      : null,
  });
}));

function createSignupResolutionError(message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.publicMessage = message;
  return error;
}

function normalizeMetaSignupId(value) {
  return String(value || '').trim();
}

function addMetaPhoneCandidate(candidates, waba, phone) {
  const wabaId = normalizeMetaSignupId(waba?.id || waba);
  const phoneNumberId = normalizeMetaSignupId(phone?.id || phone);

  if (!wabaId || !phoneNumberId) return;

  const key = `${wabaId}:${phoneNumberId}`;

  if (candidates.has(key)) return;

  candidates.set(key, {
    wabaId,
    phoneNumberId,
    displayPhoneNumber: phone?.display_phone_number || phone?.verified_name || '',
  });
}

async function fetchMetaPhoneNumbersForWaba({ apiVersion, accessToken, wabaId }) {
  const response = await axios.get(
    `https://graph.facebook.com/${apiVersion}/${wabaId}/phone_numbers`,
    {
      params: {
        fields: 'id,display_phone_number,verified_name',
        limit: 100,
      },
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      timeout: 15000,
    },
  );

  return Array.isArray(response.data?.data) ? response.data.data : [];
}

async function addMetaBusinessWabaPhoneCandidates({ apiVersion, accessToken, businessId, candidates }) {
  if (!businessId) return;

  const edges = ['owned_whatsapp_business_accounts', 'client_whatsapp_business_accounts'];

  for (const edge of edges) {
    try {
      const response = await axios.get(
        `https://graph.facebook.com/${apiVersion}/${businessId}/${edge}`,
        {
          params: {
            fields: 'id,name,phone_numbers.limit(100){id,display_phone_number,verified_name}',
            limit: 100,
          },
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          timeout: 15000,
        },
      );

      for (const waba of response.data?.data || []) {
        for (const phone of waba.phone_numbers?.data || []) {
          addMetaPhoneCandidate(candidates, waba, phone);
        }
      }
    } catch (error) {
      console.warn('Meta WABA business lookup skipped:', {
        businessId: maskValue(businessId),
        edge,
        ...safeMetaError(error),
      });
    }
  }
}

async function addMetaDebugTokenWabaPhoneCandidates({ apiVersion, accessToken, candidates }) {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${apiVersion}/debug_token`,
      {
        params: {
          input_token: accessToken,
          access_token: `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`,
        },
        timeout: 15000,
      },
    );

    const targetIds = new Set();

    for (const scope of response.data?.data?.granular_scopes || []) {
      if (!String(scope?.scope || '').includes('whatsapp')) continue;

      for (const targetId of scope.target_ids || []) {
        const cleanTargetId = normalizeMetaSignupId(targetId);
        if (cleanTargetId) targetIds.add(cleanTargetId);
      }
    }

    for (const targetId of targetIds) {
      try {
        const phones = await fetchMetaPhoneNumbersForWaba({
          apiVersion,
          accessToken,
          wabaId: targetId,
        });

        for (const phone of phones) {
          addMetaPhoneCandidate(candidates, { id: targetId }, phone);
        }
      } catch (error) {
        console.warn('Meta debug token target lookup skipped:', {
          targetId: maskValue(targetId),
          ...safeMetaError(error),
        });
      }
    }
  } catch (error) {
    console.warn('Meta debug token lookup skipped:', safeMetaError(error));
  }
}

async function resolveEmbeddedSignupAccount({ apiVersion, accessToken, phoneNumberId, wabaId, businessId }) {
  const candidates = new Map();
  const cleanPhoneNumberId = normalizeMetaSignupId(phoneNumberId);
  const cleanWabaId = normalizeMetaSignupId(wabaId);
  const cleanBusinessId = normalizeMetaSignupId(businessId);

  if (cleanWabaId) {
    const phones = await fetchMetaPhoneNumbersForWaba({
      apiVersion,
      accessToken,
      wabaId: cleanWabaId,
    });

    for (const phone of phones) {
      addMetaPhoneCandidate(candidates, { id: cleanWabaId }, phone);
    }
  }

  if ((!cleanPhoneNumberId || !cleanWabaId) && cleanBusinessId) {
    await addMetaBusinessWabaPhoneCandidates({
      apiVersion,
      accessToken,
      businessId: cleanBusinessId,
      candidates,
    });
  }

  if (!cleanPhoneNumberId || !cleanWabaId) {
    await addMetaDebugTokenWabaPhoneCandidates({
      apiVersion,
      accessToken,
      candidates,
    });
  }

  let resolvedPhoneNumberId = cleanPhoneNumberId;
  let resolvedWabaId = cleanWabaId;
  let resolvedDisplayPhoneNumber = '';

  if (resolvedPhoneNumberId && resolvedWabaId) {
    const exactCandidate = [...candidates.values()].find((candidate) => (
      candidate.phoneNumberId === resolvedPhoneNumberId && candidate.wabaId === resolvedWabaId
    ));

    if (!exactCandidate) {
      throw createSignupResolutionError('Meta signup phone number does not belong to the selected WABA. Connection was not saved.');
    }

    resolvedDisplayPhoneNumber = exactCandidate?.displayPhoneNumber || '';
  } else if (resolvedPhoneNumberId) {
    const phoneMatches = [...candidates.values()].filter((candidate) => (
      candidate.phoneNumberId === resolvedPhoneNumberId
    ));

    if (phoneMatches.length === 1) {
      resolvedWabaId = phoneMatches[0].wabaId;
      resolvedDisplayPhoneNumber = phoneMatches[0].displayPhoneNumber;
    } else if (phoneMatches.length > 1) {
      throw createSignupResolutionError('Meta returned multiple WABAs for this phone number. Please select the phone again in Embedded Signup.');
    }
  } else if (resolvedWabaId) {
    const wabaMatches = [...candidates.values()].filter((candidate) => (
      candidate.wabaId === resolvedWabaId
    ));

    if (wabaMatches.length === 1) {
      resolvedPhoneNumberId = wabaMatches[0].phoneNumberId;
      resolvedDisplayPhoneNumber = wabaMatches[0].displayPhoneNumber;
    } else if (wabaMatches.length > 1) {
      throw createSignupResolutionError('Meta returned multiple phone numbers for this WABA. Please select the phone again in Embedded Signup.');
    }
  } else if (candidates.size === 1) {
    const onlyCandidate = [...candidates.values()][0];
    resolvedPhoneNumberId = onlyCandidate.phoneNumberId;
    resolvedWabaId = onlyCandidate.wabaId;
    resolvedDisplayPhoneNumber = onlyCandidate.displayPhoneNumber;
  } else if (candidates.size > 1) {
    throw createSignupResolutionError('Meta returned multiple WhatsApp phone numbers. Please select one phone number in Embedded Signup and click Finish.');
  }

  if (!resolvedPhoneNumberId || !resolvedWabaId) {
    throw createSignupResolutionError('Meta signup completed, but the WhatsApp phone number ID / WABA ID could not be verified from Meta.');
  }

  return {
    phoneNumberId: resolvedPhoneNumberId,
    wabaId: resolvedWabaId,
    displayPhoneNumber: resolvedDisplayPhoneNumber,
  };
}

app.post('/api/whatsapp/embedded-signup/complete', requireAuth, rateLimit({
  bucketName: 'embedded-signup-complete',
  maxRequests: 10,
  windowMs: 15 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const code = String(req.body?.code || '').trim();
  let phoneNumberId = String(req.body?.phoneNumberId || '').trim();
  let wabaId = String(req.body?.wabaId || '').trim();
  const businessId = String(req.body?.businessId || '').trim();

  if (!code) {
    return res.status(400).json({
      error: 'Meta signup code is required',
    });
  }

  if (!hasRealValue(process.env.META_APP_ID) || !hasRealValue(process.env.META_APP_SECRET)) {
    return res.status(500).json({
      error: 'Meta App ID/App Secret missing on backend',
    });
  }

  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v24.0';

  const tokenRes = await axios.get(
    `https://graph.facebook.com/${apiVersion}/oauth/access_token`,
    {
      params: {
        client_id: process.env.META_APP_ID,
        client_secret: process.env.META_APP_SECRET,
        code,
      },
      timeout: 15000,
    },
  );

  const accessToken = tokenRes.data?.access_token;

  if (!accessToken) {
    return res.status(502).json({
      error: 'Meta did not return access token',
    });
  }

  let resolvedAccount;

  try {
    resolvedAccount = await resolveEmbeddedSignupAccount({
      apiVersion,
      accessToken,
      phoneNumberId,
      wabaId,
      businessId,
    });

    phoneNumberId = resolvedAccount.phoneNumberId;
    wabaId = resolvedAccount.wabaId;
  } catch (error) {
    console.error('Meta signup account resolution failed:', {
      tenantId: req.user.tenantId,
      phoneNumberId: maskValue(phoneNumberId),
      wabaId: maskValue(wabaId),
      businessId: maskValue(businessId),
      ...safeMetaError(error),
    });

    return res.status(error.statusCode || 400).json({
      error: error.publicMessage || 'Unable to verify WhatsApp Business Account details from Meta signup. Connection was not saved.',
    });
  }

  let displayPhoneNumber = '';

  try {
    const phoneRes = await axios.get(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}`,
      {
        params: {
          fields: 'id,display_phone_number,verified_name',
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        timeout: 15000,
      },
    );

    if (String(phoneRes.data?.id || '') !== phoneNumberId) {
      return res.status(400).json({
        error: 'Meta signup phone verification failed. Connection was not saved.',
      });
    }

    displayPhoneNumber = phoneRes.data?.display_phone_number || phoneRes.data?.verified_name || '';
    displayPhoneNumber = displayPhoneNumber || resolvedAccount.displayPhoneNumber || '';
  } catch (error) {
    console.error('Meta phone lookup failed:', {
      tenantId: req.user.tenantId,
      phoneNumberId: maskValue(phoneNumberId),
      ...safeMetaError(error),
    });

    return res.status(400).json({
      error: 'Unable to verify the WhatsApp phone number from Meta signup. Connection was not saved.',
    });
  }

  try {
    await axios.post(
      `https://graph.facebook.com/${apiVersion}/${wabaId}/subscribed_apps`,
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        timeout: 15000,
      },
    );
  } catch (error) {
    console.error('Meta subscribed_apps failed:', {
      tenantId: req.user.tenantId,
      wabaId: maskValue(wabaId),
      ...safeMetaError(error),
    });

    return res.status(400).json({
      error: 'Unable to subscribe the WhatsApp business account to webhooks. Connection was not saved.',
    });
  }

  const existing = await query(
    `SELECT whatsapp_accounts.tenant_id, tenants.slug
     FROM whatsapp_accounts
     JOIN tenants ON tenants.id = whatsapp_accounts.tenant_id
     WHERE whatsapp_accounts.phone_number_id = $1
     LIMIT 1`,
    [phoneNumberId],
  );

  const existingAccount = existing.rows[0];

  if (existingAccount && existingAccount.tenant_id !== req.user.tenantId) {
    return res.status(409).json({
      error: `This WhatsApp phone number is already connected to tenant: ${existingAccount.slug}`,
    });
  }

  const encryptedToken = encryptSecret(accessToken);

  const accountResult = await query(
    `INSERT INTO whatsapp_accounts (
       tenant_id,
       phone_number_id,
       display_phone_number,
       waba_id,
       access_token_encrypted,
       access_token_iv,
       access_token_tag,
       token_type,
       active,
       connected_by,
       connected_at,
       updated_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,'business_integration_system_user',true,$8,now(),now())
     ON CONFLICT (phone_number_id)
     DO UPDATE SET
       tenant_id = EXCLUDED.tenant_id,
       display_phone_number = COALESCE(EXCLUDED.display_phone_number, whatsapp_accounts.display_phone_number),
       waba_id = EXCLUDED.waba_id,
       access_token_encrypted = EXCLUDED.access_token_encrypted,
       access_token_iv = EXCLUDED.access_token_iv,
       access_token_tag = EXCLUDED.access_token_tag,
       token_type = EXCLUDED.token_type,
       active = true,
       connected_by = EXCLUDED.connected_by,
       connected_at = now(),
       updated_at = now()
     RETURNING id, phone_number_id, display_phone_number, waba_id, active, connected_at`,
    [
      req.user.tenantId,
      phoneNumberId,
      displayPhoneNumber || null,
      wabaId,
      encryptedToken.encrypted,
      encryptedToken.iv,
      encryptedToken.tag,
      req.user.id,
    ],
  );

  await query(
    `UPDATE tenants
     SET onboarding_status = 'whatsapp_mapped',
         meta_business_id = COALESCE(NULLIF($2, ''), meta_business_id),
         updated_at = now()
     WHERE id = $1`,
    [req.user.tenantId, wabaId],
  );

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'whatsapp.embedded_signup_connected',
    entityType: 'whatsapp_account',
    entityId: accountResult.rows[0].id,
    metadata: {
      phoneNumberId: maskValue(phoneNumberId),
      wabaId: maskValue(wabaId),
      displayPhoneNumber,
    },
  });

  res.json({
    ok: true,
    account: {
      id: accountResult.rows[0].id,
      phoneNumberId: maskValue(accountResult.rows[0].phone_number_id || ''),
      displayPhoneNumber: accountResult.rows[0].display_phone_number || '',
      wabaId: maskValue(accountResult.rows[0].waba_id || ''),
      active: accountResult.rows[0].active,
      connectedAt: accountResult.rows[0].connected_at,
    },
  });
}));

app.post('/api/whatsapp/map-current-phone', requireAuth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  if (isProduction) {
    return res.status(403).json({
      error: 'Production WhatsApp connection must use Meta Embedded Signup. Env phone mapping is allowed only in local development.',
    });
  }

  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();

  if (!hasRealValue(phoneNumberId)) {
    return res.status(400).json({
      error: 'WHATSAPP_PHONE_NUMBER_ID is missing. Add it in backend environment variables first.',
    });
  }

  const displayPhoneNumber = String(req.body?.displayPhoneNumber || '').trim() || null;

  const existing = await query(
    `SELECT whatsapp_accounts.tenant_id, tenants.slug
     FROM whatsapp_accounts
     JOIN tenants ON tenants.id = whatsapp_accounts.tenant_id
     WHERE whatsapp_accounts.phone_number_id = $1
     LIMIT 1`,
    [phoneNumberId],
  );

  const existingAccount = existing.rows[0];

  if (existingAccount && existingAccount.tenant_id !== req.user.tenantId) {
    return res.status(409).json({
      error: `This WhatsApp phone number is already mapped to tenant: ${existingAccount.slug}`,
    });
  }

  const result = await query(
    `INSERT INTO whatsapp_accounts (tenant_id, phone_number_id, display_phone_number, active)
     VALUES ($1, $2, $3, true)
     ON CONFLICT (phone_number_id)
     DO UPDATE SET tenant_id = EXCLUDED.tenant_id,
                   display_phone_number = COALESCE(EXCLUDED.display_phone_number, whatsapp_accounts.display_phone_number),
                   active = true
     RETURNING tenant_id, phone_number_id, display_phone_number, active`,
    [req.user.tenantId, phoneNumberId, displayPhoneNumber],
  );

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'whatsapp.phone_mapped',
    entityType: 'whatsapp_account',
    entityId: null,
    metadata: {
      phoneNumberId: maskValue(phoneNumberId),
      displayPhoneNumber,
    },
  });

  res.json({
    ok: true,
    account: result.rows[0],
  });
}));

// =========================================================
// ROUTES — WEBHOOK
// =========================================================
}

module.exports = {
  registerCoreRoutes,
};
