import { HttpError } from '../lib/http-error.js';

export function createRateLimiter({ windowMs, max, keyPrefix, message }) {
  const store = new Map();

  return async (req, res, next) => {
    const config = req.app.locals.config?.rateLimit?.[keyPrefix] || { max, windowMs };
    const effectiveMax = config.max ?? max;
    const effectiveWindowMs = config.windowMs ?? windowMs;

    const key = `${keyPrefix}:${getClientKey(req)}`;
    const now = Date.now();
    const windowStart = now - effectiveWindowMs;

    const hits = (store.get(key) || []).filter(t => t > windowStart);
    hits.push(now);
    store.set(key, hits);

    const remaining = Math.max(0, effectiveMax - hits.length);
    res.set({
      'X-RateLimit-Limit': effectiveMax,
      'X-RateLimit-Remaining': remaining,
      'X-RateLimit-Reset': new Date(now + effectiveWindowMs).toISOString(),
    });

    if (hits.length > effectiveMax) {
      res.set('Retry-After', Math.ceil(effectiveWindowMs / 1000));
      throw new HttpError(429, message || 'Too many requests', { code: 'RATE_LIMITED' });
    }

    next();
  };
}

function getClientKey(req) {
  if (req.user?._id) return `user:${req.user._id}`;
  return `ip:${req.ip || req.connection.remoteAddress}`;
}

export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyPrefix: 'auth',
  message: 'Too many authentication attempts, please try again later',
});

export const webhookRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  keyPrefix: 'webhook',
  message: 'Webhook rate limit exceeded',
});

export const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 100,
  keyPrefix: 'api',
  message: 'API rate limit exceeded',
});