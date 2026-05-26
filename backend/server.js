require('dotenv').config();

const axios = require('axios');
const bcrypt = require('bcrypt');
const cors = require('cors');
const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { query, healthCheck, closePool } = require('./db');

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set. Add it to backend/.env and restart.');
  process.exit(1);
}

const mediaRoot = path.join(__dirname, 'uploads', 'whatsapp-media');
if (!fs.existsSync(mediaRoot)) fs.mkdirSync(mediaRoot, { recursive: true });

const app = express();
const port = Number(process.env.PORT || 5000);
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production');
}

const jwtSecret = process.env.JWT_SECRET || 'dev-only-local-secret';

const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

const apiRateBuckets = new Map();

function getClientKey(req, bucketName) {
  return `${bucketName}:${req.ip || 'unknown'}`;
}

function rateLimit({ bucketName, maxRequests, windowMs }) {
  return (req, res, next) => {
    const key = getClientKey(req, bucketName);
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

    if (bucket.count > maxRequests) {
      return res.status(429).json({
        error: 'Too many requests. Please try again later.',
      });
    }

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

const allowedOrigins = new Set([
  process.env.FRONTEND_URL,
  ...(!isProduction ? ['http://localhost:5173', 'http://127.0.0.1:5173'] : []),
].filter(Boolean));

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
  credentials: true,
}));

app.set('trust proxy', 1);

app.use((req, res, next) => {
  const isApiWrite = req.path.startsWith('/api/')
    && !['GET', 'HEAD', 'OPTIONS'].includes(req.method);

  if (!isProduction || !isApiWrite) {
    return next();
  }

  const origin = String(req.headers.origin || '').trim();
  const usesCookieSession = Boolean(getCookie(req, 'bosAuthToken'));

  if (!origin) {
    if (usesCookieSession) {
      return res.status(403).json({ error: 'Trusted browser origin required' });
    }

    return next();
  }

  if (!allowedOrigins.has(origin)) {
    return res.status(403).json({ error: 'Untrusted browser origin' });
  }

  return next();
});

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }

  next();
});

app.use(express.json({
  limit: '5mb',
  verify: (req, res, buf) => { req.rawBody = buf; },
}));

app.get('/media/whatsapp/:fileName', requireAuth, asyncHandler(async (req, res) => {
  const fileName = String(req.params.fileName || '');

  if (!/^[a-zA-Z0-9_.-]+$/.test(fileName)) {
    return res.status(400).json({ error: 'Invalid media file name' });
  }

  const mediaUrl = `/media/whatsapp/${fileName}`;

  const result = await query(
    `SELECT id, media_id, mime_type
     FROM messages
     WHERE tenant_id = $1
       AND media_url = $2
     LIMIT 1`,
    [req.user.tenantId, mediaUrl],
  );

  const mediaMessage = result.rows[0];

  if (!mediaMessage) {
    return res.status(404).json({ error: 'Media not found' });
  }

  const filePath = path.join(mediaRoot, fileName);

  if (!filePath.startsWith(mediaRoot)) {
    return res.status(400).json({ error: 'Invalid media path' });
  }

  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }

  if (!mediaMessage.media_id) {
    return res.status(404).json({ error: 'Media file missing' });
  }

  const restoredMedia = await downloadWhatsAppMedia(mediaMessage.media_id, mediaMessage.mime_type || '', req.user.tenantId);

  if (!restoredMedia.mediaUrl || !restoredMedia.mediaLocalPath || !fs.existsSync(restoredMedia.mediaLocalPath)) {
    return res.status(404).json({ error: 'Media file missing' });
  }

  await query(
    `UPDATE messages
     SET media_url = $3,
         media_local_path = $4,
         mime_type = COALESCE($5, mime_type),
         file_size = COALESCE($6, file_size)
     WHERE id = $1
       AND tenant_id = $2`,
    [
      mediaMessage.id,
      req.user.tenantId,
      restoredMedia.mediaUrl,
      restoredMedia.mediaLocalPath,
      restoredMedia.mimeType,
      restoredMedia.fileSize,
    ],
  );

  return res.sendFile(restoredMedia.mediaLocalPath);
}));

// =========================================================
// CONSTANTS
// =========================================================

const DEFAULT_APP_SETTINGS = {
  appName: 'WhatsApp Sales CRM',
  companyName: 'Your Company',
  industry: 'General Sales',
  primaryColor: '#0b7f69',
  currency: 'INR',
  labels: ['New Enquiry', 'Quotation Required', 'Dispatch Query', 'Payment Follow-up', 'Complaint', 'Review Required'],
  stages: ['new', 'qualified', 'quoted', 'won', 'lost'],
  quotationPrefix: 'QT-WA',
  orderPrefix: 'SO-WA',
  botEnabled: true,
  botGreeting: 'Hello, please share the product, size, and quantity you need.',
  handoffKeywords: ['urgent', 'complaint', 'stuck', 'salesperson'],
  inventoryFields: ['sku', 'name', 'grade', 'size', 'shape', 'stock_qty', 'price'],

  quoteApprovalEnabled: true,
  quoteApprovalManagerName: '',
  quoteApprovalManagerPhone: '',
  quoteApprovalTemplateName: 'quote_manager_approval_request',
  quoteApprovalTemplateLanguage: 'en',
  customerQuoteTemplateName: 'quote_customer_approval_request',
  customerQuoteTemplateLanguage: 'en',
  orderAcknowledgementTemplateName: 'order_acknowledgement',
  orderAcknowledgementTemplateLanguage: 'en',
};

// =========================================================
// HELPERS
// =========================================================

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function signUser(user) {
  return jwt.sign(
    { id: user.id, tenantId: user.tenant_id, name: user.name, email: user.email, role: user.role },
    jwtSecret,
    { expiresIn: '12h' },
  );
}

function publicUser(user) {
  return { id: user.id, tenantId: user.tenant_id, name: user.name, email: user.email, role: user.role, active: user.active };
}

function hasRealValue(value) {
  return Boolean(value && !value.startsWith('your-') && !value.startsWith('change-'));
}

function isWhatsAppConfigured() {
  return hasRealValue(process.env.WHATSAPP_ACCESS_TOKEN) && hasRealValue(process.env.WHATSAPP_PHONE_NUMBER_ID);
}

function shouldAllowLocalMessageQueue() {
  return !isProduction;
}

function maskValue(value) {
  if (!value) return '';
  if (value.length <= 8) return '********';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
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

function getLoginAttemptKey(req, email) {
  return `${req.ip || req.headers['x-forwarded-for'] || 'unknown'}:${email}`;
}

function isLoginLocked(req, email) {
  const key = getLoginAttemptKey(req, email);
  const entry = loginAttempts.get(key);

  if (!entry) return false;

  if (entry.lockedUntil && entry.lockedUntil > Date.now()) {
    return true;
  }

  if (entry.lockedUntil && entry.lockedUntil <= Date.now()) {
    loginAttempts.delete(key);
  }

  return false;
}

function recordFailedLogin(req, email) {
  const key = getLoginAttemptKey(req, email);
  const entry = loginAttempts.get(key) || { count: 0, lockedUntil: null };

  entry.count += 1;

  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOGIN_LOCK_MS;
  }

  loginAttempts.set(key, entry);
}

function clearLoginAttempts(req, email) {
  loginAttempts.delete(getLoginAttemptKey(req, email));
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

function authCookieOptions() {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  };
}

function setAuthCookie(res, user) {
  res.cookie('bosAuthToken', signUser(user), authCookieOptions());
}

function clearAuthCookie(res) {
  res.clearCookie('bosAuthToken', {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
  });
}

function cleanList(value, fallback) {
  const list = Array.isArray(value)
    ? value
    : String(value || '').split(',').map((item) => item.trim());
  const clean = [...new Set(list.filter(Boolean))];
  return clean.length ? clean : fallback;
}

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function validateRuntimeConfig() {
  const warnings = [];

  if (!hasRealValue(process.env.JWT_SECRET) && isProduction) {
    warnings.push('JWT_SECRET is required in production.');
  }

  if (!hasRealValue(process.env.FRONTEND_URL) && isProduction) {
    warnings.push('FRONTEND_URL should be set in production so browser API calls are allowed by CORS.');
  }

  if (!hasRealValue(process.env.PUBLIC_BASE_URL) && isProduction) {
    warnings.push('PUBLIC_BASE_URL should be set in production so Meta webhook callback URL is clear.');
  }

  if (hasRealValue(process.env.WHATSAPP_ACCESS_TOKEN) !== hasRealValue(process.env.WHATSAPP_PHONE_NUMBER_ID)) {
    warnings.push('WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID should be configured together.');
  }

  if (isProduction && hasRealValue(process.env.WHATSAPP_ACCESS_TOKEN) && !hasRealValue(process.env.WHATSAPP_APP_SECRET)) {
    warnings.push('WHATSAPP_APP_SECRET is required in production. Incoming Meta webhooks will be rejected without a valid signature secret.');
  }

  if (hasRealValue(process.env.WHATSAPP_ACCESS_TOKEN) && !hasRealValue(process.env.WHATSAPP_TEST_NUMBERS)) {
    warnings.push('WHATSAPP_TEST_NUMBERS is missing. Admin test-message sending will be blocked until allowed numbers are added.');
  }

  return warnings;
}

// =========================================================
// AUTH
// =========================================================

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
         tenants.status AS tenant_status
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
    logoUrl: tenant.logo_url || '',
    businessPhone: tenant.business_phone || '',
    businessEmail: tenant.business_email || '',
    metaBusinessId: tenant.meta_business_id || '',
    onboardingStatus: tenant.onboarding_status || 'pending',
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

// =========================================================
// TENANT
// =========================================================

let _demoTenantId = null;

async function getDemoTenantId() {
  if (_demoTenantId) return _demoTenantId;

  const result = await query(
    `INSERT INTO tenants (name, slug, industry, status, plan)
     VALUES ('Demo Company', 'demo', 'General', 'active', 'starter')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
  );

  _demoTenantId = result.rows[0].id;
  return _demoTenantId;
}

async function ensureDefaultWhatsAppAccountMapping(displayPhoneNumber = null) {
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

  if (phoneNumberId === String(process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim()) {
    return ensureDefaultWhatsAppAccountMapping(value?.metadata?.display_phone_number || null);
  }

  return null;
}

// =========================================================
// AUDIT / ASSIGNMENT
// =========================================================

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
    metadata: { fromUserId: fromUserId || null, toUserId: toUserId || null, reason: reason || '' },
  });
  return result.rows[0];
}

// =========================================================
// APP SETTINGS
// =========================================================

function normalizeAppSettings(input = {}) {
  return {
    ...DEFAULT_APP_SETTINGS,
    ...input,
    appName: String(input.appName || DEFAULT_APP_SETTINGS.appName).trim().slice(0, 80),
    companyName: String(input.companyName || DEFAULT_APP_SETTINGS.companyName).trim().slice(0, 100),
    industry: String(input.industry || DEFAULT_APP_SETTINGS.industry).trim().slice(0, 80),
    primaryColor: /^#[0-9a-f]{6}$/i.test(String(input.primaryColor || '')) ? input.primaryColor : DEFAULT_APP_SETTINGS.primaryColor,
    currency: String(input.currency || DEFAULT_APP_SETTINGS.currency).trim().toUpperCase().slice(0, 6),
    labels: cleanList(input.labels, DEFAULT_APP_SETTINGS.labels),
    stages: cleanList(input.stages, DEFAULT_APP_SETTINGS.stages),
    quotationPrefix: String(input.quotationPrefix || DEFAULT_APP_SETTINGS.quotationPrefix).trim().slice(0, 16),
    orderPrefix: String(input.orderPrefix || DEFAULT_APP_SETTINGS.orderPrefix).trim().slice(0, 16),
    botEnabled: Boolean(input.botEnabled),
    botGreeting: String(input.botGreeting || DEFAULT_APP_SETTINGS.botGreeting).trim().slice(0, 500),
    handoffKeywords: cleanList(input.handoffKeywords, DEFAULT_APP_SETTINGS.handoffKeywords),
    inventoryFields: cleanList(input.inventoryFields, DEFAULT_APP_SETTINGS.inventoryFields),

    quoteApprovalEnabled: input.quoteApprovalEnabled === undefined ? DEFAULT_APP_SETTINGS.quoteApprovalEnabled : Boolean(input.quoteApprovalEnabled),
    quoteApprovalManagerName: String(input.quoteApprovalManagerName || '').trim().slice(0, 100),
    quoteApprovalManagerPhone: String(input.quoteApprovalManagerPhone || '').replace(/\D/g, '').slice(0, 15),
    quoteApprovalTemplateName: String(input.quoteApprovalTemplateName || DEFAULT_APP_SETTINGS.quoteApprovalTemplateName).trim().toLowerCase().slice(0, 80),
    quoteApprovalTemplateLanguage: String(input.quoteApprovalTemplateLanguage || DEFAULT_APP_SETTINGS.quoteApprovalTemplateLanguage).trim().slice(0, 12),
        customerQuoteTemplateName: String(input.customerQuoteTemplateName || DEFAULT_APP_SETTINGS.customerQuoteTemplateName).trim().toLowerCase().slice(0, 80),
    customerQuoteTemplateLanguage: String(input.customerQuoteTemplateLanguage || DEFAULT_APP_SETTINGS.customerQuoteTemplateLanguage).trim().slice(0, 12),
    orderAcknowledgementTemplateName: String(input.orderAcknowledgementTemplateName || DEFAULT_APP_SETTINGS.orderAcknowledgementTemplateName).trim().toLowerCase().slice(0, 80),
    orderAcknowledgementTemplateLanguage: String(input.orderAcknowledgementTemplateLanguage || DEFAULT_APP_SETTINGS.orderAcknowledgementTemplateLanguage).trim().slice(0, 12),
  };
}

async function getAppSettings(tenantId) {
  const result = await query(
    'SELECT value FROM app_settings WHERE tenant_id = $1 AND key = $2',
    [tenantId, 'customization'],
  );
  return normalizeAppSettings(result.rows[0]?.value || {});
}

async function saveAppSettings(tenantId, settings) {
  const normalized = normalizeAppSettings(settings);
  const result = await query(
    `INSERT INTO app_settings (tenant_id, key, value, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (tenant_id, key)
     DO UPDATE SET value = EXCLUDED.value, updated_at = now()
     RETURNING value`,
    [tenantId, 'customization', normalized],
  );
  return normalizeAppSettings(result.rows[0].value);
}

// =========================================================
// PRODUCT HELPERS
// =========================================================

function normalizeProduct(input = {}) {
  const customFields = input.custom_fields && typeof input.custom_fields === 'object' && !Array.isArray(input.custom_fields)
    ? input.custom_fields
    : {};
  return {
    sku: String(input.sku || '').trim().slice(0, 80),
    name: String(input.name || '').trim().slice(0, 160),
    category: String(input.category || '').trim().slice(0, 80),
    grade: String(input.grade || '').trim().slice(0, 80),
    size: String(input.size || '').trim().slice(0, 80),
    shape: String(input.shape || '').trim().slice(0, 80),
    unit: String(input.unit || 'pcs').trim().slice(0, 20) || 'pcs',
    price: toFiniteNumber(input.price, 0),
    stock_qty: toFiniteNumber(input.stock_qty, 0),
    active: input.active === undefined ? true : Boolean(input.active),
    custom_fields: customFields,
  };
}

const PRODUCT_FIELD_ALIASES = {
  sku: ['sku', 'item code', 'item_code', 'product code', 'product_code', 'code'],
  name: ['name', 'product', 'product name', 'product_name', 'item', 'item name', 'item_name'],
  category: ['category', 'group', 'product group', 'product_group'],
  grade: ['grade', 'material grade'],
  size: ['size', 'dimension'],
  shape: ['shape', 'type'],
  unit: ['unit', 'uom'],
  price: ['price', 'rate', 'sales price', 'sale price'],
  stock_qty: ['stock_qty', 'stock qty', 'stock', 'qty', 'quantity', 'available qty', 'available_qty'],
  active: ['active', 'status', 'enabled'],
};

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function findProductValue(row, field) {
  const aliases = PRODUCT_FIELD_ALIASES[field] || [field];
  const entries = Object.entries(row || {});
  for (const alias of aliases) {
    const found = entries.find(([key]) => normalizeHeader(key) === normalizeHeader(alias));
    if (found) return found[1];
  }
  return undefined;
}

function productFromImportRow(row = {}) {
  const knownHeaders = new Set(Object.values(PRODUCT_FIELD_ALIASES).flat().map(normalizeHeader));
  const base = {};
  Object.keys(PRODUCT_FIELD_ALIASES).forEach((field) => {
    const value = findProductValue(row, field);
    if (value !== undefined) base[field] = value;
  });
  if (base.active !== undefined) {
    base.active = !['false', 'inactive', 'no', '0'].includes(String(base.active).trim().toLowerCase());
  }
  const custom_fields = {};
  Object.entries(row).forEach(([key, value]) => {
    if (!knownHeaders.has(normalizeHeader(key)) && String(value || '').trim() !== '') {
      custom_fields[key.trim()] = value;
    }
  });
  return normalizeProduct({ ...base, custom_fields });
}

// =========================================================
// KNOWLEDGE BASE HELPERS
// =========================================================

function normalizeKnowledgeBaseItem(input = {}) {
  const keywordList = Array.isArray(input.keywords)
    ? input.keywords
    : String(input.keywords || '').split(',');

  return {
    title: String(input.title || '').trim().slice(0, 140),
    category: String(input.category || 'general').trim().toLowerCase().slice(0, 60) || 'general',
    content: String(input.content || '').trim().slice(0, 3000),
    keywords: [...new Set(keywordList.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))].slice(0, 30),
    active: input.active === undefined ? true : Boolean(input.active),
  };
}

function shouldUseKnowledgeBase(text = '') {
  const body = normalizeUserText(text);

  if (!body) return false;

  const blockedSensitiveIntents = /(ledger|outstanding|balance|credit limit|payment received|dispatch status|track order|order status|final rate|confirm order|book order|approve quote)/i;
  if (blockedSensitiveIntents.test(body)) return false;

  return /(about|company|profile|terms|condition|payment terms|delivery terms|freight|gst|address|location|facility|capability|quality|certificate|policy|complaint|return|warranty|material|grade equivalent|faq)/i.test(body);
}

function knowledgeSearchTerms(text = '') {
  const stopWords = new Set([
    'what', 'is', 'are', 'the', 'a', 'an', 'for', 'of', 'in', 'to', 'and', 'or',
    'please', 'pls', 'tell', 'me', 'your', 'you', 'do', 'does', 'ka', 'kya',
    'hai', 'hain', 'ke', 'ki', 'company', 'details',
  ]);

  return [...new Set(
    String(text || '')
      .toLowerCase()
      .match(/[a-z0-9.-]+/gi) || [],
  )]
    .map((item) => item.trim())
    .filter((item) => item.length >= 3 && !stopWords.has(item))
    .slice(0, 8);
}

async function findKnowledgeMatches(tenantId, text = '') {
  if (!tenantId || !shouldUseKnowledgeBase(text)) return [];

  const terms = knowledgeSearchTerms(text);

  if (!terms.length) return [];

  const params = [tenantId];
  const clauses = terms.map((term) => {
    params.push(`%${term}%`);
    const index = params.length;
    return `(title ILIKE $${index} OR category ILIKE $${index} OR content ILIKE $${index} OR EXISTS (SELECT 1 FROM unnest(keywords) kw WHERE kw ILIKE $${index}))`;
  });

  const result = await query(
    `SELECT id, title, category, content, keywords
     FROM knowledge_base
     WHERE tenant_id = $1
       AND active = true
       AND (${clauses.join(' OR ')})
     ORDER BY updated_at DESC
     LIMIT 3`,
    params,
  );

  return result.rows;
}

function buildKnowledgeReply({ settings = {}, text = '', knowledgeMatches = [] }) {
  if (!knowledgeMatches.length) return null;

  const company = settings.companyName || settings.appName || 'our team';
  const top = knowledgeMatches[0];

  if (!top?.content) return null;

  const cleanContent = String(top.content || '').trim().slice(0, 900);

  return `Based on ${company} knowledge:

${cleanContent}

If you want quotation/order/account-specific details, our team will verify and respond.`;
}

// =========================================================
// WHATSAPP / MESSAGE HELPERS
// =========================================================

function verifyMetaWebhookSignature(req) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!hasRealValue(appSecret)) {
    return !isProduction;
  }
  const signature = req.headers['x-hub-signature-256'];
  if (!signature || !signature.startsWith('sha256=')) return false;
  const expectedSignature = `sha256=${crypto.createHmac('sha256', appSecret).update(req.rawBody || Buffer.from('')).digest('hex')}`;
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

function isReplyWindowOpen(contact) {
  if (!contact?.last_inbound_at) return false;
  return Date.now() - new Date(contact.last_inbound_at).getTime() <= 24 * 60 * 60 * 1000;
}

function normalizeUserText(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
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

function categorizeMessage(text) {
  const body = (text || '').toLowerCase();
  if (/(dispatch|tracking|delivery|transport|lr|courier)/.test(body)) return 'Dispatch Query';
  if (/(payment|paid|balance|utr|invoice|outstanding)/.test(body)) return 'Payment Follow-up';
  if (/(complaint|problem|issue|damage|wrong|not working)/.test(body)) return 'Complaint';
  if (/(review|feedback|rating)/.test(body)) return 'Review Required';
  if (/(quote|quotation|rate|price|offer|estimate)/.test(body)) return 'Quotation Required';
  return 'New Enquiry';
}

function extractEnquiry(text) {
  const body = text || '';
  const grade = body.match(/\b(?:grade|material)\s*[:\-]?\s*([a-z0-9\-]+)/i)?.[1] || body.match(/\b(en\d+|ss\s?\d+|ms|is\s?\d+)\b/i)?.[1] || '';
  const size = body.match(/\b(?:size|dia|diameter)\s*[:\-]?\s*([0-9.]+\s*(?:mm|inch|in|x\s*[0-9.]+)?)/i)?.[1] || body.match(/\b[0-9.]+\s*mm\b/i)?.[0] || '';
  const shape = body.match(/\b(round bar|flat bar|sheet|plate|pipe|rod|coil|square bar|hex bar)\b/i)?.[1] || '';
  const quantity = body.match(/\b(?:qty|quantity|required)\s*[:\-]?\s*([0-9.]+\s*(?:pcs|piece|kg|ton|nos|mt)?)\b/i)?.[1] || body.match(/\b[0-9.]+\s*(?:pcs|piece|kg|ton|nos|mt)\b/i)?.[0] || '';
  return { grade, size, shape, quantity };
}

function getBotIntent(text) {
  const body = normalizeUserText(text);

  if (/^(hi|hii|hello|hey|namaste|good morning|good afternoon|good evening)\b/.test(body)) return 'greeting';
  if (/(order|book|buy|purchase|confirm|place order|chahiye|chaiye|bhejo|required|require|need)/i.test(body)) return 'order';
  if (/(quote|quotation|rate|price|offer|estimate|kitna|cost)/i.test(body)) return 'quotation';
  if (/(dispatch|tracking|delivery|transport|lr|courier)/i.test(body)) return 'dispatch';
  if (/(payment|paid|balance|utr|invoice|outstanding)/i.test(body)) return 'payment';
  if (/(complaint|problem|issue|damage|wrong|not working)/i.test(body)) return 'complaint';
  return 'general';
}

function botProductSearchTerms(text, enquiry) {
  const stopWords = new Set([
    'hi', 'hii', 'hello', 'hey', 'need', 'required', 'require', 'quotation', 'quote',
    'rate', 'price', 'order', 'book', 'buy', 'qty', 'quantity', 'size', 'grade',
    'please', 'pls', 'for', 'the', 'and', 'me', 'send', 'chahiye', 'chaiye',
  ]);
  const parts = [
    enquiry.grade,
    enquiry.size,
    enquiry.shape,
    ...(String(text || '').match(/[a-z0-9.-]+/gi) || []),
  ]
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item) => item.length >= 2 && !stopWords.has(item));

  return [...new Set(parts)].slice(0, 6);
}

async function findBotProductMatches(tenantId, text, enquiry) {
  const terms = botProductSearchTerms(text, enquiry);
  const params = [tenantId];
  let searchClause = '';

  if (terms.length) {
    const clauses = terms.map((term) => {
      params.push(`%${term}%`);
      const index = params.length;
      return `(sku ILIKE $${index} OR name ILIKE $${index} OR category ILIKE $${index} OR grade ILIKE $${index} OR size ILIKE $${index} OR shape ILIKE $${index})`;
    });
    searchClause = `AND (${clauses.join(' OR ')})`;
  }

  const result = await query(
    `SELECT sku, name, category, grade, size, shape, unit, price, stock_qty
     FROM products
     WHERE tenant_id = $1
       AND active = true
       ${searchClause}
     ORDER BY stock_qty DESC, name ASC
     LIMIT 5`,
    params,
  );

  return result.rows;
}

function formatBotProductLine(product, currency, index) {
  const specs = [product.sku, product.name, product.grade, product.size, product.shape]
    .filter(Boolean)
    .join(' - ');
  const price = Number(product.price || 0) > 0 ? ` | Rate: ${currency} ${Number(product.price).toFixed(2)}` : '';
  const stock = Number(product.stock_qty || 0) > 0 ? ` | Stock: ${Number(product.stock_qty)} ${product.unit || 'pcs'}` : '';
  return `${index + 1}. ${specs || 'Product'}${price}${stock}`;
}

function buildBotReplyText({ settings, text, products = [] }) {
  const cleanText = String(text || '').trim();
  const normalized = normalizeUserText(cleanText);

  if (!normalized || isOptOutMessage(normalized)) return null;

  const handoffWords = settings.handoffKeywords || [];
  const needsHandoff = handoffWords.some((keyword) => keyword && normalized.includes(normalizeUserText(keyword)));
  const company = settings.companyName || settings.appName || 'our business';
  const currency = settings.currency || 'INR';
  const enquiry = extractEnquiry(cleanText);
  const hasProductDetail = Boolean(enquiry.grade || enquiry.size || enquiry.shape || enquiry.quantity);
  const productLines = products.map((product, index) => formatBotProductLine(product, currency, index)).join('\n');
  const productBlock = productLines ? `\n\nAvailable product details:\n${productLines}` : '';
  const detailRequest = 'Please share product name/grade, size, quantity, delivery city and GST/company name.';
  const intent = getBotIntent(cleanText);
    const menuSelectionReply = buildMenuSelectionReply(cleanText, settings);
  if (menuSelectionReply) {
    return menuSelectionReply;
  }

  if (needsHandoff || intent === 'complaint') {
    return `Thanks for sharing this with ${company}. Your message is marked for team review. A team member will check and respond shortly.`;
  }

  if (intent === 'dispatch') {
    return `Please share order number or invoice number. ${company} team will use it to check dispatch/tracking status.`;
  }

  if (intent === 'payment') {
    return `Please share invoice number or payment UTR. ${company} team will verify and update your account status.`;
  }

  if (intent === 'greeting') {
    return `${settings.botGreeting}\n\nWelcome to ${company}. You can ask for price, quotation, stock, product details or order booking.${productBlock}\n\n${detailRequest}`;
  }

  if (intent === 'order') {
    return `Order booking ke liye details confirm kar dijiye.${productBlock}\n\n${detailRequest}\nAfter confirmation, our team will validate stock/rate and create the order.`;
  }

  if (intent === 'quotation' || hasProductDetail) {
    return `Quotation ke liye details received.${productBlock}\n\n${detailRequest}\nIf the item is correct, reply "confirm" with required quantity.`;
  }

  return `${settings.botGreeting}\n\n${detailRequest}`;
}

async function buildBotReply({ tenantId, settings, text }) {
  const knowledgeMatches = await findKnowledgeMatches(tenantId, text);
  const knowledgeReply = buildKnowledgeReply({ settings, text, knowledgeMatches });

  if (knowledgeReply) {
    return knowledgeReply.slice(0, 1000);
  }

  const enquiry = extractEnquiry(text);
  const products = await findBotProductMatches(tenantId, text, enquiry);
  const reply = buildBotReplyText({ settings, text, products });

  return reply ? reply.slice(0, 1000) : null;
}

function shouldSendMainMenu(text = '') {
  const body = normalizeUserText(text);
  return /^(hi|hii|hello|hey|namaste|menu|start|help|options|open menu)\b/.test(body);
}

function buildMainMenuInteractive(settings = {}) {
  const companyName = settings.companyName || settings.appName || 'our team';

  return {
    messaging_product: 'whatsapp',
    type: 'interactive',
    interactive: {
      type: 'list',
      header: {
        type: 'text',
        text: companyName.slice(0, 60),
      },
      body: {
        text: `Welcome to ${companyName}. Please choose what you want to do.`,
      },
      footer: {
        text: 'Powered by WhatsApp Business',
      },
      action: {
        button: 'Open Menu',
        sections: [
          {
            title: 'Sales & Support',
            rows: [
              {
                id: 'request_quote',
                title: 'Request Quote',
                description: 'Share product, size and quantity',
              },
              {
                id: 'browse_products',
                title: 'Browse Products',
                description: 'See product categories',
              },
              {
                id: 'order_status',
                title: 'Check Order Status',
                description: 'Track booking, payment or dispatch',
              },
              {
                id: 'ledger',
                title: 'Ledger / Outstanding',
                description: 'Ask for account balance or invoices',
              },
              {
                id: 'talk_to_sales',
                title: 'Talk to Sales',
                description: 'Connect with a team member',
              },
            ],
          },
        ],
      },
    },
  };
}

function menuPayloadToText(menuPayload) {
  const rows = menuPayload?.interactive?.action?.sections?.flatMap((section) => section.rows || []) || [];
  const body = menuPayload?.interactive?.body?.text || 'Please choose an option.';
  const options = rows.map((row, index) => `${index + 1}. ${row.title}`).join('\n');
  return `${body}\n\n${options}`;
}

async function getProductCategoriesForTenant(tenantId) {
  const result = await query(
    `SELECT category, COUNT(*)::int AS count
     FROM products
     WHERE tenant_id = $1
       AND active = true
       AND NULLIF(TRIM(category), '') IS NOT NULL
     GROUP BY category
     ORDER BY count DESC, category ASC
     LIMIT 10`,
    [tenantId],
  );

  return result.rows;
}

function buildCategoryMenuInteractive(settings = {}, categories = []) {
  const companyName = settings.companyName || settings.appName || 'our team';

  const rows = categories.length
    ? categories.map((item) => ({
        id: `category_${String(item.category || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40)}`,
        title: String(item.category || 'Products').slice(0, 24),
        description: `${item.count} active product${Number(item.count) === 1 ? '' : 's'}`,
      }))
    : [
        { id: 'category_steel', title: 'Steel', description: 'Steel products and grades' },
        { id: 'category_plates', title: 'Plates', description: 'Plate items' },
        { id: 'category_round_bars', title: 'Round Bars', description: 'Round bar items' },
        { id: 'category_coils', title: 'Coils', description: 'Coil items' },
      ];

  return {
    messaging_product: 'whatsapp',
    type: 'interactive',
    interactive: {
      type: 'list',
      header: {
        type: 'text',
        text: companyName.slice(0, 60),
      },
      body: {
        text: 'Please select a product category.',
      },
      footer: {
        text: 'Select category to view products',
      },
      action: {
        button: 'Select Category',
        sections: [
          {
            title: 'Product Categories',
            rows,
          },
        ],
      },
    },
  };
}

async function findExactProductCategory(tenantId, text = '') {
  const cleanText = normalizeUserText(text);

  if (!cleanText) return null;

  const result = await query(
    `SELECT category
     FROM products
     WHERE tenant_id = $1
       AND active = true
       AND LOWER(TRIM(category)) = $2
     LIMIT 1`,
    [tenantId, cleanText],
  );

  return result.rows[0]?.category || null;
}

async function buildCategoryProductsReply(tenantId, category, settings = {}) {
  const currency = settings.currency || 'INR';

  const result = await query(
    `SELECT sku, name, grade, size, shape, unit, price, stock_qty
     FROM products
     WHERE tenant_id = $1
       AND active = true
       AND LOWER(TRIM(category)) = LOWER(TRIM($2))
     ORDER BY stock_qty DESC, name ASC
     LIMIT 8`,
    [tenantId, category],
  );

  const products = result.rows;

  if (!products.length) {
    return `No active products found under ${category}. Please share product name/grade/size and our sales team will assist.`;
  }

  const lines = products.map((product, index) => {
    const specs = [product.sku, product.name, product.grade, product.size, product.shape]
      .filter(Boolean)
      .join(' - ');

    const stockText = Number(product.stock_qty || 0) > 0
      ? ` | Stock: ${Number(product.stock_qty)} ${product.unit || 'pcs'}`
      : ' | Stock: On request';

    const priceText = Number(product.price || 0) > 0
      ? ` | Rate: ${currency} ${Number(product.price).toFixed(2)}`
      : ' | Rate: On request';

    return `${index + 1}. ${specs || 'Product'}${stockText}${priceText}`;
  });

  return `Products in ${category}:\n\n${lines.join('\n')}\n\nFor quotation, reply with item number/product name, size, quantity, delivery city and GST/company name.`;
}

function buildMenuSelectionReply(text = '', settings = {}) {
  const selected = normalizeUserText(text);
  const company = settings.companyName || settings.appName || 'our team';

  if (selected === 'request quote') {
    return `Quotation ke liye please product name/grade, size, quantity, delivery city and GST/company name share kijiye. ${company} team details verify karke quote draft karegi.`;
  }

  if (selected === 'browse products') {
    return null;
  }

  if (selected === 'check order status') {
    return 'Please share your order number, quotation number, invoice number, or registered company/mobile number.';
  }

  if (selected === 'ledger / outstanding' || selected === 'ledger') {
    return 'Ledger/outstanding details ke liye please registered company name or customer code share kijiye. Sensitive account details verified contact ko hi share honge.';
  }

  if (selected === 'talk to sales') {
    return `Your message is marked for sales team review. ${company} team member will respond shortly.`;
  }

  return null;
}

function hasQuoteRequestSignal(text = '') {
  const body = normalizeUserText(text);

  if (!body) return false;

  return /(quote|quotation|rate|price|offer|estimate|require|required|need|chahiye|chaiye|qty|quantity|mt|kg|tons?|nos|pcs|piece|delivery|gst|company)/i.test(body);
}

function hasEnoughQuoteDetails(enquiry = {}) {
  return Boolean(
    enquiry.grade ||
    enquiry.size ||
    enquiry.shape ||
    enquiry.quantity,
  );
}

function buildMissingQuoteDetailsReply(settings = {}) {
  const company = settings.companyName || settings.appName || 'our team';

  return `Quotation banane ke liye please ye details share kijiye:

1. Product / Grade
2. Size / Dimension
3. Quantity
4. Delivery city
5. Company name / GST

Example:
Need SS 316 plate 3mm 4 MT delivery Pune

${company} team details verify karke quote draft karegi.`;
}

async function findBestProductForQuote(tenantId, text = '', enquiry = {}) {
  const terms = botProductSearchTerms(text, enquiry);

  if (!terms.length) return null;

  const params = [tenantId];
  const clauses = terms.map((term) => {
    params.push(`%${term}%`);
    const index = params.length;
    return `(sku ILIKE $${index} OR name ILIKE $${index} OR category ILIKE $${index} OR grade ILIKE $${index} OR size ILIKE $${index} OR shape ILIKE $${index})`;
  });

  const result = await query(
    `SELECT id, sku, name, category, grade, size, shape, unit, price, stock_qty
     FROM products
     WHERE tenant_id = $1
       AND active = true
       AND (${clauses.join(' OR ')})
     ORDER BY stock_qty DESC, price DESC, name ASC
     LIMIT 1`,
    params,
  );

  return result.rows[0] || null;
}

async function createStructuredQuoteDraft({ tenantId, contactId, messageId, text }) {
  const cleanText = String(text || '').trim();
  const enquiry = extractEnquiry(cleanText);

  if (!cleanText || !hasQuoteRequestSignal(cleanText) || !hasEnoughQuoteDetails(enquiry)) {
    return null;
  }

  const matchedProduct = await findBestProductForQuote(tenantId, cleanText, enquiry);

  const draftGrade = enquiry.grade || matchedProduct?.grade || '';
  const draftSize = enquiry.size || matchedProduct?.size || '';
  const draftShape = enquiry.shape || matchedProduct?.shape || '';
  const draftQuantity = enquiry.quantity || '';

  const existing = await query(
    `SELECT id
     FROM enquiry_drafts
     WHERE tenant_id = $1
       AND contact_id = $2
       AND status = 'draft'
       AND created_at >= now() - interval '30 minutes'
     ORDER BY created_at DESC
     LIMIT 1`,
    [tenantId, contactId],
  );

  if (existing.rows[0]) {
    const result = await query(
      `UPDATE enquiry_drafts
       SET message_id = COALESCE($3, message_id),
           grade = COALESCE(NULLIF($4, ''), grade),
           size = COALESCE(NULLIF($5, ''), size),
           shape = COALESCE(NULLIF($6, ''), shape),
           quantity = COALESCE(NULLIF($7, ''), quantity),
           source = 'WhatsApp Structured Quote'
       WHERE id = $1
         AND tenant_id = $2
       RETURNING *`,
      [
        existing.rows[0].id,
        tenantId,
        messageId || null,
        draftGrade,
        draftSize,
        draftShape,
        draftQuantity,
      ],
    );

    return { draft: result.rows[0], matchedProduct, enquiry, updatedExisting: true };
  }

  const result = await query(
    `INSERT INTO enquiry_drafts (tenant_id, contact_id, message_id, grade, size, shape, quantity, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'WhatsApp Structured Quote')
     RETURNING *`,
    [
      tenantId,
      contactId,
      messageId || null,
      draftGrade,
      draftSize,
      draftShape,
      draftQuantity,
    ],
  );

  return { draft: result.rows[0], matchedProduct, enquiry, updatedExisting: false };
}

function buildStructuredQuoteConfirmation({ draftResult, settings = {} }) {
  if (!draftResult?.draft) return null;

  const company = settings.companyName || settings.appName || 'our team';
  const product = draftResult.matchedProduct;
  const draft = draftResult.draft;

  const matchedLine = product
    ? `Matched product: ${[product.sku, product.name, product.grade, product.size, product.shape].filter(Boolean).join(' - ')}`
    : 'Matched product: Sales team will verify manually';

  const stockLine = product && Number(product.stock_qty || 0) > 0
    ? `Available stock: ${Number(product.stock_qty)} ${product.unit || 'pcs'}`
    : 'Available stock: To be verified';

  const rateLine = product && Number(product.price || 0) > 0
    ? `Indicative rate in master: ${settings.currency || 'INR'} ${Number(product.price).toFixed(2)}`
    : 'Rate: To be quoted after verification';

  return `✅ Quote request captured.

${matchedLine}
Grade: ${draft.grade || '-'}
Size: ${draft.size || '-'}
Shape: ${draft.shape || '-'}
Quantity: ${draft.quantity || '-'}

${stockLine}
${rateLine}

${company} team will verify price, stock, delivery terms and share the official quotation.`;
}

function parseQuantity(value) {
  const match = String(value || '').match(/([0-9.]+)\s*([a-zA-Z]*)/);
  return { quantity: toFiniteNumber(match?.[1], 1), unit: match?.[2] || 'pcs' };
}

function normalizeSalesItem(item = {}) {
  const parsed = parseQuantity(item.quantity);
  const quantity = toFiniteNumber(item.quantity_value || parsed.quantity, 1);
  const rate = toFiniteNumber(item.rate, 0);
  return {
    product_id: item.product_id || null,
    description: item.description || [item.shape, item.grade, item.size].filter(Boolean).join(' ') || 'WhatsApp enquiry item',
    grade: item.grade || '',
    size: item.size || '',
    shape: item.shape || '',
    quantity,
    unit: item.unit || parsed.unit || 'pcs',
    rate,
    amount: toFiniteNumber(item.amount, quantity * rate || 0),
  };
}

function sumItems(items) {
  return items.reduce((total, item) => total + Number(item.amount || 0), 0);
}

async function validateSalesItemsForTenant(tenantId, items = []) {
  const productIds = [
    ...new Set(
      items
        .map((item) => item.product_id)
        .filter(Boolean),
    ),
  ];

  if (!productIds.length) return;

  const result = await query(
    `SELECT id
     FROM products
     WHERE tenant_id = $1
       AND id = ANY($2::uuid[])`,
    [tenantId, productIds],
  );

  const validIds = new Set(result.rows.map((row) => row.id));
  const invalidIds = productIds.filter((id) => !validIds.has(id));

  if (invalidIds.length) {
    const error = new Error('One or more products do not belong to this company');
    error.statusCode = 400;
    throw error;
  }
}

async function validateContactForTenant(tenantId, contactId) {
  if (!contactId) return;

  const result = await query(
    'SELECT id FROM contacts WHERE id = $1 AND tenant_id = $2 LIMIT 1',
    [contactId, tenantId],
  );

  if (!result.rows[0]) {
    const error = new Error('Contact does not belong to this company');
    error.statusCode = 400;
    throw error;
  }
}

function extractText(message) {
  if (message.type === 'text') return message.text?.body || '';
  if (message.type === 'button') return message.button?.text || '';
  if (message.type === 'interactive') return message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '';
  if (message.type === 'image') return message.image?.caption || `[image ${message.image?.id || ''}]`.trim();
  if (message.type === 'document') return message.document?.caption || message.document?.filename || `[document ${message.document?.id || ''}]`.trim();
  if (message.type === 'audio') return `[audio ${message.audio?.id || ''}]`.trim();
  if (message.type === 'video') return message.video?.caption || `[video ${message.video?.id || ''}]`.trim();
  return `[${message.type || 'message'}]`;
}

function normalizeWhatsAppMessage(message = {}) {
  const type = message.type || 'unsupported';
  const contextWaMessageId = message.context?.id || null;
  const base = {
    type, body: '', normalizedText: '', caption: null, mediaId: null, mimeType: null,
    fileName: null, sha256: null, contextWaMessageId,
    interactivePayload: null, buttonPayload: null, locationPayload: null,
    contactsPayload: null, reactionPayload: null,
    referralPayload: message.referral || null, unsupportedPayload: null,
  };

  if (type === 'text') {
    const text = message.text?.body || '';
    return { ...base, body: text, normalizedText: text };
  }
  if (type === 'button') {
    const buttonText = message.button?.text || '';
    return { ...base, body: buttonText, normalizedText: buttonText, buttonPayload: message.button || null };
  }
  if (type === 'interactive') {
    const buttonReply = message.interactive?.button_reply;
    const listReply = message.interactive?.list_reply;
    const text = buttonReply?.title || listReply?.title || '';
    return { ...base, body: text || '[interactive]', normalizedText: text, interactivePayload: message.interactive || null };
  }
  if (type === 'image') {
    const media = message.image || {};
    const caption = media.caption || '';
    const mediaId = media.id || null;

    return {
      ...base,
      body: caption || (mediaId ? '[image]' : '[image: missing media_id]'),
      normalizedText: caption || '',
      caption: caption || null,
      mediaId,
      mimeType: media.mime_type || null,
      sha256: media.sha256 || null,
    };
  }
  if (type === 'document') {
    const media = message.document || {};
    const caption = media.caption || '';
    const fileName = media.filename || '';
    return { ...base, body: caption || fileName || '[document]', normalizedText: caption || fileName, caption, mediaId: media.id || null, mimeType: media.mime_type || null, fileName, sha256: media.sha256 || null };
  }
  if (type === 'audio') {
    const media = message.audio || {};
    return { ...base, body: '[audio]', normalizedText: '', mediaId: media.id || null, mimeType: media.mime_type || null, sha256: media.sha256 || null };
  }
  if (type === 'video') {
    const media = message.video || {};
    const caption = media.caption || '';
    return { ...base, body: caption || '[video]', normalizedText: caption, caption, mediaId: media.id || null, mimeType: media.mime_type || null, sha256: media.sha256 || null };
  }
  if (type === 'sticker') {
    const media = message.sticker || {};
    return { ...base, body: '[sticker]', normalizedText: '', mediaId: media.id || null, mimeType: media.mime_type || null, sha256: media.sha256 || null };
  }
  if (type === 'location') {
    const location = message.location || {};
    const text = [location.name, location.address].filter(Boolean).join(' - ');
    return { ...base, body: text || '[location]', normalizedText: text, locationPayload: location };
  }
  if (type === 'contacts') {
    const contacts = message.contacts || [];
    const firstName = contacts[0]?.name?.formatted_name || contacts[0]?.name?.first_name || '';
    return { ...base, body: firstName || '[contacts]', normalizedText: firstName, contactsPayload: contacts };
  }
  if (type === 'reaction') {
    const reaction = message.reaction || {};
    return { ...base, body: reaction.emoji || '[reaction]', normalizedText: reaction.emoji || '', reactionPayload: reaction, contextWaMessageId: reaction.message_id || contextWaMessageId };
  }
  return { ...base, body: `[unsupported: ${type}]`, normalizedText: '', unsupportedPayload: message };
}

function extensionFromMime(mimeType = '') {
  if (mimeType.includes('jpeg')) return 'jpg';
  if (mimeType.includes('png')) return 'png';
  if (mimeType.includes('webp')) return 'webp';
  if (mimeType.includes('pdf')) return 'pdf';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('mp4')) return 'mp4';
  return 'bin';
}

async function downloadWhatsAppMedia(mediaId, fallbackMimeType = '', tenantId = null) {
  if (!mediaId) {
    console.warn('WA media skipped: mediaId missing');
    return { mediaUrl: null, mediaLocalPath: null, mimeType: fallbackMimeType || null, fileSize: null };
  }

  const config = tenantId ? await getWhatsAppSendConfig(tenantId) : null;
  const accessToken = config?.accessToken || process.env.WHATSAPP_ACCESS_TOKEN;

  if (!hasRealValue(accessToken)) {
    console.warn('WA media skipped: WhatsApp token not configured for tenant');
    return { mediaUrl: null, mediaLocalPath: null, mimeType: fallbackMimeType || null, fileSize: null };
  }

  const apiVersion = config?.apiVersion || process.env.WHATSAPP_API_VERSION || 'v24.0';
  const maxAttempts = Number(process.env.WHATSAPP_MEDIA_MAX_ATTEMPTS || 3);
  const timeoutMs = Number(process.env.WHATSAPP_MEDIA_TIMEOUT_MS || 15000);

  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const metaRes = await axios.get(
        `https://graph.facebook.com/${apiVersion}/${mediaId}`,
        {
         headers: { Authorization: `Bearer ${accessToken}` },
          timeout: timeoutMs,
        },
      );

      const downloadUrl = metaRes.data?.url;
      const mimeType = metaRes.data?.mime_type || fallbackMimeType || '';
      const fileSize = metaRes.data?.file_size || null;

      if (!downloadUrl) {
        console.warn('WA media download URL missing:', {
          mediaId,
          mimeType,
          fileSize,
        });

        return { mediaUrl: null, mediaLocalPath: null, mimeType: mimeType || null, fileSize };
      }

      const extension = extensionFromMime(mimeType);
      const safeMediaId = String(mediaId).replace(/[^a-zA-Z0-9_-]/g, '_') || crypto.randomUUID();
      const fileName = `${safeMediaId}-${Date.now()}.${extension}`;
      const localPath = path.join(mediaRoot, fileName);

      const fileRes = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: timeoutMs,
        maxContentLength: Number(process.env.WHATSAPP_MEDIA_MAX_BYTES || 25 * 1024 * 1024),
        maxBodyLength: Number(process.env.WHATSAPP_MEDIA_MAX_BYTES || 25 * 1024 * 1024),
      });

      fs.writeFileSync(localPath, Buffer.from(fileRes.data));

      const mediaUrl = `/media/whatsapp/${fileName}`;

      console.log('WA media downloaded:', {
        mediaId,
        mediaUrl,
        mimeType,
        fileSize,
      });

      return {
        mediaUrl,
        mediaLocalPath: localPath,
        mimeType: mimeType || null,
        fileSize,
      };
    } catch (error) {
      lastError = error;

      console.error('WA media download attempt failed:', {
        attempt,
        maxAttempts,
        mediaId,
        status: error.response?.status || null,
        code: error.code || null,
        metaError: error.response?.data?.error?.message || error.response?.data || null,
        message: error.message,
      });

      if (!isRetryableWhatsAppError(error) || attempt >= maxAttempts) {
        break;
      }

      await sleep(500 * attempt);
    }
  }

  console.error('WA media download failed:', {
    mediaId,
    message: lastError?.message || 'Unknown media download error',
  });

  return { mediaUrl: null, mediaLocalPath: null, mimeType: fallbackMimeType || null, fileSize: null };
}

// =========================================================
// DB OPERATIONS
// =========================================================

async function getLeastLoadedSalesUser(tenantId) {
  const result = await query(
    `SELECT u.id
     FROM users u
     LEFT JOIN contacts c ON c.assigned_to = u.id AND c.tenant_id = u.tenant_id
     WHERE u.tenant_id = $1 AND u.role = 'sales' AND u.active = true
     GROUP BY u.id
     ORDER BY COUNT(c.id), u.created_at
     LIMIT 1`,
    [tenantId],
  );
  return result.rows[0]?.id || null;
}

async function upsertContact({ tenantId, waId, name, phone, label, touchInbound = true }) {
  const assignedTo = await getLeastLoadedSalesUser(tenantId);
  const result = await query(
    `INSERT INTO contacts (tenant_id, wa_id, name, phone, label, assigned_to, last_inbound_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $7 THEN now() ELSE NULL END, now())
     ON CONFLICT (tenant_id, wa_id)
     DO UPDATE SET
       name = COALESCE(EXCLUDED.name, contacts.name),
       phone = EXCLUDED.phone,
       label = EXCLUDED.label,
       assigned_to = COALESCE(contacts.assigned_to, EXCLUDED.assigned_to),
       last_inbound_at = CASE WHEN $7 THEN now() ELSE contacts.last_inbound_at END,
       updated_at = now()
     RETURNING *`,
    [tenantId, waId, name || null, phone, label || 'New Enquiry', assignedTo, touchInbound],
  );
  return result.rows[0];
}

async function addMessage({
  tenantId, contactId, waMessageId, direction, type = 'text', body, status = 'received',
  rawPayload, templateName, waSenderId, waRecipientId, caption, mediaId, mediaUrl,
  mediaLocalPath, mimeType, fileName, fileSize, sha256, contextWaMessageId,
  interactivePayload, buttonPayload, locationPayload, contactsPayload,
  reactionPayload, referralPayload, unsupportedPayload, normalizedText,
}) {
  const result = await query(
    `INSERT INTO messages (
       tenant_id, contact_id, wa_message_id, direction, type, body, status, raw_payload,
       template_name, wa_sender_id, wa_recipient_id, caption, media_id, media_url,
       media_local_path, mime_type, file_name, file_size, sha256, context_wa_message_id,
       interactive_payload, button_payload, location_payload, contacts_payload,
       reaction_payload, referral_payload, unsupported_payload, normalized_text
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)
     ON CONFLICT (tenant_id, wa_message_id) WHERE wa_message_id IS NOT NULL DO NOTHING
     RETURNING *`,
    [
      tenantId, contactId, waMessageId || null, direction, type, body || '', status,
      rawPayload || null, templateName || null, waSenderId || null, waRecipientId || null,
      caption || null, mediaId || null, mediaUrl || null, mediaLocalPath || null,
      mimeType || null, fileName || null, fileSize || null, sha256 || null,
      contextWaMessageId || null, interactivePayload || null, buttonPayload || null,
      locationPayload || null, contactsPayload || null, reactionPayload || null,
      referralPayload || null, unsupportedPayload || null, normalizedText || body || '',
    ],
  );
  return result.rows[0] || null;
}

async function updateMessageStatus({ tenantId, waMessageId, status, rawPayload }) {
  if (!tenantId || !waMessageId || !status) return null;

  const allowedStatuses = new Set(['sent', 'delivered', 'read', 'failed']);
  const cleanStatus = String(status || '').trim().toLowerCase();

  if (!allowedStatuses.has(cleanStatus)) {
    return null;
  }

  const result = await query(
    `UPDATE messages
     SET status = $3,
         status_updated_at = now(),
         raw_status_payload = $4
     WHERE tenant_id = $1
       AND wa_message_id = $2
     RETURNING *`,
    [tenantId, waMessageId, cleanStatus, rawPayload || null],
  );

  const message = result.rows[0] || null;

  if (message) {
    await recordAudit({
      tenantId,
      action: 'message.status_updated',
      entityType: 'message',
      entityId: message.id,
        metadata: { waMessageId, status: cleanStatus },
    });
  }

  return message;
}

async function createEnquiryDraft({ tenantId, contactId, messageId, text }) {
  const cleanText = String(text || '').trim();

  if (!cleanText || /^\[(image|audio|video|sticker|location|contacts|reaction|unsupported)/i.test(cleanText)) {
    return null;
  }

  const structuredDraft = await createStructuredQuoteDraft({
    tenantId,
    contactId,
    messageId,
    text: cleanText,
  });

  return structuredDraft?.draft || null;
}

async function maybeSendBotAutoReply({ tenantId, contact, inboundMessage, text }) {
  if (!tenantId || !contact || !inboundMessage) return null;
  if (contact.opted_out || isOptOutMessage(text)) return null;

  const settings = await getAppSettings(tenantId);
  if (!settings.botEnabled) return null;

  if (!isReplyWindowOpen(contact)) {
    console.warn('Bot auto-reply skipped: 24-hour window is not open', {
      tenantId,
      contactId: contact.id,
    });
    return null;
  }

  const normalizedText = normalizeUserText(text);
  const useMainMenu = shouldSendMainMenu(text);
  const useCategoryMenu = normalizedText === 'browse products';
  const selectedCategory = !useMainMenu && !useCategoryMenu
    ? await findExactProductCategory(tenantId, text)
    : null;

  let menuPayload = null;
  let replyText = null;
  let messageType = 'text';
  let auditAction = 'bot.auto_reply_sent';

  if (useMainMenu) {
    menuPayload = buildMainMenuInteractive(settings);
    replyText = menuPayloadToText(menuPayload);
    messageType = 'interactive';
    auditAction = 'bot.menu_sent';
  } else if (useCategoryMenu) {
    const categories = await getProductCategoriesForTenant(tenantId);
    menuPayload = buildCategoryMenuInteractive(settings, categories);
    replyText = menuPayloadToText(menuPayload);
    messageType = 'interactive';
    auditAction = 'bot.category_menu_sent';
  } else if (selectedCategory) {
    replyText = await buildCategoryProductsReply(tenantId, selectedCategory, settings);
    messageType = 'text';
    auditAction = 'bot.category_products_sent';
  } else if (hasQuoteRequestSignal(text)) {
    const enquiry = extractEnquiry(text);

    if (!hasEnoughQuoteDetails(enquiry)) {
      replyText = buildMissingQuoteDetailsReply(settings);
      messageType = 'text';
      auditAction = 'bot.quote_missing_details';
    } else {
      const draftResult = await createStructuredQuoteDraft({
        tenantId,
        contactId: contact.id,
        messageId: inboundMessage.id,
        text,
      });

      replyText = buildStructuredQuoteConfirmation({ draftResult, settings });
      messageType = 'text';
      auditAction = 'bot.quote_request_captured';
    }
  } else {
    replyText = await buildBotReply({ tenantId, settings, text });
  }

  if (!replyText) return null;

  let waMessageId = null;

  try {
    waMessageId = messageType === 'interactive'
      ? await sendWhatsAppInteractiveList(contact, menuPayload, tenantId)
      : await sendWhatsAppText(contact, replyText, tenantId);
  } catch (error) {
    console.error('Bot auto-reply failed:', {
      tenantId,
      contactId: contact.id,
      status: error.response?.status || null,
      message: error.response?.data?.error?.message || error.message,
    });

    await recordAudit({
      tenantId,
      action: 'bot.auto_reply_failed',
      entityType: 'contact',
      entityId: contact.id,
      metadata: {
        inboundMessageId: inboundMessage.id,
        status: error.response?.status || null,
        type: messageType,
      },
    });

    return null;
  }

  const status = waMessageId ? 'sent' : 'accepted';

  if (!waMessageId && !shouldAllowLocalMessageQueue()) {
    return null;
  }

  const botMessage = await addMessage({
    tenantId,
    contactId: contact.id,
    waMessageId,
    direction: 'outbound',
    type: messageType,
    body: replyText,
    status,
    rawPayload: menuPayload || null,
    interactivePayload: menuPayload?.interactive || null,
    normalizedText: replyText,
  });

  await recordAudit({
    tenantId,
    action: auditAction,
    entityType: 'message',
    entityId: botMessage?.id,
    metadata: {
      contactId: contact.id,
      inboundMessageId: inboundMessage.id,
      status,
      type: messageType,
      selectedCategory,
    },
  });

  return botMessage;
}

async function processInboundMessage({ tenantId, waId, name, body, waMessageId, rawPayload }) {
  if (waMessageId) {
    const duplicateResult = await query(
      `SELECT messages.*, contacts.id AS contact_id
       FROM messages
       LEFT JOIN contacts ON contacts.id = messages.contact_id
       WHERE messages.tenant_id = $1
         AND messages.wa_message_id = $2
       LIMIT 1`,
      [tenantId, waMessageId],
    );

    const duplicateMessage = duplicateResult.rows[0];

    if (duplicateMessage) {
      return {
        contact: duplicateMessage.contact_id ? { id: duplicateMessage.contact_id } : null,
        message: duplicateMessage,
        enquiryDraft: null,
        duplicate: true,
      };
    }
  }

  const normalized = normalizeWhatsAppMessage(rawPayload || { type: 'text', text: { body } });
  const textForIntent = normalized.normalizedText || normalized.body || body || '';

  let downloadedMedia = { mediaUrl: null, mediaLocalPath: null, mimeType: normalized.mimeType, fileSize: null };
  if (normalized.mediaId) {
    try {
      downloadedMedia = await downloadWhatsAppMedia(normalized.mediaId, normalized.mimeType, tenantId);
    } catch (error) {
      console.error('WhatsApp media download failed:', error.response?.data || error.message);
    }
  }

    const label = categorizeMessage(textForIntent);

  const optOutText = normalizeUserText(textForIntent);
  const isOptOut = isOptOutMessage(optOutText);

  const contact = await upsertContact({ tenantId, waId, name, phone: waId, label });

  if (isOptOut) {
    await query(
      `UPDATE contacts
       SET opted_out = true,
           opted_out_at = now(),
           opted_out_reason = $3,
           updated_at = now()
       WHERE id = $1
         AND tenant_id = $2`,
      [contact.id, tenantId, optOutText],
    );

    contact.opted_out = true;
    contact.opted_out_at = new Date();
    contact.opted_out_reason = optOutText;
  }
  const saved = await addMessage({
    tenantId, contactId: contact.id, waMessageId, direction: 'inbound',
    type: normalized.type, body: normalized.body, status: 'received', rawPayload,
    waSenderId: waId, caption: normalized.caption,
    mediaId: normalized.mediaId, mediaUrl: downloadedMedia.mediaUrl,
    mediaLocalPath: downloadedMedia.mediaLocalPath, mimeType: downloadedMedia.mimeType || normalized.mimeType,
    fileName: normalized.fileName, fileSize: downloadedMedia.fileSize,
    sha256: normalized.sha256, contextWaMessageId: normalized.contextWaMessageId,
    interactivePayload: normalized.interactivePayload, buttonPayload: normalized.buttonPayload,
    locationPayload: normalized.locationPayload, contactsPayload: normalized.contactsPayload,
    reactionPayload: normalized.reactionPayload, referralPayload: normalized.referralPayload,
    unsupportedPayload: normalized.unsupportedPayload, normalizedText: normalized.normalizedText,
  });

  if (normalized.mediaId) {
    console.log('WA media message saved:', {
      tenantId,
      contactId: contact.id,
      messageId: saved?.id || null,
      waMessageId,
      type: normalized.type,
      mediaId: normalized.mediaId,
      mediaUrl: downloadedMedia.mediaUrl,
      mimeType: downloadedMedia.mimeType || normalized.mimeType,
      fileSize: downloadedMedia.fileSize,
    });
  }

  const managerApproval = await handleManagerApprovalInbound({
    tenantId,
    contact,
    inboundMessage: saved,
    text: textForIntent,
    rawPayload,
  });

  if (managerApproval?.handled) {
    return {
      contact,
      message: saved,
      enquiryDraft: null,
      botReply: managerApproval.botReply || null,
      managerApproval,
    };
  }

  const customerQuoteAction = await handleCustomerQuoteInbound({
    tenantId,
    contact,
    inboundMessage: saved,
    text: textForIntent,
    rawPayload,
  });

  if (customerQuoteAction?.handled) {
    return {
      contact,
      message: saved,
      enquiryDraft: null,
      botReply: customerQuoteAction.botReply || null,
      customerQuoteAction,
    };
  }

  const botReply = await maybeSendBotAutoReply({ tenantId, contact, inboundMessage: saved, text: textForIntent });
  const enquiryDraft = await createEnquiryDraft({ tenantId, contactId: contact.id, messageId: saved?.id, text: textForIntent });

  return { contact, message: saved, enquiryDraft, botReply };
}

async function findContact(contactId, tenantId) {
  const result = await query('SELECT * FROM contacts WHERE id = $1 AND tenant_id = $2', [contactId, tenantId]);
  return result.rows[0] || null;
}

function canAccessContact(user, contact) {
  if (!user || !contact) return false;
  if (contact.tenant_id !== user.tenantId) return false;
  if (canMonitor(user)) return true;
  return contact.assigned_to === user.id;
}

async function canAccessContactId(user, contactId) {
  if (!contactId) return canMonitor(user);
  const contact = await findContact(contactId, user.tenantId);
  return canAccessContact(user, contact);
}

async function canAccessDraft(user, draft) {
  if (!draft) return false;
  return canAccessContactId(user, draft.contact_id);
}

async function getEnquiryDraftById(id, tenantId) {
  const result = await query(
    `SELECT e.*, c.name AS contact_name, c.phone
     FROM enquiry_drafts e
     LEFT JOIN contacts c ON c.id = e.contact_id AND c.tenant_id = e.tenant_id
     WHERE e.id = $1 AND e.tenant_id = $2`,
    [id, tenantId],
  );
  return result.rows[0] || null;
}

async function createQuotation({ tenantId, contactId, notes, items, source = 'WhatsApp Auto', validUntil }) {
  const normalizedItems = items.map(normalizeSalesItem);

  await validateContactForTenant(tenantId, contactId);
  await validateSalesItemsForTenant(tenantId, normalizedItems);

  const amount = sumItems(normalizedItems);
  const settings = await getAppSettings(tenantId);
  const quoteNo = `${settings.quotationPrefix || DEFAULT_APP_SETTINGS.quotationPrefix}-${Date.now()}`;

  const quote = await query(
    `INSERT INTO quotations (tenant_id, contact_id, quote_no, amount, notes, source, valid_until)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [tenantId, contactId || null, quoteNo, amount, notes || null, source, validUntil || null],
  );

  await Promise.all(normalizedItems.map((item) => query(
    `INSERT INTO quotation_items (tenant_id, quotation_id, product_id, description, grade, size, shape, quantity, unit, rate, amount)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [tenantId, quote.rows[0].id, item.product_id, item.description, item.grade, item.size, item.shape, item.quantity, item.unit, item.rate, item.amount],
  )));

  return quote.rows[0];
}

async function createSalesOrder({ tenantId, contactId, notes, items, source = 'WhatsApp', paymentStatus = 'pending', dispatchStatus = 'pending' }) {
  const normalizedItems = items.map(normalizeSalesItem);

  await validateContactForTenant(tenantId, contactId);
  await validateSalesItemsForTenant(tenantId, normalizedItems);

  const amount = sumItems(normalizedItems);
  const settings = await getAppSettings(tenantId);
  const orderNo = `${settings.orderPrefix || DEFAULT_APP_SETTINGS.orderPrefix}-${Date.now()}`;

  const order = await query(
    `INSERT INTO sales_orders (tenant_id, contact_id, order_no, amount, notes, source, payment_status, dispatch_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [tenantId, contactId || null, orderNo, amount, notes || null, source, paymentStatus, dispatchStatus],
  );

  await Promise.all(normalizedItems.map((item) => query(
    `INSERT INTO sales_order_items (tenant_id, order_id, product_id, description, grade, size, shape, quantity, unit, rate, amount)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [tenantId, order.rows[0].id, item.product_id, item.description, item.grade, item.size, item.shape, item.quantity, item.unit, item.rate, item.amount],
  )));

  return order.rows[0];
}

async function getWhatsAppSendConfig(tenantId) {
  const accountResult = await query(
    `SELECT
       phone_number_id,
       access_token_encrypted,
       access_token_iv,
       access_token_tag
     FROM whatsapp_accounts
     WHERE tenant_id = $1
       AND active = true
     ORDER BY connected_at DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [tenantId],
  );

  const account = accountResult.rows[0];

  if (account?.phone_number_id && account?.access_token_encrypted) {
    const accessToken = decryptSecret({
      encrypted: account.access_token_encrypted,
      iv: account.access_token_iv,
      tag: account.access_token_tag,
    });

    if (!hasRealValue(accessToken)) {
      return null;
    }

    return {
      apiVersion: process.env.WHATSAPP_API_VERSION || 'v24.0',
      phoneNumberId: account.phone_number_id,
      accessToken,
    };
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!hasRealValue(phoneNumberId) || !hasRealValue(accessToken)) {
    return null;
  }

  return {
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v24.0',
    phoneNumberId,
    accessToken,
  };
}

function whatsappMessagesUrl(config) {
  return `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/messages`;
}

function whatsappHeaders(config) {
  return {
    Authorization: `Bearer ${config.accessToken}`,
    'Content-Type': 'application/json',
  };
}

async function createOutboundMessageRecord({
  tenantId,
  contactId = null,
  toPhone,
  messageType = 'text',
  templateName = null,
  language = null,
  body = '',
  payload = {},
  createdBy = null,
}) {
  if (!tenantId || !toPhone) return null;

  const result = await query(
    `INSERT INTO outbound_messages
       (tenant_id, contact_id, to_phone, message_type, template_name, language, body, payload, status, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9)
     RETURNING *`,
    [
      tenantId,
      contactId,
      String(toPhone || '').replace(/\D/g, ''),
      messageType,
      templateName,
      language,
      body || '',
      payload || {},
      createdBy,
    ],
  );

  return result.rows[0];
}

async function markOutboundSending(outboundId, tenantId) {
  if (!outboundId || !tenantId) return null;

  const result = await query(
    `UPDATE outbound_messages
     SET status = 'sending',
         attempts = attempts + 1,
         updated_at = now(),
         last_error = NULL
     WHERE id = $1
       AND tenant_id = $2
     RETURNING *`,
    [outboundId, tenantId],
  );

  return result.rows[0] || null;
}

async function markOutboundSent(outboundId, tenantId, waMessageId) {
  if (!outboundId || !tenantId) return null;

  const result = await query(
    `UPDATE outbound_messages
     SET status = 'sent',
         wa_message_id = COALESCE($3, wa_message_id),
         sent_at = now(),
         updated_at = now(),
         last_error = NULL
     WHERE id = $1
       AND tenant_id = $2
     RETURNING *`,
    [outboundId, tenantId, waMessageId || null],
  );

  return result.rows[0] || null;
}

async function markOutboundFailed(outboundId, tenantId, error) {
  if (!outboundId || !tenantId) return null;

  const result = await query(
    `UPDATE outbound_messages
     SET status = 'failed',
         last_error = $3,
         updated_at = now()
     WHERE id = $1
       AND tenant_id = $2
     RETURNING *`,
    [
      outboundId,
      tenantId,
      String(error?.response?.data?.error?.message || error?.message || error || 'WhatsApp send failed').slice(0, 2000),
    ],
  );

  return result.rows[0] || null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableWhatsAppError(error) {
  const status = error.response?.status;

  // Retry only temporary failures.
  // Do not retry 400/401/403 because those are usually policy/config/token/template errors.
  return (
    status === 408 ||
    status === 429 ||
    (status >= 500 && status <= 599) ||
    error.code === 'ECONNRESET' ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'ECONNABORTED'
  );
}

async function postWhatsAppMessage(config, payload, meta = {}) {
  const maxAttempts = Number(process.env.WHATSAPP_SEND_MAX_ATTEMPTS || 3);
  const timeoutMs = Number(process.env.WHATSAPP_SEND_TIMEOUT_MS || 10000);

  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await axios.post(
        whatsappMessagesUrl(config),
        payload,
        {
          headers: whatsappHeaders(config),
          timeout: timeoutMs,
        },
      );

      return response;
    } catch (error) {
      lastError = error;

      const status = error.response?.status || null;
      const metaError = error.response?.data?.error?.message || error.response?.data || null;

      console.error('WhatsApp send attempt failed:', {
        attempt,
        maxAttempts,
        status,
        code: error.code || null,
        message: metaError || error.message,
        tenantId: meta.tenantId || null,
        type: meta.type || null,
      });

      if (!isRetryableWhatsAppError(error) || attempt >= maxAttempts) {
        throw error;
      }

      await sleep(500 * attempt);
    }
  }

  throw lastError || new Error('WhatsApp message send failed');
}

async function sendWhatsAppText(contact, text, tenantId) {
  const config = await getWhatsAppSendConfig(tenantId);

  if (!config) {
    if (shouldAllowLocalMessageQueue()) return null;
    throw new Error('WhatsApp is not configured. Message was not sent.');
  }

  const response = await postWhatsAppMessage(
    config,
    {
      messaging_product: 'whatsapp',
      to: contact.wa_id,
      type: 'text',
      text: { body: text },
    },
    { tenantId, type: 'text' },
  );

  return response.data?.messages?.[0]?.id || null;
}

async function sendWhatsAppInteractiveList(contact, menuPayload, tenantId) {
  const config = await getWhatsAppSendConfig(tenantId);

  if (!config) {
    if (shouldAllowLocalMessageQueue()) return null;
    throw new Error('WhatsApp is not configured. Interactive menu was not sent.');
  }

  const response = await postWhatsAppMessage(
    config,
    {
      ...menuPayload,
      to: contact.wa_id,
    },
    { tenantId, type: 'interactive' },
  );

  return response.data?.messages?.[0]?.id || null;
}

async function sendWhatsAppTemplate(contact, templateName, language = 'en', tenantId) {
  const config = await getWhatsAppSendConfig(tenantId);

  if (!config) {
    if (shouldAllowLocalMessageQueue()) return null;
    throw new Error('WhatsApp is not configured. Template message was not sent.');
  }

  const response = await postWhatsAppMessage(
    config,
    {
      messaging_product: 'whatsapp',
      to: contact.wa_id,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
      },
    },
    { tenantId, type: 'template' },
  );

  return response.data?.messages?.[0]?.id || null;
}

async function sendWhatsAppTemplateToNumber({ tenantId, to, templateName, language = 'en', bodyParams = [] }) {
  const config = await getWhatsAppSendConfig(tenantId);

  if (!config) {
    if (shouldAllowLocalMessageQueue()) return null;
    throw new Error('WhatsApp is not configured. Template message was not sent.');
  }

  const cleanTo = String(to || '').replace(/\D/g, '');

  if (cleanTo.length < 11 || cleanTo.length > 15) {
    throw new Error('Manager WhatsApp number must include country code. Example: 91XXXXXXXXXX');
  }

  const components = bodyParams.length
    ? [
        {
          type: 'body',
          parameters: bodyParams.map((value) => ({
            type: 'text',
            text: String(value ?? '').slice(0, 1024),
          })),
        },
      ]
    : [];

  const response = await postWhatsAppMessage(
    config,
    {
      messaging_product: 'whatsapp',
      to: cleanTo,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
        ...(components.length ? { components } : {}),
      },
    },
    { tenantId, type: 'template_to_number' },
  );

  return response.data?.messages?.[0]?.id || null;
}

function formatQuotationItemsForApproval(items = []) {
  const lines = items.slice(0, 5).map((item, index) => {
    const description = String(item.description || [item.grade, item.size, item.shape].filter(Boolean).join(' ') || 'Item').trim();
    const qty = `${Number(item.quantity || 0)} ${item.unit || ''}`.trim();
    const rate = Number(item.rate || 0).toLocaleString('en-IN');
    const amount = Number(item.amount || 0).toLocaleString('en-IN');

    return `${index + 1}. ${description} | ${qty} x ${rate} = ${amount}`;
  });

  if (items.length > 5) {
    lines.push(`+${items.length - 5} more item(s)`);
  }

  return lines.join('\n').slice(0, 900);
}

async function recordQuotationApprovalEvent({
  tenantId,
  quotationId,
  actorType = 'system',
  actorUserId = null,
  actorPhone = null,
  action,
  reason = null,
  rawPayload = null,
}) {
  if (!tenantId || !quotationId || !action) return null;

  const result = await query(
    `INSERT INTO quotation_approval_events
       (tenant_id, quotation_id, actor_type, actor_user_id, actor_phone, action, reason, raw_payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      tenantId,
      quotationId,
      actorType,
      actorUserId,
      actorPhone,
      action,
      reason,
      rawPayload,
    ],
  );

  return result.rows[0];
}

async function sendOrderAcknowledgementToCustomer({ tenantId, userId, order, quote }) {
  const settings = await getAppSettings(tenantId);

  const templateName = String(settings.orderAcknowledgementTemplateName || '').trim().toLowerCase();
  const templateLanguage = String(settings.orderAcknowledgementTemplateLanguage || 'en').trim() || 'en';

  if (!templateName) {
    return { sent: false, reason: 'order_ack_template_missing' };
  }

  const contactResult = await query(
    `SELECT id, name, company, wa_id, phone, opted_out
     FROM contacts
     WHERE id = $1
       AND tenant_id = $2
     LIMIT 1`,
    [order.contact_id, tenantId],
  );

  const contact = contactResult.rows[0];

  if (!contact) {
    return { sent: false, reason: 'contact_not_found' };
  }

  if (contact.opted_out) {
    return { sent: false, reason: 'customer_opted_out' };
  }

  const templateResult = await query(
    `SELECT id, name, language, active
     FROM whatsapp_templates
     WHERE tenant_id = $1
       AND name = $2
       AND language = $3
       AND active = true
     LIMIT 1`,
    [tenantId, templateName, templateLanguage],
  );

  if (!templateResult.rows[0]) {
    return { sent: false, reason: 'template_not_active' };
  }

  const customerName = contact.company || contact.name || contact.phone || 'Customer';
  const orderNo = order.order_no || 'Order';
  const quoteNo = quote?.quote_no || '-';
  const amountText = `${settings.currency || 'INR'} ${Number(order.amount || 0).toLocaleString('en-IN')}`;

  const waMessageId = await sendWhatsAppTemplateToNumber({
    tenantId,
    to: contact.wa_id || contact.phone,
    templateName,
    language: templateLanguage,
    bodyParams: [
      customerName,
      orderNo,
      quoteNo,
      amountText,
    ],
  });

  const outboundBody = [
    `[Order Acknowledgement] ${orderNo}`,
    `Customer: ${customerName}`,
    `Quotation: ${quoteNo}`,
    `Amount: ${amountText}`,
    '',
    'Order received. Payment, stock and dispatch will be processed as per company verification.',
  ].join('\n');

  const message = await addMessage({
    tenantId,
    contactId: contact.id,
    waMessageId,
    direction: 'outbound',
    type: 'template',
    body: outboundBody,
    status: waMessageId ? 'sent' : 'accepted',
    templateName,
    rawPayload: {
      templateName,
      templateLanguage,
      orderId: order.id,
      orderNo,
      quoteId: quote?.id || null,
      quoteNo,
      bodyParams: [customerName, orderNo, quoteNo, amountText],
    },
    normalizedText: outboundBody,
  });

  await recordAudit({
    tenantId,
    actorUserId: userId,
    action: 'order.acknowledgement_sent',
    entityType: 'sales_order',
    entityId: order.id,
    metadata: {
      contactId: contact.id,
      quoteId: quote?.id || null,
      templateName,
      messageId: waMessageId,
      messageRowId: message?.id || null,
    },
  });

  return {
    sent: true,
    messageId: waMessageId,
    messageRowId: message?.id || null,
  };
}

function isManagerApproveText(text = '') {
  const body = normalizeUserText(text);
  return body === 'approve quote'
    || body === 'approve'
    || body === 'approved'
    || body === 'yes approve'
    || body === 'ok approve';
}

function isManagerRejectText(text = '') {
  const body = normalizeUserText(text);
  return body === 'reject quote'
    || body === 'reject'
    || body === 'rejected'
    || body === 'no reject'
    || body === 'reject quotation';
}

async function findLatestManagerQuote({ tenantId, managerPhone, statuses = [] }) {
  const cleanPhone = String(managerPhone || '').replace(/\D/g, '');

  if (!tenantId || !cleanPhone) return null;

  const params = [tenantId, cleanPhone];
  let statusSql = '';

  if (statuses.length) {
    params.push(statuses);
    statusSql = `AND manager_approval_status = ANY($${params.length}::text[])`;
  }

  const result = await query(
    `SELECT *
     FROM quotations
     WHERE tenant_id = $1
       AND manager_phone = $2
       ${statusSql}
     ORDER BY manager_approval_requested_at DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    params,
  );

  return result.rows[0] || null;
}

async function sendManagerApprovalSystemReply({ tenantId, contactId, contact, text, action, quoteId }) {
  let waMessageId = null;

  try {
    waMessageId = await sendWhatsAppText(contact, text, tenantId);
  } catch (error) {
    console.error('Manager approval system reply failed:', {
      tenantId,
      contactId,
      quoteId,
      action,
      status: error.response?.status || null,
      message: error.response?.data?.error?.message || error.message,
    });
    return null;
  }

  return addMessage({
    tenantId,
    contactId,
    waMessageId,
    direction: 'outbound',
    type: 'text',
    body: text,
    status: waMessageId ? 'sent' : 'accepted',
    rawPayload: { action, quoteId },
    normalizedText: text,
  });
}

async function handleManagerApprovalInbound({ tenantId, contact, inboundMessage, text, rawPayload }) {
  const managerPhone = String(contact?.wa_id || contact?.phone || '').replace(/\D/g, '');
  const cleanText = String(text || '').trim();

  if (!tenantId || !contact || !inboundMessage || !managerPhone || !cleanText) {
    return null;
  }

  const waitingReasonQuote = await findLatestManagerQuote({
    tenantId,
    managerPhone,
    statuses: ['waiting_reason'],
  });

  if (waitingReasonQuote && !isManagerApproveText(cleanText) && !isManagerRejectText(cleanText)) {
    const reason = cleanText.slice(0, 1000);

    const updatedQuote = await query(
      `UPDATE quotations
       SET status = 'revision_required',
           approval_status = 'revision_required',
           manager_approval_status = 'revision_required',
           manager_rejection_reason = $3,
           revision_no = COALESCE(revision_no, 0) + 1
       WHERE id = $1
         AND tenant_id = $2
       RETURNING *`,
      [waitingReasonQuote.id, tenantId, reason],
    );

    await recordQuotationApprovalEvent({
      tenantId,
      quotationId: waitingReasonQuote.id,
      actorType: 'manager',
      actorPhone: managerPhone,
      action: 'manager_rejection_reason_received',
      reason,
      rawPayload,
    });

    await recordAudit({
      tenantId,
      action: 'quotation.manager_rejection_reason_received',
      entityType: 'quotation',
      entityId: waitingReasonQuote.id,
      metadata: {
        managerPhone: maskValue(managerPhone),
        reason,
        inboundMessageId: inboundMessage.id,
      },
    });

    const replyText = `Rejection reason captured for quotation ${waitingReasonQuote.quote_no}.

Reason:
${reason}

Status is now revision_required. Sales team will update the quotation and send it again for your approval.`;

    const botReply = await sendManagerApprovalSystemReply({
      tenantId,
      contactId: contact.id,
      contact,
      text: replyText,
      action: 'manager_rejection_reason_received',
      quoteId: waitingReasonQuote.id,
    });

    return {
      handled: true,
      action: 'manager_rejection_reason_received',
      quotation: updatedQuote.rows[0],
      botReply,
    };
  }

  if (!isManagerApproveText(cleanText) && !isManagerRejectText(cleanText)) {
    return null;
  }

  const pendingQuote = await findLatestManagerQuote({
    tenantId,
    managerPhone,
    statuses: ['pending'],
  });

  if (!pendingQuote) {
    return null;
  }

  if (isManagerApproveText(cleanText)) {
    const updatedQuote = await query(
      `UPDATE quotations
       SET status = 'manager_approved',
           approval_status = 'manager_approved',
           manager_approval_status = 'approved',
           manager_approved_at = now()
       WHERE id = $1
         AND tenant_id = $2
       RETURNING *`,
      [pendingQuote.id, tenantId],
    );

    await recordQuotationApprovalEvent({
      tenantId,
      quotationId: pendingQuote.id,
      actorType: 'manager',
      actorPhone: managerPhone,
      action: 'manager_approved',
      reason: null,
      rawPayload,
    });

    await recordAudit({
      tenantId,
      action: 'quotation.manager_approved',
      entityType: 'quotation',
      entityId: pendingQuote.id,
      metadata: {
        managerPhone: maskValue(managerPhone),
        inboundMessageId: inboundMessage.id,
      },
    });

    const replyText = `Quotation ${pendingQuote.quote_no} approved.

Customer has not been sent the quotation yet. Sales team can now send the approved quotation to the customer.`;

    const botReply = await sendManagerApprovalSystemReply({
      tenantId,
      contactId: contact.id,
      contact,
      text: replyText,
      action: 'manager_approved',
      quoteId: pendingQuote.id,
    });

    return {
      handled: true,
      action: 'manager_approved',
      quotation: updatedQuote.rows[0],
      botReply,
    };
  }

  if (isManagerRejectText(cleanText)) {
    const updatedQuote = await query(
      `UPDATE quotations
       SET status = 'manager_rejected_waiting_reason',
           approval_status = 'manager_rejected_waiting_reason',
           manager_approval_status = 'waiting_reason',
           manager_rejected_at = now()
       WHERE id = $1
         AND tenant_id = $2
       RETURNING *`,
      [pendingQuote.id, tenantId],
    );

    await recordQuotationApprovalEvent({
      tenantId,
      quotationId: pendingQuote.id,
      actorType: 'manager',
      actorPhone: managerPhone,
      action: 'manager_rejected',
      reason: null,
      rawPayload,
    });

    await recordAudit({
      tenantId,
      action: 'quotation.manager_rejected',
      entityType: 'quotation',
      entityId: pendingQuote.id,
      metadata: {
        managerPhone: maskValue(managerPhone),
        inboundMessageId: inboundMessage.id,
      },
    });

    const replyText = `Quotation ${pendingQuote.quote_no} rejected.

Please send the rejection reason or required changes in your next message.

Example:
Reduce rate by ₹3/kg and add freight separately.`;

    const botReply = await sendManagerApprovalSystemReply({
      tenantId,
      contactId: contact.id,
      contact,
      text: replyText,
      action: 'manager_rejected_waiting_reason',
      quoteId: pendingQuote.id,
    });

    return {
      handled: true,
      action: 'manager_rejected',
      quotation: updatedQuote.rows[0],
      botReply,
    };
  }

  return null;
}

function isCustomerQuoteApproveText(text = '') {
  const body = normalizeUserText(text);
  return body === 'approve quote'
    || body === 'approve'
    || body === 'approved'
    || body === 'yes approve'
    || body === 'accept quote'
    || body === 'accepted'
    || body === 'confirm quote';
}

function isCustomerQuoteRejectText(text = '') {
  const body = normalizeUserText(text);
  return body === 'reject quote'
    || body === 'reject'
    || body === 'rejected'
    || body === 'no reject'
    || body === 'decline quote'
    || body === 'not accepted';
}

async function findLatestCustomerSentQuote({ tenantId, contactId }) {
  if (!tenantId || !contactId) return null;

  const result = await query(
    `SELECT *
     FROM quotations
     WHERE tenant_id = $1
       AND contact_id = $2
       AND status = 'customer_sent'
       AND approval_status = 'customer_sent'
     ORDER BY customer_sent_at DESC NULLS LAST, created_at DESC
     LIMIT 1`,
    [tenantId, contactId],
  );

  return result.rows[0] || null;
}

async function sendCustomerQuoteSystemReply({ tenantId, contactId, contact, text, action, quoteId }) {
  let waMessageId = null;

  try {
    waMessageId = await sendWhatsAppText(contact, text, tenantId);
  } catch (error) {
    console.error('Customer quote system reply failed:', {
      tenantId,
      contactId,
      quoteId,
      action,
      status: error.response?.status || null,
      message: error.response?.data?.error?.message || error.message,
    });
    return null;
  }

  return addMessage({
    tenantId,
    contactId,
    waMessageId,
    direction: 'outbound',
    type: 'text',
    body: text,
    status: waMessageId ? 'sent' : 'accepted',
    rawPayload: { action, quoteId },
    normalizedText: text,
  });
}

async function handleCustomerQuoteInbound({ tenantId, contact, inboundMessage, text, rawPayload }) {
  const cleanText = String(text || '').trim();

  if (!tenantId || !contact || !inboundMessage || !cleanText) {
    return null;
  }

  if (!isCustomerQuoteApproveText(cleanText) && !isCustomerQuoteRejectText(cleanText)) {
    return null;
  }

  const quote = await findLatestCustomerSentQuote({
    tenantId,
    contactId: contact.id,
  });

  if (!quote) {
    return null;
  }

  const customerPhone = String(contact.wa_id || contact.phone || '').replace(/\D/g, '');

  if (isCustomerQuoteApproveText(cleanText)) {
    const updatedQuote = await query(
      `UPDATE quotations
       SET status = 'accepted',
           approval_status = 'customer_approved'
       WHERE id = $1
         AND tenant_id = $2
       RETURNING *`,
      [quote.id, tenantId],
    );

    await recordQuotationApprovalEvent({
      tenantId,
      quotationId: quote.id,
      actorType: 'customer',
      actorPhone: customerPhone,
      action: 'customer_approved',
      reason: null,
      rawPayload,
    });

    await recordAudit({
      tenantId,
      action: 'quotation.customer_approved',
      entityType: 'quotation',
      entityId: quote.id,
      metadata: {
        customerPhone: maskValue(customerPhone),
        inboundMessageId: inboundMessage.id,
      },
    });

    const replyText = `Thank you. Quotation ${quote.quote_no} is accepted.

Our team will verify payment, stock, dispatch terms and proceed with the next order step.`;

    const botReply = await sendCustomerQuoteSystemReply({
      tenantId,
      contactId: contact.id,
      contact,
      text: replyText,
      action: 'customer_approved',
      quoteId: quote.id,
    });

    return {
      handled: true,
      action: 'customer_approved',
      quotation: updatedQuote.rows[0],
      botReply,
    };
  }

  if (isCustomerQuoteRejectText(cleanText)) {
    const updatedQuote = await query(
      `UPDATE quotations
       SET status = 'rejected',
           approval_status = 'customer_rejected'
       WHERE id = $1
         AND tenant_id = $2
       RETURNING *`,
      [quote.id, tenantId],
    );

    await recordQuotationApprovalEvent({
      tenantId,
      quotationId: quote.id,
      actorType: 'customer',
      actorPhone: customerPhone,
      action: 'customer_rejected',
      reason: null,
      rawPayload,
    });

    await recordAudit({
      tenantId,
      action: 'quotation.customer_rejected',
      entityType: 'quotation',
      entityId: quote.id,
      metadata: {
        customerPhone: maskValue(customerPhone),
        inboundMessageId: inboundMessage.id,
      },
    });

    const replyText = `Quotation ${quote.quote_no} is marked as rejected.

Please share the reason or required changes if you want our team to revise the offer.`;

    const botReply = await sendCustomerQuoteSystemReply({
      tenantId,
      contactId: contact.id,
      contact,
      text: replyText,
      action: 'customer_rejected',
      quoteId: quote.id,
    });

    return {
      handled: true,
      action: 'customer_rejected',
      quotation: updatedQuote.rows[0],
      botReply,
    };
  }

  return null;
}

// =========================================================
// STARTUP
// =========================================================

async function ensureSchema() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await query(schema);
}

async function ensureDefaultUsers() {
  if (isProduction) {
    console.log('Production mode: default demo users are not created automatically');
    return;
  }
  const tenantId = await getDemoTenantId();
  const defaults = [
    { name: 'Admin User', email: 'admin@bos.com', password: 'admin123', role: 'admin' },
    { name: 'Manager User', email: 'manager@bos.com', password: 'manager123', role: 'manager' },
    { name: 'Sales Person', email: 'sales@bos.com', password: 'sales123', role: 'sales' },
  ];
  const hashed = await Promise.all(defaults.map(async (u) => ({ ...u, hash: await bcrypt.hash(u.password, 10) })));
  await Promise.all(hashed.map((user) => query(
    `INSERT INTO users (tenant_id, name, email, password_hash, role)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email)
     DO UPDATE SET tenant_id = COALESCE(users.tenant_id, EXCLUDED.tenant_id)`,
    [tenantId, user.name, user.email, user.hash, user.role],
  )));
}

async function ensurePlatformSuperAdmin() {
  const email = String(process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.SUPER_ADMIN_PASSWORD || '');
  const name = String(process.env.SUPER_ADMIN_NAME || 'Platform Super Admin').trim();

  if (!email || !password) {
    if (!isProduction) {
      console.log('SUPER_ADMIN_EMAIL/SUPER_ADMIN_PASSWORD not set. Platform super admin bootstrap skipped.');
    }
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('SUPER_ADMIN_EMAIL must be a valid email');
  }

  if (password.length < 12) {
    throw new Error('SUPER_ADMIN_PASSWORD must be at least 12 characters');
  }

  const tenantResult = await query(
    `INSERT INTO tenants (name, slug, industry, status, plan, onboarding_status, updated_at)
     VALUES ('Platform Admin', 'platform', 'SaaS Platform', 'active', 'internal', 'active', now())
     ON CONFLICT (slug)
     DO UPDATE SET status = 'active',
                   onboarding_status = 'active',
                   updated_at = now()
     RETURNING id`,
  );

  const platformTenantId = tenantResult.rows[0].id;

  const existingResult = await query(
    `SELECT id, role, active
     FROM users
     WHERE lower(email) = $1
     LIMIT 1`,
    [email],
  );

  if (existingResult.rows[0]) {
    const hash = await bcrypt.hash(password, 10);

    await query(
      `UPDATE users
       SET tenant_id = $2,
           role = 'super_admin',
           active = true,
           password_hash = $3
       WHERE lower(email) = $1`,
      [email, platformTenantId, hash],
    );

    console.log('Platform super admin already exists and was verified active with current environment password');
    return;
  }

  const hash = await bcrypt.hash(password, 10);

  await query(
    `INSERT INTO users (tenant_id, name, email, password_hash, role, active)
     VALUES ($1, $2, $3, $4, 'super_admin', true)`,
    [platformTenantId, name || 'Platform Super Admin', email, hash],
  );

  console.log('Platform super admin created from environment variables');
}

// =========================================================
// ROUTES — SYSTEM
// =========================================================

const serverStartedAt = new Date();

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

  const ready = Boolean(
    db.ok
    && hasRealValue(process.env.WHATSAPP_VERIFY_TOKEN)
    && hasRealValue(process.env.WHATSAPP_ACCESS_TOKEN)
    && hasRealValue(process.env.WHATSAPP_PHONE_NUMBER_ID)
    && (!isProduction || hasRealValue(process.env.WHATSAPP_APP_SECRET))
  );

  return res.status(ready ? 200 : 503).json({
    ok: ready,
    service: 'bos-whatsapp-backend',
    databaseReady: Boolean(db.ok),
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
  const tenantId = await getDemoTenantId();
  const settings = await getAppSettings(tenantId);
  res.json({ appName: settings.appName, companyName: settings.companyName, industry: settings.industry, primaryColor: settings.primaryColor });
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

  if (
    password.length < 12
    || password.length > 128
    || !/[a-z]/.test(password)
    || !/[A-Z]/.test(password)
    || !/[0-9]/.test(password)
    || !/[^a-zA-Z0-9]/.test(password)
  ) {
    return res.status(400).json({
      error: 'Password must be 12-128 characters with uppercase, lowercase, number and symbol',
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

app.post('/api/platform/tenants', requireAuth, requireSuperAdmin, asyncHandler(async (req, res) => {
  const cleanName = String(req.body?.name || '').trim();
  const cleanIndustry = String(req.body?.industry || 'General').trim() || 'General';
  const cleanPlan = String(req.body?.plan || 'starter').trim().toLowerCase() || 'starter';
  const cleanStatus = String(req.body?.status || 'active').trim().toLowerCase() || 'active';
  const cleanSlug = normalizeTenantSlug(req.body?.slug || cleanName);

  const businessPhone = String(req.body?.businessPhone || '').trim();
  const businessEmail = String(req.body?.businessEmail || '').trim().toLowerCase();
  const logoUrl = String(req.body?.logoUrl || '').trim();
  const metaBusinessId = String(req.body?.metaBusinessId || '').trim();

  if (!cleanName || !cleanSlug) {
    return res.status(400).json({ error: 'Client company name and slug are required' });
  }

  if (!['active', 'inactive', 'suspended'].includes(cleanStatus)) {
    return res.status(400).json({ error: 'Invalid tenant status' });
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

app.patch('/api/platform/tenants/:tenantId', requireAuth, requireSuperAdmin, asyncHandler(async (req, res) => {
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

  const cleanName = req.body?.name !== undefined ? String(req.body.name || '').trim() : existingTenant.name;
  const cleanIndustry = req.body?.industry !== undefined ? String(req.body.industry || '').trim() : existingTenant.industry;
  const cleanStatus = req.body?.status !== undefined ? String(req.body.status || '').trim().toLowerCase() : existingTenant.status;
  const cleanPlan = req.body?.plan !== undefined ? String(req.body.plan || '').trim().toLowerCase() : existingTenant.plan;

  const businessPhone = req.body?.businessPhone !== undefined ? String(req.body.businessPhone || '').trim() : existingTenant.business_phone;
  const businessEmail = req.body?.businessEmail !== undefined ? String(req.body.businessEmail || '').trim().toLowerCase() : existingTenant.business_email;
  const logoUrl = req.body?.logoUrl !== undefined ? String(req.body.logoUrl || '').trim() : existingTenant.logo_url;
  const metaBusinessId = req.body?.metaBusinessId !== undefined ? String(req.body.metaBusinessId || '').trim() : existingTenant.meta_business_id;
  const onboardingStatus = req.body?.onboardingStatus !== undefined ? String(req.body.onboardingStatus || '').trim() : existingTenant.onboarding_status;

  if (!cleanName) {
    return res.status(400).json({ error: 'Client company name is required' });
  }

  if (!['active', 'inactive', 'suspended'].includes(cleanStatus)) {
    return res.status(400).json({ error: 'Invalid tenant status' });
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

app.post('/api/platform/tenants/:tenantId/admin', requireAuth, requireSuperAdmin, asyncHandler(async (req, res) => {
  const tenantId = req.params.tenantId;

  const cleanName = String(req.body?.name || '').trim();
  const cleanEmail = String(req.body?.email || '').trim().toLowerCase();
  const cleanPassword = String(req.body?.password || '');

  if (!cleanName || !cleanEmail || !cleanPassword) {
    return res.status(400).json({ error: 'Admin name, email and password are required' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return res.status(400).json({ error: 'Valid admin email required' });
  }

  if (cleanPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
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

  const hash = await bcrypt.hash(cleanPassword, 10);

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
      email: cleanEmail,
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
      clientAdminEmail: clientAdmin.email,
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

app.put('/api/app-settings', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });
  res.json(await saveAppSettings(req.user.tenantId, req.body || {}));
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

app.post('/api/knowledge-base', requireAuth, asyncHandler(async (req, res) => {
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

app.patch('/api/knowledge-base/:id', requireAuth, asyncHandler(async (req, res) => {
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

app.delete('/api/knowledge-base/:id', requireAuth, asyncHandler(async (req, res) => {
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
  const accessTokenSet = hasRealValue(process.env.WHATSAPP_ACCESS_TOKEN);
  const phoneNumberIdSet = hasRealValue(process.env.WHATSAPP_PHONE_NUMBER_ID);
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

app.post('/api/whatsapp/embedded-signup/complete', requireAuth, rateLimit({
  bucketName: 'embedded-signup-complete',
  maxRequests: 10,
  windowMs: 15 * 60 * 1000,
}), asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }

  const code = String(req.body?.code || '').trim();
  const phoneNumberId = String(req.body?.phoneNumberId || '').trim();
  const wabaId = String(req.body?.wabaId || '').trim();

  if (!code || !phoneNumberId || !wabaId) {
    return res.status(400).json({
      error: 'Meta signup code, phone number ID and WABA ID are required',
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
  } catch (error) {
    console.error('Meta phone lookup failed:', {
      tenantId: req.user.tenantId,
      phoneNumberId: maskValue(phoneNumberId),
      status: error.response?.status || null,
      message: error.response?.data?.error?.message || error.message,
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
      status: error.response?.status || null,
      message: error.response?.data?.error?.message || error.message,
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

app.post('/webhook', (req, res) => {
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

  res.sendStatus(200);

  setImmediate(async () => {
    let webhookEvent = null;

    try {
      webhookEvent = await createWebhookEvent(payload);
      await markWebhookEventProcessing(webhookEvent.id, webhookEvent.tenant_id);

      await processWhatsAppWebhookPayload(payload);

      await markWebhookEventProcessed(webhookEvent.id, webhookEvent.tenant_id);
    } catch (error) {
      console.error('WA webhook async processing failed:', {
        webhookEventId: webhookEvent?.id || null,
        message: error.message,
        stack: error.stack,
      });

      if (webhookEvent?.id) {
        await markWebhookEventFailed(webhookEvent.id, webhookEvent.tenant_id, error);
      }
    }
  });
});

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

  if (cleanPassword.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
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

  if (password !== undefined && String(password).length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
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

  await markWebhookEventProcessing(event.id, req.user.tenantId);

  try {
    await processWhatsAppWebhookPayload(event.payload);
    await markWebhookEventProcessed(event.id, req.user.tenantId);

    await recordAudit({
      tenantId: req.user.tenantId,
      actorUserId: req.user.id,
      action: 'webhook_event.retried',
      entityType: 'webhook_event',
      entityId: event.id,
      metadata: {
        previousAttempts: event.attempts,
        result: 'processed',
      },
    });

    return res.json({
      ok: true,
      id: event.id,
      status: 'processed',
      message: 'Webhook event retried successfully.',
    });
  } catch (error) {
    await markWebhookEventFailed(event.id, req.user.tenantId, error);

    await recordAudit({
      tenantId: req.user.tenantId,
      actorUserId: req.user.id,
      action: 'webhook_event.retry_failed',
      entityType: 'webhook_event',
      entityId: event.id,
      metadata: {
        previousAttempts: event.attempts,
        result: 'failed',
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

  if (outbound.message_type === 'text' && !isReplyWindowOpen(contact)) {
    return res.status(400).json({
      error: '24-hour reply window expired. Text retry is not allowed. Use approved template.',
    });
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

app.post('/api/outbound-messages/retry-failed', requireAuth, asyncHandler(async (req, res) => {
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

      if (outbound.message_type === 'text' && !isReplyWindowOpen(contact)) {
        summary.skipped += 1;
        summary.errors.push({
          id: outbound.id,
          reason: 'reply_window_expired',
        });
        continue;
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
  const { label, assigned, q, window } = req.query;
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
  if (q) { params.push(`%${q}%`); where.push(`(c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR c.company ILIKE $${params.length})`); }
  if (window === 'open') where.push(`c.last_inbound_at >= now() - interval '24 hours'`);
  if (window === 'expired') where.push(`(c.last_inbound_at IS NULL OR c.last_inbound_at < now() - interval '24 hours')`);
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
     ORDER BY COALESCE(m.created_at, c.updated_at) DESC`,
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
    `SELECT id, tenant_id, contact_id, wa_message_id, direction, type, body, status, template_name,
            caption, media_id, media_url, mime_type, file_name, file_size,
            interactive_payload, button_payload, status_updated_at, created_at
     FROM messages WHERE contact_id = $1 AND tenant_id = $2 ORDER BY created_at ASC`,
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
  const { name, company, stage, owner, notes, label, assigned_to, assignment_reason } = req.body;
  const contact = await findContact(req.params.id, req.user.tenantId);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  if (!canAccessContact(req.user, contact)) return res.status(403).json({ error: 'Conversation assigned to another user' });
  if (assigned_to !== undefined && !canMonitor(req.user)) return res.status(403).json({ error: 'Only manager/admin can assign' });

  if (stage !== undefined) {
    const settings = await getAppSettings(req.user.tenantId);
    const allowedStages = new Set((settings.stages || DEFAULT_APP_SETTINGS.stages).map((item) => String(item).trim().toLowerCase()));
    const cleanStage = String(stage || '').trim().toLowerCase();

    if (!allowedStages.has(cleanStage)) {
      return res.status(400).json({ error: 'Invalid contact stage' });
    }
  }

  const shouldUpdateAssignment = assigned_to !== undefined;
  const assignedToValue = assigned_to === '' ? null : assigned_to;
  if (assignedToValue) {
    const assignedUser = await query(
      'SELECT id FROM users WHERE id = $1 AND tenant_id = $2 AND active = true LIMIT 1',
      [assignedToValue, req.user.tenantId],
    );    if (!assignedUser.rows[0]) return res.status(400).json({ error: 'Assigned user not found for this company' });
  }
  const before = await query('SELECT assigned_to FROM contacts WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenantId]);
  const result = await query(
    `UPDATE contacts
     SET name = COALESCE($2, name), company = COALESCE($3, company), stage = COALESCE($4, stage),
         owner = COALESCE($5, owner), notes = COALESCE($6, notes), label = COALESCE($7, label),
         assigned_to = CASE WHEN $8 THEN $9::uuid ELSE assigned_to END, updated_at = now()
     WHERE id = $1 AND tenant_id = $10
     RETURNING *`,
    [req.params.id, name, company, stage, owner, notes, label, shouldUpdateAssignment, assignedToValue, req.user.tenantId],
  );
  await recordAssignmentHistory({ tenantId: req.user.tenantId, contactId: req.params.id, fromUserId: before.rows[0]?.assigned_to, toUserId: result.rows[0]?.assigned_to, changedBy: req.user.id, reason: assignment_reason });
  res.json(result.rows[0]);
}));

app.post('/api/conversations/:id/messages', requireAuth, asyncHandler(async (req, res) => {
  const { text, templateName, language } = req.body;

  const contact = await findContact(req.params.id, req.user.tenantId);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });

    if (contact.opted_out) {
    return res.status(403).json({
      error: 'Customer has opted out. Do not send WhatsApp messages to this contact.',
    });
  }

  if (!canAccessContact(req.user, contact)) {
    return res.status(403).json({ error: 'Conversation assigned to another user' });
  }

  const cleanText = String(text || '').trim();
  const cleanTemplateName = String(templateName || '').trim();
  const cleanLanguage = String(language || 'en').trim() || 'en';

  if (!cleanText && !cleanTemplateName) {
    return res.status(400).json({ error: 'Message text or template is required' });
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
      `SELECT id, name, language, body
       FROM whatsapp_templates
       WHERE tenant_id = $1
         AND name = $2
         AND language = $3
         AND active = true
       LIMIT 1`,
      [req.user.tenantId, cleanTemplateName, cleanLanguage],
    );

    templateRecord = templateResult.rows[0];

    if (!templateRecord) {
      return res.status(400).json({ error: 'Template is not active or not found for this company' });
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
    `SELECT id, name, language, body, active, created_at
     FROM whatsapp_templates
     WHERE tenant_id = $1
       AND active = true
     ORDER BY name, language`,
    [req.user.tenantId],
  );

  res.json(result.rows);
}));

app.get('/api/templates/manage', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) {
    return res.status(403).json({ error: 'Manager/Admin only' });
  }

  const result = await query(
    `SELECT id, name, language, body, active, created_at
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
  const active = req.body?.active === undefined ? true : Boolean(req.body.active);

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
    `INSERT INTO whatsapp_templates (tenant_id, name, language, body, active)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_id, name, language)
     DO UPDATE SET body = EXCLUDED.body,
                   active = EXCLUDED.active
     RETURNING id, name, language, body, active, created_at`,
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

app.patch('/api/templates/:id', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) {
    return res.status(403).json({ error: 'Manager/Admin only' });
  }

  const existingResult = await query(
    `SELECT id, name, language, body, active
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

  const active = req.body?.active === undefined ? existing.active : Boolean(req.body.active);

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
     RETURNING id, name, language, body, active, created_at`,
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

app.get('/api/products', requireAuth, asyncHandler(async (req, res) => {
  const { q, active } = req.query;
  const params = [req.user.tenantId];
  const where = ['tenant_id = $1'];
  if (q) { params.push(`%${q}%`); where.push(`(sku ILIKE $${params.length} OR name ILIKE $${params.length} OR category ILIKE $${params.length} OR grade ILIKE $${params.length} OR size ILIKE $${params.length} OR shape ILIKE $${params.length})`); }
  if (active === 'true' || active === 'false') { params.push(active === 'true'); where.push(`active = $${params.length}`); }
  const result = await query(`SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY active DESC, created_at DESC LIMIT 500`, params);
  res.json(result.rows);
}));

app.post('/api/products', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });
  const product = normalizeProduct(req.body);
  if (!product.sku || !product.name) return res.status(400).json({ error: 'SKU and product name required' });
  const existing = await query('SELECT id FROM products WHERE tenant_id = $1 AND lower(sku) = lower($2) LIMIT 1', [req.user.tenantId, product.sku]);
  if (existing.rows[0]) return res.status(409).json({ error: 'Product SKU already exists' });
  const result = await query(
    'INSERT INTO products (tenant_id, sku, name, category, grade, size, shape, unit, price, stock_qty, active, custom_fields) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',
    [req.user.tenantId, product.sku, product.name, product.category, product.grade, product.size, product.shape, product.unit, product.price, product.stock_qty, product.active, product.custom_fields],
  );
  await recordAudit({ tenantId: req.user.tenantId, actorUserId: req.user.id, action: 'product.created', entityType: 'product', entityId: result.rows[0].id, metadata: { sku: product.sku } });
  res.status(201).json(result.rows[0]);
}));

app.patch('/api/products/:id', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });
  const product = normalizeProduct(req.body);
  if (!product.sku || !product.name) return res.status(400).json({ error: 'SKU and product name required' });
  
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

app.post('/api/products/import', requireAuth, asyncHandler(async (req, res) => {
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
    if (!product.sku || !product.name) { skipped.push({ row: index + 1, reason: 'SKU and product name required' }); continue; }
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

// =========================================================
// ERROR HANDLER
// =========================================================

app.use((err, req, res, next) => {
  if (err.code === '22P02') {
    return res.status(400).json({ error: 'Invalid id format' });
  }

  if (Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 500) {
    return res.status(err.statusCode).json({ error: err.message || 'Invalid request' });
  }

  console.error(err);

  if (isProduction) {
    return res.status(500).json({ error: 'Internal server error' });
  }

  return res.status(500).json({ error: err.message || 'Internal server error' });
});

// =========================================================
// SERVER START
// =========================================================

let httpServer = null;

async function startServer() {
  await ensureSchema();
  await ensureDefaultUsers();
  await ensurePlatformSuperAdmin();
  await ensureDefaultWhatsAppAccountMapping();

  const warnings = validateRuntimeConfig();
  warnings.forEach((warning) => console.warn(`Config warning: ${warning}`));

  httpServer = app.listen(port, () => {
    console.log(`BOS WhatsApp backend running on http://localhost:${port}`);
  });

  return httpServer;
}

async function gracefulShutdown(signal) {
  console.log(`${signal} received. Closing HTTP server and database pool...`);

  try {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }

    await closePool();
    console.log('Shutdown completed cleanly.');
    process.exit(0);
  } catch (error) {
    console.error('Shutdown failed:', {
      message: error.message,
      code: error.code || null,
    });
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  gracefulShutdown('SIGTERM');
});

process.on('SIGINT', () => {
  gracefulShutdown('SIGINT');
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

if (require.main === module) {
  startServer().catch((error) => {
    console.error('Server startup failed:', {
      message: error.message,
      code: error.code || null,
    });
    process.exit(1);
  });
}

module.exports = {
  app,
  buildBotReplyText,
  categorizeMessage,
  extractEnquiry,
  extractText,
  getBotIntent,
  normalizeProduct,
  normalizeSalesItem,
  parseQuantity,
  startServer,
  updateMessageStatus,
};
