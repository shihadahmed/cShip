import mongoose from 'mongoose';

const READY_STATES = Object.freeze({
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
});

let listenersAttached = false;

export function getDatabaseStatus(state = mongoose.connection.readyState) {
  return READY_STATES[state] ?? 'unknown';
}

function attachConnectionListeners(logger) {
  if (listenersAttached) return;
  listenersAttached = true;

  mongoose.connection.on('error', (error) => {
    logger.error('MongoDB connection error', { error: error.message });
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });
}

export async function connectDatabase({ config, logger }) {
  if (!config.MONGODB_URI) {
    logger.warn(
      'MONGODB_URI is not configured; database-backed features are disabled',
    );
    return null;
  }

  attachConnectionListeners(logger);
  mongoose.set('strictQuery', true);

  await mongoose.connect(config.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 10,
    autoIndex: config.NODE_ENV !== 'production',
  });

  logger.info('MongoDB connected', {
    database: mongoose.connection.name,
    host: mongoose.connection.host,
  });

  return mongoose.connection;
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
