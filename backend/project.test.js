// Merged backend tests.

{
// auth.service.test.js
const assert = require('node:assert/strict');
const test = require('node:test');
const jwt = require('jsonwebtoken');

const { createAuthService } = require('./services');

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    cookies: {},
    clearedCookies: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    cookie(name, value, options) {
      this.cookies[name] = { value, options };
      return this;
    },
    clearCookie(name, options) {
      this.clearedCookies[name] = { options };
      return this;
    },
  };
}

async function runRequireAuth({ service, token }) {
  const req = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
  const res = createResponse();
  let nextCalled = false;

  await service.requireAuth(req, res, () => {
    nextCalled = true;
  });

  return { req, res, nextCalled };
}

test('requireAuth loads the session user with the token tenant id', async () => {
  const jwtSecret = 'test-secret-with-more-than-32-characters';
  const queryCalls = [];

  const service = createAuthService({
    jwt,
    jwtSecret,
    isProduction: true,
    getCookie: () => '',
    async query(sql, params) {
      queryCalls.push({ sql, params });
      return {
        rows: [{
          id: params[0],
          tenant_id: params[1],
          name: 'Admin User',
          email: 'admin@example.com',
          role: 'admin',
          active: true,
          tenant_status: 'active',
        }],
      };
    },
  });

  const token = jwt.sign({ id: 'user-1', tenantId: 'tenant-1' }, jwtSecret);
  const { req, res, nextCalled } = await runRequireAuth({ service, token });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(queryCalls[0].params, ['user-1', 'tenant-1']);
assert.deepEqual(req.user, {
  id: 'user-1',
  tenantId: 'tenant-1',
  name: 'Admin User',
  email: 'admin@example.com',
  role: 'admin',
  supportMode: false,
  supportActorUserId: null,
  supportActorTenantId: null,
  supportExpiresAt: null,
});
assert.deepEqual(req.tenant, {
  id: 'tenant-1',
  status: 'active',
  subscriptionStatus: 'trial',
  trialEndsAt: null,
  subscriptionEndsAt: null,
  suspendedReason: '',
});
});

test('requireAuth rejects tokens that do not resolve to an active tenant user', async () => {
  const jwtSecret = 'test-secret-with-more-than-32-characters';

  const service = createAuthService({
    jwt,
    jwtSecret,
    isProduction: true,
    getCookie: () => '',
    async query() {
      return { rows: [] };
    },
  });

  const token = jwt.sign({ id: 'user-1', tenantId: 'tenant-1' }, jwtSecret);
  const { res, nextCalled } = await runRequireAuth({ service, token });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'User or company is inactive');
});

test('publicUser exposes only safe user session fields', () => {
  const service = createAuthService({
    jwt,
    jwtSecret: 'test-secret-with-more-than-32-characters',
    isProduction: true,
    getCookie: () => '',
    query: async () => ({ rows: [] }),
  });

  const publicUser = service.publicUser({
    id: 'user-1',
    tenant_id: 'tenant-1',
    name: 'Admin User',
    email: 'admin@example.com',
    role: 'admin',
    active: true,
    password_hash: 'secret-hash',
    totp_secret_encrypted: 'encrypted-secret',
    totp_enabled: 1,
  });

  assert.deepEqual(publicUser, {
    id: 'user-1',
    tenantId: 'tenant-1',
    name: 'Admin User',
    email: 'admin@example.com',
    role: 'admin',
    active: true,
    totpEnabled: true,
  });
  assert.equal(Object.hasOwn(publicUser, 'password_hash'), false);
  assert.equal(Object.hasOwn(publicUser, 'totp_secret_encrypted'), false);
});

test('requireActiveSubscription allows active trial tenants', () => {
  const service = createAuthService({
    jwt,
    jwtSecret: 'test-secret-with-more-than-32-characters',
    isProduction: true,
    getCookie: () => '',
    query: async () => ({ rows: [] }),
  });

  const req = {
    tenant: {
      status: 'active',
      subscriptionStatus: 'trial',
      trialEndsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
  };
  const res = createResponse();
  let nextCalled = false;

  service.requireActiveSubscription(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test('requireActiveSubscription blocks expired trial tenants', () => {
  const service = createAuthService({
    jwt,
    jwtSecret: 'test-secret-with-more-than-32-characters',
    isProduction: true,
    getCookie: () => '',
    query: async () => ({ rows: [] }),
  });

  const req = {
    tenant: {
      status: 'active',
      subscriptionStatus: 'trial',
      trialEndsAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    },
  };
  const res = createResponse();
  let nextCalled = false;

  service.requireActiveSubscription(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error, 'Trial expired');
  assert.equal(res.body.billingBlocked, true);
});

test('production auth cookie is httpOnly, secure, and cross-site compatible', () => {
  const service = createAuthService({
    jwt,
    jwtSecret: 'test-secret-with-more-than-32-characters',
    isProduction: true,
    getCookie: () => '',
    query: async () => ({ rows: [] }),
  });
  const res = createResponse();

  service.setAuthCookie(res, {
    id: 'user-1',
    tenant_id: 'tenant-1',
    name: 'Admin User',
    email: 'admin@example.com',
    role: 'admin',
  });

  assert.equal(res.cookies.bosAuthToken.options.httpOnly, true);
  assert.equal(res.cookies.bosAuthToken.options.secure, true);
  assert.equal(res.cookies.bosAuthToken.options.sameSite, 'none');
  assert.equal(res.cookies.bosAuthToken.options.path, '/');
});

}

{
// common.security.test.js
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const {
  decryptSecret,
  encryptSecret,
  isOptOutMessage,
  isStrongPassword,
  safeErrorLog,
} = require('./services');

function withEncryptionKey(fn) {
  const previous = process.env.META_TOKEN_ENCRYPTION_KEY;
  process.env.META_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      if (previous === undefined) {
        delete process.env.META_TOKEN_ENCRYPTION_KEY;
      } else {
        process.env.META_TOKEN_ENCRYPTION_KEY = previous;
      }
    });
}

test('safeErrorLog redacts token and password values', () => {
  const safe = safeErrorLog(new Error(
    'Meta failed access_token=meta-token password=plain jwt_secret=jwt-secret',
  ));

  assert.match(safe.message, /access_token=\[REDACTED\]/);
  assert.match(safe.message, /password=\[REDACTED\]/);
  assert.match(safe.message, /jwt_secret=\[REDACTED\]/);
  assert.doesNotMatch(safe.message, /meta-token/);
  assert.doesNotMatch(safe.message, /plain/);
  assert.doesNotMatch(safe.message, /jwt-secret/);
});

test('opt-out detection covers common English and Hindi customer messages', () => {
  assert.equal(isOptOutMessage('STOP'), true);
  assert.equal(isOptOutMessage('please do not message'), true);
  assert.equal(isOptOutMessage('message mat bhejo'), true);
  assert.equal(isOptOutMessage('need quotation for EN8'), false);
});

test('strong password policy rejects weak credentials', () => {
  assert.equal(isStrongPassword('Short@1'), false);
  assert.equal(isStrongPassword('longbutnosymbol123'), false);
  assert.equal(isStrongPassword('StrongPass@123'), true);
});

test('Meta token encryption round-trips without storing plaintext', async () => {
  await withEncryptionKey(() => {
    const secret = 'meta-access-token-value';
    const encrypted = encryptSecret(secret);

    assert.ok(encrypted.encrypted);
    assert.ok(encrypted.iv);
    assert.ok(encrypted.tag);
    assert.notEqual(encrypted.encrypted, secret);
    assert.equal(decryptSecret(encrypted), secret);
  });
});

}

{
// domain.test.js
const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildBotReplyText,
  categorizeMessage,
  extractEnquiry,
  extractText,
  getBotIntent,
  isAllowedOutboundMediaContent,
  normalizeProduct,
  normalizeSalesItem,
  parseQuantity,
} = require('./server');

test('categorizes common WhatsApp sales intents', () => {
  assert.equal(categorizeMessage('Please send quotation and price'), 'Quotation Required');
  assert.equal(categorizeMessage('Payment UTR shared'), 'Payment Follow-up');
  assert.equal(categorizeMessage('Dispatch tracking chahiye'), 'Dispatch Query');
  assert.equal(categorizeMessage('Wrong item issue'), 'Complaint');
});

test('extracts product enquiry fields from inbound text', () => {
  const enquiry = extractEnquiry('Need quotation for round bar grade EN8 size 20mm qty 25 pcs');
  assert.equal(enquiry.grade, 'EN8');
  assert.equal(enquiry.size, '20mm');
  assert.equal(enquiry.shape, 'round bar');
  assert.equal(enquiry.quantity, '25 pcs');
});

test('normalizes invalid numeric inputs safely', () => {
  const product = normalizeProduct({ sku: 'A', name: 'Item', price: 'bad', stock_qty: 'NaN' });
  assert.equal(product.price, 0);
  assert.equal(product.stock_qty, 0);

  const item = normalizeSalesItem({ quantity: 'bad', rate: 'nope' });
  assert.equal(item.quantity, 1);
  assert.equal(item.rate, 0);
  assert.equal(item.amount, 0);
});

test('parses quantities and non-text WhatsApp messages', () => {
  assert.deepEqual(parseQuantity('12 kg'), { quantity: 12, unit: 'kg' });
  assert.equal(extractText({ type: 'image', image: { caption: 'Product photo', id: 'img-1' } }), 'Product photo');
  assert.equal(extractText({ type: 'document', document: { filename: 'invoice.pdf' } }), 'invoice.pdf');
});

test('outbound media validator rejects spoofed file content', () => {
  assert.equal(isAllowedOutboundMediaContent({
    mimetype: 'image/png',
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]),
  }), true);

  assert.equal(isAllowedOutboundMediaContent({
    mimetype: 'image/png',
    buffer: Buffer.from('<script>alert(1)</script>'),
  }), false);

  assert.equal(isAllowedOutboundMediaContent({
    mimetype: 'application/pdf',
    buffer: Buffer.from('%PDF-1.7\n'),
  }), true);
});

test('builds policy-safe bot replies for greeting and order intent', () => {
  const settings = {
    companyName: 'BLUE OCEAN STEELS LLP',
    appName: 'BOS CRM',
    currency: 'INR',
    botGreeting: 'Hello, please share the product, size, and quantity you need.',
    handoffKeywords: ['urgent'],
  };
  const products = [{ sku: 'EN8-20', name: 'EN8 Round Bar', grade: 'EN8', size: '20mm', shape: 'round bar', unit: 'pcs', price: 120, stock_qty: 25 }];

  assert.equal(getBotIntent('hii'), 'greeting');
  assert.match(buildBotReplyText({ settings, text: 'hii', products }), /Welcome to BLUE OCEAN STEELS LLP/);
  assert.match(buildBotReplyText({ settings, text: 'book order for EN8 20mm qty 5', products }), /Order booking/);
  assert.equal(buildBotReplyText({ settings, text: 'STOP', products }), null);
});

}

{
// embedded-signup.test.js
const assert = require('node:assert/strict');
const test = require('node:test');

const asyncHandler = require('./services').asyncHandler;
const { registerCoreRoutes } = require('./routes');

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function createRouteHarness({ axios, query }) {
  const routes = [];
  const app = new Proxy({}, {
    get(target, method) {
      return (path, ...handlers) => {
        routes.push({ method, path, handlers });
      };
    },
  });

  registerCoreRoutes(app, {
    axios,
    query,
    asyncHandler,
    rateLimit: () => (req, res, next) => next(),
    requireAuth: (req, res, next) => {
      req.user = {
        id: 'user-1',
        tenantId: 'tenant-1',
        role: 'admin',
      };
      req.tenant = {
        id: 'tenant-1',
        status: 'active',
        subscriptionStatus: 'active',
      };
      next();
    },
    requireActiveSubscription: (req, res, next) => next(),
    maskValue: (value = '') => (value ? `masked:${String(value).slice(-4)}` : ''),
    hasRealValue: (value) => Boolean(value && !String(value).startsWith('your-')),
    encryptSecret: (value) => ({
      encrypted: `encrypted:${value}`,
      iv: 'iv',
      tag: 'tag',
    }),
    safeMetaError: (error) => ({
      status: error?.response?.status || null,
      message: error?.message || 'test error',
    }),
    recordAudit: async () => {},
  });

  const route = routes.find((item) => (
    item.method === 'post' && item.path === '/api/whatsapp/embedded-signup/complete'
  ));

  assert.ok(route, 'embedded signup completion route should be registered');

  async function run(body = {}) {
    const req = {
      body,
      headers: {},
      ip: '127.0.0.1',
      socket: {},
    };
    const res = createResponse();

    for (const handler of route.handlers) {
      if (res.body) break;

      await new Promise((resolve, reject) => {
        const next = (error) => (error ? reject(error) : resolve());
        const result = handler(req, res, next);

        if (result && typeof result.then === 'function') {
          result.then(resolve).catch(reject);
        }
      });
    }

    return res;
  }

  return { run };
}

function withMetaEnv(fn) {
  const previous = {
    META_APP_ID: process.env.META_APP_ID,
    META_APP_SECRET: process.env.META_APP_SECRET,
    WHATSAPP_API_VERSION: process.env.WHATSAPP_API_VERSION,
  };

  process.env.META_APP_ID = 'app-1';
  process.env.META_APP_SECRET = 'secret-1';
  process.env.WHATSAPP_API_VERSION = 'v24.0';

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });
}

test('embedded signup completion saves a verified WABA phone mapping', async () => {
  await withMetaEnv(async () => {
    const metaPosts = [];
    const queryCalls = [];

    const axios = {
      async get(url) {
        if (url.includes('/oauth/access_token')) {
          return { data: { access_token: 'token-1' } };
        }

        if (url.endsWith('/waba-1/phone_numbers')) {
          return {
            data: {
              data: [
                {
                  id: 'phone-1',
                  display_phone_number: '+91 99999 99999',
                  verified_name: 'Blue Ocean',
                },
              ],
            },
          };
        }

        if (url.endsWith('/phone-1')) {
          return {
            data: {
              id: 'phone-1',
              display_phone_number: '+91 99999 99999',
            },
          };
        }

        throw new Error(`Unexpected Meta GET: ${url}`);
      },
      async post(url) {
        metaPosts.push(url);
        return { data: { success: true } };
      },
    };

    async function query(sql, params) {
      queryCalls.push({ sql, params });

      if (sql.includes('FROM whatsapp_accounts') && sql.includes('JOIN tenants')) {
        return { rows: [] };
      }

      if (sql.includes('INSERT INTO whatsapp_accounts')) {
        return {
          rows: [{
            id: 'account-1',
            phone_number_id: params[1],
            display_phone_number: params[2],
            waba_id: params[3],
            active: true,
            connected_at: '2026-06-08T00:00:00.000Z',
          }],
        };
      }

      if (sql.includes('UPDATE tenants')) {
        return { rows: [] };
      }

      throw new Error(`Unexpected SQL: ${sql}`);
    }

    const { run } = createRouteHarness({ axios, query });
    const res = await run({
      code: 'code-1',
      phoneNumberId: 'phone-1',
      wabaId: 'waba-1',
      businessId: 'business-1',
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.account.displayPhoneNumber, '+91 99999 99999');
    assert.equal(metaPosts.length, 1);
    assert.match(metaPosts[0], /waba-1\/subscribed_apps$/);
    assert.ok(queryCalls.some((call) => call.sql.includes('INSERT INTO whatsapp_accounts')));
    assert.ok(queryCalls.some((call) => (
      call.sql.includes('UPDATE tenants')
      && call.params[0] === 'tenant-1'
      && call.params[1] === 'business-1'
    )));
  });
});

test('embedded signup completion rejects a phone that is not in the selected WABA', async () => {
  await withMetaEnv(async () => {
    let saveAttempted = false;

    const axios = {
      async get(url) {
        if (url.includes('/oauth/access_token')) {
          return { data: { access_token: 'token-1' } };
        }

        if (url.endsWith('/waba-1/phone_numbers')) {
          return {
            data: {
              data: [{ id: 'other-phone', display_phone_number: '+91 11111 11111' }],
            },
          };
        }

        throw new Error(`Unexpected Meta GET after resolver failure: ${url}`);
      },
      async post() {
        throw new Error('Webhook subscription should not run for mismatched phone/WABA');
      },
    };

    async function query(sql) {
      if (sql.includes('INSERT INTO whatsapp_accounts')) {
        saveAttempted = true;
      }

      return { rows: [] };
    }

    const { run } = createRouteHarness({ axios, query });
    const originalConsoleError = console.error;
    console.error = () => {};

    let res;
    try {
      res = await run({
        code: 'code-1',
        phoneNumberId: 'phone-1',
        wabaId: 'waba-1',
      });
    } finally {
      console.error = originalConsoleError;
    }

    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /does not belong to the selected WABA/);
    assert.equal(saveAttempted, false);
  });
});

}
