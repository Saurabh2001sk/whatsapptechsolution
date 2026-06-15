// Merged backend helpers/services. Source modules were consolidated to keep the backend folder small.

const __asyncHandler = (() => {
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

return asyncHandler;
})();

const __rateLimit = (() => {
const IORedis = require('ioredis');

const apiRateBuckets = new Map();

let redisClient = null;
let redisDisabled = false;

function getRedisUrl() {
  return String(process.env.RATE_LIMIT_REDIS_URL || process.env.REDIS_URL || '').trim();
}

function shouldUseRedisRateLimit() {
  const redisUrl = getRedisUrl();

  return Boolean(redisUrl)
    && !redisUrl.startsWith('your-')
    && !redisUrl.startsWith('change-');
}

function shouldAllowMemoryRateLimitInProduction() {
  return String(process.env.RATE_LIMIT_ALLOW_MEMORY_IN_PRODUCTION || '')
    .trim()
    .toLowerCase() === 'true';
}

function shouldRequireRedisRateLimit() {
  return process.env.NODE_ENV === 'production' && !shouldAllowMemoryRateLimitInProduction();
}

function getRedisClient() {
  if (redisClient || redisDisabled || !shouldUseRedisRateLimit()) return redisClient;

  redisClient = new IORedis(getRedisUrl(), {
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    connectTimeout: 5000,
    tls: getRedisUrl().startsWith('rediss://') ? {} : undefined,
  });

  redisClient.on('error', (error) => {
    redisDisabled = true;
    console.error('Redis rate limit disabled:', {
      message: error.message,
      code: error.code || null,
    });
  });

  return redisClient;
}

function getClientIp(req) {
  const forwardedFor = String(req.headers['x-forwarded-for'] || '')
    .split(',')[0]
    .trim();

  return forwardedFor || req.ip || req.socket?.remoteAddress || 'unknown';
}

function getClientKey(req, bucketName) {
  const tenantId = req.user?.tenantId || 'public';
  const userId = req.user?.id || 'anonymous';
  const ip = getClientIp(req);

  return `${bucketName}:tenant=${tenantId}:user=${userId}:ip=${ip}`;
}

async function redisRateLimit({ req, res, key, maxRequests, windowMs }) {
  const client = getRedisClient();
  if (!client) return false;

  const windowSeconds = Math.ceil(windowMs / 1000);
  const count = await client.incr(key);

  if (count === 1) {
    await client.expire(key, windowSeconds);
  }

  const ttl = await client.ttl(key);
  const resetAt = Math.ceil(Date.now() / 1000) + Math.max(ttl, 0);
  const remaining = Math.max(maxRequests - count, 0);

  res.setHeader('RateLimit-Limit', String(maxRequests));
  res.setHeader('RateLimit-Remaining', String(remaining));
  res.setHeader('RateLimit-Reset', String(resetAt));

  if (count > maxRequests) {
    res.setHeader('Retry-After', String(Math.max(ttl, 1)));
    res.status(429).json({ error: 'Too many requests. Please try again later.' });
    return true;
  }

  return true;
}

function memoryRateLimit({ req, res, key, maxRequests, windowMs }) {
  const now = Date.now();

  const bucket = apiRateBuckets.get(key) || {
    count: 0,
    resetAt: now + windowMs,
  };

  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }

  bucket.count += 1;
  apiRateBuckets.set(key, bucket);

  const remaining = Math.max(maxRequests - bucket.count, 0);
  const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);

  res.setHeader('RateLimit-Limit', String(maxRequests));
  res.setHeader('RateLimit-Remaining', String(remaining));
  res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

  if (bucket.count > maxRequests) {
    res.setHeader('Retry-After', String(retryAfterSeconds));

    return res.status(429).json({
      error: 'Too many requests. Please try again later.',
    });
  }

  return null;
}

function rateLimit({ bucketName, maxRequests, windowMs }) {
  return async (req, res, next) => {
    const safeBucketName = String(bucketName || 'default').replace(/[^a-zA-Z0-9_.:-]/g, '_');
    const safeMaxRequests = Math.max(Number(maxRequests || 60), 1);
    const safeWindowMs = Math.max(Number(windowMs || 60 * 1000), 1000);
    const key = getClientKey(req, safeBucketName);

    if (shouldRequireRedisRateLimit() && (!shouldUseRedisRateLimit() || redisDisabled)) {
  return res.status(503).json({
    error: 'Redis-backed rate limiting is required in production',
  });
}

    try {
      if (shouldUseRedisRateLimit() && !redisDisabled) {
        const handled = await redisRateLimit({
          req,
          res,
          key,
          maxRequests: safeMaxRequests,
          windowMs: safeWindowMs,
        });

        if (handled) {
          if (!res.headersSent) return next();
          return undefined;
        }
      }
    } catch (error) {
      redisDisabled = true;
      console.error('Redis rate limit failed:', {
  message: error.message,
  code: error.code || null,
});

if (shouldRequireRedisRateLimit()) {
  return res.status(503).json({
    error: 'Redis-backed rate limiting is unavailable',
  });
}
    }

    const memoryResponse = memoryRateLimit({
      req,
      res,
      key,
      maxRequests: safeMaxRequests,
      windowMs: safeWindowMs,
    });

    if (memoryResponse) return memoryResponse;
    return next();
  };
}

setInterval(() => {
  const now = Date.now();

  for (const [key, bucket] of apiRateBuckets.entries()) {
    if (bucket.resetAt <= now) {
      apiRateBuckets.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

return rateLimit;
})();

const __common = (() => {
const crypto = require('crypto');

function maskValue(value) {
  if (!value) return '';
  if (value.length <= 8) return '********';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function maskEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  const [name, domain] = email.split('@');

  if (!name || !domain) return maskValue(email);

  const safeName = name.length <= 2
    ? `${name[0] || '*'}***`
    : `${name.slice(0, 2)}***${name.slice(-1)}`;

  return `${safeName}@${domain}`;
}

function maskId(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (text.length <= 10) return '********';
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function hasRealValue(value) {
  const text = String(value || '').trim();
  return Boolean(
    text
    && !text.startsWith('your-')
    && !text.startsWith('your_')
    && !text.startsWith('change-')
    && !text.startsWith('change_')
    && !text.startsWith('replace-')
    && !text.startsWith('replace_')
  );
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isStrongPassword(password) {
  const value = String(password || '');

  return (
    value.length >= 12
    && value.length <= 128
    && /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /[0-9]/.test(value)
    && /[^a-zA-Z0-9]/.test(value)
  );
}

function strongPasswordError() {
  return 'Password must be 12-128 characters with uppercase, lowercase, number and symbol';
}

function normalizeUserText(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isReplyWindowOpen(contact) {
  if (!contact?.last_inbound_at) return false;
  return Date.now() - new Date(contact.last_inbound_at).getTime() <= 24 * 60 * 60 * 1000;
}

function isOptOutMessage(value = '') {
  const text = normalizeUserText(value);

  if (!text) return false;

  const exactKeywords = new Set([
    'stop',
    'unsubscribe',
    'do not message',
    'dont message',
    "don't message",
    'do not send',
    'dont send',
    "don't send",
    'remove me',
    'opt out',
    'block',
    'band karo',
    'mat bhejo',
    'message mat bhejo',
    'msg mat bhejo',
  ]);

  if (exactKeywords.has(text)) return true;

  return /\b(stop|unsubscribe|opt\s*out)\b/i.test(text)
    || /do\s*not\s*(message|send)/i.test(text)
    || /don'?t\s*(message|send)/i.test(text)
    || /(band\s*karo|mat\s*bhejo|message\s*mat\s*bhejo|msg\s*mat\s*bhejo)/i.test(text);
}

function getTokenEncryptionKey() {
  const key = String(process.env.META_TOKEN_ENCRYPTION_KEY || '').trim();

  if (!/^[a-f0-9]{64}$/i.test(key)) {
    throw new Error('META_TOKEN_ENCRYPTION_KEY must be a 64-character hex string');
  }

  return Buffer.from(key, 'hex');
}

function encryptSecret(value) {
  const plainText = String(value || '');

  if (!plainText) {
    return {
      encrypted: null,
      iv: null,
      tag: null,
    };
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getTokenEncryptionKey(), iv);

  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

function decryptSecret({ encrypted, iv, tag }) {
  if (!encrypted || !iv || !tag) return '';

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getTokenEncryptionKey(),
    Buffer.from(iv, 'base64'),
  );

  decipher.setAuthTag(Buffer.from(tag, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

function getCookie(req, name) {
  const cookies = String(req.headers.cookie || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean);

  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = cookie.slice(0, separatorIndex);
    const value = cookie.slice(separatorIndex + 1);

    if (key === name) return decodeURIComponent(value);
  }

  return '';
}

function safeMetaError(error) {
  const metaError = error?.response?.data?.error || null;

  return {
    status: error?.response?.status || null,
    code: error?.code || null,
    metaCode: metaError?.code || null,
    metaSubcode: metaError?.error_subcode || null,
    metaType: metaError?.type || null,
    message: metaError?.message || error?.message || 'Unknown error',
  };
}

function safeErrorLog(error, isProduction = false) {
  function redactText(value = '') {
    return String(value || '')
      .replace(/(access_token=)[^&\s]+/gi, '$1[REDACTED]')
      .replace(/(token=)[^&\s]+/gi, '$1[REDACTED]')
      .replace(/(password=)[^&\s]+/gi, '$1[REDACTED]')
      .replace(/(authorization:\s*bearer\s+)[^\s]+/gi, '$1[REDACTED]')
      .replace(/(whatsapp_access_token\s*[:=]\s*)[^\s,}]+/gi, '$1[REDACTED]')
      .replace(/(jwt_secret\s*[:=]\s*)[^\s,}]+/gi, '$1[REDACTED]');
  }

  return {
    message: redactText(error?.message || 'Unknown error'),
    code: error?.code || null,
    stack: isProduction ? undefined : redactText(error?.stack || ''),
  };
}

function cleanList(value, fallback) {
  const list = Array.isArray(value)
    ? value
    : String(value || '').split(',').map((item) => item.trim());

  const clean = [...new Set(list.filter(Boolean))];

  return clean.length ? clean : fallback;
}

const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DEFAULT_VOICE_WEEKLY_HOURS = WEEK_DAYS.reduce((acc, day) => {
  acc[day] = { enabled: true, slots: [{ start: '00:00', end: '23:59' }] };
  return acc;
}, {});

function cleanVoiceWeeklyHours(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  return WEEK_DAYS.reduce((acc, day) => {
    const dayValue = source[day] && typeof source[day] === 'object'
      ? source[day]
      : DEFAULT_VOICE_WEEKLY_HOURS[day];

    const slots = Array.isArray(dayValue.slots) && dayValue.slots.length
      ? dayValue.slots.slice(0, 4).map((slot) => ({
        start: String(slot?.start || '00:00').slice(0, 5),
        end: String(slot?.end || '23:59').slice(0, 5),
      }))
      : [{ start: '00:00', end: '23:59' }];

    acc[day] = {
      enabled: dayValue.enabled !== false,
      slots,
    };

    return acc;
  }, {});
}

function cleanUnavailableHours(value) {
  return Array.isArray(value)
    ? value.slice(0, 40).map((entry) => ({
      date: String(entry?.date || '').slice(0, 10),
      start: String(entry?.start || '00:00').slice(0, 5),
      end: String(entry?.end || '23:59').slice(0, 5),
      reason: String(entry?.reason || '').trim().slice(0, 100),
    })).filter((entry) => entry.date)
    : [];
}

return { maskValue, maskEmail, maskId, hasRealValue, toFiniteNumber, isStrongPassword, strongPasswordError, normalizeUserText, isReplyWindowOpen, isOptOutMessage, encryptSecret, decryptSecret, getCookie, safeMetaError, safeErrorLog, cleanList, WEEK_DAYS, DEFAULT_VOICE_WEEKLY_HOURS, cleanVoiceWeeklyHours, cleanUnavailableHours };
})();

const __auth = (() => {
function createAuthService({
  jwt,
  jwtSecret,
  isProduction,
  query,
  getCookie,
}) {
  function signUser(user) {
    return jwt.sign(
{
  id: user.id,
  tenantId: user.tenant_id,
  name: user.name,
  email: user.email,
  role: user.role,
  supportMode: Boolean(user.supportMode),
  supportActorUserId: user.supportActorUserId || null,
  supportActorTenantId: user.supportActorTenantId || null,
  supportExpiresAt: user.supportExpiresAt || null,
},
      jwtSecret,
      { expiresIn: '12h' },
    );
  }

  function publicUser(user) {
    return {
      id: user.id,
      tenantId: user.tenant_id,
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      totpEnabled: Boolean(user.totp_enabled),
    };
  }

  function authCookieOptions() {
    const cookieNeedsCrossSiteMode =
      isProduction ||
      process.env.COOKIE_SECURE === 'true' ||
      process.env.RENDER === 'true' ||
      String(process.env.FRONTEND_URL || '').startsWith('https://') ||
      String(process.env.FRONTEND_URLS || '').includes('https://') ||
      String(process.env.PUBLIC_BASE_URL || '').startsWith('https://');

    return {
      httpOnly: true,
      secure: cookieNeedsCrossSiteMode,
      sameSite: cookieNeedsCrossSiteMode ? 'none' : 'lax',
      partitioned: cookieNeedsCrossSiteMode || undefined,
      maxAge: 12 * 60 * 60 * 1000,
      path: '/',
    };
  }

  function setAuthCookie(res, user) {
    res.cookie('bosAuthToken', signUser(user), authCookieOptions());
  }

  function clearAuthCookie(res) {
    const cookieNeedsCrossSiteMode =
      isProduction ||
      process.env.COOKIE_SECURE === 'true' ||
      process.env.RENDER === 'true' ||
      String(process.env.FRONTEND_URL || '').startsWith('https://') ||
      String(process.env.FRONTEND_URLS || '').includes('https://') ||
      String(process.env.PUBLIC_BASE_URL || '').startsWith('https://');

    res.clearCookie('bosAuthToken', {
      httpOnly: true,
      secure: cookieNeedsCrossSiteMode,
      sameSite: cookieNeedsCrossSiteMode ? 'none' : 'lax',
      partitioned: cookieNeedsCrossSiteMode || undefined,
      path: '/',
    });
  }

  async function requireAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ')
      ? header.slice(7)
      : getCookie(req, 'bosAuthToken');

    if (!token) {
      return res.status(401).json({ error: 'Login required' });
    }

    try {
      const decoded = jwt.verify(token, jwtSecret);
      if (decoded.supportMode && (!decoded.supportExpiresAt || Date.now() > Number(decoded.supportExpiresAt))) {
  return res.status(401).json({ error: 'Support session expired' });
}

      if (!decoded.id || !decoded.tenantId) {
        return res.status(401).json({ error: 'Invalid login session' });
      }

      const result = await query(
        `SELECT
           users.id,
           users.tenant_id,
           users.name,
           users.email,
           users.role,
           users.active,
           tenants.status AS tenant_status,
           tenants.subscription_status,
           tenants.trial_ends_at,
           tenants.subscription_ends_at,
           tenants.suspended_reason
         FROM users
         JOIN tenants ON tenants.id = users.tenant_id
         WHERE users.id = $1
           AND users.tenant_id = $2
         LIMIT 1`,
        [decoded.id, decoded.tenantId],
      );

      const user = result.rows[0];

      if (!user || !user.active || user.tenant_status !== 'active') {
        return res.status(401).json({ error: 'User or company is inactive' });
      }

      req.user = {
        id: user.id,
        tenantId: user.tenant_id,
        name: user.name,
        email: user.email,
        role: user.role,
        supportMode: Boolean(decoded.supportMode),
        supportActorUserId: decoded.supportActorUserId || null,
        supportActorTenantId: decoded.supportActorTenantId || null,
        supportExpiresAt: decoded.supportExpiresAt || null,
      };

      req.tenant = {
        id: user.tenant_id,
        status: user.tenant_status,
        subscriptionStatus: user.subscription_status || 'trial',
        trialEndsAt: user.trial_ends_at || null,
        subscriptionEndsAt: user.subscription_ends_at || null,
        suspendedReason: user.suspended_reason || '',
      };

      return next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  function isSuperAdmin(user) {
    return user?.role === 'super_admin';
  }

  function canMonitor(user) {
    return isSuperAdmin(user) || user.role === 'admin' || user.role === 'manager';
  }

  function requireSuperAdmin(req, res, next) {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ error: 'Super admin only' });
    }

    return next();
  }

  function getSubscriptionBlockReason(tenant) {
    if (!tenant) return 'Company account missing';

    const tenantStatus = String(tenant.status || '').trim().toLowerCase();
    const subscriptionStatus = String(tenant.subscriptionStatus || tenant.subscription_status || '').trim().toLowerCase();
    const suspendedReason = tenant.suspendedReason || tenant.suspended_reason || '';

    if (tenantStatus === 'suspended') {
      return suspendedReason || 'Company account suspended';
    }

    if (tenantStatus === 'inactive') {
      return 'Company account inactive';
    }

    if (subscriptionStatus === 'suspended') {
      return suspendedReason || 'Subscription suspended';
    }

    if (subscriptionStatus === 'expired') {
      return suspendedReason || 'Subscription expired';
    }

    const trialEndsAt = tenant.trialEndsAt || tenant.trial_ends_at;
    const subscriptionEndsAt = tenant.subscriptionEndsAt || tenant.subscription_ends_at;

    if (
      subscriptionStatus === 'trial'
      && trialEndsAt
      && new Date(trialEndsAt).getTime() < Date.now()
    ) {
      return 'Trial expired';
    }

    if (
      subscriptionStatus === 'active'
      && subscriptionEndsAt
      && new Date(subscriptionEndsAt).getTime() < Date.now()
    ) {
      return 'Subscription expired';
    }

    return '';
  }

  function requireActiveSubscription(req, res, next) {
    const reason = getSubscriptionBlockReason(req.tenant);

    if (reason) {
      return res.status(403).json({
        error: reason,
        billingBlocked: true,
      });
    }

    return next();
  }

  return {
    signUser,
    publicUser,
    authCookieOptions,
    setAuthCookie,
    clearAuthCookie,
    requireAuth,
    isSuperAdmin,
    canMonitor,
    requireSuperAdmin,
    getSubscriptionBlockReason,
    requireActiveSubscription,
  };
}

return { createAuthService };
})();

const __tenant = (() => {
function createTenantService({
  query,
  isProduction,
  hasRealValue,
}) {
  let demoTenantId = null;

  function normalizeTenantSlug(value = '') {
    return String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
  }

function publicTenant(tenant) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    industry: tenant.industry,
    status: tenant.status,
    plan: tenant.plan,
    subscriptionStatus: tenant.subscription_status || 'trial',
    trialEndsAt: tenant.trial_ends_at || null,
    subscriptionEndsAt: tenant.subscription_ends_at || null,
    suspendedReason: tenant.suspended_reason || '',
    logoUrl: tenant.logo_url,
    businessPhone: tenant.business_phone,
    businessEmail: tenant.business_email,
    metaBusinessId: tenant.meta_business_id,
    onboardingStatus: tenant.onboarding_status,
    createdAt: tenant.created_at,
    updatedAt: tenant.updated_at,
  };
}

  async function countActiveTenantAdmins(tenantId, excludeUserId = null) {
    const params = [tenantId];
    let excludeSql = '';

    if (excludeUserId) {
      params.push(excludeUserId);
      excludeSql = `AND id <> $${params.length}`;
    }

    const result = await query(
      `SELECT COUNT(*)::int AS count
       FROM users
       WHERE tenant_id = $1
         AND role = 'admin'
         AND active = true
         ${excludeSql}`,
      params,
    );

    return result.rows[0]?.count || 0;
  }

  async function getDemoTenantId() {
    if (demoTenantId) return demoTenantId;

    const result = await query(
      `INSERT INTO tenants (name, slug, industry, status, plan)
       VALUES ('Demo Company', 'demo', 'General', 'active', 'starter')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
    );

    demoTenantId = result.rows[0].id;
    return demoTenantId;
  }

  async function ensureDefaultWhatsAppAccountMapping(displayPhoneNumber = null) {
    if (isProduction) {
      return null;
    }

    const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();

    if (!hasRealValue(phoneNumberId)) {
      return null;
    }

    const tenantId = await getDemoTenantId();

    const result = await query(
      `INSERT INTO whatsapp_accounts (tenant_id, phone_number_id, display_phone_number, active)
       VALUES ($1, $2, $3, true)
       ON CONFLICT (phone_number_id)
       DO UPDATE SET display_phone_number = COALESCE(EXCLUDED.display_phone_number, whatsapp_accounts.display_phone_number),
                     active = true
       RETURNING tenant_id`,
      [tenantId, phoneNumberId, displayPhoneNumber || null],
    );

    return result.rows[0]?.tenant_id || null;
  }

  async function getEnvWhatsAppAccountStatus(tenantId = null) {
    const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();

    if (!hasRealValue(phoneNumberId)) {
      return {
        phoneNumberMapped: false,
        phoneNumberMappedToCurrentTenant: false,
        phoneNumberMappedTenantSlug: null,
      };
    }

    const result = await query(
      `SELECT whatsapp_accounts.tenant_id, whatsapp_accounts.active, tenants.slug
       FROM whatsapp_accounts
       JOIN tenants ON tenants.id = whatsapp_accounts.tenant_id
       WHERE whatsapp_accounts.phone_number_id = $1
       LIMIT 1`,
      [phoneNumberId],
    );

    const account = result.rows[0];

    return {
      phoneNumberMapped: Boolean(account?.active),
      phoneNumberMappedToCurrentTenant: Boolean(account?.active && tenantId && account.tenant_id === tenantId),
      phoneNumberMappedTenantSlug: account?.slug || null,
    };
  }

  async function getTenantIdForWebhookValue(value = {}) {
    const phoneNumberId = String(value?.metadata?.phone_number_id || '').trim();

    if (!phoneNumberId) {
      return null;
    }

    const mapped = await query(
      `SELECT tenants.id
       FROM whatsapp_accounts
       JOIN tenants ON tenants.id = whatsapp_accounts.tenant_id
       WHERE whatsapp_accounts.phone_number_id = $1
         AND whatsapp_accounts.active = true
         AND tenants.status = 'active'
       LIMIT 1`,
      [phoneNumberId],
    );

    if (mapped.rows[0]?.id) {
      return mapped.rows[0].id;
    }

    if (!isProduction && phoneNumberId === String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim()) {
      return ensureDefaultWhatsAppAccountMapping(value?.metadata?.display_phone_number || null);
    }

    return null;
  }

  return {
    normalizeTenantSlug,
    publicTenant,
    countActiveTenantAdmins,
    getDemoTenantId,
    ensureDefaultWhatsAppAccountMapping,
    getEnvWhatsAppAccountStatus,
    getTenantIdForWebhookValue,
  };
}

return { createTenantService };
})();

const __audit = (() => {
function createAuditService({
  query,
}) {
  async function recordAudit({ tenantId, actorUserId, action, entityType, entityId, metadata = {} }) {
    if (!action || !entityType || !tenantId) return null;

    const result = await query(
      `INSERT INTO audit_events (tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tenantId, actorUserId || null, action, entityType, entityId || null, metadata],
    );

    return result.rows[0];
  }

  async function recordAssignmentHistory({ tenantId, contactId, fromUserId, toUserId, changedBy, reason }) {
    if (!contactId || !tenantId || fromUserId === toUserId) return null;

    const result = await query(
      `INSERT INTO assignment_history (tenant_id, contact_id, from_user_id, to_user_id, changed_by, reason)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [tenantId, contactId, fromUserId || null, toUserId || null, changedBy || null, reason || null],
    );

    await recordAudit({
      tenantId,
      actorUserId: changedBy,
      action: 'contact.assigned',
      entityType: 'contact',
      entityId: contactId,
      metadata: {
        fromUserId: fromUserId || null,
        toUserId: toUserId || null,
        reason: reason || '',
      },
    });

    return result.rows[0];
  }

  return {
    recordAudit,
    recordAssignmentHistory,
  };
}

return { createAuditService };
})();

const __tenantLimits = (() => {
const PLAN_LIMITS = {
  starter: {
    users: 3,
    contacts: 1000,
    templates: 25,
    products: 1000,
    campaignRecipientsPerRun: 500,
    outboundMessagesPerDay: 1000,
  },
  growth: {
    users: 10,
    contacts: 10000,
    templates: 100,
    products: 10000,
    campaignRecipientsPerRun: 5000,
    outboundMessagesPerDay: 10000,
  },
  business: {
    users: 50,
    contacts: 100000,
    templates: 500,
    products: 100000,
    campaignRecipientsPerRun: 25000,
    outboundMessagesPerDay: 50000,
  },
};

function normalizePlan(plan = 'starter') {
  const cleanPlan = String(plan || 'starter').trim().toLowerCase();
  return PLAN_LIMITS[cleanPlan] ? cleanPlan : 'starter';
}

function createLimitError(message) {
  const error = new Error(message);
  error.statusCode = 402;
  error.code = 'PLAN_LIMIT_REACHED';
  return error;
}

function createTenantLimitsService({ query }) {
  async function getTenantPlan(tenantId) {
    const result = await query(
      `SELECT plan
       FROM tenants
       WHERE id = $1
       LIMIT 1`,
      [tenantId],
    );

    return normalizePlan(result.rows[0]?.plan);
  }

  async function getTenantLimits(tenantId) {
    const plan = await getTenantPlan(tenantId);
    return {
      plan,
      ...PLAN_LIMITS[plan],
    };
  }

  async function countRows(tableName, tenantId, extraWhere = '') {
    const result = await query(
      `SELECT COUNT(*)::int AS count
       FROM ${tableName}
       WHERE tenant_id = $1
       ${extraWhere}`,
      [tenantId],
    );

    return Number(result.rows[0]?.count || 0);
  }

  async function assertTenantLimit({ tenantId, resource, add = 1 }) {
    const limits = await getTenantLimits(tenantId);
    const limit = Number(limits[resource] || 0);

    if (!limit) return limits;

    const tableMap = {
      users: { table: 'users', where: 'AND active = true' },
      contacts: { table: 'contacts', where: '' },
      templates: { table: 'whatsapp_templates', where: '' },
      products: { table: 'products', where: '' },
    };

    const tableInfo = tableMap[resource];

    if (!tableInfo) return limits;

    const currentCount = await countRows(tableInfo.table, tenantId, tableInfo.where);

    if (currentCount + add > limit) {
      throw createLimitError(`Plan limit reached: ${resource} limit is ${limit} on ${limits.plan} plan.`);
    }

    return limits;
  }

  async function assertCampaignRecipientLimit({ tenantId, recipientCount }) {
    const limits = await getTenantLimits(tenantId);

    if (Number(recipientCount || 0) > limits.campaignRecipientsPerRun) {
      throw createLimitError(
        `Plan limit reached: campaign can include maximum ${limits.campaignRecipientsPerRun} recipients on ${limits.plan} plan.`,
      );
    }

    return limits;
  }

  async function assertDailyOutboundLimit({ tenantId, add = 1 }) {
    const limits = await getTenantLimits(tenantId);

    const result = await query(
      `SELECT COUNT(*)::int AS count
       FROM outbound_messages
       WHERE tenant_id = $1
         AND created_at >= now() - interval '24 hours'`,
      [tenantId],
    );

    const currentCount = Number(result.rows[0]?.count || 0);

    if (currentCount + add > limits.outboundMessagesPerDay) {
      throw createLimitError(
        `Plan limit reached: daily outbound message limit is ${limits.outboundMessagesPerDay} on ${limits.plan} plan.`,
      );
    }

    return limits;
  }

  return {
    getTenantLimits,
    assertTenantLimit,
    assertCampaignRecipientLimit,
    assertDailyOutboundLimit,
  };
}

return { createTenantLimitsService };
})();

const __totp = (() => {
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

async function createTotpEnrollment(email) {
  const safeEmail = String(email || '').trim().toLowerCase() || 'admin';

  const secret = speakeasy.generateSecret({
    name: `BOS WhatsApp (${safeEmail})`,
    issuer: 'BOS WhatsApp',
    length: 20,
  });

  const qrCodeDataUrl = await QRCode.toDataURL(secret.otpauth_url);

  return {
    secret: secret.base32,
    qrCodeDataUrl,
    otpauthUrl: secret.otpauth_url,
  };
}

function cleanTotpToken(token) {
  return String(token || '').replace(/\D/g, '').slice(0, 6);
}

function verifyTotp(secret, token) {
  const cleanToken = cleanTotpToken(token);

  if (!secret || cleanToken.length !== 6) {
    return false;
  }

  return speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: cleanToken,
    window: 1,
  });
}

return { createTotpEnrollment, cleanTotpToken, verifyTotp };
})();

const __mediaStorage = (() => {
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { GetObjectCommand, PutObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

function boolEnv(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

function safeFileName(fileName = 'media.bin') {
  const clean = String(fileName || 'media.bin')
    .replace(/[\\/]/g, '-')
    .replace(/[^a-zA-Z0-9_. -]/g, '_')
    .replace(/\s+/g, '-')
    .slice(0, 160);

  return clean || 'media.bin';
}

function isPathInside(parentPath, childPath) {
  const relativePath = path.relative(parentPath, childPath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function encodeStorageKey(key = '') {
  return Buffer.from(String(key), 'utf8').toString('base64url');
}

function decodeStorageKey(value = '') {
  try {
    return Buffer.from(String(value), 'base64url').toString('utf8');
  } catch {
    return '';
  }
}

function createMediaStorage({ mediaRoot }) {
  const driver = String(process.env.MEDIA_STORAGE_DRIVER || process.env.OBJECT_STORAGE_DRIVER || 'local')
    .trim()
    .toLowerCase();

  const bucket = String(process.env.MEDIA_STORAGE_BUCKET || process.env.S3_BUCKET || '').trim();
  const region = String(process.env.MEDIA_STORAGE_REGION || process.env.AWS_REGION || 'auto').trim();
  const endpoint = String(process.env.MEDIA_STORAGE_ENDPOINT || process.env.S3_ENDPOINT || '').trim();
  const accessKeyId = String(process.env.MEDIA_STORAGE_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || '').trim();
  const secretAccessKey = String(process.env.MEDIA_STORAGE_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || '').trim();
  const forcePathStyle = boolEnv(process.env.MEDIA_STORAGE_FORCE_PATH_STYLE, Boolean(endpoint));

  const s3Enabled = driver === 's3'
    && bucket
    && accessKeyId
    && secretAccessKey
    && (region || endpoint);

  const localProductionAllowed = boolEnv(process.env.MEDIA_STORAGE_ALLOW_LOCAL_IN_PRODUCTION, false);

  if (process.env.NODE_ENV === 'production' && !s3Enabled && !localProductionAllowed) {
    throw new Error('Production media storage requires MEDIA_STORAGE_DRIVER=s3 with bucket credentials. Set MEDIA_STORAGE_ALLOW_LOCAL_IN_PRODUCTION=true only for temporary non-customer testing.');
  }

  const client = s3Enabled
    ? new S3Client({
      region: region || 'auto',
      endpoint: endpoint || undefined,
      forcePathStyle,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    })
    : null;

  function makeObjectKey({ tenantId, fileName, source = 'whatsapp' }) {
    const tenantPart = String(tenantId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeName = safeFileName(fileName);
    const uniquePart = `${Date.now()}-${crypto.randomUUID()}`;
    return `tenants/${tenantPart}/${source}/${uniquePart}-${safeName}`;
  }

  async function putTenantMediaObject({
    tenantId,
    buffer,
    fileName,
    mimeType,
    source = 'whatsapp',
  }) {
    if (!buffer?.length) {
      return { provider: null, storageKey: null, mediaUrl: null, mediaLocalPath: null };
    }

    if (s3Enabled) {
      const storageKey = makeObjectKey({ tenantId, fileName, source });

      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: buffer,
        ContentType: mimeType || 'application/octet-stream',
        Metadata: {
          tenant_id: String(tenantId || ''),
          source,
        },
      }));

      return {
        provider: 's3',
        storageKey,
        mediaUrl: `/media/whatsapp/${encodeStorageKey(storageKey)}`,
        mediaLocalPath: null,
      };
    }

    const localName = `${Date.now()}-${crypto.randomUUID()}-${safeFileName(fileName)}`;
    const localPath = path.join(mediaRoot, localName);

    if (!isPathInside(mediaRoot, localPath)) {
      throw new Error('Invalid local media path');
    }

    fs.writeFileSync(localPath, buffer);

    return {
      provider: 'local',
      storageKey: localName,
      mediaUrl: `/media/whatsapp/${localName}`,
      mediaLocalPath: localPath,
    };
  }

  async function getTenantMediaStream(storageKey) {
    if (!s3Enabled || !storageKey) return null;

    const response = await client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: storageKey,
    }));

    return {
      body: response.Body,
      contentType: response.ContentType || 'application/octet-stream',
      contentLength: response.ContentLength || null,
    };
  }

  async function getSignedTenantMediaUrl(storageKey, expiresIn = 300) {
    if (!s3Enabled || !storageKey) return null;

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: storageKey,
    });

    return getSignedUrl(client, command, { expiresIn });
  }

  return {
    driver: s3Enabled ? 's3' : 'local',
    isObjectStorageEnabled: s3Enabled,
    encodeStorageKey,
    decodeStorageKey,
    putTenantMediaObject,
    getTenantMediaStream,
    getSignedTenantMediaUrl,
  };
}

return { createMediaStorage };
})();

module.exports = {

  asyncHandler: __asyncHandler,

  rateLimit: __rateLimit,

  ...__common,

  ...__auth,

  ...__tenant,

  ...__audit,

  ...__tenantLimits,

  ...__totp,

  ...__mediaStorage,

};
