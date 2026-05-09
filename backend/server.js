require('dotenv').config();

const axios = require('axios');
const bcrypt = require('bcrypt');
const cors = require('cors');
const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { hasDatabase, query } = require('./db');

const app = express();
const port = Number(process.env.PORT || 5000);

const isProduction = process.env.NODE_ENV === 'production';

if (isProduction && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required in production');
}

const jwtSecret = process.env.JWT_SECRET || 'dev-only-local-secret';
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
  verify: (req, res, buf) => {
    req.rawBody = buf;
  },
}));

const LABELS = [
  'New Enquiry',
  'Quotation Required',
  'Dispatch Query',
  'Payment Follow-up',
  'Complaint',
  'Review Required',
];

const memory = {
  users: [
    { id: 'user-admin', name: 'Admin User', email: 'admin@bos.com', password: 'admin123', role: 'admin', active: true },
    { id: 'user-manager', name: 'Manager User', email: 'manager@bos.com', password: 'manager123', role: 'manager', active: true },
    { id: 'user-sales', name: 'Sales Person', email: 'sales@bos.com', password: 'sales123', role: 'sales', active: true },
  ],
  assignmentHistory: [],
  contacts: [
    {
      id: 'demo-contact-1',
      wa_id: '919999999999',
      name: 'Demo Customer',
      phone: '919999999999',
      stage: 'qualified',
      company: 'BOS Client',
      notes: 'Demo lead for first run',
      label: 'Quotation Required',
      assigned_to: 'user-sales',
      last_inbound_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  messages: [
    {
      id: 'demo-message-1',
      contact_id: 'demo-contact-1',
      direction: 'inbound',
      type: 'text',
      body: 'Need quotation for round bar grade EN8 size 20mm quantity 25 pcs.',
      status: 'received',
      created_at: new Date().toISOString(),
    },
  ],
  products: [
    { id: 'prod-1', sku: 'BOS-001', name: 'Standard Product', price: 1200, stock_qty: 40 },
  ],
  quotations: [],
  quotationItems: [],
  orders: [],
  orderItems: [],
  enquiryDrafts: [
    {
      id: 'draft-1',
      contact_id: 'demo-contact-1',
      message_id: 'demo-message-1',
      grade: 'EN8',
      size: '20mm',
      shape: 'round bar',
      quantity: '25 pcs',
      status: 'draft',
      source: 'WhatsApp Auto',
      created_at: new Date().toISOString(),
    },
  ],
  templates: [
    { id: 'template-1', name: 'quotation_followup', language: 'en', body: 'Your quotation is ready. Please confirm.' },
    { id: 'template-2', name: 'payment_reminder', language: 'en', body: 'Payment follow-up for your pending order.' },
  ],
};

function now() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function signUser(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    jwtSecret,
    { expiresIn: '12h' },
  );
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, active: user.active };
}

async function recordAssignmentHistory({ contactId, fromUserId, toUserId, changedBy, reason }) {
  if (!contactId || fromUserId === toUserId) return null;
  if (hasDatabase) {
    const result = await query(
      `INSERT INTO assignment_history (contact_id, from_user_id, to_user_id, changed_by, reason)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [contactId, fromUserId || null, toUserId || null, changedBy || null, reason || null],
    );
    return result.rows[0];
  }
  const row = { id: makeId('assignment'), contact_id: contactId, from_user_id: fromUserId, to_user_id: toUserId, changed_by: changedBy, reason, created_at: now() };
  memory.assignmentHistory.unshift(row);
  return row;
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Login required' });

  try {
    req.user = jwt.verify(token, jwtSecret);
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function canMonitor(user) {
  return user.role === 'admin' || user.role === 'manager';
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

function verifyMetaWebhookSignature(req) {
  const appSecret = process.env.WHATSAPP_APP_SECRET;

  if (!appSecret) {
    return true;
  }

  const signature = req.headers['x-hub-signature-256'];

  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }

  const expectedSignature = `sha256=${crypto
    .createHmac('sha256', appSecret)
    .update(req.rawBody || Buffer.from(''))
    .digest('hex')}`;

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

function isReplyWindowOpen(contact) {
  if (!contact?.last_inbound_at) return false;
  const lastInbound = new Date(contact.last_inbound_at).getTime();
  return Date.now() - lastInbound <= 24 * 60 * 60 * 1000;
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
  return {
    quantity: Number(match?.[1] || 1),
    unit: match?.[2] || 'pcs',
  };
}

function normalizeSalesItem(item = {}) {
  const parsed = parseQuantity(item.quantity);
  const quantity = Number(item.quantity_value || parsed.quantity || 1);
  const rate = Number(item.rate || 0);
  return {
    product_id: item.product_id || null,
    description: item.description || [item.shape, item.grade, item.size].filter(Boolean).join(' ') || 'WhatsApp enquiry item',
    grade: item.grade || '',
    size: item.size || '',
    shape: item.shape || '',
    quantity,
    unit: item.unit || parsed.unit || 'pcs',
    rate,
    amount: Number(item.amount || quantity * rate || 0),
  };
}

function sumItems(items) {
  return items.reduce((total, item) => total + Number(item.amount || 0), 0);
}

async function getLeastLoadedSalesUser() {
  if (hasDatabase) {
    const result = await query(
      `SELECT u.id
       FROM users u
       LEFT JOIN contacts c ON c.assigned_to = u.id
       WHERE u.role = 'sales' AND u.active = true
       GROUP BY u.id
       ORDER BY COUNT(c.id), u.created_at
       LIMIT 1`,
    );
    return result.rows[0]?.id || null;
  }
  return memory.users.find((user) => user.role === 'sales' && user.active)?.id || null;
}

async function ensureDefaultUsers() {
  if (!hasDatabase) return;

  if (isProduction) {
    console.log('Production mode: default demo users are not created automatically');
    return;
  }

  const defaults = [
    { name: 'Admin User', email: 'admin@bos.com', password: 'admin123', role: 'admin' },
    { name: 'Manager User', email: 'manager@bos.com', password: 'manager123', role: 'manager' },
    { name: 'Sales Person', email: 'sales@bos.com', password: 'sales123', role: 'sales' },
  ];

  for (const user of defaults) {
    const passwordHash = await bcrypt.hash(user.password, 10);
    await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      [user.name, user.email, passwordHash, user.role],
    );
  }
}

async function ensureSchema() {
  if (!hasDatabase) return;
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await query(schema);
}

async function upsertContact({ waId, name, phone, label, touchInbound = true }) {
  const assignedTo = await getLeastLoadedSalesUser();
  if (hasDatabase) {
    const result = await query(
      `INSERT INTO contacts (wa_id, name, phone, label, assigned_to, last_inbound_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $6 THEN now() ELSE NULL END, now())
       ON CONFLICT (wa_id)
       DO UPDATE SET
         name = COALESCE(EXCLUDED.name, contacts.name),
         phone = EXCLUDED.phone,
         label = EXCLUDED.label,
         assigned_to = COALESCE(contacts.assigned_to, EXCLUDED.assigned_to),
         last_inbound_at = CASE WHEN $6 THEN now() ELSE contacts.last_inbound_at END,
         updated_at = now()
       RETURNING *`,
      [waId, name || null, phone, label || 'New Enquiry', assignedTo, touchInbound],
    );
    return result.rows[0];
  }

  let contact = memory.contacts.find((item) => item.wa_id === waId);
  if (!contact) {
    contact = {
      id: makeId('contact'),
      wa_id: waId,
      name: name || phone,
      phone,
      stage: 'new',
      company: '',
      notes: '',
      label: label || 'New Enquiry',
      assigned_to: assignedTo,
      last_inbound_at: touchInbound ? now() : null,
      updated_at: now(),
    };
    memory.contacts.unshift(contact);
  } else {
    contact.name = name || contact.name;
    contact.phone = phone;
    contact.label = label || contact.label;
    if (touchInbound) contact.last_inbound_at = now();
    contact.updated_at = now();
  }
  return contact;
}

async function addMessage({ contactId, waMessageId, direction, type = 'text', body, status = 'received', rawPayload, templateName }) {
  if (hasDatabase) {
    const result = await query(
      `INSERT INTO messages (contact_id, wa_message_id, direction, type, body, status, raw_payload, template_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (wa_message_id) DO NOTHING
       RETURNING *`,
      [contactId, waMessageId || null, direction, type, body || '', status, rawPayload || null, templateName || null],
    );
    return result.rows[0] || null;
  }

  if (waMessageId && memory.messages.some((item) => item.wa_message_id === waMessageId)) return null;
  const message = {
    id: makeId('message'),
    contact_id: contactId,
    wa_message_id: waMessageId,
    direction,
    type,
    body: body || '',
    status,
    raw_payload: rawPayload || null,
    template_name: templateName || null,
    created_at: now(),
  };
  memory.messages.push(message);
  return message;
}

async function createEnquiryDraft({ contactId, messageId, text }) {
  const enquiry = extractEnquiry(text);
  const hasEnquirySignal = enquiry.grade || enquiry.size || enquiry.shape || enquiry.quantity || /(quote|quotation|rate|price|qty|quantity|size|grade)/i.test(text || '');
  if (!hasEnquirySignal) return null;

  if (hasDatabase) {
    const result = await query(
      `INSERT INTO enquiry_drafts (contact_id, message_id, grade, size, shape, quantity, source)
       VALUES ($1, $2, $3, $4, $5, $6, 'WhatsApp Auto')
       RETURNING *`,
      [contactId, messageId || null, enquiry.grade, enquiry.size, enquiry.shape, enquiry.quantity],
    );
    return result.rows[0];
  }

  const draft = { id: makeId('draft'), contact_id: contactId, message_id: messageId, ...enquiry, status: 'draft', source: 'WhatsApp Auto', created_at: now() };
  memory.enquiryDrafts.unshift(draft);
  return draft;
}

async function processInboundMessage({ waId, name, body, waMessageId, rawPayload }) {
  const label = categorizeMessage(body);
  const contact = await upsertContact({ waId, name, phone: waId, label });
  const saved = await addMessage({
    contactId: contact.id,
    waMessageId,
    direction: 'inbound',
    type: 'text',
    body,
    status: 'received',
    rawPayload,
  });
  const enquiryDraft = await createEnquiryDraft({ contactId: contact.id, messageId: saved?.id, text: body });
  return { contact, message: saved, enquiryDraft };
}

function extractText(message) {
  if (message.type === 'text') return message.text?.body || '';
  if (message.type === 'button') return message.button?.text || '';
  if (message.type === 'interactive') return message.interactive?.button_reply?.title || message.interactive?.list_reply?.title || '';
  return `[${message.type || 'message'}]`;
}

async function findContact(contactId) {
  if (hasDatabase) {
    const result = await query('SELECT * FROM contacts WHERE id = $1', [contactId]);
    return result.rows[0] || null;
  }
  return memory.contacts.find((item) => item.id === contactId) || null;
}
function canAccessContact(user, contact) {
  if (!user || !contact) return false;
  if (canMonitor(user)) return true;
  return contact.assigned_to === user.id;
}

async function sendWhatsAppText(contact, text) {
  if (!isWhatsAppConfigured()) {
    if (shouldAllowLocalMessageQueue()) return null;
    throw new Error('WhatsApp is not configured. Message was not sent.');
  }

  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v20.0';
  const url = `https://graph.facebook.com/${apiVersion}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const response = await axios.post(
    url,
    { messaging_product: 'whatsapp', to: contact.wa_id, type: 'text', text: { body: text } },
    { headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' } },
  );
  return response.data?.messages?.[0]?.id || null;
}

async function sendWhatsAppTemplate(contact, templateName, language = 'en') {
  if (!isWhatsAppConfigured()) {
    if (shouldAllowLocalMessageQueue()) return null;
    throw new Error('WhatsApp is not configured. Template message was not sent.');
  }

  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v20.0';
  const url = `https://graph.facebook.com/${apiVersion}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const response = await axios.post(
    url,
    {
      messaging_product: 'whatsapp',
      to: contact.wa_id,
      type: 'template',
      template: { name: templateName, language: { code: language } },
    },
    { headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' } },
  );
  return response.data?.messages?.[0]?.id || null;
}

app.get('/health', (req, res) => {
  res.json({ ok: true, database: hasDatabase ? 'postgres' : 'memory', whatsappConfigured: isWhatsAppConfigured() });
});

app.get('/api/test-db', asyncHandler(async (req, res) => {
  if (!hasDatabase) return res.json({ ok: true, mode: 'memory', message: 'DATABASE_URL blank hai, backend demo memory mode me chal raha hai.' });
  try {
    const result = await query('SELECT now() AS server_time');
    return res.json({ ok: true, mode: 'postgres', message: 'PostgreSQL connection working hai.', serverTime: result.rows[0].server_time });
  } catch (error) {
    return res.status(500).json({ ok: false, mode: 'postgres', message: 'PostgreSQL connect nahi ho raha.', error: error.message });
  }
}));

app.post('/api/auth/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  if (hasDatabase) {
    const result = await query('SELECT * FROM users WHERE email = $1 AND active = true', [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) return res.status(401).json({ error: 'Invalid login' });
    return res.json({ token: signUser(user), user: publicUser(user) });
  }

  const user = memory.users.find((item) => item.email === email && item.password === password && item.active);
  if (!user) return res.status(401).json({ error: 'Invalid login' });
  res.json({ token: signUser(user), user: publicUser(user) });
}));

app.get('/api/me', requireAuth, (req, res) => res.json(req.user));

app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

app.post('/webhook', asyncHandler(async (req, res) => {
  if (!verifyMetaWebhookSignature(req)) {
    return res.status(403).json({ error: 'Invalid webhook signature' });
  }

  const entries = req.body?.entry || [];
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const contacts = value.contacts || [];
      const messages = value.messages || [];
      for (const message of messages) {
        const body = extractText(message);
        const profile = contacts.find((item) => item.wa_id === message.from);
        await processInboundMessage({
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
  if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });
  const cleanPhone = String(req.body.phone || '').replace(/\D/g, '');
  const body = String(req.body.message || '').trim();
  if (cleanPhone.length < 11 || !body) {
    return res.status(400).json({ error: 'Phone country code ke saath aur message required hai.' });
  }

  const result = await processInboundMessage({
    waId: cleanPhone,
    name: req.body.name || cleanPhone,
    body,
    waMessageId: `local.${Date.now()}.${Math.random().toString(16).slice(2)}`,
    rawPayload: { localSimulator: true, createdBy: req.user.id },
  });
  res.status(201).json(result);
}));

app.get('/api/settings/status', requireAuth, (req, res) => {
  res.json({
    database: hasDatabase ? 'Connected through DATABASE_URL' : 'Using in-memory demo store',
    webhookVerifyTokenSet: hasRealValue(process.env.WHATSAPP_VERIFY_TOKEN),
    webhookAppSecretSet: hasRealValue(process.env.WHATSAPP_APP_SECRET),
    whatsappTokenSet: hasRealValue(process.env.WHATSAPP_ACCESS_TOKEN),
    phoneNumberIdSet: hasRealValue(process.env.WHATSAPP_PHONE_NUMBER_ID),
    webhookUrl: '/webhook',
    labels: LABELS,
  });
});

app.get('/api/whatsapp/config', requireAuth, (req, res) => {
  if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });
  res.json({
    configured: isWhatsAppConfigured(),
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v20.0',
    phoneNumberIdSet: hasRealValue(process.env.WHATSAPP_PHONE_NUMBER_ID),
    phoneNumberIdMasked: maskValue(process.env.WHATSAPP_PHONE_NUMBER_ID || ''),
    accessTokenSet: hasRealValue(process.env.WHATSAPP_ACCESS_TOKEN),
    accessTokenMasked: maskValue(process.env.WHATSAPP_ACCESS_TOKEN || ''),
    verifyTokenSet: hasRealValue(process.env.WHATSAPP_VERIFY_TOKEN),
    appSecretSet: hasRealValue(process.env.WHATSAPP_APP_SECRET),
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || '',
    webhookPath: '/webhook',
    callbackUrl: process.env.PUBLIC_BASE_URL ? `${process.env.PUBLIC_BASE_URL.replace(/\/$/, '')}/webhook` : 'Set PUBLIC_BASE_URL to show full webhook URL',
  });
});

app.post('/api/whatsapp/test-message', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });
  const { to, text } = req.body;
  const cleanTo = String(to || '').replace(/\D/g, '');
  if (!to || !text?.trim()) return res.status(400).json({ error: 'To number and text are required' });
  if (cleanTo.length < 11) {
    return res.status(400).json({
      error: 'Number country code ke saath hona chahiye. India ke liye format: 91XXXXXXXXXX',
    });
  }
  if (!isWhatsAppConfigured()) {
    return res.status(400).json({
      error: 'Real WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID .env me set karo, phir backend restart karo.',
    });
  }

  const apiVersion = process.env.WHATSAPP_API_VERSION || 'v20.0';
  const url = `https://graph.facebook.com/${apiVersion}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const response = await axios.post(
    url,
    { messaging_product: 'whatsapp', to: cleanTo, type: 'text', text: { body: text.trim() } },
    { headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' } },
  );
  const messageId = response.data?.messages?.[0]?.id || null;
  const contact = await upsertContact({
    waId: cleanTo,
    name: cleanTo,
    phone: cleanTo,
    label: 'Review Required',
    touchInbound: false,
  });
  const message = await addMessage({
    contactId: contact.id,
    waMessageId: messageId,
    direction: 'outbound',
    type: 'text',
    body: text.trim(),
    status: messageId ? 'sent' : 'accepted',
    rawPayload: response.data,
  });
  res.json({
    ok: true,
    to: cleanTo,
    contactId: contact.id,
    savedMessageId: message?.id || null,
    messageId,
    metaResponse: response.data,
  });
}));

app.get('/api/users', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });
  if (hasDatabase) {
    const result = await query('SELECT id, name, email, role, active FROM users ORDER BY role, name');
    return res.json(result.rows);
  }
  res.json(memory.users.map(publicUser));
}));

app.post('/api/users', requireAuth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || !['admin', 'manager', 'sales'].includes(role)) {
    return res.status(400).json({ error: 'Name, email, password, and valid role required' });
  }
  if (hasDatabase) {
    const passwordHash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, active`,
      [name, email, passwordHash, role],
    );
    return res.status(201).json(result.rows[0]);
  }
  const user = { id: makeId('user'), name, email, password, role, active: true };
  memory.users.push(user);
  res.status(201).json(publicUser(user));
}));

app.patch('/api/users/:id', requireAuth, asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  const { name, role, active, password } = req.body;
  if (role !== undefined && !['admin', 'manager', 'sales'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (hasDatabase) {
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    const result = await query(
      `UPDATE users
       SET name = COALESCE($2, name),
           role = COALESCE($3, role),
           active = COALESCE($4, active),
           password_hash = COALESCE($5, password_hash)
       WHERE id = $1
       RETURNING id, name, email, role, active`,
      [req.params.id, name, role, active, passwordHash],
    );
    return res.json(result.rows[0]);
  }
  const user = memory.users.find((item) => item.id === req.params.id);
  Object.assign(user, { name: name ?? user.name, role: role ?? user.role, active: active ?? user.active, password: password || user.password });
  res.json(publicUser(user));
}));

app.get('/api/dashboard', requireAuth, asyncHandler(async (req, res) => {
  if (hasDatabase) {
    const scopeWhere = canMonitor(req.user) ? '' : 'WHERE c.assigned_to = $1';
    const params = canMonitor(req.user) ? [] : [req.user.id];
    const summary = await query(
      `SELECT
        COUNT(*)::int AS total_conversations,
        COUNT(*) FILTER (WHERE c.assigned_to IS NULL)::int AS unassigned,
        COUNT(*) FILTER (WHERE c.last_inbound_at >= now() - interval '24 hours')::int AS open_windows,
        COUNT(*) FILTER (WHERE c.last_inbound_at < now() - interval '24 hours')::int AS expired_windows
       FROM contacts c ${scopeWhere}`,
      params,
    );
    const labels = await query(
      `SELECT c.label, COUNT(*)::int AS count FROM contacts c ${scopeWhere} GROUP BY c.label ORDER BY count DESC`,
      params,
    );
    return res.json({ ...summary.rows[0], labels: labels.rows });
  }

  const contacts = canMonitor(req.user) ? memory.contacts : memory.contacts.filter((item) => item.assigned_to === req.user.id);
  res.json({
    total_conversations: contacts.length,
    unassigned: contacts.filter((item) => !item.assigned_to).length,
    open_windows: contacts.filter(isReplyWindowOpen).length,
    expired_windows: contacts.filter((item) => !isReplyWindowOpen(item)).length,
    labels: LABELS.map((label) => ({ label, count: contacts.filter((item) => item.label === label).length })),
  });
}));

app.get('/api/conversations', requireAuth, asyncHandler(async (req, res) => {
  const { label, assigned, q, window } = req.query;
  if (hasDatabase) {
    const params = [];
    const where = [];
    if (!canMonitor(req.user)) {
      params.push(req.user.id);
      where.push(`c.assigned_to = $${params.length}`);
    }
    if (label && label !== 'all') {
      params.push(label);
      where.push(`c.label = $${params.length}`);
    }
    if (assigned === 'unassigned') where.push('c.assigned_to IS NULL');
    if (q) {
      params.push(`%${q}%`);
      where.push(`(c.name ILIKE $${params.length} OR c.phone ILIKE $${params.length} OR c.company ILIKE $${params.length})`);
    }
    if (window === 'open') where.push(`c.last_inbound_at >= now() - interval '24 hours'`);
    if (window === 'expired') where.push(`(c.last_inbound_at IS NULL OR c.last_inbound_at < now() - interval '24 hours')`);
    const result = await query(
      `SELECT c.*, u.name AS assigned_name,
        m.body AS last_message,
        m.created_at AS last_message_at,
        CASE WHEN c.last_inbound_at >= now() - interval '24 hours' THEN true ELSE false END AS reply_window_open,
        COALESCE(unread.count, 0) AS unread_count
       FROM contacts c
       LEFT JOIN users u ON u.id = c.assigned_to
       LEFT JOIN LATERAL (
         SELECT body, created_at FROM messages WHERE contact_id = c.id ORDER BY created_at DESC LIMIT 1
       ) m ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS count FROM messages WHERE contact_id = c.id AND direction = 'inbound' AND status = 'received'
       ) unread ON true
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY COALESCE(m.created_at, c.updated_at) DESC`,
      params,
    );
    return res.json(result.rows);
  }

  const usersById = Object.fromEntries(memory.users.map((user) => [user.id, user]));
  let rows = memory.contacts;
  if (!canMonitor(req.user)) rows = rows.filter((item) => item.assigned_to === req.user.id);
  if (label && label !== 'all') rows = rows.filter((item) => item.label === label);
  if (assigned === 'unassigned') rows = rows.filter((item) => !item.assigned_to);
  if (q) rows = rows.filter((item) => `${item.name || ''} ${item.phone || ''} ${item.company || ''}`.toLowerCase().includes(q.toLowerCase()));
  if (window === 'open') rows = rows.filter(isReplyWindowOpen);
  if (window === 'expired') rows = rows.filter((item) => !isReplyWindowOpen(item));
  res.json(rows.map((contact) => {
    const messages = memory.messages.filter((message) => message.contact_id === contact.id);
    const last = messages[messages.length - 1];
    return { ...contact, assigned_name: usersById[contact.assigned_to]?.name || '', last_message: last?.body || '', last_message_at: last?.created_at || contact.updated_at, reply_window_open: isReplyWindowOpen(contact), unread_count: messages.filter((message) => message.direction === 'inbound' && message.status === 'received').length };
  }));
}));

app.get('/api/contacts/:id/assignment-history', requireAuth, asyncHandler(async (req, res) => {
  if (!canMonitor(req.user)) return res.status(403).json({ error: 'Manager/Admin only' });
  if (hasDatabase) {
    const result = await query(
      `SELECT ah.*, from_user.name AS from_user_name, to_user.name AS to_user_name, changed_user.name AS changed_by_name
       FROM assignment_history ah
       LEFT JOIN users from_user ON from_user.id = ah.from_user_id
       LEFT JOIN users to_user ON to_user.id = ah.to_user_id
       LEFT JOIN users changed_user ON changed_user.id = ah.changed_by
       WHERE ah.contact_id = $1
       ORDER BY ah.created_at DESC`,
      [req.params.id],
    );
    return res.json(result.rows);
  }
  const usersById = Object.fromEntries(memory.users.map((user) => [user.id, user]));
  res.json(memory.assignmentHistory.filter((item) => item.contact_id === req.params.id).map((item) => ({
    ...item,
    from_user_name: usersById[item.from_user_id]?.name || '',
    to_user_name: usersById[item.to_user_id]?.name || '',
    changed_by_name: usersById[item.changed_by]?.name || '',
  })));
}));

app.get('/api/conversations/:id/messages', requireAuth, asyncHandler(async (req, res) => {
  const contact = await findContact(req.params.id);

  if (!contact) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  if (!canAccessContact(req.user, contact)) {
    return res.status(403).json({ error: 'Conversation assigned to another user' });
  }

  if (hasDatabase) {
    const result = await query('SELECT * FROM messages WHERE contact_id = $1 ORDER BY created_at ASC', [req.params.id]);
    return res.json(result.rows);
  }

  res.json(memory.messages.filter((message) => message.contact_id === req.params.id));
}));

app.post('/api/conversations/:id/read', requireAuth, asyncHandler(async (req, res) => {
  const contact = await findContact(req.params.id);

  if (!contact) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  if (!canAccessContact(req.user, contact)) {
    return res.status(403).json({ error: 'Conversation assigned to another user' });
  }

  if (hasDatabase) {
    const result = await query(
      `UPDATE messages
       SET status = 'read'
       WHERE contact_id = $1
         AND direction = 'inbound'
         AND status = 'received'
       RETURNING id`,
      [req.params.id],
    );

    return res.json({ ok: true, updated: result.rowCount });
  }

  let updated = 0;

  memory.messages.forEach((message) => {
    if (
      message.contact_id === req.params.id &&
      message.direction === 'inbound' &&
      message.status === 'received'
    ) {
      message.status = 'read';
      updated += 1;
    }
  });

  res.json({ ok: true, updated });
}));

app.patch('/api/contacts/:id', requireAuth, asyncHandler(async (req, res) => {
  const { name, company, stage, owner, notes, label, assigned_to, assignment_reason } = req.body;

  const contact = await findContact(req.params.id);

  if (!contact) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  if (!canAccessContact(req.user, contact)) {
    return res.status(403).json({ error: 'Conversation assigned to another user' });
  }

  if (assigned_to !== undefined && !canMonitor(req.user)) {
    return res.status(403).json({ error: 'Only manager/admin can assign' });
  }

  const shouldUpdateAssignment = assigned_to !== undefined;
  const assignedToValue = assigned_to === '' ? null : assigned_to;

  if (hasDatabase) {
    const before = await query('SELECT assigned_to FROM contacts WHERE id = $1', [req.params.id]);
    const result = await query(
      `UPDATE contacts
       SET name = COALESCE($2, name), company = COALESCE($3, company), stage = COALESCE($4, stage),
           owner = COALESCE($5, owner), notes = COALESCE($6, notes), label = COALESCE($7, label),
           assigned_to = CASE WHEN $8 THEN $9::uuid ELSE assigned_to END,
           updated_at = now()
       WHERE id = $1 RETURNING *`,
      [req.params.id, name, company, stage, owner, notes, label, shouldUpdateAssignment, assignedToValue],
    );
    await recordAssignmentHistory({
      contactId: req.params.id,
      fromUserId: before.rows[0]?.assigned_to,
      toUserId: result.rows[0]?.assigned_to,
      changedBy: req.user.id,
      reason: assignment_reason,
    });
    return res.json(result.rows[0]);
  }
  const memoryContact = memory.contacts.find((item) => item.id === req.params.id);
  const fromUserId = memoryContact.assigned_to;

  Object.assign(memoryContact, {
    name: name ?? memoryContact.name,
    company: company ?? memoryContact.company,
    stage: stage ?? memoryContact.stage,
    owner: owner ?? memoryContact.owner,
    notes: notes ?? memoryContact.notes,
    label: label ?? memoryContact.label,
    updated_at: now(),
  });

  if (shouldUpdateAssignment) memoryContact.assigned_to = assignedToValue;

  await recordAssignmentHistory({
    contactId: memoryContact.id,
    fromUserId,
    toUserId: memoryContact.assigned_to,
    changedBy: req.user.id,
    reason: assignment_reason,
  });

  res.json(memoryContact);
}));

app.post('/api/conversations/:id/messages', requireAuth, asyncHandler(async (req, res) => {
  const { text, templateName, language } = req.body;
  const contact = await findContact(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  if (!canAccessContact(req.user, contact)) {
    return res.status(403).json({ error: 'Conversation assigned to another user' });
  }

  const replyWindowOpen = isReplyWindowOpen(contact);
  if (!replyWindowOpen && !templateName) {
    return res.status(400).json({ error: '24-hour reply window expired. Template message use karo.' });
  }

  let waMessageId = null;
  let body = text;
  let type = 'text';

  try {
    if (templateName) {
      waMessageId = await sendWhatsAppTemplate(contact, templateName, language || 'en');
      body = `[Template] ${templateName}`;
      type = 'template';
    } else {
      if (!text?.trim()) return res.status(400).json({ error: 'Message text is required' });
      waMessageId = await sendWhatsAppText(contact, text.trim());
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
    contactId: contact.id,
    waMessageId,
    direction: 'outbound',
    type,
    body,
    status,
    templateName,
  });

  res.status(201).json(message);
}));

app.get('/api/templates', requireAuth, asyncHandler(async (req, res) => {
  if (hasDatabase) {
    const result = await query('SELECT * FROM whatsapp_templates WHERE active = true ORDER BY name');
    return res.json(result.rows);
  }
  res.json(memory.templates);
}));

app.get('/api/enquiry-drafts', requireAuth, asyncHandler(async (req, res) => {
  if (hasDatabase) {
    const scope = canMonitor(req.user) ? '' : 'WHERE c.assigned_to = $1';
    const params = canMonitor(req.user) ? [] : [req.user.id];
    const result = await query(
      `SELECT e.*, c.name AS contact_name, c.phone
       FROM enquiry_drafts e
       LEFT JOIN contacts c ON c.id = e.contact_id
       ${scope}
       ORDER BY e.created_at DESC`,
      params,
    );
    return res.json(result.rows);
  }
  res.json(memory.enquiryDrafts);
}));

app.post('/api/enquiry-drafts/:id/create-erp', requireAuth, asyncHandler(async (req, res) => {
  if (hasDatabase) {
    const result = await query(
      `UPDATE enquiry_drafts
       SET status = 'erp_created', erp_enquiry_no = COALESCE(erp_enquiry_no, $2), reviewed_by = $3
       WHERE id = $1
       RETURNING *`,
      [req.params.id, `ERP-WA-${Date.now()}`, req.user.id],
    );
    return res.json(result.rows[0]);
  }
  const draft = memory.enquiryDrafts.find((item) => item.id === req.params.id);
  Object.assign(draft, { status: 'erp_created', erp_enquiry_no: `ERP-WA-${Date.now()}`, reviewed_by: req.user.id });
  res.json(draft);
}));

async function getEnquiryDraftById(id) {
  if (hasDatabase) {
    const result = await query(
      `SELECT e.*, c.name AS contact_name, c.phone
       FROM enquiry_drafts e
       LEFT JOIN contacts c ON c.id = e.contact_id
       WHERE e.id = $1`,
      [id],
    );
    return result.rows[0] || null;
  }
  return memory.enquiryDrafts.find((item) => item.id === id) || null;
}

async function createQuotation({ contactId, notes, items, source = 'WhatsApp Auto', validUntil }) {
  const normalizedItems = items.map(normalizeSalesItem);
  const amount = sumItems(normalizedItems);
  const quoteNo = `Q-${Date.now()}`;
  if (hasDatabase) {
    const quote = await query(
      'INSERT INTO quotations (contact_id, quote_no, amount, notes, source, valid_until) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [contactId || null, quoteNo, amount, notes || null, source, validUntil || null],
    );
    for (const item of normalizedItems) {
      await query(
        `INSERT INTO quotation_items (quotation_id, product_id, description, grade, size, shape, quantity, unit, rate, amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [quote.rows[0].id, item.product_id, item.description, item.grade, item.size, item.shape, item.quantity, item.unit, item.rate, item.amount],
      );
    }
    return quote.rows[0];
  }
  const quote = { id: makeId('quote'), contact_id: contactId, quote_no: quoteNo, status: 'draft', amount, notes, source, valid_until: validUntil, created_at: now() };
  memory.quotations.unshift(quote);
  normalizedItems.forEach((item) => memory.quotationItems.push({ id: makeId('quoteItem'), quotation_id: quote.id, ...item }));
  return quote;
}

async function createSalesOrder({ contactId, notes, items, source = 'WhatsApp', paymentStatus = 'pending', dispatchStatus = 'pending' }) {
  const normalizedItems = items.map(normalizeSalesItem);
  const amount = sumItems(normalizedItems);
  const orderNo = `SO-${Date.now()}`;
  if (hasDatabase) {
    const order = await query(
      `INSERT INTO sales_orders (contact_id, order_no, amount, notes, source, payment_status, dispatch_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [contactId || null, orderNo, amount, notes || null, source, paymentStatus, dispatchStatus],
    );
    for (const item of normalizedItems) {
      await query(
        `INSERT INTO sales_order_items (order_id, product_id, description, grade, size, shape, quantity, unit, rate, amount)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [order.rows[0].id, item.product_id, item.description, item.grade, item.size, item.shape, item.quantity, item.unit, item.rate, item.amount],
      );
    }
    return order.rows[0];
  }
  const order = { id: makeId('order'), contact_id: contactId, order_no: orderNo, status: 'pending', amount, notes, source, payment_status: paymentStatus, dispatch_status: dispatchStatus, created_at: now() };
  memory.orders.unshift(order);
  normalizedItems.forEach((item) => memory.orderItems.push({ id: makeId('orderItem'), order_id: order.id, ...item }));
  return order;
}

app.post('/api/enquiry-drafts/:id/create-quote', requireAuth, asyncHandler(async (req, res) => {
  const draft = await getEnquiryDraftById(req.params.id);
  if (!draft) return res.status(404).json({ error: 'Enquiry draft not found' });
  const rate = Number(req.body.rate || 0);
  const item = normalizeSalesItem({
    description: [draft.shape, draft.grade, draft.size].filter(Boolean).join(' ') || 'WhatsApp enquiry item',
    grade: draft.grade,
    size: draft.size,
    shape: draft.shape,
    quantity: draft.quantity,
    rate,
  });
  const quote = await createQuotation({
    contactId: draft.contact_id,
    notes: req.body.notes || `Created from WhatsApp enquiry ${draft.id}`,
    items: [item],
    source: 'WhatsApp Auto',
    validUntil: req.body.valid_until,
  });
  if (hasDatabase) {
    await query('UPDATE enquiry_drafts SET status = $2, reviewed_by = $3 WHERE id = $1', [draft.id, 'quoted', req.user.id]);
  } else {
    draft.status = 'quoted';
    draft.reviewed_by = req.user.id;
  }
  res.status(201).json(quote);
}));

app.get('/api/products', requireAuth, asyncHandler(async (req, res) => {
  if (hasDatabase) {
    const result = await query('SELECT * FROM products ORDER BY created_at DESC');
    return res.json(result.rows);
  }
  res.json(memory.products);
}));

app.post('/api/products', requireAuth, asyncHandler(async (req, res) => {
  const { sku, name, price, stock_qty } = req.body;
  if (hasDatabase) {
    const result = await query('INSERT INTO products (sku, name, price, stock_qty) VALUES ($1, $2, $3, $4) RETURNING *', [sku, name, Number(price || 0), Number(stock_qty || 0)]);
    return res.status(201).json(result.rows[0]);
  }
  const product = { id: makeId('prod'), sku, name, price: Number(price || 0), stock_qty: Number(stock_qty || 0) };
  memory.products.unshift(product);
  res.status(201).json(product);
}));

app.get('/api/quotations', requireAuth, asyncHandler(async (req, res) => {
  if (hasDatabase) {
    const result = await query(
      `SELECT q.*, c.name AS contact_name, c.phone,
        COALESCE(
          json_agg(qi ORDER BY qi.created_at) FILTER (WHERE qi.id IS NOT NULL),
          '[]'
        ) AS items
       FROM quotations q
       LEFT JOIN contacts c ON c.id = q.contact_id
       LEFT JOIN quotation_items qi ON qi.quotation_id = q.id
       GROUP BY q.id, c.name, c.phone
       ORDER BY q.created_at DESC`,
    );
    return res.json(result.rows);
  }
  res.json(memory.quotations.map((quote) => ({
    ...quote,
    items: memory.quotationItems.filter((item) => item.quotation_id === quote.id),
  })));
}));

app.post('/api/quotations', requireAuth, asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body.items) && req.body.items.length
    ? req.body.items
    : [{ description: req.body.notes || 'Manual quotation item', quantity: 1, rate: Number(req.body.amount || 0) }];
  const quote = await createQuotation({
    contactId: req.body.contact_id,
    notes: req.body.notes,
    items,
    source: req.body.source || 'WhatsApp',
    validUntil: req.body.valid_until,
  });
  res.status(201).json(quote);
}));

app.patch('/api/quotations/:id', requireAuth, asyncHandler(async (req, res) => {
  const { status, valid_until, notes } = req.body;
  if (hasDatabase) {
    const result = await query(
      `UPDATE quotations
       SET status = COALESCE($2, status),
           valid_until = COALESCE($3, valid_until),
           notes = COALESCE($4, notes)
       WHERE id = $1
       RETURNING *`,
      [req.params.id, status, valid_until, notes],
    );
    return res.json(result.rows[0]);
  }
  const quote = memory.quotations.find((item) => item.id === req.params.id);
  Object.assign(quote, { status: status || quote.status, valid_until: valid_until || quote.valid_until, notes: notes || quote.notes });
  res.json(quote);
}));

app.post('/api/quotations/:id/convert-order', requireAuth, asyncHandler(async (req, res) => {
  let quote;
  let items;
  if (hasDatabase) {
    const quoteResult = await query('SELECT * FROM quotations WHERE id = $1', [req.params.id]);
    quote = quoteResult.rows[0];
    if (!quote) return res.status(404).json({ error: 'Quotation not found' });
    const itemResult = await query('SELECT * FROM quotation_items WHERE quotation_id = $1 ORDER BY created_at', [quote.id]);
    items = itemResult.rows;
  } else {
    quote = memory.quotations.find((item) => item.id === req.params.id);
    if (!quote) return res.status(404).json({ error: 'Quotation not found' });
    items = memory.quotationItems.filter((item) => item.quotation_id === quote.id);
  }
  const order = await createSalesOrder({
    contactId: quote.contact_id,
    notes: req.body.notes || `Converted from quotation ${quote.quote_no}`,
    items,
    source: 'WhatsApp Quote',
    paymentStatus: req.body.payment_status || 'pending',
    dispatchStatus: req.body.dispatch_status || 'pending',
  });
  if (hasDatabase) await query("UPDATE quotations SET status = 'converted' WHERE id = $1", [quote.id]);
  else quote.status = 'converted';
  res.status(201).json(order);
}));

app.get('/api/orders', requireAuth, asyncHandler(async (req, res) => {
  if (hasDatabase) {
    const result = await query(
      `SELECT o.*, c.name AS contact_name, c.phone,
        COALESCE(
          json_agg(soi ORDER BY soi.created_at) FILTER (WHERE soi.id IS NOT NULL),
          '[]'
        ) AS items
       FROM sales_orders o
       LEFT JOIN contacts c ON c.id = o.contact_id
       LEFT JOIN sales_order_items soi ON soi.order_id = o.id
       GROUP BY o.id, c.name, c.phone
       ORDER BY o.created_at DESC`,
    );
    return res.json(result.rows);
  }
  res.json(memory.orders.map((order) => ({
    ...order,
    items: memory.orderItems.filter((item) => item.order_id === order.id),
  })));
}));

app.post('/api/orders', requireAuth, asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body.items) && req.body.items.length
    ? req.body.items
    : [{ description: req.body.notes || 'Manual order item', quantity: 1, rate: Number(req.body.amount || 0) }];
  const order = await createSalesOrder({
    contactId: req.body.contact_id,
    notes: req.body.notes,
    items,
    source: req.body.source || 'WhatsApp',
    paymentStatus: req.body.payment_status || 'pending',
    dispatchStatus: req.body.dispatch_status || 'pending',
  });
  res.status(201).json(order);
}));

app.patch('/api/orders/:id', requireAuth, asyncHandler(async (req, res) => {
  const { status, payment_status, dispatch_status, notes } = req.body;
  if (hasDatabase) {
    const result = await query(
      `UPDATE sales_orders
       SET status = COALESCE($2, status),
           payment_status = COALESCE($3, payment_status),
           dispatch_status = COALESCE($4, dispatch_status),
           notes = COALESCE($5, notes)
       WHERE id = $1
       RETURNING *`,
      [req.params.id, status, payment_status, dispatch_status, notes],
    );
    return res.json(result.rows[0]);
  }
  const order = memory.orders.find((item) => item.id === req.params.id);
  Object.assign(order, {
    status: status || order.status,
    payment_status: payment_status || order.payment_status,
    dispatch_status: dispatch_status || order.dispatch_status,
    notes: notes || order.notes,
  });
  res.json(order);
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

ensureSchema().then(() => ensureDefaultUsers()).then(() => {
  app.listen(port, () => {
    console.log(`BOS WhatsApp backend running on http://localhost:${port}`);
  });
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
