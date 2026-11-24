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
import { authRateLimiter, webhookRateLimiter, apiRateLimiter } from './middleware/rate-limit.js';

export function createApp({ config, logger, registerRoutes } = {}) {
  if (!config) throw new Error('createApp requires a config object');
  if (!logger) throw new Error('createApp requires a logger');

  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.locals.config = config;
  app.locals.logger = logger;

  app.use(requestId);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: false,
    }),
  );
  app.use(
    cors({
      origin: config.clientOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  if (config.MONGODB_URI) {
    app.use(createSessionMiddleware(config));
  }

  const { csrfTokenRoute, validateCsrf } = createCsrfMiddleware(config);

  app.get('/api/csrf-token', csrfTokenRoute);
  app.use(validateCsrf);

  app.use('/api/health', healthRouter);

  app.use('/api/auth', authRateLimiter);
  app.use('/api/webhooks', webhookRateLimiter);
  app.use('/api', apiRateLimiter);

  app.use(createAuditMiddleware());

  if (typeof registerRoutes === 'function') {
    registerRoutes(app);
  }

  app.use(notFound);
  app.use(errorHandler({ logger, config }));

  return app;
}
