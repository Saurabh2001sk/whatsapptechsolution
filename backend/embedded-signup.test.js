const assert = require('node:assert/strict');
const test = require('node:test');

const asyncHandler = require('./asyncHandler');
const { registerCoreRoutes } = require('./core.routes');

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
      next();
    },
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
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.account.displayPhoneNumber, '+91 99999 99999');
    assert.equal(metaPosts.length, 1);
    assert.match(metaPosts[0], /waba-1\/subscribed_apps$/);
    assert.ok(queryCalls.some((call) => call.sql.includes('INSERT INTO whatsapp_accounts')));
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
