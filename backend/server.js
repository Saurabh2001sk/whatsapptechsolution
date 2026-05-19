require('dotenv').config();

const axios = require('axios');
const bcrypt = require('bcrypt');
const cors = require('cors');
const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { query } = require('./db');

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

const allowedOrigins = new Set([
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
].filter(Boolean));

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked origin: ${origin}`));
  },
}));

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

  const restoredMedia = await downloadWhatsAppMedia(mediaMessage.media_id, mediaMessage.mime_type || '');

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
  botEnabled: false,
  botGreeting: 'Hello, please share the product, size, and quantity you need.',
  handoffKeywords: ['urgent', 'complaint', 'stuck', 'salesperson'],
  inventoryFields: ['sku', 'name', 'grade', 'size', 'shape', 'stock_qty', 'price'],
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
  if (!hasRealValue(process.env.JWT_SECRET) && isProduction) warnings.push('JWT_SECRET is required in production');
  if (!hasRealValue(process.env.FRONTEND_URL) && isProduction) warnings.push('FRONTEND_URL should be set in production');
  if (hasRealValue(process.env.WHATSAPP_ACCESS_TOKEN) !== hasRealValue(process.env.WHATSAPP_PHONE_NUMBER_ID)) {
    warnings.push('WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID should be configured together');
  }
  if (hasRealValue(process.env.WHATSAPP_ACCESS_TOKEN) && !hasRealValue(process.env.WHATSAPP_APP_SECRET)) {
    warnings.push('WHATSAPP_APP_SECRET is recommended so Meta webhook signatures can be verified');
  }
  return warnings;
}

// =========================================================
// AUTH
// =========================================================

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

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

function canMonitor(user) {
  return user.role === 'admin' || user.role === 'manager';
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

async function downloadWhatsAppMedia(mediaId, fallbackMimeType = '') {
  if (!mediaId) {
    console.warn('WA media skipped: mediaId missing');
    return { mediaUrl: null, mediaLocalPath: null, mimeType: fallbackMimeType || null, fileSize: null };
  }

  if (!isWhatsAppConfigured()) {
    console.warn('WA media skipped: WhatsApp token/phone number not configured');
    return { mediaUrl: null, mediaLocalPath: null, mimeType: fallbackMimeType || null, fileSize: null };
  }

  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v20.0';

  try {
    const metaRes = await axios.get(
      `https://graph.facebook.com/${apiVersion}/${mediaId}`,
      { headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` } },
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
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}` },
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
    console.error('WA media download failed:', {
      mediaId,
      status: error.response?.status || null,
      metaError: error.response?.data?.error?.message || error.response?.data || null,
      message: error.message,
    });

    return { mediaUrl: null, mediaLocalPath: null, mimeType: fallbackMimeType || null, fileSize: null };
  }
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
  const enquiry = extractEnquiry(text);
  const cleanText = String(text || '').trim();
  if (!cleanText || /^\[(image|audio|video|sticker|location|contacts|reaction|unsupported)/i.test(cleanText)) return null;
  const hasEnquirySignal = enquiry.grade || enquiry.size || enquiry.shape || enquiry.quantity || /(quote|quotation|rate|price|qty|quantity|size|grade)/i.test(cleanText);
  if (!hasEnquirySignal) return null;
  const result = await query(
    `INSERT INTO enquiry_drafts (tenant_id, contact_id, message_id, grade, size, shape, quantity, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'WhatsApp Auto')
     RETURNING *`,
    [tenantId, contactId, messageId || null, enquiry.grade, enquiry.size, enquiry.shape, enquiry.quantity],
  );
  return result.rows[0];
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
      downloadedMedia = await downloadWhatsAppMedia(normalized.mediaId, normalized.mimeType);
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

  const enquiryDraft = await createEnquiryDraft({ tenantId, contactId: contact.id, messageId: saved?.id, text: textForIntent });
  return { contact, message: saved, enquiryDraft };
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
    `SELECT phone_number_id
     FROM whatsapp_accounts
     WHERE tenant_id = $1
       AND active = true
     ORDER BY created_at DESC
     LIMIT 1`,
    [tenantId],
  );

  const account = accountResult.rows[0];

  const phoneNumberId = account?.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!hasRealValue(phoneNumberId) || !hasRealValue(accessToken)) {
    return null;
  }

  return {
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v20.0',
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

async function sendWhatsAppText(contact, text, tenantId) {
  const config = await getWhatsAppSendConfig(tenantId);

  if (!config) {
    if (shouldAllowLocalMessageQueue()) return null;
    throw new Error('WhatsApp is not configured. Message was not sent.');
  }

  const response = await axios.post(
    whatsappMessagesUrl(config),
    {
      messaging_product: 'whatsapp',
      to: contact.wa_id,
      type: 'text',
      text: { body: text },
    },
    { headers: whatsappHeaders(config) },
  );

  return response.data?.messages?.[0]?.id || null;
}

async function sendWhatsAppTemplate(contact, templateName, language = 'en', tenantId) {
  const config = await getWhatsAppSendConfig(tenantId);

  if (!config) {
    if (shouldAllowLocalMessageQueue()) return null;
    throw new Error('WhatsApp is not configured. Template message was not sent.');
  }

  const response = await axios.post(
    whatsappMessagesUrl(config),
    {
      messaging_product: 'whatsapp',
      to: contact.wa_id,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
      },
    },
    { headers: whatsappHeaders(config) },
  );

  return response.data?.messages?.[0]?.id || null;
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

// =========================================================
// ROUTES — SYSTEM
// =========================================================

app.get('/health', (req, res) => {
  res.json({ ok: true, database: 'postgres', whatsappConfigured: isWhatsAppConfigured(), warnings: validateRuntimeConfig() });
});

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

app.post('/api/auth/login', asyncHandler(async (req, res) => {
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

  return res.json({
    token: signUser(user),
    user: publicUser(user),
  });
}));

app.get('/api/me', requireAuth, (req, res) => res.json(req.user));

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
    phoneNumberMapped: accountStatus.phoneNumberMapped,
    phoneNumberMappedToCurrentTenant: accountStatus.phoneNumberMappedToCurrentTenant,
    phoneNumberMappedTenantSlug: accountStatus.phoneNumberMappedTenantSlug,
    webhookUrl: '/webhook',
    labels: settings.labels,
    warnings,
  });
}));

app.get('/api/whatsapp/config', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });
  const accountStatus = await getEnvWhatsAppAccountStatus(req.user.tenantId);

  res.json({
    configured: isWhatsAppConfigured(),
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v20.0',
    phoneNumberIdSet: hasRealValue(process.env.WHATSAPP_PHONE_NUMBER_ID),
    phoneNumberIdMasked: maskValue(process.env.WHATSAPP_PHONE_NUMBER_ID || ''),
    phoneNumberMapped: accountStatus.phoneNumberMapped,
    phoneNumberMappedToCurrentTenant: accountStatus.phoneNumberMappedToCurrentTenant,
    phoneNumberMappedTenantSlug: accountStatus.phoneNumberMappedTenantSlug,
    accessTokenSet: hasRealValue(process.env.WHATSAPP_ACCESS_TOKEN),
    accessTokenMasked: maskValue(process.env.WHATSAPP_ACCESS_TOKEN || ''),
    verifyTokenSet: hasRealValue(process.env.WHATSAPP_VERIFY_TOKEN),
    appSecretSet: hasRealValue(process.env.WHATSAPP_APP_SECRET),
    webhookSignatureRequired: isProduction,
    webhookPath: '/webhook',
    callbackUrl: process.env.PUBLIC_BASE_URL ? `${process.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/webhook` : 'Set PUBLIC_BASE_URL to show full webhook URL',
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

app.post('/webhook', asyncHandler(async (req, res) => {
  console.log('WA webhook received:', {
    object: req.body?.object || null,
    entries: req.body?.entry?.length || 0,
    hasSignature: Boolean(req.headers['x-hub-signature-256']),
  });

  if (!verifyMetaWebhookSignature(req)) {
    console.warn('WA webhook rejected: invalid signature');
    return res.status(403).json({ error: 'Invalid webhook signature' });
  }

  const entries = req.body?.entry || [];

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

  res.sendStatus(200);
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

app.post('/api/whatsapp/test-message', requireAuth, asyncHandler(async (req, res) => {
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

  const response = await axios.post(
    whatsappMessagesUrl(config),
    {
      messaging_product: 'whatsapp',
      to: cleanTo,
      type: 'text',
      text: { body: cleanText },
    },
    { headers: whatsappHeaders(config) },
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
            caption, media_id, media_url, mime_type, file_name, file_size, status_updated_at, created_at
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

  try {
    if (cleanTemplateName) {
      waMessageId = await sendWhatsAppTemplate(contact, cleanTemplateName, cleanLanguage, req.user.tenantId);
      body = `[Template] ${cleanTemplateName}`;
      type = 'template';
    } else {
      waMessageId = await sendWhatsAppText(contact, cleanText, req.user.tenantId);
    }
  } catch (error) {
    return res.status(400).json({
      error: error.response?.data?.error?.message || error.message || 'WhatsApp message failed',
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

app.patch('/api/quotations/:id', requireAuth, asyncHandler(async (req, res) => {
  const { status, valid_until, notes } = req.body;

  if (status !== undefined) {
    const allowedQuotationStatuses = new Set(['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted', 'lost']);
    const cleanStatus = String(status || '').trim().toLowerCase();

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
  const quoteResult = await query('SELECT * FROM quotations WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenantId]);
  const quote = quoteResult.rows[0];
  if (!quote) return res.status(404).json({ error: 'Quotation not found' });
  const itemResult = await query('SELECT * FROM quotation_items WHERE quotation_id = $1 AND tenant_id = $2 ORDER BY created_at', [quote.id, req.user.tenantId]);
  if (!(await canAccessContactId(req.user, quote.contact_id))) return res.status(403).json({ error: 'Quotation assigned to another user' });
  const order = await createSalesOrder({ tenantId: req.user.tenantId, contactId: quote.contact_id, notes: req.body.notes || `Converted from quotation ${quote.quote_no}`, items: itemResult.rows, source: 'WhatsApp Quote', paymentStatus: req.body.payment_status || 'pending', dispatchStatus: req.body.dispatch_status || 'pending' });
  await query("UPDATE quotations SET status = 'converted' WHERE id = $1 AND tenant_id = $2", [quote.id, req.user.tenantId]);
  await recordAudit({ tenantId: req.user.tenantId, actorUserId: req.user.id, action: 'quotation.converted_to_order', entityType: 'sales_order', entityId: order.id, metadata: { quoteId: quote.id, contactId: quote.contact_id } });
  res.status(201).json(order);
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

  console.error(err);

  if (isProduction) {
    return res.status(500).json({ error: 'Internal server error' });
  }

  return res.status(500).json({ error: err.message || 'Internal server error' });
});

// =========================================================
// SERVER START
// =========================================================

async function startServer() {
  await ensureSchema();
  await ensureDefaultUsers();
  await ensureDefaultWhatsAppAccountMapping();
  const warnings = validateRuntimeConfig();
  warnings.forEach((warning) => console.warn(`Config warning: ${warning}`));
  return app.listen(port, () => {
    console.log(`BOS WhatsApp backend running on http://localhost:${port}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  app,
  categorizeMessage,
  extractEnquiry,
  extractText,
  normalizeProduct,
  normalizeSalesItem,
  parseQuantity,
  startServer,
  updateMessageStatus,
};
