const apiRateBuckets = new Map();

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

function rateLimit({ bucketName, maxRequests, windowMs }) {
  return (req, res, next) => {
    const safeBucketName = String(bucketName || 'default').replace(/[^a-zA-Z0-9_.:-]/g, '_');
    const safeMaxRequests = Math.max(Number(maxRequests || 60), 1);
    const safeWindowMs = Math.max(Number(windowMs || 60 * 1000), 1000);

    const key = getClientKey(req, safeBucketName);
    const now = Date.now();

    const bucket = apiRateBuckets.get(key) || {
      count: 0,
      resetAt: now + safeWindowMs,
    };

    if (bucket.resetAt <= now) {
      bucket.count = 0;
      bucket.resetAt = now + safeWindowMs;
    }

    bucket.count += 1;
    apiRateBuckets.set(key, bucket);

    const remaining = Math.max(safeMaxRequests - bucket.count, 0);
    const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);

    res.setHeader('RateLimit-Limit', String(safeMaxRequests));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > safeMaxRequests) {
      res.setHeader('Retry-After', String(retryAfterSeconds));

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

module.exports = rateLimit;