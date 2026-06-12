// Merged route registrations. Kept as scoped modules to preserve original route logic.

const __coreRoutes = (() => {
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
    OUTBOUND_MEDIA_MAX_BYTES,
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

  const ALLOWED_TENANT_PLANS = new Set(['trial', 'premium', 'internal']);
  const ALLOWED_TENANT_STATUSES = new Set(['active', 'inactive', 'suspended']);

function signTotpLoginChallenge(user) {
  return require('jsonwebtoken').sign(
    {
      id: user.id,
      tenantId: user.tenant_id,
      name: user.name,
      email: user.email,
      role: user.role,
      totp_challenge: true,
    },
    jwtSecret,
    { expiresIn: '5m' },
  );
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

  function cleanPlatformPlan(value = 'trial') {
    const cleanValue = String(value || 'trial').trim().toLowerCase() || 'trial';
    if (cleanValue === 'starter') return 'trial';
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
['admin', 'super_admin'].includes(user.role)
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

app.post('/api/auth/forgot-password', rateLimit({
  bucketName: 'forgot-password',
  maxRequests: 5,
  windowMs: 60 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.json({ ok: true, message: 'If this email exists, reset instructions will be sent.' });
  }

  const userResult = await query(
    `SELECT users.id, users.tenant_id, users.email, users.active, tenants.status AS tenant_status
     FROM users
     JOIN tenants ON tenants.id = users.tenant_id
     WHERE lower(users.email) = $1
     LIMIT 1`,
    [email],
  );

  const user = userResult.rows[0];

  if (!user || !user.active || user.tenant_status !== 'active') {
    return res.json({ ok: true, message: 'If this email exists, reset instructions will be sent.' });
  }

  const plainToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
  const frontendUrl = String(process.env.FRONTEND_URL || '').trim().replace(/\/$/, '');
  const resetUrl = `${frontendUrl || 'http://localhost:5173'}/?resetToken=${plainToken}`;

  await query(
    `INSERT INTO password_reset_tokens
       (tenant_id, user_id, token_hash, expires_at, requested_ip)
     VALUES
       ($1, $2, $3, now() + interval '30 minutes', $4)`,
    [
      user.tenant_id,
      user.id,
      tokenHash,
      req.ip || req.headers['x-forwarded-for'] || '',
    ],
  );

  await recordAudit({
    tenantId: user.tenant_id,
    actorUserId: user.id,
    action: 'auth.password_reset_requested',
    entityType: 'user',
    entityId: user.id,
    metadata: {
      email: maskEmail(user.email),
    },
  });

  if (!isProduction) {
    return res.json({
      ok: true,
      message: 'Reset link generated for development.',
      resetUrl,
    });
  }

  console.log('Password reset requested:', {
    email: maskEmail(user.email),
    resetUrl,
  });

  return res.json({ ok: true, message: 'If this email exists, reset instructions will be sent.' });
}));

app.post('/api/auth/reset-password', rateLimit({
  bucketName: 'reset-password',
  maxRequests: 10,
  windowMs: 60 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  const token = String(req.body?.token || '').trim();
  const password = String(req.body?.password || '');

  if (!token || token.length < 32) {
    return res.status(400).json({ error: 'Invalid reset token' });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({ error: strongPasswordError() });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const resetResult = await query(
    `SELECT password_reset_tokens.id,
            password_reset_tokens.tenant_id,
            password_reset_tokens.user_id,
            users.email,
            users.active,
            tenants.status AS tenant_status
     FROM password_reset_tokens
     JOIN users ON users.id = password_reset_tokens.user_id
     JOIN tenants ON tenants.id = password_reset_tokens.tenant_id
     WHERE password_reset_tokens.token_hash = $1
       AND password_reset_tokens.used_at IS NULL
       AND password_reset_tokens.expires_at > now()
     LIMIT 1`,
    [tokenHash],
  );

  const reset = resetResult.rows[0];

  if (!reset || !reset.active || reset.tenant_status !== 'active') {
    return res.status(400).json({ error: 'Reset link is invalid or expired' });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  await query('BEGIN');

  try {
    await query(
      `UPDATE users
       SET password_hash = $3
       WHERE id = $1
         AND tenant_id = $2`,
      [reset.user_id, reset.tenant_id, passwordHash],
    );

    await query(
      `UPDATE password_reset_tokens
       SET used_at = now()
       WHERE id = $1`,
      [reset.id],
    );

    await query(
      `UPDATE password_reset_tokens
       SET used_at = now()
       WHERE user_id = $1
         AND used_at IS NULL`,
      [reset.user_id],
    );

    await recordAudit({
      tenantId: reset.tenant_id,
      actorUserId: reset.user_id,
      action: 'auth.password_reset_completed',
      entityType: 'user',
      entityId: reset.user_id,
      metadata: {
        email: maskEmail(reset.email),
      },
    });

    await query('COMMIT');
  } catch (error) {
    await query('ROLLBACK');
    throw error;
  }

  return res.json({ ok: true, message: 'Password reset successful. Please login again.' });
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
  (
    name,
    slug,
    industry,
    status,
    plan,
    subscription_status,
    trial_ends_at,
    subscription_ends_at,
    suspended_reason,
    business_email,
    onboarding_status,
    updated_at
  )
VALUES
  (
    $1,
    $2,
    $3,
    'active',
    'trial',
    'trial',
    now() + interval '14 days',
    NULL,
    NULL,
    $4,
    'admin_created',
    now()
  )
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
                jsonb_build_object('onboardingStatus', 'admin_created', 'plan', 'trial', 'nextStep', 'connect_whatsapp')
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

app.get('/api/me', requireAuth, asyncHandler(async (req, res) => {
  const tenantResult = await query(
    `SELECT
       status,
       plan,
       subscription_status,
       trial_ends_at,
       subscription_ends_at,
       suspended_reason
     FROM tenants
     WHERE id = $1
     LIMIT 1`,
    [req.user.tenantId],
  );

  const tenant = tenantResult.rows[0] || {};

  return res.json({
    ...req.user,
    tenant: {
      status: tenant.status || 'active',
      plan: tenant.plan || 'starter',
      subscriptionStatus: tenant.subscription_status || 'trial',
      trialEndsAt: tenant.trial_ends_at || null,
      subscriptionEndsAt: tenant.subscription_ends_at || null,
      suspendedReason: tenant.suspended_reason || '',
    },
  });
}));

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
       tenants.subscription_status,
       tenants.trial_ends_at,
       tenants.subscription_ends_at,
       tenants.suspended_reason,
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
  const cleanPlan = cleanPlatformPlan(req.body?.plan || 'trial');
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
     (
       name,
       slug,
       industry,
       status,
       plan,
       subscription_status,
       trial_ends_at,
       subscription_ends_at,
       suspended_reason,
       logo_url,
       business_phone,
       business_email,
       meta_business_id,
       onboarding_status,
       updated_at
     )
   VALUES
     (
       $1,
       $2,
       $3,
       $4,
       $5,
       'trial',
       now() + interval '14 days',
       NULL,
       NULL,
       $6,
       $7,
       $8,
       $9,
       'tenant_created',
       now()
     )
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

app.patch('/api/platform/tenants/:tenantId/subscription', requireAuth, requireSuperAdmin, rateLimit({
  bucketName: 'platform-update-subscription',
  maxRequests: 60,
  windowMs: 60 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  const tenantId = req.params.tenantId;
  const action = String(req.body?.action || '').trim().toLowerCase();
  const plan = cleanPlatformPlan(req.body?.plan || 'premium');
  const reason = cleanPlatformText(req.body?.reason || '', 300);

  const allowedActions = new Set(['activate', 'trial', 'expire', 'suspend', 'resume']);

  if (!allowedActions.has(action)) {
    return res.status(400).json({
      error: 'Invalid subscription action',
    });
  }

  if (!plan) {
    return res.status(400).json({
      error: 'Invalid tenant plan',
    });
  }

  const tenantResult = await query(
    `SELECT *
     FROM tenants
     WHERE id = $1
     LIMIT 1`,
    [tenantId],
  );

  const tenant = tenantResult.rows[0];

  if (!tenant) {
    return res.status(404).json({
      error: 'Client company not found',
    });
  }

  if (tenant.slug === 'platform') {
    return res.status(400).json({
      error: 'Platform tenant subscription cannot be changed from this route',
    });
  }

  let updateSql = '';
  let params = [];

  if (action === 'activate') {
    updateSql = `
      UPDATE tenants
      SET status = 'active',
          plan = $2,
          subscription_status = 'active',
          trial_ends_at = NULL,
          subscription_ends_at = now() + interval '30 days',
          suspended_reason = NULL,
          updated_at = now()
      WHERE id = $1
      RETURNING *
    `;
    params = [tenantId, plan];
  }

  if (action === 'trial') {
    updateSql = `
      UPDATE tenants
      SET status = 'active',
          plan = $2,
          subscription_status = 'trial',
          trial_ends_at = now() + interval '14 days',
          subscription_ends_at = NULL,
          suspended_reason = NULL,
          updated_at = now()
      WHERE id = $1
      RETURNING *
    `;
    params = [tenantId, plan];
  }

  if (action === 'expire') {
    updateSql = `
      UPDATE tenants
      SET subscription_status = 'expired',
          subscription_ends_at = now(),
          suspended_reason = COALESCE(NULLIF($2, ''), 'Subscription expired by platform admin'),
          updated_at = now()
      WHERE id = $1
      RETURNING *
    `;
    params = [tenantId, reason];
  }

  if (action === 'suspend') {
    updateSql = `
      UPDATE tenants
      SET status = 'suspended',
          subscription_status = 'suspended',
          suspended_reason = COALESCE(NULLIF($2, ''), 'Subscription suspended by platform admin'),
          updated_at = now()
      WHERE id = $1
      RETURNING *
    `;
    params = [tenantId, reason];
  }

  if (action === 'resume') {
    updateSql = `
      UPDATE tenants
      SET status = 'active',
          subscription_status = 'active',
          subscription_ends_at = COALESCE(subscription_ends_at, now() + interval '30 days'),
          suspended_reason = NULL,
          updated_at = now()
      WHERE id = $1
      RETURNING *
    `;
    params = [tenantId];
  }

  const updatedResult = await query(updateSql, params);
  const updatedTenant = updatedResult.rows[0];

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'platform.subscription_updated',
    entityType: 'tenant',
    entityId: tenantId,
    metadata: {
      clientTenantId: tenantId,
      clientTenantName: tenant.name,
      previousStatus: tenant.subscription_status || 'trial',
      newStatus: updatedTenant.subscription_status,
      previousPlan: tenant.plan,
      newPlan: updatedTenant.plan,
      action,
      reason,
    },
  });

  return res.json({
    ok: true,
    tenant: publicTenant(updatedTenant),
  });
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

  const supportExpiresAt = Date.now() + 30 * 60 * 1000;

setAuthCookie(res, {
  ...clientAdmin,
  supportMode: true,
  supportActorUserId: req.user.id,
  supportActorTenantId: req.user.tenantId,
  supportExpiresAt,
});

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
    maxOutboundMediaBytes: OUTBOUND_MEDIA_MAX_BYTES,
    maxOutboundMediaMb: Math.round((Number(OUTBOUND_MEDIA_MAX_BYTES || 0) / (1024 * 1024)) * 10) / 10,
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
    nextStep: securelyConnected ? 'use_workspace' : 'connect_whatsapp',
    processes: {
      customerOnboarding: {
        status: tenant.onboarding_status || 'pending',
        complete: ['admin_created', 'whatsapp_mapped', 'active'].includes(tenant.onboarding_status || ''),
      },
      wabaConnection: {
        status: securelyConnected ? 'whatsapp_mapped' : 'pending',
        complete: securelyConnected,
      },
    },
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
    [req.user.tenantId, businessId],
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
      businessId: maskValue(businessId),
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
    nextStep: 'use_workspace',
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

return { registerCoreRoutes };
})();

const __whatsappRoutes = (() => {
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
    enqueueWebhookEvent,
    webhookQueueAvailable,
    handleCustomerQuoteInbound,
    assertTenantLimit,
    getTenantLimits,
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

      if (!isProduction) {
        console.log('WA webhook change value:', {
          phoneNumberId: maskId(value?.metadata?.phone_number_id || ''),
          contactsCount: value?.contacts?.length || 0,
          messagesCount: value?.messages?.length || 0,
          statusesCount: value?.statuses?.length || 0,
        });
      }

      const tenantId = await getTenantIdForWebhookValue(value);

      if (!isProduction) {
        console.log('WA webhook tenant mapping:', {
          phoneNumberId: maskId(value?.metadata?.phone_number_id || ''),
          tenantId,
        });
      }

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
  if (!isProduction) {
    console.log('WA webhook received:', {
      object: req.body?.object || null,
      entries: req.body?.entry?.length || 0,
      hasSignature: Boolean(req.headers['x-hub-signature-256']),
    });
  }

  if (!verifyMetaWebhookSignature(req)) {
    console.warn('WA webhook rejected: invalid signature');
    return res.status(403).json({ error: 'Invalid webhook signature' });
  }

  const payload = req.body;
  const webhookEvent = await createWebhookEvent(payload);

  res.sendStatus(200);

  if (
    webhookQueueAvailable
    && typeof enqueueWebhookEvent === 'function'
  ) {
    try {
      await enqueueWebhookEvent({
        webhookEventId: webhookEvent.id,
        tenantId: webhookEvent.tenant_id,
      });

      return;
    } catch (error) {
      console.error('Webhook queue enqueue failed:', safeErrorLog(error));
    }
  }

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

      if (webhookEvent?.id) {
        await markWebhookEventFailed(webhookEvent.id, webhookEvent.tenant_id, error);
      }
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

  if (body.length > MAX_WHATSAPP_TEXT_LENGTH) {
    return res.status(400).json({
      error: `Inbound simulator message is too long. Maximum ${MAX_WHATSAPP_TEXT_LENGTH} characters allowed.`,
    });
  }
  const localMessageId = `local.${Date.now()}.${Math.random().toString(16).slice(2)}`;

  const result = await processInboundMessage({
    tenantId: req.user.tenantId,
    waId: cleanPhone,
    name: req.body.name || cleanPhone,
    body,
    waMessageId: localMessageId,
    rawPayload: {
      id: localMessageId,
      from: cleanPhone,
      timestamp: String(Math.floor(Date.now() / 1000)),
      type: 'text',
      text: {
        body,
      },
      localSimulator: true,
      createdBy: req.user.id,
    },
  });
  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'message.local_inbound_captured',
    entityType: 'contact',
    entityId: result.contact.id,
    metadata: { phone: maskValue(cleanPhone) },
  });
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
      to: maskValue(cleanTo),
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

app.post('/api/users', rateLimit({
  bucketName: 'user-create',
  maxRequests: 30,
  windowMs: 60 * 60 * 1000,
}), requireAuth, asyncHandler(async (req, res) => {
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

  await assertTenantLimit({
  tenantId: req.user.tenantId,
  resource: 'users',
  add: 1,
});

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
      email: maskEmail(cleanEmail),
      role: cleanRole,
    },
  });

  res.status(201).json(publicUser(result.rows[0]));
}));

app.patch('/api/users/:id', rateLimit({
  bucketName: 'user-update',
  maxRequests: 60,
  windowMs: 60 * 60 * 1000,
}), requireAuth, asyncHandler(async (req, res) => {
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

app.delete('/api/users/:id', rateLimit({
  bucketName: 'user-delete',
  maxRequests: 30,
  windowMs: 60 * 60 * 1000,
}), requireAuth, asyncHandler(async (req, res) => {
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
  email: maskEmail(result.rows[0].email),
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

app.post('/api/webhook-events/cleanup', rateLimit({
  bucketName: 'webhook-events-cleanup',
  maxRequests: 10,
  windowMs: 60 * 60 * 1000,
}), requireAuth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const retentionDays = Math.min(
    Math.max(Number(req.body?.retentionDays || process.env.WEBHOOK_EVENT_RETENTION_DAYS || 365), 90),
    3650,
  );

  const confirmDelete = String(req.body?.confirmDelete || '').trim();
  const deletionConfirmed = confirmDelete === 'DELETE_OLD_PROCESSED_WEBHOOK_EVENTS';

  const eligibleResult = await query(
    `SELECT COUNT(*)::int AS count
     FROM webhook_events
     WHERE tenant_id = $1
       AND status = 'processed'
       AND received_at < now() - ($2::int * interval '1 day')`,
    [req.user.tenantId, retentionDays],
  );

  let deletedCount = 0;

  if (deletionConfirmed) {
    const deleteResult = await query(
      `DELETE FROM webhook_events
       WHERE tenant_id = $1
         AND status = 'processed'
         AND received_at < now() - ($2::int * interval '1 day')
       RETURNING id`,
      [req.user.tenantId, retentionDays],
    );

    deletedCount = deleteResult.rowCount;
  }

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: deletionConfirmed ? 'webhook_events.cleanup_deleted' : 'webhook_events.cleanup_checked',
    entityType: 'webhook_event',
    entityId: null,
    metadata: {
      retentionDays,
      eligibleCount: eligibleResult.rows[0]?.count || 0,
      deletedCount,
      deletionConfirmed,
    },
  });

  res.json({
    ok: true,
    retentionDays,
    eligibleCount: eligibleResult.rows[0]?.count || 0,
    deletedCount,
    deletionConfirmed,
  });
}));

app.post('/api/webhook-events/recover-stuck', rateLimit({
  bucketName: 'webhook-events-recover-stuck',
  maxRequests: 20,
  windowMs: 60 * 60 * 1000,
}), requireAuth, asyncHandler(async (req, res) => {
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

app.post('/api/system/maintenance', rateLimit({
  bucketName: 'system-maintenance',
  maxRequests: 10,
  windowMs: 60 * 60 * 1000,
}), requireAuth, asyncHandler(async (req, res) => {
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

  const confirmDelete = String(req.body?.confirmDelete || '').trim();
  const deletionConfirmed = confirmDelete === 'DELETE_OLD_SYSTEM_RECORDS';

  const [eligibleWebhookEvents, eligibleOutboundMessages, recoveredStuckWebhooks] = await Promise.all([
    query(
      `SELECT COUNT(*)::int AS count
       FROM webhook_events
       WHERE tenant_id = $1
         AND status = 'processed'
         AND received_at < now() - ($2::int * interval '1 day')`,
      [req.user.tenantId, webhookRetentionDays],
    ),
    query(
      `SELECT COUNT(*)::int AS count
       FROM outbound_messages
       WHERE tenant_id = $1
         AND status = 'sent'
         AND created_at < now() - ($2::int * interval '1 day')`,
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

  let deletedWebhookEvents = { rowCount: 0 };
  let deletedOutboundMessages = { rowCount: 0 };

  if (deletionConfirmed) {
    [deletedWebhookEvents, deletedOutboundMessages] = await Promise.all([
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
    ]);
  }

  const result = {
    webhookRetentionDays,
    outboundRetentionDays,
    stuckMinutes,
    eligibleWebhookEvents: eligibleWebhookEvents.rows[0]?.count || 0,
    eligibleOutboundMessages: eligibleOutboundMessages.rows[0]?.count || 0,
    deletedWebhookEvents: deletedWebhookEvents.rowCount,
    deletedOutboundMessages: deletedOutboundMessages.rowCount,
    recoveredStuckWebhooks: recoveredStuckWebhooks.rowCount,
    deletionConfirmed,
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

app.get('/api/billing/summary', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) {
    return res.status(403).json({ error: 'Manager/Admin only' });
  }

  const tenantResult = await query(
    `SELECT
       id,
       name,
       slug,
       status,
       plan,
       subscription_status,
       trial_ends_at,
       subscription_ends_at,
       suspended_reason,
       business_email,
       business_phone
     FROM tenants
     WHERE id = $1
     LIMIT 1`,
    [req.user.tenantId],
  );

  const tenant = tenantResult.rows[0];

  if (!tenant) {
    return res.status(404).json({ error: 'Company account not found' });
  }

  const limits = await getTenantLimits(req.user.tenantId);

  const [
    users,
    contacts,
    templates,
    products,
    outboundToday,
    outboundMonth,
    campaignsMonth,
  ] = await Promise.all([
    query(`SELECT COUNT(*)::int AS count FROM users WHERE tenant_id = $1 AND active = true`, [req.user.tenantId]),
    query(`SELECT COUNT(*)::int AS count FROM contacts WHERE tenant_id = $1`, [req.user.tenantId]),
    query(`SELECT COUNT(*)::int AS count FROM whatsapp_templates WHERE tenant_id = $1`, [req.user.tenantId]),
    query(`SELECT COUNT(*)::int AS count FROM products WHERE tenant_id = $1`, [req.user.tenantId]),
    query(
      `SELECT COUNT(*)::int AS count
       FROM outbound_messages
       WHERE tenant_id = $1
         AND created_at >= now() - interval '24 hours'`,
      [req.user.tenantId],
    ),
    query(
      `SELECT COUNT(*)::int AS count
       FROM outbound_messages
       WHERE tenant_id = $1
         AND created_at >= date_trunc('month', now())`,
      [req.user.tenantId],
    ),
    query(
      `SELECT COUNT(*)::int AS count
       FROM campaigns
       WHERE tenant_id = $1
         AND created_at >= date_trunc('month', now())`,
      [req.user.tenantId],
    ),
  ]);

  let blockedReason = '';

  if (tenant.status === 'suspended') blockedReason = tenant.suspended_reason || 'Company account suspended';
  if (tenant.status === 'inactive') blockedReason = 'Company account inactive';
  if (tenant.subscription_status === 'suspended') blockedReason = tenant.suspended_reason || 'Subscription suspended';
  if (tenant.subscription_status === 'expired') blockedReason = tenant.suspended_reason || 'Subscription expired';

  if (
    tenant.subscription_status === 'trial'
    && tenant.trial_ends_at
    && new Date(tenant.trial_ends_at).getTime() < Date.now()
  ) {
    blockedReason = 'Trial expired';
  }

  if (
    tenant.subscription_status === 'active'
    && tenant.subscription_ends_at
    && new Date(tenant.subscription_ends_at).getTime() < Date.now()
  ) {
    blockedReason = 'Subscription expired';
  }

  return res.json({
    tenant: {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      plan: tenant.plan || limits.plan,
      subscriptionStatus: tenant.subscription_status || 'trial',
      trialEndsAt: tenant.trial_ends_at || null,
      subscriptionEndsAt: tenant.subscription_ends_at || null,
      suspendedReason: tenant.suspended_reason || '',
      businessEmail: tenant.business_email || '',
      businessPhone: tenant.business_phone || '',
    },
    plan: tenant.plan || limits.plan,
    subscriptionStatus: tenant.subscription_status || 'trial',
    trialEndsAt: tenant.trial_ends_at || null,
    subscriptionEndsAt: tenant.subscription_ends_at || null,
    limits,
    usage: {
      users: users.rows[0]?.count || 0,
      contacts: contacts.rows[0]?.count || 0,
      templates: templates.rows[0]?.count || 0,
      products: products.rows[0]?.count || 0,
      outboundMessagesToday: outboundToday.rows[0]?.count || 0,
      outboundMessagesThisMonth: outboundMonth.rows[0]?.count || 0,
      campaignsThisMonth: campaignsMonth.rows[0]?.count || 0,
    },
    blocked: Boolean(blockedReason),
    blockedReason,
  });
}));

app.get('/api/tenant/usage', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) {
    return res.status(403).json({ error: 'Manager/Admin only' });
  }

  const limits = await getTenantLimits(req.user.tenantId);

  const [users, contacts, templates, products, outboundToday] = await Promise.all([
    query(`SELECT COUNT(*)::int AS count FROM users WHERE tenant_id = $1 AND active = true`, [req.user.tenantId]),
    query(`SELECT COUNT(*)::int AS count FROM contacts WHERE tenant_id = $1`, [req.user.tenantId]),
    query(`SELECT COUNT(*)::int AS count FROM whatsapp_templates WHERE tenant_id = $1`, [req.user.tenantId]),
    query(`SELECT COUNT(*)::int AS count FROM products WHERE tenant_id = $1`, [req.user.tenantId]),
    query(
      `SELECT COUNT(*)::int AS count
       FROM outbound_messages
       WHERE tenant_id = $1
         AND created_at >= now() - interval '24 hours'`,
      [req.user.tenantId],
    ),
  ]);

  res.json({
    plan: limits.plan,
    limits,
    usage: {
      users: users.rows[0]?.count || 0,
      contacts: contacts.rows[0]?.count || 0,
      templates: templates.rows[0]?.count || 0,
      products: products.rows[0]?.count || 0,
      outboundMessagesToday: outboundToday.rows[0]?.count || 0,
    },
  });
}));

app.post('/api/webhook-events/:id/retry', rateLimit({
  bucketName: 'webhook-event-retry',
  maxRequests: 60,
  windowMs: 60 * 60 * 1000,
}), requireAuth, asyncHandler(async (req, res) => {
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

app.post('/api/outbound-messages/:id/retry', rateLimit({
  bucketName: 'outbound-message-retry',
  maxRequests: 60,
  windowMs: 60 * 60 * 1000,
}), requireAuth, asyncHandler(async (req, res) => {
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
       AND retryable = true
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

  ctx.processWhatsAppWebhookPayload = processWhatsAppWebhookPayload;
  ctx.markWebhookEventProcessing = markWebhookEventProcessing;
  ctx.markWebhookEventProcessed = markWebhookEventProcessed;
  ctx.markWebhookEventFailed = markWebhookEventFailed;

}

return { registerWhatsAppRoutes };
})();

const __crmRoutes = (() => {
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
    mediaStorage,
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
    buildWhatsAppMediaPayload,
    mediaTypeFromMime,
    uploadWhatsAppMedia,
    sendWhatsAppMedia,
    mediaUpload,
    OUTBOUND_MEDIA_MAX_BYTES,
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
    assertTenantLimit,
  } = ctx;

  function formatBytes(bytes = 0) {
    const value = Number(bytes || 0);
    if (!Number.isFinite(value) || value <= 0) return '0 MB';
    return `${Math.round((value / (1024 * 1024)) * 10) / 10} MB`;
  }

  function handleMediaUpload(req, res, next) {
    mediaUpload.single('mediaFile')(req, res, (error) => {
      if (!error) return next();

      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          error: `Media file is too large. Maximum ${formatBytes(OUTBOUND_MEDIA_MAX_BYTES)} is allowed.`,
          code: 'MEDIA_FILE_TOO_LARGE',
          maxBytes: OUTBOUND_MEDIA_MAX_BYTES,
        });
      }

      if (String(error.message || '').includes('Unsupported media file type')) {
        return res.status(400).json({
          error: 'Unsupported media file type. Choose JPG, PNG, WebP, MP4, 3GP, audio, PDF, Office document, or text file.',
          code: 'MEDIA_FILE_TYPE_UNSUPPORTED',
        });
      }

      return next(error);
    });
  }

  async function requireActiveTenantSubscription(req, res, next) {
  if (!req.user?.tenantId) {
    return res.status(401).json({ error: 'Login required' });
  }

  if (req.user.role === 'super_admin' || req.user.supportMode) {
    return next();
  }

  const tenantResult = await query(
    `SELECT id, status, plan, subscription_status, trial_ends_at, subscription_ends_at, suspended_reason
     FROM tenants
     WHERE id = $1
     LIMIT 1`,
    [req.user.tenantId],
  );

  const tenant = tenantResult.rows[0];

  if (!tenant) {
    return res.status(403).json({ error: 'Company account not found' });
  }

  if (tenant.status !== 'active') {
    return res.status(403).json({
      error: 'Company account is inactive',
      subscriptionStatus: tenant.subscription_status || 'unknown',
      suspendedReason: tenant.suspended_reason || '',
    });
  }

  if (tenant.subscription_status === 'suspended') {
    return res.status(402).json({
      error: 'Subscription suspended',
      subscriptionStatus: 'suspended',
      suspendedReason: tenant.suspended_reason || '',
    });
  }

  if (tenant.subscription_status === 'expired') {
    return res.status(402).json({
      error: 'Subscription expired',
      subscriptionStatus: 'expired',
      suspendedReason: tenant.suspended_reason || '',
    });
  }

  return next();
}

function cleanAutoReplyText(value = '', maxLength = 1000) {
  return String(value || '').trim().slice(0, maxLength);
}

function cleanAutoReplyTriggerType(value = 'contains') {
  const cleanValue = String(value || 'contains').trim().toLowerCase();
  return ['contains', 'starts_with', 'exact'].includes(cleanValue) ? cleanValue : null;
}

app.get('/api/auto-reply-rules', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) {
    return res.status(403).json({ error: 'Manager/Admin only' });
  }

  const result = await query(
    `SELECT id, name, trigger_type, trigger_value, reply_text, priority,
            active, send_once_per_contact, created_at, updated_at
     FROM auto_reply_rules
     WHERE tenant_id = $1
     ORDER BY priority ASC, updated_at DESC
     LIMIT 200`,
    [req.user.tenantId],
  );

  res.json(result.rows);
}));

app.post('/api/auto-reply-rules', requireAuth, rateLimit({
  bucketName: 'auto-reply-rule-create',
  maxRequests: 60,
  windowMs: 60 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const name = cleanAutoReplyText(req.body?.name, 120);
  const triggerType = cleanAutoReplyTriggerType(req.body?.triggerType || req.body?.trigger_type);
  const triggerValue = cleanAutoReplyText(req.body?.triggerValue || req.body?.trigger_value, 300);
  const replyText = cleanAutoReplyText(req.body?.replyText || req.body?.reply_text, MAX_WHATSAPP_TEXT_LENGTH);
  const priority = Math.min(Math.max(Number(req.body?.priority || 100), 1), 10000);
  const active = req.body?.active === undefined ? true : Boolean(req.body.active);
  const sendOncePerContact = Boolean(req.body?.sendOncePerContact || req.body?.send_once_per_contact);

  if (!name) {
    return res.status(400).json({ error: 'Rule name is required' });
  }

  if (!triggerType) {
    return res.status(400).json({ error: 'Invalid trigger type' });
  }

  if (triggerValue.length < 2) {
    return res.status(400).json({ error: 'Trigger value must be at least 2 characters' });
  }

  if (replyText.length < 2) {
    return res.status(400).json({ error: 'Reply text must be at least 2 characters' });
  }

  const result = await query(
    `INSERT INTO auto_reply_rules
       (tenant_id, name, trigger_type, trigger_value, reply_text, priority,
        active, send_once_per_contact, created_by, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, now())
     RETURNING id, name, trigger_type, trigger_value, reply_text, priority,
               active, send_once_per_contact, created_at, updated_at`,
    [
      req.user.tenantId,
      name,
      triggerType,
      triggerValue,
      replyText,
      priority,
      active,
      sendOncePerContact,
      req.user.id,
    ],
  );

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'auto_reply_rule.created',
    entityType: 'auto_reply_rule',
    entityId: result.rows[0].id,
    metadata: {
      name,
      triggerType,
      priority,
      active,
      sendOncePerContact,
    },
  });

  res.status(201).json(result.rows[0]);
}));

app.patch('/api/auto-reply-rules/:id', requireAuth, rateLimit({
  bucketName: 'auto-reply-rule-update',
  maxRequests: 120,
  windowMs: 60 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const existingResult = await query(
    `SELECT *
     FROM auto_reply_rules
     WHERE id = $1
       AND tenant_id = $2
     LIMIT 1`,
    [req.params.id, req.user.tenantId],
  );

  const existing = existingResult.rows[0];

  if (!existing) {
    return res.status(404).json({ error: 'Auto reply rule not found' });
  }

  const name = req.body?.name !== undefined
    ? cleanAutoReplyText(req.body.name, 120)
    : existing.name;

  const triggerType = req.body?.triggerType !== undefined || req.body?.trigger_type !== undefined
    ? cleanAutoReplyTriggerType(req.body?.triggerType || req.body?.trigger_type)
    : existing.trigger_type;

  const triggerValue = req.body?.triggerValue !== undefined || req.body?.trigger_value !== undefined
    ? cleanAutoReplyText(req.body?.triggerValue || req.body?.trigger_value, 300)
    : existing.trigger_value;

  const replyText = req.body?.replyText !== undefined || req.body?.reply_text !== undefined
    ? cleanAutoReplyText(req.body?.replyText || req.body?.reply_text, MAX_WHATSAPP_TEXT_LENGTH)
    : existing.reply_text;

  const priority = req.body?.priority !== undefined
    ? Math.min(Math.max(Number(req.body.priority || 100), 1), 10000)
    : existing.priority;

  const active = req.body?.active !== undefined ? Boolean(req.body.active) : existing.active;

  const sendOncePerContact = req.body?.sendOncePerContact !== undefined || req.body?.send_once_per_contact !== undefined
    ? Boolean(req.body?.sendOncePerContact || req.body?.send_once_per_contact)
    : existing.send_once_per_contact;

  if (!name) {
    return res.status(400).json({ error: 'Rule name is required' });
  }

  if (!triggerType) {
    return res.status(400).json({ error: 'Invalid trigger type' });
  }

  if (triggerValue.length < 2) {
    return res.status(400).json({ error: 'Trigger value must be at least 2 characters' });
  }

  if (replyText.length < 2) {
    return res.status(400).json({ error: 'Reply text must be at least 2 characters' });
  }

  const result = await query(
    `UPDATE auto_reply_rules
     SET name = $3,
         trigger_type = $4,
         trigger_value = $5,
         reply_text = $6,
         priority = $7,
         active = $8,
         send_once_per_contact = $9,
         updated_by = $10,
         updated_at = now()
     WHERE id = $1
       AND tenant_id = $2
     RETURNING id, name, trigger_type, trigger_value, reply_text, priority,
               active, send_once_per_contact, created_at, updated_at`,
    [
      req.params.id,
      req.user.tenantId,
      name,
      triggerType,
      triggerValue,
      replyText,
      priority,
      active,
      sendOncePerContact,
      req.user.id,
    ],
  );

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'auto_reply_rule.updated',
    entityType: 'auto_reply_rule',
    entityId: result.rows[0].id,
    metadata: {
      changedFields: Object.keys(req.body || {}),
      active,
      priority,
    },
  });

  res.json(result.rows[0]);
}));

app.delete('/api/auto-reply-rules/:id', requireAuth, rateLimit({
  bucketName: 'auto-reply-rule-delete',
  maxRequests: 60,
  windowMs: 60 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const result = await query(
    `DELETE FROM auto_reply_rules
     WHERE id = $1
       AND tenant_id = $2
     RETURNING id, name`,
    [req.params.id, req.user.tenantId],
  );

  const deleted = result.rows[0];

  if (!deleted) {
    return res.status(404).json({ error: 'Auto reply rule not found' });
  }

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'auto_reply_rule.deleted',
    entityType: 'auto_reply_rule',
    entityId: deleted.id,
    metadata: {
      name: deleted.name,
    },
  });

  res.json({ ok: true, deleted });
}));

app.use('/api', requireAuth, asyncHandler(requireActiveTenantSubscription));

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
  const {
    text,
    templateName,
    language,
    mediaType,
    mediaUrl,
    caption,
    fileName,
  } = req.body;

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
  const cleanMediaType = String(mediaType || '').trim().toLowerCase();
  const cleanMediaUrl = String(mediaUrl || '').trim();
  const cleanCaption = String(caption || '').trim();
  const cleanFileName = String(fileName || '').trim();

  const hasText = Boolean(cleanText);
  const hasTemplate = Boolean(cleanTemplateName);
  const hasMedia = Boolean(cleanMediaType || cleanMediaUrl);

  const sendModeCount = [hasText, hasTemplate, hasMedia].filter(Boolean).length;

  if (sendModeCount === 0) {
    return res.status(400).json({ error: 'Message text, template, or media is required' });
  }

  if (sendModeCount > 1) {
    return res.status(400).json({ error: 'Send only one message type at a time: text, template, or media' });
  }

  if (hasText && cleanText.length > MAX_WHATSAPP_TEXT_LENGTH) {
    return res.status(400).json({
      error: `WhatsApp text message is too long. Maximum ${MAX_WHATSAPP_TEXT_LENGTH} characters allowed.`,
    });
  }

  const replyWindowOpen = isReplyWindowOpen(contact);

  if (!replyWindowOpen && !hasTemplate) {
    return res.status(400).json({
      error: '24-hour reply window expired. Use an approved WhatsApp template.',
    });
  }

  let templateRecord = null;

  if (hasTemplate) {
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

  const allowedMediaTypes = new Set(['image', 'document', 'video', 'audio']);
  let safeMediaUrl = '';

  if (hasMedia) {
    if (!allowedMediaTypes.has(cleanMediaType)) {
      return res.status(400).json({
        error: 'Invalid media type. Allowed types: image, document, video, audio.',
      });
    }

    if (!cleanMediaUrl) {
      return res.status(400).json({ error: 'Media URL is required' });
    }

    if (cleanMediaUrl.length > 2000) {
      return res.status(400).json({ error: 'Media URL is too long' });
    }

    let parsedUrl;

    try {
      parsedUrl = new URL(cleanMediaUrl);
    } catch {
      return res.status(400).json({ error: 'Media URL must be a valid HTTPS URL' });
    }

    if (parsedUrl.protocol !== 'https:') {
      return res.status(400).json({ error: 'Media URL must use HTTPS' });
    }

    const host = parsedUrl.hostname.toLowerCase();

    if (
      host === 'localhost'
      || host.endsWith('.local')
      || host === '127.0.0.1'
      || host === '0.0.0.0'
      || host.startsWith('10.')
      || host.startsWith('192.168.')
      || /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
    ) {
      return res.status(400).json({
        error: 'Private or localhost media URLs are not allowed. Use a public HTTPS media URL.',
      });
    }

    if (cleanCaption.length > 1024) {
      return res.status(400).json({ error: 'Media caption maximum 1024 characters allowed' });
    }

    if (cleanMediaType === 'audio' && cleanCaption) {
      return res.status(400).json({ error: 'Audio messages do not support captions in this composer' });
    }

    if (cleanFileName.length > 240) {
      return res.status(400).json({ error: 'File name maximum 240 characters allowed' });
    }

    safeMediaUrl = parsedUrl.toString();
  }

  let waMessageId = null;
  let body = cleanText;
  let type = 'text';
  let outboundPayload = null;

  if (hasTemplate) {
    type = 'template';
    body = `[Template] ${cleanTemplateName}`;
    outboundPayload = {
      messaging_product: 'whatsapp',
      to: contact.wa_id,
      type: 'template',
      template: {
        name: cleanTemplateName,
        language: { code: cleanLanguage },
      },
    };
  } else if (hasMedia) {
    type = cleanMediaType;
    body = cleanCaption || `[${cleanMediaType}] ${cleanFileName || safeMediaUrl}`;
    outboundPayload = buildWhatsAppMediaPayload({
      contact,
      mediaType: cleanMediaType,
      mediaUrl: safeMediaUrl,
      caption: cleanCaption,
      fileName: cleanFileName,
    });
  } else {
    outboundPayload = {
      messaging_product: 'whatsapp',
      to: contact.wa_id,
      type: 'text',
      text: { body: cleanText },
    };
  }

  const outboundRecord = await createOutboundMessageRecord({
    tenantId: req.user.tenantId,
    contactId: contact.id,
    toPhone: contact.wa_id || contact.phone,
    messageType: type,
    templateName: cleanTemplateName || null,
    language: hasTemplate ? cleanLanguage : null,
    body,
    payload: outboundPayload,
    createdBy: req.user.id,
  });

  await markOutboundSending(outboundRecord?.id, req.user.tenantId);

  try {
    if (hasTemplate) {
      waMessageId = await sendWhatsAppTemplate(contact, cleanTemplateName, cleanLanguage, req.user.tenantId);
    } else if (hasMedia) {
      waMessageId = await sendWhatsAppMedia(contact, outboundPayload, req.user.tenantId);
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

  const status = waMessageId ? 'accepted' : 'queued-local';

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
    rawPayload: outboundPayload,
    mediaUrl: hasMedia ? safeMediaUrl : null,
    caption: hasMedia ? cleanCaption : null,
    fileName: hasMedia ? cleanFileName : null,
    normalizedText: body,
  });

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: hasMedia ? 'message.media_sent' : 'message.sent',
    entityType: 'message',
    entityId: message?.id,
    metadata: {
      contactId: contact.id,
      status,
      type,
      replyWindowOpen,
      templateId: templateRecord?.id || null,
      mediaType: hasMedia ? cleanMediaType : null,
      hasCaption: Boolean(cleanCaption),
      outboundMessageId: outboundRecord?.id || null,
    },
  });

  res.status(201).json(message);
}));

app.post('/api/conversations/:id/messages/media-upload', rateLimit({
  bucketName: 'conversation-media-upload-send',
  maxRequests: 60,
  windowMs: 60 * 60 * 1000,
}), requireAuth, handleMediaUpload, asyncHandler(async (req, res) => {
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

  const replyWindowOpen = isReplyWindowOpen(contact);

  if (!replyWindowOpen) {
    return res.status(400).json({
      error: '24-hour reply window expired. Media messages are not allowed. Use an approved WhatsApp template.',
    });
  }

  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: 'Media file is required' });
  }

  const caption = String(req.body?.caption || '').trim();
  const requestedMediaType = String(req.body?.mediaType || '').trim().toLowerCase();
  const detectedMediaType = mediaTypeFromMime(file.mimetype);
  const mediaType = requestedMediaType || detectedMediaType;
  const fileName = String(req.body?.fileName || file.originalname || 'upload').trim().slice(0, 240);

  const allowedMediaTypes = new Set(['image', 'document', 'video', 'audio']);

  if (!allowedMediaTypes.has(mediaType)) {
    return res.status(400).json({
      error: 'Invalid media type. Allowed types: image, document, video, audio.',
    });
  }

  if (mediaType !== detectedMediaType && !(mediaType === 'document' && detectedMediaType === 'document')) {
    return res.status(400).json({
      error: `Selected media type does not match uploaded file type. Detected ${detectedMediaType}.`,
    });
  }

  if (caption.length > 1024) {
    return res.status(400).json({ error: 'Media caption maximum 1024 characters allowed' });
  }

  if (mediaType === 'audio' && caption) {
    return res.status(400).json({ error: 'Audio messages do not support captions in this composer' });
  }

  const storedMedia = await mediaStorage.putTenantMediaObject({
    tenantId: req.user.tenantId,
    buffer: file.buffer,
    fileName,
    mimeType: file.mimetype,
    source: 'whatsapp-outbound',
  });

  const mediaId = await uploadWhatsAppMedia({
    tenantId: req.user.tenantId,
    buffer: file.buffer,
    fileName,
    mimeType: file.mimetype,
  });

  if (!mediaId && !shouldAllowLocalMessageQueue()) {
    return res.status(400).json({ error: 'WhatsApp media upload failed.' });
  }

  const outboundPayload = buildWhatsAppMediaPayload({
    contact,
    mediaType,
    mediaId,
    caption,
    fileName,
  });

  const body = caption || `[${mediaType}] ${fileName}`;

  const outboundRecord = await createOutboundMessageRecord({
    tenantId: req.user.tenantId,
    contactId: contact.id,
    toPhone: contact.wa_id || contact.phone,
    messageType: mediaType,
    body,
    payload: outboundPayload,
    createdBy: req.user.id,
  });

  await markOutboundSending(outboundRecord?.id, req.user.tenantId);

  let waMessageId = null;

  try {
    waMessageId = await sendWhatsAppMedia(contact, outboundPayload, req.user.tenantId);
    await markOutboundSent(outboundRecord?.id, req.user.tenantId, waMessageId);
  } catch (error) {
    await markOutboundFailed(outboundRecord?.id, req.user.tenantId, error);

    return res.status(400).json({
      error: error.response?.data?.error?.message || error.message || 'WhatsApp media message failed',
      outboundMessageId: outboundRecord?.id || null,
    });
  }

  const status = waMessageId ? 'accepted' : 'queued-local';

  if (!waMessageId && !shouldAllowLocalMessageQueue()) {
    return res.status(400).json({ error: 'WhatsApp media message was not sent.' });
  }

  const message = await addMessage({
    tenantId: req.user.tenantId,
    contactId: contact.id,
    waMessageId,
    direction: 'outbound',
    type: mediaType,
    body,
    status,
    rawPayload: outboundPayload,
    mediaId,
    mediaUrl: storedMedia.mediaUrl,
    mediaLocalPath: storedMedia.mediaLocalPath,
    mediaStorageProvider: storedMedia.provider,
    mediaStorageKey: storedMedia.storageKey,
    caption,
    mimeType: file.mimetype,
    fileName,
    fileSize: file.size,
    normalizedText: body,
  });

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'message.media_file_sent',
    entityType: 'message',
    entityId: message?.id,
    metadata: {
      contactId: contact.id,
      status,
      type: mediaType,
      replyWindowOpen,
      mediaId: maskId(mediaId || ''),
      fileName,
      mimeType: file.mimetype,
      fileSize: file.size,
      storageProvider: storedMedia.provider,
      outboundMessageId: outboundRecord?.id || null,
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

  await assertTenantLimit({
  tenantId: req.user.tenantId,
  resource: 'templates',
  add: 1,
});

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

return { registerCrmRoutes };
})();

const __salesRoutes = (() => {
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

    const MAX_SALES_ITEMS_PER_DOCUMENT = 50;
  const MAX_SALES_NOTES_LENGTH = 2000;

  function cleanSalesText(value = '', maxLength = 500) {
    return String(value || '').trim().slice(0, maxLength);
  }

  function cleanSalesSource(value = '', fallback = 'WhatsApp') {
    const cleanValue = cleanSalesText(value, 80);
    return cleanValue || fallback;
  }

  function cleanSalesDate(value = '') {
    const rawValue = String(value || '').trim();

    if (!rawValue) return null;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
      return { error: 'Date must be in YYYY-MM-DD format' };
    }

    const date = new Date(`${rawValue}T00:00:00.000Z`);

    if (Number.isNaN(date.getTime())) {
      return { error: 'Invalid date' };
    }

    const today = new Date();
    const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    if (date < todayUtc) {
      return { error: 'Date cannot be in the past' };
    }

    return rawValue;
  }

  function normalizeSalesPayloadItems(body = {}, fallbackDescription = 'Manual item') {
    const rawItems = Array.isArray(body.items) && body.items.length
      ? body.items
      : [{
          description: body.notes || fallbackDescription,
          quantity: 1,
          rate: toFiniteNumber(body.amount, 0),
        }];

    if (rawItems.length > MAX_SALES_ITEMS_PER_DOCUMENT) {
      return {
        error: `Maximum ${MAX_SALES_ITEMS_PER_DOCUMENT} items allowed`,
      };
    }

    const items = rawItems.map(normalizeSalesItem);

    for (const [index, item] of items.entries()) {
      if (!cleanSalesText(item.description, 500)) {
        return { error: `Item ${index + 1} description is required` };
      }

      if (Number(item.quantity || 0) <= 0) {
        return { error: `Item ${index + 1} quantity must be greater than zero` };
      }

      if (Number(item.rate || 0) < 0) {
        return { error: `Item ${index + 1} rate cannot be negative` };
      }

      if (Number(item.amount || 0) < 0) {
        return { error: `Item ${index + 1} amount cannot be negative` };
      }
    }

    if (sumItems(items) <= 0) {
      return {
        error: 'Total amount must be greater than zero',
      };
    }

    return { items };
  }

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
  const contactId = String(req.body?.contact_id || '').trim();

  if (!contactId) {
    return res.status(400).json({ error: 'Quotation contact is required' });
  }

  if (!(await canAccessContactId(req.user, contactId))) {
    return res.status(403).json({ error: 'Quotation contact assigned to another user' });
  }

  const itemResult = normalizeSalesPayloadItems(req.body, 'Manual quotation item');

  if (itemResult.error) {
    return res.status(400).json({ error: itemResult.error });
  }

  const validUntil = cleanSalesDate(req.body?.valid_until);

  if (validUntil?.error) {
    return res.status(400).json({ error: `Quotation valid until: ${validUntil.error}` });
  }

  const notes = cleanSalesText(req.body?.notes, MAX_SALES_NOTES_LENGTH);
  const source = cleanSalesSource(req.body?.source, 'WhatsApp');

  const quote = await createQuotation({
    tenantId: req.user.tenantId,
    contactId,
    notes,
    items: itemResult.items,
    source,
    validUntil,
  });

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'quotation.created',
    entityType: 'quotation',
    entityId: quote.id,
    metadata: {
      contactId,
      source,
      itemCount: itemResult.items.length,
      amount: quote.amount,
    },
  });

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

  const allowedPaymentStatuses = new Set(['pending', 'partial', 'paid', 'overdue', 'cancelled']);
  const allowedDispatchStatuses = new Set(['pending', 'packed', 'dispatched', 'delivered', 'cancelled']);

  const paymentStatus = String(req.body?.payment_status || 'pending').trim().toLowerCase();
  const dispatchStatus = String(req.body?.dispatch_status || 'pending').trim().toLowerCase();

  if (!allowedPaymentStatuses.has(paymentStatus)) {
    return res.status(400).json({ error: 'Invalid payment status' });
  }

  if (!allowedDispatchStatuses.has(dispatchStatus)) {
    return res.status(400).json({ error: 'Invalid dispatch status' });
  }

  const order = await createSalesOrder({
    tenantId: req.user.tenantId,
    contactId: quote.contact_id,
    notes: cleanSalesText(req.body?.notes, MAX_SALES_NOTES_LENGTH) || `Converted from quotation ${quote.quote_no}`,
    items: itemResult.rows,
    source: 'WhatsApp Quote',
    paymentStatus,
    dispatchStatus,
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
  const contactId = String(req.body?.contact_id || '').trim();

  if (!contactId) {
    return res.status(400).json({ error: 'Order contact is required' });
  }

  if (!(await canAccessContactId(req.user, contactId))) {
    return res.status(403).json({ error: 'Order contact assigned to another user' });
  }

  const itemResult = normalizeSalesPayloadItems(req.body, 'Manual order item');

  if (itemResult.error) {
    return res.status(400).json({ error: itemResult.error });
  }

  const allowedPaymentStatuses = new Set(['pending', 'partial', 'paid', 'overdue', 'cancelled']);
  const allowedDispatchStatuses = new Set(['pending', 'packed', 'dispatched', 'delivered', 'cancelled']);

  const paymentStatus = String(req.body?.payment_status || 'pending').trim().toLowerCase();
  const dispatchStatus = String(req.body?.dispatch_status || 'pending').trim().toLowerCase();

  if (!allowedPaymentStatuses.has(paymentStatus)) {
    return res.status(400).json({ error: 'Invalid payment status' });
  }

  if (!allowedDispatchStatuses.has(dispatchStatus)) {
    return res.status(400).json({ error: 'Invalid dispatch status' });
  }

  const notes = cleanSalesText(req.body?.notes, MAX_SALES_NOTES_LENGTH);
  const source = cleanSalesSource(req.body?.source, 'WhatsApp');

  const order = await createSalesOrder({
    tenantId: req.user.tenantId,
    contactId,
    notes,
    items: itemResult.items,
    source,
    paymentStatus,
    dispatchStatus,
  });

  await recordAudit({
    tenantId: req.user.tenantId,
    actorUserId: req.user.id,
    action: 'order.created',
    entityType: 'sales_order',
    entityId: order.id,
    metadata: {
      contactId,
      source,
      itemCount: itemResult.items.length,
      amount: order.amount,
      paymentStatus,
      dispatchStatus,
    },
  });

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

return { registerSalesRoutes };
})();

const __campaignRoutes = (() => {
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

return { registerCampaignRoutes };
})();

const __tallyRoutes = (() => {
function registerTallyRoutes(app, ctx) {
  const {
    axios,
    query,
    asyncHandler,
    rateLimit,
    requireAuth,
    canMonitor,
    recordAudit,
    safeErrorLog,
    isProduction,
  } = ctx;

  const DEFAULT_TALLY_SETTINGS = {
    enabled: false,
    productType: 'tallyprime',
    gatewayUrl: '',
    companyName: '',
    salesVoucherType: 'Sales',
    salesLedgerName: 'Sales',
    salesLedgerParent: 'Sales Accounts',
    customerLedgerParent: 'Sundry Debtors',
  };

  function requireAdmin(req, res, next) {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' });
    }

    return next();
  }

  function cleanText(value = '', maxLength = 160) {
    return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
  }

  function cleanGatewayUrl(value = '') {
    const rawUrl = String(value || '').trim();
    if (!rawUrl) return '';

    let parsed;
    try {
      parsed = new URL(rawUrl);
    } catch {
      throw new Error('Valid Tally gateway URL required');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Tally gateway URL must start with http:// or https://');
    }

    if (isProduction && parsed.protocol !== 'https:') {
      throw new Error('Production Tally gateway URL must use HTTPS.');
    }

    const host = parsed.hostname.toLowerCase();
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    const isPrivateHost = /^10\./.test(host)
      || /^192\.168\./.test(host)
      || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);

    if (isProduction && (isLocalHost || isPrivateHost)) {
      throw new Error('Render backend cannot reach local/private Tally URL. Use a public HTTPS bridge or deploy backend inside the same office network.');
    }

    parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  }

  function normalizeSettings(body = {}) {
    const gatewayUrl = cleanGatewayUrl(body.gatewayUrl || body.gateway_url || '');
    const enabled = body.enabled === true || body.enabled === 'true';
    const allowedProductTypes = new Set(['tallyprime', 'tally_erp9', 'other']);
    const productType = String(body.productType || body.product_type || DEFAULT_TALLY_SETTINGS.productType).trim().toLowerCase();

    if (enabled && !gatewayUrl) {
      throw new Error('Tally gateway URL required before enabling integration');
    }

    if (!allowedProductTypes.has(productType)) {
      throw new Error('Select a valid Tally product type');
    }

    return {
      enabled,
      productType,
      gatewayUrl,
      companyName: cleanText(body.companyName || body.company_name || '', 120),
      salesVoucherType: cleanText(body.salesVoucherType || body.sales_voucher_type || DEFAULT_TALLY_SETTINGS.salesVoucherType, 80) || DEFAULT_TALLY_SETTINGS.salesVoucherType,
      salesLedgerName: cleanText(body.salesLedgerName || body.sales_ledger_name || DEFAULT_TALLY_SETTINGS.salesLedgerName, 120) || DEFAULT_TALLY_SETTINGS.salesLedgerName,
      salesLedgerParent: cleanText(body.salesLedgerParent || body.sales_ledger_parent || DEFAULT_TALLY_SETTINGS.salesLedgerParent, 120) || DEFAULT_TALLY_SETTINGS.salesLedgerParent,
      customerLedgerParent: cleanText(body.customerLedgerParent || body.customer_ledger_parent || DEFAULT_TALLY_SETTINGS.customerLedgerParent, 120) || DEFAULT_TALLY_SETTINGS.customerLedgerParent,
    };
  }

  function publicSettings(row = null) {
    if (!row) return { ...DEFAULT_TALLY_SETTINGS, lastTestedAt: null, lastTestStatus: '', lastError: '' };

    return {
      enabled: row.enabled === true,
      productType: row.product_type || DEFAULT_TALLY_SETTINGS.productType,
      gatewayUrl: row.gateway_url || '',
      companyName: row.company_name || '',
      salesVoucherType: row.sales_voucher_type || DEFAULT_TALLY_SETTINGS.salesVoucherType,
      salesLedgerName: row.sales_ledger_name || DEFAULT_TALLY_SETTINGS.salesLedgerName,
      salesLedgerParent: row.sales_ledger_parent || DEFAULT_TALLY_SETTINGS.salesLedgerParent,
      customerLedgerParent: row.customer_ledger_parent || DEFAULT_TALLY_SETTINGS.customerLedgerParent,
      lastTestedAt: row.last_tested_at || null,
      lastTestStatus: row.last_test_status || '',
      lastError: row.last_error || '',
    };
  }

  function xmlEscape(value = '') {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function tallyDate(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return tallyDate(new Date());
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  }

  function amountValue(value) {
    return Math.max(0, Number(value || 0)).toFixed(2);
  }

  function companyStaticVariables(settings) {
    if (!settings.companyName) return '';

    return `
          <STATICVARIABLES>
            <SVCURRENTCOMPANY>${xmlEscape(settings.companyName)}</SVCURRENTCOMPANY>
          </STATICVARIABLES>`;
  }

  function buildConnectionTestXml(settings) {
    return `<ENVELOPE>
  <HEADER>
    <VERSION>1</VERSION>
    <TALLYREQUEST>Export</TALLYREQUEST>
    <TYPE>Data</TYPE>
    <ID>List of Companies</ID>
  </HEADER>
  <BODY>
    <DESC>${companyStaticVariables(settings)}
    </DESC>
  </BODY>
</ENVELOPE>`;
  }

  function buildLedgerMastersXml(settings, order) {
    const partyLedgerName = cleanText(order.contact_name || order.phone || 'WhatsApp Customer', 120);

    return `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>${companyStaticVariables(settings)}
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="${xmlEscape(partyLedgerName)}" ACTION="Create">
            <NAME>${xmlEscape(partyLedgerName)}</NAME>
            <PARENT>${xmlEscape(settings.customerLedgerParent)}</PARENT>
            <ISBILLWISEON>Yes</ISBILLWISEON>
          </LEDGER>
          <LEDGER NAME="${xmlEscape(settings.salesLedgerName)}" ACTION="Create">
            <NAME>${xmlEscape(settings.salesLedgerName)}</NAME>
            <PARENT>${xmlEscape(settings.salesLedgerParent)}</PARENT>
          </LEDGER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
  }

  function buildSalesVoucherXml(settings, order) {
    const partyLedgerName = cleanText(order.contact_name || order.phone || 'WhatsApp Customer', 120);
    const amount = amountValue(order.amount);
    const itemSummary = (order.items || [])
      .map((item) => `${item.description || 'Item'} ${Number(item.quantity || 0)} ${item.unit || ''} x ${Number(item.rate || 0)}`.trim())
      .join('; ')
      .slice(0, 800);
    const narration = cleanText([order.notes, itemSummary, `Source: ${order.source || 'WhatsApp'}`].filter(Boolean).join(' | '), 1000);

    return `<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>${companyStaticVariables(settings)}
      </REQUESTDESC>
      <REQUESTDATA>
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="${xmlEscape(settings.salesVoucherType)}" ACTION="Create">
            <GUID>BOS-WA-${xmlEscape(order.id)}</GUID>
            <DATE>${tallyDate(order.created_at)}</DATE>
            <VOUCHERTYPENAME>${xmlEscape(settings.salesVoucherType)}</VOUCHERTYPENAME>
            <VOUCHERNUMBER>${xmlEscape(order.order_no)}</VOUCHERNUMBER>
            <REFERENCE>${xmlEscape(order.order_no)}</REFERENCE>
            <PARTYLEDGERNAME>${xmlEscape(partyLedgerName)}</PARTYLEDGERNAME>
            <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
            <NARRATION>${xmlEscape(narration)}</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${xmlEscape(partyLedgerName)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${amount}</AMOUNT>
              <BILLALLOCATIONS.LIST>
                <NAME>${xmlEscape(order.order_no)}</NAME>
                <BILLTYPE>New Ref</BILLTYPE>
                <AMOUNT>-${amount}</AMOUNT>
              </BILLALLOCATIONS.LIST>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${xmlEscape(settings.salesLedgerName)}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${amount}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
  }

  function tagNumber(xml = '', tagName = '') {
    const match = String(xml || '').match(new RegExp(`<${tagName}>\\s*(-?\\d+)\\s*</${tagName}>`, 'i'));
    return match ? Number(match[1]) : 0;
  }

  function tagText(xml = '', tagName = '') {
    const match = String(xml || '').match(new RegExp(`<${tagName}>\\s*([\\s\\S]*?)\\s*</${tagName}>`, 'i'));
    return match ? match[1].replace(/<[^>]+>/g, '').trim() : '';
  }

  function parseTallyResponse(xml = '') {
    const responseText = String(xml || '');
    const created = tagNumber(responseText, 'CREATED');
    const altered = tagNumber(responseText, 'ALTERED');
    const errors = tagNumber(responseText, 'ERRORS');
    const exceptions = tagNumber(responseText, 'EXCEPTIONS');
    const lineError = tagText(responseText, 'LINEERROR') || tagText(responseText, 'LASTVCHID');
    const hasEnvelope = /<ENVELOPE[\s>]/i.test(responseText) || /<RESPONSE[\s>]/i.test(responseText);

    return {
      ok: hasEnvelope && errors === 0 && exceptions === 0 && !tagText(responseText, 'LINEERROR'),
      created,
      altered,
      errors,
      exceptions,
      lineError,
      raw: responseText.slice(0, 20000),
    };
  }

  function isAlreadyExistsResponse(parsed) {
    return /already\s+exists|duplicate/i.test(parsed.lineError || '');
  }

  async function postTallyXml(settings, xml) {
    const response = await axios.post(settings.gatewayUrl, xml, {
      headers: { 'Content-Type': 'text/xml; charset=utf-8' },
      timeout: Number(process.env.TALLY_REQUEST_TIMEOUT_MS || 20000),
      responseType: 'text',
      transformResponse: [(data) => data],
    });

    return parseTallyResponse(response.data);
  }

  async function getSavedSettings(tenantId) {
    const result = await query(
      `SELECT *
       FROM tally_settings
       WHERE tenant_id = $1
       LIMIT 1`,
      [tenantId],
    );

    return result.rows[0] || null;
  }

  async function getOrderForTally(tenantId, orderId) {
    const result = await query(
      `SELECT o.*, c.name AS contact_name, c.phone,
              COALESCE(json_agg(soi ORDER BY soi.created_at) FILTER (WHERE soi.id IS NOT NULL), '[]') AS items
       FROM sales_orders o
       LEFT JOIN contacts c ON c.id = o.contact_id AND c.tenant_id = o.tenant_id
       LEFT JOIN sales_order_items soi ON soi.order_id = o.id AND soi.tenant_id = o.tenant_id
       WHERE o.id = $1
         AND o.tenant_id = $2
       GROUP BY o.id, c.name, c.phone
       LIMIT 1`,
      [orderId, tenantId],
    );

    return result.rows[0] || null;
  }

  async function createSyncLog({ tenantId, userId, entityType, entityId, action, status, requestXml, responseXml, error, tallyReference }) {
    const result = await query(
      `INSERT INTO tally_sync_logs
         (tenant_id, entity_type, entity_id, action, status, tally_reference, request_xml, response_xml, error, created_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
       RETURNING *`,
      [tenantId, entityType, entityId, action, status, tallyReference || null, requestXml || null, responseXml || null, error || null, userId],
    );

    return result.rows[0];
  }

  app.get('/api/tally/settings', requireAuth, asyncHandler(async (req, res) => {
    if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });

    const settings = await getSavedSettings(req.user.tenantId);
    res.json(publicSettings(settings));
  }));

  app.put('/api/tally/settings', requireAuth, requireAdmin, rateLimit({
    bucketName: 'tally-settings',
    maxRequests: 60,
    windowMs: 60 * 60 * 1000,
  }), asyncHandler(async (req, res) => {
    let settings;
    try {
      settings = normalizeSettings(req.body);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const result = await query(
      `INSERT INTO tally_settings
         (tenant_id, enabled, product_type, gateway_url, company_name, sales_voucher_type, sales_ledger_name, sales_ledger_parent, customer_ledger_parent, created_by, updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,now())
       ON CONFLICT (tenant_id)
       DO UPDATE SET enabled = EXCLUDED.enabled,
                     product_type = EXCLUDED.product_type,
                     gateway_url = EXCLUDED.gateway_url,
                     company_name = EXCLUDED.company_name,
                     sales_voucher_type = EXCLUDED.sales_voucher_type,
                     sales_ledger_name = EXCLUDED.sales_ledger_name,
                     sales_ledger_parent = EXCLUDED.sales_ledger_parent,
                     customer_ledger_parent = EXCLUDED.customer_ledger_parent,
                     updated_by = EXCLUDED.updated_by,
                     updated_at = now()
       RETURNING *`,
      [
        req.user.tenantId,
        settings.enabled,
        settings.productType,
        settings.gatewayUrl,
        settings.companyName,
        settings.salesVoucherType,
        settings.salesLedgerName,
        settings.salesLedgerParent,
        settings.customerLedgerParent,
        req.user.id,
      ],
    );

    await recordAudit({
      tenantId: req.user.tenantId,
      actorUserId: req.user.id,
      action: 'tally.settings_saved',
      entityType: 'tally_settings',
      entityId: req.user.tenantId,
      metadata: {
        enabled: settings.enabled,
        productType: settings.productType,
        gatewayHost: settings.gatewayUrl ? new URL(settings.gatewayUrl).host : '',
      },
    });

    res.json(publicSettings(result.rows[0]));
  }));

  app.post('/api/tally/test', requireAuth, requireAdmin, rateLimit({
    bucketName: 'tally-test',
    maxRequests: 30,
    windowMs: 60 * 60 * 1000,
  }), asyncHandler(async (req, res) => {
    const saved = await getSavedSettings(req.user.tenantId);
    const merged = normalizeSettings({
      ...publicSettings(saved),
      ...req.body,
      enabled: req.body?.enabled ?? publicSettings(saved).enabled,
    });

    if (!merged.gatewayUrl) {
      return res.status(400).json({ error: 'Save Tally gateway URL first' });
    }

    const requestXml = buildConnectionTestXml(merged);

    try {
      const parsed = await postTallyXml(merged, requestXml);
      const status = parsed.ok ? 'connected' : 'failed';
      const errorText = parsed.ok ? '' : (parsed.lineError || 'Tally returned an error response');

      await query(
        `UPDATE tally_settings
         SET last_tested_at = now(),
             last_test_status = $3,
             last_error = $4,
             updated_by = $5,
             updated_at = now()
         WHERE tenant_id = $1
           AND gateway_url = $2`,
        [req.user.tenantId, merged.gatewayUrl, status, errorText, req.user.id],
      );

      await createSyncLog({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        entityType: 'tally_connection',
        entityId: req.user.tenantId,
        action: 'test_connection',
        status,
        requestXml,
        responseXml: parsed.raw,
        error: errorText,
      });

      if (!parsed.ok) {
        return res.status(502).json({ ok: false, error: errorText, response: parsed });
      }

      return res.json({ ok: true, message: 'Tally gateway connected', response: parsed });
    } catch (error) {
      const safeError = safeErrorLog(error);
      await createSyncLog({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        entityType: 'tally_connection',
        entityId: req.user.tenantId,
        action: 'test_connection',
        status: 'failed',
        requestXml,
        responseXml: null,
        error: safeError.message,
      });

      return res.status(502).json({ ok: false, error: safeError.message || 'Tally gateway connection failed' });
    }
  }));

  app.get('/api/tally/logs', requireAuth, asyncHandler(async (req, res) => {
    if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });

    const result = await query(
      `SELECT id, entity_type, entity_id, action, status, tally_reference, error, created_at, updated_at
       FROM tally_sync_logs
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.user.tenantId],
    );

    res.json(result.rows);
  }));

  app.post('/api/tally/orders/:id/sync', requireAuth, rateLimit({
    bucketName: 'tally-order-sync',
    maxRequests: 120,
    windowMs: 60 * 60 * 1000,
  }), asyncHandler(async (req, res) => {
    if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });

    const settingsRow = await getSavedSettings(req.user.tenantId);
    const settings = publicSettings(settingsRow);

    if (!settings.enabled || !settings.gatewayUrl) {
      return res.status(400).json({ error: 'Tally integration is not enabled for this company' });
    }

    const order = await getOrderForTally(req.user.tenantId, req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (Number(order.amount || 0) <= 0) {
      return res.status(400).json({ error: 'Order amount must be greater than zero before Tally sync' });
    }

    const alreadySynced = await query(
      `SELECT id, tally_reference, created_at
       FROM tally_sync_logs
       WHERE tenant_id = $1
         AND entity_type = 'sales_order'
         AND entity_id = $2
         AND action = 'push_sales_voucher'
         AND status = 'success'
       ORDER BY created_at DESC
       LIMIT 1`,
      [req.user.tenantId, order.id],
    );

    if (alreadySynced.rows[0] && req.body?.force !== true) {
      return res.status(409).json({
        error: 'Order already synced to Tally. Use force sync only after checking duplicates in Tally.',
        syncedAt: alreadySynced.rows[0].created_at,
        tallyReference: alreadySynced.rows[0].tally_reference,
      });
    }

    const mastersXml = buildLedgerMastersXml(settings, order);
    const voucherXml = buildSalesVoucherXml(settings, order);
    const combinedRequest = `${mastersXml}\n\n---VOUCHER---\n\n${voucherXml}`;

    try {
      const mastersResponse = await postTallyXml(settings, mastersXml);
      if (!mastersResponse.ok && !isAlreadyExistsResponse(mastersResponse)) {
        const log = await createSyncLog({
          tenantId: req.user.tenantId,
          userId: req.user.id,
          entityType: 'sales_order',
          entityId: order.id,
          action: 'push_sales_voucher',
          status: 'failed',
          tallyReference: order.order_no,
          requestXml: combinedRequest,
          responseXml: mastersResponse.raw,
          error: mastersResponse.lineError || 'Tally ledger master creation failed',
        });

        return res.status(502).json({ ok: false, error: log.error, logId: log.id });
      }

      const voucherResponse = await postTallyXml(settings, voucherXml);
      if (!voucherResponse.ok) {
        const log = await createSyncLog({
          tenantId: req.user.tenantId,
          userId: req.user.id,
          entityType: 'sales_order',
          entityId: order.id,
          action: 'push_sales_voucher',
          status: 'failed',
          tallyReference: order.order_no,
          requestXml: combinedRequest,
          responseXml: voucherResponse.raw,
          error: voucherResponse.lineError || 'Tally voucher import failed',
        });

        return res.status(502).json({ ok: false, error: log.error, response: voucherResponse, logId: log.id });
      }

      const log = await createSyncLog({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        entityType: 'sales_order',
        entityId: order.id,
        action: 'push_sales_voucher',
        status: 'success',
        tallyReference: order.order_no,
        requestXml: combinedRequest,
        responseXml: voucherResponse.raw,
        error: '',
      });

      await recordAudit({
        tenantId: req.user.tenantId,
        actorUserId: req.user.id,
        action: 'tally.sales_order_synced',
        entityType: 'sales_order',
        entityId: order.id,
        metadata: {
          orderNo: order.order_no,
          amount: order.amount,
          logId: log.id,
        },
      });

      return res.json({ ok: true, message: 'Order synced to Tally', log, response: voucherResponse });
    } catch (error) {
      const safeError = safeErrorLog(error);
      const log = await createSyncLog({
        tenantId: req.user.tenantId,
        userId: req.user.id,
        entityType: 'sales_order',
        entityId: order.id,
        action: 'push_sales_voucher',
        status: 'failed',
        tallyReference: order.order_no,
        requestXml: combinedRequest,
        responseXml: null,
        error: safeError.message,
      });

      return res.status(502).json({ ok: false, error: safeError.message || 'Tally sync failed', logId: log.id });
    }
  }));
}

return { registerTallyRoutes };
})();

module.exports = {

  ...__coreRoutes,

  ...__whatsappRoutes,

  ...__crmRoutes,

  ...__salesRoutes,

  ...__campaignRoutes,

  ...__tallyRoutes,

};
