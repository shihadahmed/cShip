import { createServer } from 'node:http';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { registerRoutes } from './routes/index.js';

const DEFAULT_RETRY_BASE_MS = 1000;
const DEFAULT_RETRY_MAX_MS = 30000;

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '0.0.0.0');
  });
}

export async function startServer({
  config,
  logger,
  connect = connectDatabase,
  disconnect = disconnectDatabase,
  retryBaseMs = DEFAULT_RETRY_BASE_MS,
  retryMaxMs = DEFAULT_RETRY_MAX_MS,
} = {}) {
  if (!config) throw new Error('startServer requires a config object');
  if (!logger) throw new Error('startServer requires a logger');

  const app = await createApp({ config, logger, registerRoutes });
  const server = createServer(app);

  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  await listen(server, config.PORT);

  logger.info('cShip API listening', {
    port: server.address()?.port ?? config.PORT,
    environment: config.NODE_ENV,
    pid: process.pid,
  });

  let stopped = false;
  let retryTimer = null;
  let attempt = 0;

  const scheduleRetry = (error) => {
    if (stopped) return;

    attempt += 1;
    const delay = Math.min(
      retryMaxMs,
      retryBaseMs * 2 ** Math.min(attempt - 1, 10),
    );

    logger.error('Database connection failed; retrying in background', {
      attempt,
      retryInMs: delay,
      error: error.message,
    });

    retryTimer = setTimeout(() => {
      retryTimer = null;
      void tryConnect();
    }, delay);
    retryTimer.unref?.();
  };

  const tryConnect = async () => {
    if (stopped) return;

    try {
      await connect({ config, logger });
      attempt = 0;
    } catch (error) {
      scheduleRetry(error);
    }
  };

  void tryConnect();

  const close = async () => {
    if (stopped) return;
    stopped = true;

    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }

    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });

    const sessionStore = app.locals.sessionStore;
    if (sessionStore) {
      try {
        // Wait for lazy store initialization (e.g. TTL index creation) to
        // finish so closing the client does not interrupt an in-flight
        // operation and surface as an unhandled rejection.
        await sessionStore.collectionP;
      } catch (error) {
        logger.error('Session store initialization failed', { error: error.message });
      }

      try {
        await sessionStore.close?.();
      } catch (error) {
        logger.error('Session store close failed', { error: error.message });
      }
    }

    for (const limiter of Object.values(app.locals.rateLimiters || {})) {
      try {
        await limiter.close?.();
      } catch (error) {
        logger.error('Rate limiter close failed', { error: error.message });
      }
    }

    try {
      await disconnect();
    } catch (error) {
      logger.error('Database disconnect failed', { error: error.message });
    }
  };

  return { app, server, close };
}
