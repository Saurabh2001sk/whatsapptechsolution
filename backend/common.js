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
  return Boolean(value && !value.startsWith('your-') && !value.startsWith('change-'));
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

module.exports = {
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
};