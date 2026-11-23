import { Router } from 'express';
import { getDatabaseStatus } from '../config/db.js';

export const healthRouter = Router();

healthRouter.get('/', (req, res) => {
  try {
    const config = req.app.locals.config;
    const databaseStatus = getDatabaseStatus();
    const databaseConfigured = Boolean(config.MONGODB_URI);
    const status =
      databaseConfigured && databaseStatus !== 'connected' ? 'degraded' : 'ok';

    res.set('Cache-Control', 'no-store');
    res.status(200).json({
      status,
      service: 'cship-server',
      version: '0.1.0',
      environment: config.NODE_ENV,
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      database: {
        configured: databaseConfigured,
        status: databaseStatus,
      },
      build: {
        memoryLimitMb: config.BUILD_MEMORY_MB,
        maxConcurrent: config.MAX_CONCURRENT_BUILDS,
        timeoutMs: config.BUILD_TIMEOUT_MS,
      },
    });
  } catch (err) {
    console.error('Health route error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
