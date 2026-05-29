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

module.exports = rateLimit;