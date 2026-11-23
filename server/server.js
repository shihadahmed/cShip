import 'dotenv/config';
import { loadEnv } from './src/config/env.js';
import { createLogger } from './src/lib/logger.js';
import { startServer } from './src/start-server.js';

const SHUTDOWN_TIMEOUT_MS = 10000;

async function main() {
  let config;

  try {
    config = loadEnv();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }

  const logger = createLogger({
    level: config.LOG_LEVEL,
    nodeEnv: config.NODE_ENV,
  });

  const { close } = await startServer({ config, logger });

  let shuttingDown = false;

  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Shutting down', { signal });

    const forceExit = setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    try {
      await close();
      clearTimeout(forceExit);
      process.exit(0);
    } catch (error) {
      logger.error('Shutdown failed', { error: error.message });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

main().catch((error) => {
  console.error('Fatal startup error', error);
  process.exit(1);
});
