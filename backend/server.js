require('dotenv').config();

const axios = require('axios');
const bcrypt = require('bcrypt');
const cors = require('cors');
const crypto = require('crypto');
const express = require('express');
const FormData = require('form-data');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { query, healthCheck, closePool } = require('./db');
const asyncHandler = require('./asyncHandler');
const rateLimit = require('./rateLimit');
const { createAuthService } = require('./auth.service');
const { createTenantService } = require('./tenant.service');
const { createAuditService } = require('./audit.service');
const {
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
  getCookie,
  safeMetaError,
  safeErrorLog,
  cleanList,
  WEEK_DAYS,
  DEFAULT_VOICE_WEEKLY_HOURS,
  cleanVoiceWeeklyHours,
  cleanUnavailableHours,
} = require('./common');
const { registerCoreRoutes } = require('./core.routes');
const { registerWhatsAppRoutes } = require('./whatsapp.routes');
const { registerCrmRoutes } = require('./crm.routes');
const { registerSalesRoutes } = require('./sales.routes');
const { registerCampaignRoutes } = require('./campaign.routes');
const { registerTallyRoutes } = require('./tally.routes');
const { createMediaStorage } = require('./media.storage');

if (!process.env.DATABASE_URL) {
  console.error('FATAL: DATABASE_URL is not set. Add it to backend/.env and restart.');
  process.exit(1);
}

const mediaRoot = path.resolve(process.env.WHATSAPP_MEDIA_DIR || path.join(__dirname, '.media'));
if (!fs.existsSync(mediaRoot)) fs.mkdirSync(mediaRoot, { recursive: true });
const mediaStorage = createMediaStorage({ mediaRoot });

const ALLOWED_OUTBOUND_MEDIA_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/3gpp',
  'audio/aac',
  'audio/mp4',
  'audio/mpeg',
  'audio/amr',
  'audio/ogg',
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

const OUTBOUND_MEDIA_MAX_BYTES = Number(process.env.OUTBOUND_MEDIA_MAX_BYTES || 16 * 1024 * 1024);

const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: OUTBOUND_MEDIA_MAX_BYTES,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_OUTBOUND_MEDIA_MIME.has(file.mimetype)) {
      return cb(new Error('Unsupported media file type'));
    }

    return cb(null, true);
  },
});

const app = express();
const port = Number(process.env.PORT || 5000);
const isProduction = process.env.NODE_ENV === 'production';

const rawJwtSecret = String(process.env.JWT_SECRET || '').trim();

if (isProduction) {
  const jwtLooksUnsafe =
    !rawJwtSecret ||
    rawJwtSecret.length < 32 ||
    rawJwtSecret.startsWith('your-') ||
    rawJwtSecret.startsWith('change-') ||
    rawJwtSecret === 'dev-only-local-secret';

  if (jwtLooksUnsafe) {
    throw new Error('JWT_SECRET must be a real random secret with at least 32 characters in production');
  }
}

const jwtSecret = rawJwtSecret || 'dev-only-local-secret';

const {
  signUser,
  publicUser,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  isSuperAdmin,
  canMonitor,
  requireSuperAdmin,
} = createAuthService({
  jwt,
  jwtSecret,
  isProduction,
  query,
  getCookie,
});

const {
  normalizeTenantSlug,
  publicTenant,
  countActiveTenantAdmins,
  getDemoTenantId,
  ensureDefaultWhatsAppAccountMapping,
  getEnvWhatsAppAccountStatus,
  getTenantIdForWebhookValue,
} = createTenantService({
  query,
  isProduction,
  hasRealValue,
});

const {
  recordAudit,
  recordAssignmentHistory,
} = createAuditService({
  query,
});

const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

function parseAllowedOrigins(value = '') {
  return String(value || '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

const allowedOrigins = new Set([
  ...parseAllowedOrigins(process.env.FRONTEND_URL),
  ...parseAllowedOrigins(process.env.FRONTEND_URLS),
  ...(!isProduction ? ['http://localhost:5173', 'http://127.0.0.1:5173'] : []),
]);

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
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "base-uri 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        "img-src 'self' data: blob:",
        "media-src 'self' blob:",
        "connect-src 'self'",
      ].join('; '),
    );
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
  const decodedStorageKey = mediaStorage.decodeStorageKey(fileName);

  const result = await query(
    `SELECT id, media_id, mime_type, media_local_path, media_storage_provider, media_storage_key
     FROM messages
     WHERE tenant_id = $1
       AND (
         media_url = $2
         OR media_storage_key = $3
       )
     LIMIT 1`,
    [req.user.tenantId, mediaUrl, decodedStorageKey || fileName],
  );

  const mediaMessage = result.rows[0];

  if (!mediaMessage) {
    return res.status(404).json({ error: 'Media not found' });
  }

  if (mediaMessage.media_storage_provider === 's3' && mediaMessage.media_storage_key) {
    if (req.query?.signed === '1') {
      const signedUrl = await mediaStorage.getSignedTenantMediaUrl(mediaMessage.media_storage_key);
      if (!signedUrl) return res.status(404).json({ error: 'Media object missing' });
      return res.json({ url: signedUrl, expiresIn: 300 });
    }

    const objectStream = await mediaStorage.getTenantMediaStream(mediaMessage.media_storage_key);
    if (!objectStream?.body) return res.status(404).json({ error: 'Media object missing' });

    res.setHeader('Content-Type', objectStream.contentType || mediaMessage.mime_type || 'application/octet-stream');
    if (objectStream.contentLength) res.setHeader('Content-Length', String(objectStream.contentLength));
    return objectStream.body.pipe(res);
  }

  const localFileName = mediaMessage.media_storage_key || fileName;
  const filePath = mediaMessage.media_local_path || path.join(mediaRoot, localFileName);

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

  const restoredToObjectStorage = restoredMedia.mediaStorageProvider === 's3' && restoredMedia.mediaStorageKey;
  const restoredToLocalStorage = restoredMedia.mediaLocalPath && fs.existsSync(restoredMedia.mediaLocalPath);

  if (!restoredMedia.mediaUrl || (!restoredToObjectStorage && !restoredToLocalStorage)) {
    return res.status(404).json({ error: 'Media file missing' });
  }

  await query(
    `UPDATE messages
     SET media_url = $3,
         media_local_path = $4,
         media_storage_provider = $5,
         media_storage_key = $6,
         mime_type = COALESCE($7, mime_type),
         file_size = COALESCE($8, file_size)
     WHERE id = $1
       AND tenant_id = $2`,
    [
      mediaMessage.id,
      req.user.tenantId,
      restoredMedia.mediaUrl,
      restoredMedia.mediaLocalPath,
      restoredMedia.mediaStorageProvider,
      restoredMedia.mediaStorageKey,
      restoredMedia.mimeType,
      restoredMedia.fileSize,
    ],
  );

  if (restoredMedia.mediaStorageProvider === 's3' && restoredMedia.mediaStorageKey) {
    const objectStream = await mediaStorage.getTenantMediaStream(restoredMedia.mediaStorageKey);
    if (!objectStream?.body) return res.status(404).json({ error: 'Media object missing' });

    res.setHeader('Content-Type', objectStream.contentType || restoredMedia.mimeType || 'application/octet-stream');
    if (objectStream.contentLength) res.setHeader('Content-Length', String(objectStream.contentLength));
    return objectStream.body.pipe(res);
  }

  return res.sendFile(restoredMedia.mediaLocalPath);
}));

// =========================================================
// CONSTANTS
// =========================================================

const MAX_WHATSAPP_TEXT_LENGTH = 4096;

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
  ftpAccessEnabled: false,
  twoFactorEnabled: false,
  wabaMmLiteEnabled: false,
  wabaHealthyRetryEnabled: false,
  wabaConversionEventsEnabled: false,
  billingBusinessName: '',
  billingGstNumber: '',
  billingPanNumber: '',
  billingCountry: 'India',
  billingState: '',
  billingCity: '',
  billingAddress: '',
  billingPinCode: '',
  billingEmail: '',
  billingContactNumber: '',
  voiceCallsEnabled: false,
  voiceCallbackEnabled: false,
  voiceDisplayCallButtons: true,
  voiceCallHoursMode: 'specific',
  voiceTimeZone: 'Asia/Kolkata (GMT+05:30)',
  voiceWeeklyHours: DEFAULT_VOICE_WEEKLY_HOURS,
  voiceUnavailableHours: [],
  inboxAutoAssign: false,
};

// =========================================================
// HELPERS
// =========================================================

function isWhatsAppConfigured() {
  return hasRealValue(process.env.WHATSAPP_ACCESS_TOKEN) && hasRealValue(process.env.WHATSAPP_PHONE_NUMBER_ID);
}

function shouldAllowLocalMessageQueue() {
  return !isProduction;
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
    ftpAccessEnabled: Boolean(input.ftpAccessEnabled),
    twoFactorEnabled: Boolean(input.twoFactorEnabled),
    wabaMmLiteEnabled: Boolean(input.wabaMmLiteEnabled),
    wabaHealthyRetryEnabled: Boolean(input.wabaHealthyRetryEnabled),
    wabaConversionEventsEnabled: Boolean(input.wabaConversionEventsEnabled),
    billingBusinessName: String(input.billingBusinessName || '').trim().slice(0, 140),
    billingGstNumber: String(input.billingGstNumber || '').trim().toUpperCase().slice(0, 20),
    billingPanNumber: String(input.billingPanNumber || '').trim().toUpperCase().slice(0, 10),
    billingCountry: String(input.billingCountry || 'India').trim().slice(0, 80),
    billingState: String(input.billingState || '').trim().slice(0, 80),
    billingCity: String(input.billingCity || '').trim().slice(0, 80),
    billingAddress: String(input.billingAddress || '').trim().slice(0, 200),
    billingPinCode: String(input.billingPinCode || '').replace(/\D/g, '').slice(0, 6),
    billingEmail: String(input.billingEmail || '').trim().toLowerCase().slice(0, 140),
    billingContactNumber: String(input.billingContactNumber || '').replace(/\D/g, '').slice(0, 10),
    voiceCallsEnabled: Boolean(input.voiceCallsEnabled),
    voiceCallbackEnabled: Boolean(input.voiceCallbackEnabled),
    voiceDisplayCallButtons: input.voiceDisplayCallButtons === undefined ? DEFAULT_APP_SETTINGS.voiceDisplayCallButtons : Boolean(input.voiceDisplayCallButtons),
    voiceCallHoursMode: input.voiceCallHoursMode === 'all' ? 'all' : 'specific',
    voiceTimeZone: String(input.voiceTimeZone || DEFAULT_APP_SETTINGS.voiceTimeZone).trim().slice(0, 80),
    voiceWeeklyHours: cleanVoiceWeeklyHours(input.voiceWeeklyHours),
    voiceUnavailableHours: cleanUnavailableHours(input.voiceUnavailableHours),
    inboxAutoAssign: Boolean(input.inboxAutoAssign),
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

function extractBusinessReferences(text = '') {
  const matches = String(text || '').match(/\b(?:SO-WA|QT-WA|SO|QT|INV|ORDER)[-/]?[A-Z0-9-]{2,}\b/gi) || [];
  return [...new Set(matches.map((item) => item.trim().toUpperCase()).filter(Boolean))].slice(0, 5);
}

async function buildOrderStatusReply({ tenantId, contactId, settings, text }) {
  const intent = getBotIntent(text);
  const normalized = normalizeUserText(text);
  const looksLikeStatusQuestion = intent === 'dispatch'
    || intent === 'payment'
    || normalized.includes('order status')
    || normalized.includes('track order')
    || normalized.includes('dispatch status')
    || normalized.includes('payment status');

  if (!looksLikeStatusQuestion || !tenantId || !contactId) return null;

  const references = extractBusinessReferences(text);
  const company = settings.companyName || settings.appName || 'our business';

  if (!references.length) {
    return `Please share your order number or quotation number. ${company} team can then confirm payment and dispatch status.`;
  }

  const orderResult = await query(
    `SELECT
       sales_orders.order_no,
       sales_orders.status,
       sales_orders.payment_status,
       sales_orders.dispatch_status,
       sales_orders.amount,
       sales_orders.updated_at
     FROM sales_orders
     WHERE sales_orders.tenant_id = $1
       AND sales_orders.contact_id = $2
       AND UPPER(sales_orders.order_no) = ANY($3::text[])
     ORDER BY sales_orders.updated_at DESC
     LIMIT 1`,
    [tenantId, contactId, references],
  );

  const order = orderResult.rows[0];

  if (order) {
    return `Order ${order.order_no} status:\nOrder: ${order.status}\nPayment: ${order.payment_status}\nDispatch: ${order.dispatch_status}\nAmount: ${settings.currency || 'INR'} ${Number(order.amount || 0).toFixed(2)}\n\nFor invoice, transport receipt, or urgent changes, our team will verify and respond.`;
  }

  const quoteResult = await query(
    `SELECT
       quotations.quote_no,
       quotations.status,
       quotations.amount,
       quotations.valid_until,
       quotations.updated_at
     FROM quotations
     WHERE quotations.tenant_id = $1
       AND quotations.contact_id = $2
       AND UPPER(quotations.quote_no) = ANY($3::text[])
     ORDER BY quotations.updated_at DESC
     LIMIT 1`,
    [tenantId, contactId, references],
  );

  const quote = quoteResult.rows[0];

  if (quote) {
    const validUntil = quote.valid_until ? new Date(quote.valid_until).toLocaleDateString('en-IN') : '-';
    return `Quotation ${quote.quote_no} status:\nStatus: ${quote.status}\nAmount: ${settings.currency || 'INR'} ${Number(quote.amount || 0).toFixed(2)}\nValid until: ${validUntil}\n\nReply confirm if you want our team to continue order processing.`;
  }

  return `I could not find this order/quotation for your WhatsApp number. Please recheck the number or share registered company/mobile details for team verification.`;
}

async function buildBotReply({ tenantId, settings, text, contact }) {
  const orderStatusReply = await buildOrderStatusReply({
    tenantId,
    contactId: contact?.id,
    settings,
    text,
  });

  if (orderStatusReply) {
    return orderStatusReply.slice(0, 1000);
  }

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

async function validateTemplateRetryAllowed(tenantId, templateName, language = 'en') {
  const cleanTemplateName = String(templateName || '').trim();
  const cleanLanguage = String(language || 'en').trim() || 'en';

  if (!cleanTemplateName) {
    const error = new Error('Template name missing. Template retry is not allowed.');
    error.statusCode = 400;
    throw error;
  }

  const result = await query(
    `SELECT id, name, language, active, meta_status
     FROM whatsapp_templates
     WHERE tenant_id = $1
       AND name = $2
       AND language = $3
       AND active = true
       AND ($4::boolean = false OR meta_status = 'approved')
     LIMIT 1`,
    [tenantId, cleanTemplateName, cleanLanguage, isProduction],
  );

  if (!result.rows[0]) {
    const error = new Error(
      isProduction
        ? 'Template is not approved by Meta for this company. Sync approved templates from Meta before retrying.'
        : 'Template is not active for this company. Sync/add the approved Meta template before retrying.',
    );
    error.statusCode = 400;
    throw error;
  }

  return result.rows[0];
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
    return { mediaUrl: null, mediaLocalPath: null, mediaStorageProvider: null, mediaStorageKey: null, mimeType: fallbackMimeType || null, fileSize: null };
  }

  const config = tenantId ? await getWhatsAppSendConfig(tenantId) : null;
  const accessToken = config?.accessToken || process.env.WHATSAPP_ACCESS_TOKEN;

  if (!hasRealValue(accessToken)) {
    console.warn('WA media skipped: WhatsApp token not configured for tenant');
    return { mediaUrl: null, mediaLocalPath: null, mediaStorageProvider: null, mediaStorageKey: null, mimeType: fallbackMimeType || null, fileSize: null };
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
  mediaId: maskId(mediaId),
  mimeType,
  fileSize,
});

        return { mediaUrl: null, mediaLocalPath: null, mediaStorageProvider: null, mediaStorageKey: null, mimeType: mimeType || null, fileSize };
      }

      const extension = extensionFromMime(mimeType);
      const safeMediaId = String(mediaId).replace(/[^a-zA-Z0-9_-]/g, '_') || crypto.randomUUID();
      const fileName = `${safeMediaId}-${Date.now()}.${extension}`;

      const fileRes = await axios.get(downloadUrl, {
        responseType: 'arraybuffer',
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: timeoutMs,
        maxContentLength: Number(process.env.WHATSAPP_MEDIA_MAX_BYTES || 25 * 1024 * 1024),
        maxBodyLength: Number(process.env.WHATSAPP_MEDIA_MAX_BYTES || 25 * 1024 * 1024),
      });

      const storedMedia = await mediaStorage.putTenantMediaObject({
        tenantId,
        buffer: Buffer.from(fileRes.data),
        fileName,
        mimeType,
        source: 'whatsapp-inbound',
      });

     console.log('WA media downloaded:', {
  mediaId: maskId(mediaId),
  mediaUrl: isProduction ? '[protected-media-url]' : storedMedia.mediaUrl,
  mimeType,
  fileSize,
  storageProvider: storedMedia.provider,
});

      return {
        mediaUrl: storedMedia.mediaUrl,
        mediaLocalPath: storedMedia.mediaLocalPath,
        mediaStorageProvider: storedMedia.provider,
        mediaStorageKey: storedMedia.storageKey,
        mimeType: mimeType || null,
        fileSize,
      };
    } catch (error) {
      lastError = error;

console.error('WA media download attempt failed:', {
  attempt,
  maxAttempts,
  mediaId: maskId(mediaId),
  ...safeMetaError(error),
});

      if (!isRetryableWhatsAppError(error) || attempt >= maxAttempts) {
        break;
      }

      await sleep(500 * attempt);
    }
  }

console.error('WA media download failed:', {
  mediaId: maskId(mediaId),
  ...safeMetaError(lastError),
});

  return { mediaUrl: null, mediaLocalPath: null, mediaStorageProvider: null, mediaStorageKey: null, mimeType: fallbackMimeType || null, fileSize: null };
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
  mediaLocalPath, mediaStorageProvider, mediaStorageKey, mimeType, fileName, fileSize, sha256, contextWaMessageId,
  interactivePayload, buttonPayload, locationPayload, contactsPayload,
  reactionPayload, referralPayload, unsupportedPayload, normalizedText,
}) {
  const result = await query(
    `INSERT INTO messages (
       tenant_id, contact_id, wa_message_id, direction, type, body, status, raw_payload,
       template_name, wa_sender_id, wa_recipient_id, caption, media_id, media_url,
       media_local_path, media_storage_provider, media_storage_key, mime_type, file_name, file_size, sha256, context_wa_message_id,
       interactive_payload, button_payload, location_payload, contacts_payload,
       reaction_payload, referral_payload, unsupported_payload, normalized_text
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)
     ON CONFLICT (tenant_id, wa_message_id) WHERE wa_message_id IS NOT NULL DO NOTHING
     RETURNING *`,
    [
      tenantId, contactId, waMessageId || null, direction, type, body || '', status,
      rawPayload || null, templateName || null, waSenderId || null, waRecipientId || null,
      caption || null, mediaId || null, mediaUrl || null, mediaLocalPath || null,
      mediaStorageProvider || null, mediaStorageKey || null, mimeType || null, fileName || null, fileSize || null, sha256 || null,
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
    replyText = await buildBotReply({ tenantId, settings, text, contact });
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
      ...safeMetaError(error),
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
      console.error('WhatsApp media download failed:', safeMetaError(error));
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
           marketing_opted_in = false,
           marketing_opted_in_at = NULL,
           marketing_opt_in_source = 'whatsapp_customer_opt_out',
           marketing_opt_in_proof = NULL,
           updated_at = now()
       WHERE id = $1
         AND tenant_id = $2`,
      [contact.id, tenantId, optOutText],
    );

    await query(
      `INSERT INTO contact_consents (
         tenant_id,
         contact_id,
         consent_type,
         channel,
         status,
         source,
         proof_text,
         recorded_by
       )
       VALUES ($1, $2, 'marketing', 'whatsapp', 'opted_out', 'whatsapp_customer_opt_out', $3, NULL)`,
      [tenantId, contact.id, optOutText.slice(0, 500)],
    );

    await recordAudit({
      tenantId,
      action: 'contact.customer_opted_out',
      entityType: 'contact',
      entityId: contact.id,
      metadata: {
        phone: maskValue(waId),
        reason: optOutText,
        waMessageId: maskId(waMessageId || ''),
      },
    });

    contact.opted_out = true;
    contact.opted_out_at = new Date();
    contact.opted_out_reason = optOutText;
    contact.marketing_opted_in = false;
  }
  const saved = await addMessage({
    tenantId, contactId: contact.id, waMessageId, direction: 'inbound',
    type: normalized.type, body: normalized.body, status: 'received', rawPayload,
    waSenderId: waId, caption: normalized.caption,
    mediaId: normalized.mediaId, mediaUrl: downloadedMedia.mediaUrl,
    mediaLocalPath: downloadedMedia.mediaLocalPath,
    mediaStorageProvider: downloadedMedia.mediaStorageProvider,
    mediaStorageKey: downloadedMedia.mediaStorageKey,
    mimeType: downloadedMedia.mimeType || normalized.mimeType,
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
      waMessageId: maskId(waMessageId),
      type: normalized.type,
      mediaId: maskId(normalized.mediaId),
      mediaUrl: isProduction ? '[protected-media-url]' : downloadedMedia.mediaUrl,
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

  if (isProduction) {
    return null;
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

async function getWhatsAppTemplateSyncConfig(tenantId) {
  const accountResult = await query(
    `SELECT
       waba_id,
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

  if (account?.waba_id && account?.access_token_encrypted) {
    const accessToken = decryptSecret({
      encrypted: account.access_token_encrypted,
      iv: account.access_token_iv,
      tag: account.access_token_tag,
    });

    if (hasRealValue(accessToken)) {
      return {
        apiVersion: process.env.WHATSAPP_API_VERSION || 'v24.0',
        wabaId: account.waba_id,
        accessToken,
        source: 'tenant_embedded_signup',
      };
    }
  }

  if (isProduction) {
    return null;
  }

  const envWabaId = String(process.env.WHATSAPP_WABA_ID || '').trim();
  const envToken = String(process.env.WHATSAPP_ACCESS_TOKEN || '').trim();

  if (hasRealValue(envWabaId) && hasRealValue(envToken)) {
    return {
      apiVersion: process.env.WHATSAPP_API_VERSION || 'v24.0',
      wabaId: envWabaId,
      accessToken: envToken,
      source: 'dev_env_fallback',
    };
  }

  return null;
}

function extractMetaTemplateBody(template = {}) {
  const bodyComponent = (template.components || []).find((component) => component.type === 'BODY');
  return String(bodyComponent?.text || '').trim().slice(0, 1000);
}

function normalizeMetaTemplateStatus(value = '') {
  return String(value || 'unknown').trim().toLowerCase();
}

function normalizeMetaTemplateCategory(value = '') {
  return String(value || 'utility').trim().toLowerCase();
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

      console.error('WhatsApp send attempt failed:', {
        attempt,
        maxAttempts,
        ...safeMetaError(error),
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

function buildWhatsAppMediaPayload({
  contact,
  mediaType,
  mediaUrl = '',
  mediaId = '',
  caption = '',
  fileName = '',
}) {
  const cleanType = String(mediaType || '').trim().toLowerCase();
  const cleanUrl = String(mediaUrl || '').trim();
  const cleanMediaId = String(mediaId || '').trim();
  const cleanCaption = String(caption || '').trim().slice(0, 1024);
  const cleanFileName = String(fileName || '').trim().slice(0, 240);

  const mediaObject = cleanMediaId
    ? { id: cleanMediaId }
    : { link: cleanUrl };

  const payload = {
    messaging_product: 'whatsapp',
    to: contact.wa_id,
    type: cleanType,
    [cleanType]: mediaObject,
  };

  if (['image', 'video', 'document'].includes(cleanType) && cleanCaption) {
    payload[cleanType].caption = cleanCaption;
  }

  if (cleanType === 'document' && cleanFileName) {
    payload.document.filename = cleanFileName;
  }

  return payload;
}

async function sendWhatsAppMedia(contact, mediaPayload, tenantId) {
  const config = await getWhatsAppSendConfig(tenantId);

  if (!config) {
    if (shouldAllowLocalMessageQueue()) return null;
    throw new Error('WhatsApp is not configured. Media message was not sent.');
  }

  const response = await postWhatsAppMessage(
    config,
    mediaPayload,
    { tenantId, type: mediaPayload.type || 'media' },
  );

  return response.data?.messages?.[0]?.id || null;
}

function mediaTypeFromMime(mimeType = '') {
  const cleanMime = String(mimeType || '').toLowerCase();

  if (cleanMime.startsWith('image/')) return 'image';
  if (cleanMime.startsWith('video/')) return 'video';
  if (cleanMime.startsWith('audio/')) return 'audio';

  return 'document';
}

async function uploadWhatsAppMedia({ tenantId, buffer, fileName, mimeType }) {
  const config = await getWhatsAppSendConfig(tenantId);

  if (!config) {
    if (shouldAllowLocalMessageQueue()) return null;
    throw new Error('WhatsApp is not configured. Media file was not uploaded.');
  }

  if (!buffer?.length) {
    throw new Error('Media file is empty.');
  }

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mimeType);
  form.append('file', buffer, {
    filename: fileName || 'upload',
    contentType: mimeType,
  });

  const response = await axios.post(
    `https://graph.facebook.com/${config.apiVersion}/${config.phoneNumberId}/media`,
    form,
    {
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        ...form.getHeaders(),
      },
      timeout: Number(process.env.WHATSAPP_MEDIA_UPLOAD_TIMEOUT_MS || 20000),
      maxBodyLength: OUTBOUND_MEDIA_MAX_BYTES + 1024 * 1024,
      maxContentLength: OUTBOUND_MEDIA_MAX_BYTES + 1024 * 1024,
    },
  );

  return response.data?.id || null;
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
    `SELECT id, name, language, active, meta_status
     FROM whatsapp_templates
     WHERE tenant_id = $1
       AND name = $2
       AND language = $3
       AND active = true
       AND ($4::boolean = false OR meta_status = 'approved')
     LIMIT 1`,
    [tenantId, templateName, templateLanguage, isProduction],
  );

  if (!templateResult.rows[0]) {
    return {
      sent: false,
      reason: isProduction ? 'template_not_meta_approved' : 'template_not_active',
    };
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
      ...safeMetaError(error),
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
      ...safeMetaError(error),
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
  if (isProduction && process.env.AUTO_MIGRATE_ON_START !== 'true') {
    console.log('Production schema auto-migration skipped. Run npm run init-db before deploy when schema changes.');
    return;
  }

  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await query(schema);
}

function demoPassword(envName, fallback) {
  const password = String(process.env[envName] || fallback)

  if (!isStrongPassword(password)) {
    throw new Error(`${envName} ${strongPasswordError()}`)
  }

  return password
}

async function ensureDefaultUsers() {
  if (isProduction) {
    console.log('Production mode: default demo users are not created automatically')
    return
  }

  const tenantId = await getDemoTenantId()
  const defaults = [
    {
      name: 'Admin User',
      email: 'admin@bos.com',
      password: demoPassword('DEMO_ADMIN_PASSWORD', 'AdminDemo@12345'),
      role: 'admin',
    },
    {
      name: 'Manager User',
      email: 'manager@bos.com',
      password: demoPassword('DEMO_MANAGER_PASSWORD', 'ManagerDemo@12345'),
      role: 'manager',
    },
    {
      name: 'Sales Person',
      email: 'sales@bos.com',
      password: demoPassword('DEMO_SALES_PASSWORD', 'SalesDemo@12345'),
      role: 'sales',
    },
  ]

  const hashed = await Promise.all(defaults.map(async (u) => ({
    ...u,
    hash: await bcrypt.hash(u.password, 10),
  })))

  await Promise.all(hashed.map((user) => query(
    `INSERT INTO users (tenant_id, name, email, password_hash, role, active)
     VALUES ($1, $2, $3, $4, $5, true)
     ON CONFLICT (email)
     DO UPDATE SET
       tenant_id = COALESCE(users.tenant_id, EXCLUDED.tenant_id),
       name = EXCLUDED.name,
       password_hash = EXCLUDED.password_hash,
       role = EXCLUDED.role,
       active = true`,
    [tenantId, user.name, user.email, user.hash, user.role],
  )))
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

  if (!isStrongPassword(password)) {
    throw new Error(`SUPER_ADMIN_PASSWORD ${strongPasswordError()}`);
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

const routeContext = {
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
};

registerCoreRoutes(app, routeContext);
registerWhatsAppRoutes(app, routeContext);
registerCrmRoutes(app, routeContext);
registerSalesRoutes(app, routeContext);
registerCampaignRoutes(app, routeContext);
registerTallyRoutes(app, routeContext);

// =========================================================
// ERROR HANDLER
// =========================================================

app.use((err, req, res, next) => {
  if (String(err.message || '').startsWith('CORS blocked origin:')) {
    return res.status(403).json({ error: 'CORS blocked origin' });
  }

  if (err.code === '22P02') {
    return res.status(400).json({ error: 'Invalid id format' });
  }

  if (Number.isInteger(err.statusCode) && err.statusCode >= 400 && err.statusCode < 500) {
    return res.status(err.statusCode).json({ error: err.message || 'Invalid request' });
  }

  console.error('Unhandled route error:', safeErrorLog(err, isProduction));

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
    console.error('Shutdown failed:', safeErrorLog(error));
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
  const error = reason instanceof Error ? reason : new Error(String(reason || 'Unknown promise rejection'));
  console.error('Unhandled promise rejection:', safeErrorLog(error));
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
