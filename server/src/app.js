import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { requestId } from './middleware/request-id.js';
import { notFound } from './middleware/not-found.js';
import { errorHandler } from './middleware/error-handler.js';
import { healthRouter } from './routes/health.routes.js';
import { createSessionMiddleware } from './middleware/auth.js';
import { createCsrfMiddleware } from './middleware/csrf.js';
import { createAuditMiddleware } from './middleware/audit-log.js';
import { createRateLimiters } from './middleware/rate-limit.js';
import { createCspMiddleware } from './middleware/csp.js';
import { sanitizeInput, bodySizeLimit } from './middleware/sanitize.js';

export async function createApp({ config, logger, registerRoutes } = {}) {
  if (!config) throw new Error('createApp requires a config object');
  if (!logger) throw new Error('createApp requires a logger');

  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.locals.config = config;
  app.locals.logger = logger;

  app.use(requestId);
  // Use helmet for standard security headers, but disable CSP and crossOriginResourcePolicy
  // since we handle them in our custom CSP middleware
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false,
      crossOriginOpenerPolicy: false, // We set this in CSP middleware
      referrerPolicy: false, // We set this in CSP middleware
      // Enable additional security headers
      dnsPrefetchControl: { allow: false },
      frameguard: { action: 'deny' },
      hsts: config.isProduction
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
      ieNoOpen: true,
      noSniff: true,
      originAgentCluster: true,
      permittedCrossDomainPolicies: { permittedPolicies: 'none' },
      xssFilter: true,
    }),
  );
  // Apply CSP middleware with nonce support
  app.use(createCspMiddleware(config));
  app.use(
    cors({
      origin: config.clientOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-Id'],
      exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After'],
      maxAge: 86400, // 24 hours
    }),
  );
  app.use(cookieParser());
  
  // Body size limit (configurable via config.BODY_SIZE_LIMIT or default 1mb)
  const bodyLimit = config.BODY_SIZE_LIMIT || '1mb';
  app.use(bodySizeLimit(bodyLimit));
  const jsonParser = express.json({ limit: bodyLimit });
  app.use((req, res, next) => {
    // GitHub webhooks are verified against the raw request body, so they must
    // bypass the global JSON parser and use the route-level raw parser.
    if (req.path === '/api/webhooks/github') return next();
    return jsonParser(req, res, next);
  });

  // Sanitize input to prevent NoSQL injection and other attacks
  app.use(sanitizeInput());

  if (config.MONGODB_URI) {
    const sessionMiddleware = await createSessionMiddleware(config);
    app.locals.sessionStore = sessionMiddleware.store;
    app.use(sessionMiddleware);
  }

  // Audit middleware is registered before CSRF/rate limiting so that security
  // rejections (invalid CSRF, 429s, 401/403s) are captured in the audit trail.
  app.use(createAuditMiddleware({ logger }));

  const { csrfTokenRoute, validateCsrf } = createCsrfMiddleware(config);

  app.get('/api/csrf-token', csrfTokenRoute);
  app.use(validateCsrf);

  app.use('/api/health', healthRouter);

  // Create rate limiters with Redis config if available
  const { authRateLimiter, webhookRateLimiter, apiRateLimiter } = createRateLimiters(config.redis);
  app.locals.rateLimiters = { authRateLimiter, webhookRateLimiter, apiRateLimiter };
  app.use('/api/auth', authRateLimiter);
  app.use('/api/webhooks', webhookRateLimiter);
  app.use('/api', apiRateLimiter);

  if (typeof registerRoutes === 'function') {
    registerRoutes(app);
  }

  app.use(notFound);
  app.use(errorHandler({ logger, config }));

  return app;
}
