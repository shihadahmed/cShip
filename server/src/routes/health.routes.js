import { Router } from 'express';
import { getDatabaseStatus } from '../config/db.js';
import { getDiskSpace } from '../lib/disk.js';
import mongoose from 'mongoose';

export const healthRouter = Router();

healthRouter.get('/', async (req, res) => {
  try {
    const config = req.app.locals.config;
    const databaseStatus = getDatabaseStatus();
    const databaseConfigured = Boolean(config.MONGODB_URI);
    const status =
      databaseConfigured && databaseStatus !== 'connected' ? 'degraded' : 'ok';

    // Queue stats
    const queue = req.app.locals.queue;
    const queueStats = queue && typeof queue.getStats === 'function'
      ? await queue.getStats()
      : { depth: 0, processing: 0 };

    // Worker stats
    const worker = req.app.locals.worker;
    const workerStats = worker && typeof worker.getStats === 'function'
      ? worker.getStats()
      : { status: 'not_started' };

    // Disk space
    const deploymentsRoot = config.DEPLOYMENTS_ROOT || process.cwd();
    const disk = await getDiskSpace(deploymentsRoot);

    // Memory
    const mem = process.memoryUsage();

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
        readyState: mongoose.connection.readyState,
      },
      queue: queueStats,
      worker: workerStats,
      disk,
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
        usagePercent: Math.round((mem.heapUsed / mem.heapTotal) * 100),
      },
      build: {
        memoryLimitMb: config.BUILD_MEMORY_MB,
        maxConcurrent: config.MAX_CONCURRENT_BUILDS,
        timeoutMs: config.BUILD_TIMEOUT_MS,
      },
      rateLimit: config.rateLimit || {},
    });
  } catch (err) {
    console.error('Health route error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
