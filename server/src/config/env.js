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
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production' && !value.MONGODB_URI) {
      ctx.addIssue({
        code: 'custom',
        path: ['MONGODB_URI'],
        message: 'MONGODB_URI is required in production',
      });
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

  return {
    ...env,
    clientOrigins,
    adminGithubLogins: splitList(env.ADMIN_GITHUB_LOGINS),
    isProduction: env.NODE_ENV === 'production',
  };
}
