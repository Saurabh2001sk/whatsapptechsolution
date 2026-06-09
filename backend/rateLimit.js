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
      console.error('Redis rate limit failed, falling back to memory:', {
        message: error.message,
        code: error.code || null,
      });
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

module.exports = rateLimit;