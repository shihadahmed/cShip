import { HttpError } from '../lib/http-error.js';
import Redis from 'ioredis';

/**
 * In-memory rate limit store (fallback when Redis is not available)
 */
class MemoryRateLimitStore {
  constructor({ maxKeys = 10000 } = {}) {
    this.store = new Map();
    this.maxKeys = maxKeys;
  }

  async increment(key, windowMs) {
    const now = Date.now();
    const windowStart = now - windowMs;
    const hits = (this.store.get(key) || []).filter(t => t > windowStart);
    hits.push(now);
    this.store.set(key, hits);

    // Bound memory use: evict the oldest keys when the map grows too large.
    if (this.store.size > this.maxKeys) {
      const excess = this.store.size - this.maxKeys;
      let removed = 0;
      for (const existingKey of this.store.keys()) {
        this.store.delete(existingKey);
        if (++removed >= excess) break;
      }
    }

    return { hits: hits.length, resetTime: now + windowMs };
  }

  async decrement(key) {
    const hits = this.store.get(key) || [];
    if (hits.length > 0) {
      hits.pop();
      this.store.set(key, hits);
    }
  }

  async reset(key) {
    this.store.delete(key);
  }

  close() {
    this.store.clear();
  }
}

/**
 * Redis-backed rate limit store for distributed rate limiting
 */
class RedisRateLimitStore {
  constructor(redisConfig) {
    this.redis = this.createRedisClient(redisConfig);
    this.connected = false;
    this.connectionError = null;

    this.redis.on('connect', () => {
      this.connected = true;
      this.connectionError = null;
    });

    this.redis.on('error', (err) => {
      this.connected = false;
      this.connectionError = err;
    });

    this.redis.on('close', () => {
      this.connected = false;
    });
  }

  createRedisClient(redisConfig) {
    if (redisConfig.url) {
      return new Redis(redisConfig.url, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => Math.min(times * 100, 3000),
        lazyConnect: true,
      });
    }
    return new Redis({
      host: redisConfig.host,
      port: redisConfig.port,
      password: redisConfig.password,
      db: redisConfig.db,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => Math.min(times * 100, 3000),
      lazyConnect: true,
    });
  }

  async connect() {
    if (!this.connected) {
      try {
        await this.redis.connect();
      } catch (err) {
        // Connection will be retried on next operation
      }
    }
  }

  async increment(key, windowMs) {
    const now = Date.now();
    const windowSec = Math.ceil(windowMs / 1000);
    const redisKey = `ratelimit:${key}`;

    try {
      await this.connect();

      const pipeline = this.redis.pipeline();
      pipeline.zremrangebyscore(redisKey, 0, now - windowMs);
      pipeline.zadd(redisKey, now, `${now}-${Math.random()}`);
      pipeline.zcard(redisKey);
      pipeline.expire(redisKey, windowSec + 1);
      const results = await pipeline.exec();

      const firstError = results.find(([error]) => error);
      if (firstError) {
        throw new Error(firstError[0].message);
      }

      const hits = results[2][1];
      return { hits, resetTime: now + windowMs };
    } catch (err) {
      // On Redis error, throw to trigger fallback
      throw new Error(`Redis rate limit error: ${err.message}`);
    }
  }

  disconnect() {
    // Synchronous and safe even if the lazy client never connected.
    this.redis.disconnect();
  }

  async close() {
    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }
}

/**
 * Creates a rate limiter with Redis backend (falls back to memory if Redis unavailable)
 */
export function createRateLimiter({ windowMs, max, keyPrefix, message, redisConfig }) {
  let redisStore = null;
  let memoryStore = new MemoryRateLimitStore();
  let useRedis = false;

  // Initialize Redis store if config provided
  if (redisConfig) {
    try {
      redisStore = new RedisRateLimitStore(redisConfig);
      useRedis = true;
    } catch (err) {
      console.warn('Failed to initialize Redis rate limit store, using memory store:', err.message);
    }
  }

  // Try Redis first, then degrade to the in-process store. Redis is used even
  // while the lazy client is still connecting, so limits are shared from the
  // first request instead of only after the `connect` event fires.
  const increment = async (key, windowMs) => {
    if (useRedis && redisStore) {
      try {
        return await redisStore.increment(key, windowMs);
      } catch (err) {
        console.warn('Redis rate limit failed, falling back to memory store:', err.message);
        useRedis = false;
      }
    }
    return memoryStore.increment(key, windowMs);
  };

  const limiter = async (req, res, next) => {
    const config = req.app.locals.config?.rateLimit?.[keyPrefix] || { max, windowMs };
    const effectiveMax = config.max ?? max;
    const effectiveWindowMs = config.windowMs ?? windowMs;

    const key = `${keyPrefix}:${getClientKey(req)}`;

    try {
      const { hits, resetTime } = await increment(key, effectiveWindowMs);

      const remaining = Math.max(0, effectiveMax - hits);
      res.set({
        'X-RateLimit-Limit': effectiveMax,
        'X-RateLimit-Remaining': remaining,
        'X-RateLimit-Reset': new Date(resetTime).toISOString(),
      });

      if (hits > effectiveMax) {
        res.set('Retry-After', Math.ceil(effectiveWindowMs / 1000));
        throw new HttpError(429, message || 'Too many requests', { code: 'RATE_LIMITED' });
      }

      next();
    } catch (err) {
      next(err);
    }
  };

  // Release Redis connections on shutdown.
  limiter.close = async () => {
    memoryStore.close();
    redisStore?.disconnect();
  };

  return limiter;
}

function getClientKey(req) {
  if (req.user?._id) return `user:${req.user._id}`;
  return `ip:${req.ip || req.connection.remoteAddress}`;
}

// Create rate limiters with Redis config from app locals
export function createRateLimiters(redisConfig) {
  return {
    authRateLimiter: createRateLimiter({
      windowMs: 15 * 60 * 1000,
      max: 5,
      keyPrefix: 'auth',
      message: 'Too many authentication attempts, please try again later',
      redisConfig,
    }),
    webhookRateLimiter: createRateLimiter({
      windowMs: 60 * 1000,
      max: 30,
      keyPrefix: 'webhook',
      message: 'Webhook rate limit exceeded',
      redisConfig,
    }),
    apiRateLimiter: createRateLimiter({
      windowMs: 60 * 1000,
      max: 100,
      keyPrefix: 'api',
      message: 'API rate limit exceeded',
      redisConfig,
    }),
  };
}