import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().max(65535).default(4000),
    LOG_LEVEL: z
      .enum(['debug', 'info', 'warn', 'error', 'silent'])
      .default('info'),
    MONGODB_URI: z.string().trim().min(1).optional(),
    CLIENT_ORIGIN: z.string().default('http://localhost:3000'),
    PUBLIC_SERVER_URL: z.string().url().optional(),
    SESSION_SECRET: z.string().min(32).optional(),
    TOKEN_ENCRYPTION_KEY: z
      .string()
      .regex(/^[a-f0-9]{64}$/i, 'must be 64 hexadecimal characters')
      .optional(),
    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GITHUB_CALLBACK_URL: z.string().url().optional(),
    ADMIN_GITHUB_LOGINS: z.string().optional(),
    CPANEL_URL: z.string().url().optional(),
    CPANEL_USERNAME: z.string().optional(),
    CPANEL_API_TOKEN: z.string().optional(),
    DEPLOYMENTS_ROOT: z.string().optional(),
    BUILD_MEMORY_MB: z.coerce.number().int().min(128).max(4096).default(512),
    MAX_CONCURRENT_BUILDS: z.coerce.number().int().min(1).max(4).default(1),
    BUILD_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(60000)
      .max(3600000)
      .default(900000),
    SSE_HEARTBEAT_MS: z.coerce
      .number()
      .int()
      .min(5000)
      .max(60000)
      .default(15000),
    RATE_LIMIT_AUTH_MAX: z.coerce.number().int().min(1).max(100).default(5),
    RATE_LIMIT_AUTH_WINDOW_MS: z.coerce.number().int().min(60000).max(3600000).default(900000),
    RATE_LIMIT_WEBHOOK_MAX: z.coerce.number().int().min(1).max(200).default(30),
    RATE_LIMIT_WEBHOOK_WINDOW_MS: z.coerce.number().int().min(10000).max(300000).default(60000),
    RATE_LIMIT_API_MAX: z.coerce.number().int().min(10).max(1000).default(100),
    RATE_LIMIT_API_WINDOW_MS: z.coerce.number().int().min(10000).max(300000).default(60000),
    // Redis configuration for rate limiting (optional, enables distributed rate limiting)
    REDIS_URL: z.string().url().optional(),
    REDIS_HOST: z.string().optional(),
    REDIS_PORT: z.coerce.number().int().min(1).max(65535).optional(),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_DB: z.coerce.number().int().min(0).max(15).default(0),
    // Request body size limit (e.g., '1mb', '500kb', '1000000')
    BODY_SIZE_LIMIT: z.string().default('1mb'),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production' && !value.MONGODB_URI) {
      ctx.addIssue({
        code: 'custom',
        path: ['MONGODB_URI'],
        message: 'MONGODB_URI is required in production',
      });
    }
    if (value.NODE_ENV === 'production') {
      if (!value.SESSION_SECRET || value.SESSION_SECRET.length < 32) {
        ctx.addIssue({
          code: 'custom',
          path: ['SESSION_SECRET'],
          message: 'SESSION_SECRET must be at least 32 characters in production',
        });
      }
      if (!value.TOKEN_ENCRYPTION_KEY) {
        ctx.addIssue({
          code: 'custom',
          path: ['TOKEN_ENCRYPTION_KEY'],
          message: 'TOKEN_ENCRYPTION_KEY is required in production',
        });
      }
      if (!value.GITHUB_CLIENT_ID) {
        ctx.addIssue({
          code: 'custom',
          path: ['GITHUB_CLIENT_ID'],
          message: 'GITHUB_CLIENT_ID is required in production',
        });
      }
      if (!value.GITHUB_CLIENT_SECRET) {
        ctx.addIssue({
          code: 'custom',
          path: ['GITHUB_CLIENT_SECRET'],
          message: 'GITHUB_CLIENT_SECRET is required in production',
        });
      }
      if (!value.GITHUB_CALLBACK_URL) {
        ctx.addIssue({
          code: 'custom',
          path: ['GITHUB_CALLBACK_URL'],
          message: 'GITHUB_CALLBACK_URL is required in production',
        });
      }
      if (!value.ADMIN_GITHUB_LOGINS || splitList(value.ADMIN_GITHUB_LOGINS).length === 0) {
        ctx.addIssue({
          code: 'custom',
          path: ['ADMIN_GITHUB_LOGINS'],
          message: 'ADMIN_GITHUB_LOGINS is required in production (comma-separated list)',
        });
      }
    }
  });

export class EnvValidationError extends Error {
  constructor(issues) {
    const details = issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'ENV';
        return `${path}: ${issue.message}`;
      })
      .join('; ');
    super(`Invalid environment configuration: ${details}`);
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

function splitList(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function loadEnv(source = process.env) {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    throw new EnvValidationError(result.error.issues);
  }

  const env = result.data;
  const clientOrigins = splitList(env.CLIENT_ORIGIN);

  if (clientOrigins.length === 0) {
    throw new EnvValidationError([
      {
        path: ['CLIENT_ORIGIN'],
        message: 'at least one allowed origin is required',
      },
    ]);
  }

  // Build Redis config from either URL or discrete params
  let redisConfig = undefined;
  if (env.REDIS_URL) {
    redisConfig = { url: env.REDIS_URL };
  } else if (env.REDIS_HOST) {
    redisConfig = {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT ?? 6379,
      password: env.REDIS_PASSWORD,
      db: env.REDIS_DB,
    };
  }

  return {
    ...env,
    clientOrigins,
    adminGithubLogins: splitList(env.ADMIN_GITHUB_LOGINS).map((login) => login.toLowerCase()),
    isProduction: env.NODE_ENV === 'production',
    redis: redisConfig,
    rateLimit: {
      auth: { max: env.RATE_LIMIT_AUTH_MAX, windowMs: env.RATE_LIMIT_AUTH_WINDOW_MS },
      webhook: { max: env.RATE_LIMIT_WEBHOOK_MAX, windowMs: env.RATE_LIMIT_WEBHOOK_WINDOW_MS },
      api: { max: env.RATE_LIMIT_API_MAX, windowMs: env.RATE_LIMIT_API_WINDOW_MS },
    },
  };
}
