import session from 'express-session';
import MongoStore from 'connect-mongo';
import { MemoryStore } from 'express-session';

let UserModel = null;

async function getUserModel() {
  if (!UserModel) {
    UserModel = (await import('../models/User.js')).default;
  }
  return UserModel;
}

export function createSessionMiddleware(config) {
  let store;

  // Use separate URI for session store if provided, otherwise fall back to main URI
  // Explicit 'memory' or empty string means use MemoryStore
  const sessionMongoUri = config.SESSION_MONGODB_URI ?? config.MONGODB_URI;

  // If no MongoDB URI, or explicitly set to 'memory'/'', use memory store
  if (!sessionMongoUri || sessionMongoUri === 'memory' || sessionMongoUri === '') {
    store = new MemoryStore();
  } else {
    try {
      // Create a wrapper that ensures the MongoStore connection promise is properly handled
      const mongoStore = MongoStore.create({
        mongoUrl: sessionMongoUri,
        ttl: 14 * 24 * 60 * 60,
        autoRemove: 'native',
        touchAfter: 24 * 3600,
      });

      // Handle MongoStore connection errors gracefully
      mongoStore.on('error', (err) => {
        console.error('MongoStore error:', err.message);
      });

      // Start with memory store, switch to MongoStore if connection succeeds
      store = new MemoryStore();

      // Try to use MongoStore asynchronously
      // Create a handled promise that never rejects unhandled
      const clientPromise = mongoStore.clientPromise;
      if (clientPromise && typeof clientPromise.then === 'function') {
        const handledPromise = clientPromise.then(
          (client) => {
            store = mongoStore;
            console.log('MongoStore connected successfully');
            return client;
          },
          (err) => {
            console.warn('MongoStore connection failed, using memory store:', err.message);
            // Keep using memory store
            return null;
          }
        );
        // Prevent unhandled rejection by attaching a noop catch
        handledPromise.catch(() => {});
      }
    } catch {
      console.warn('MongoStore creation failed, falling back to memory store');
      store = new MemoryStore();
    }
  }

  const sessionMiddleware = session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store,
    cookie: {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      maxAge: 14 * 24 * 60 * 60 * 1000,
    },
  });

  // Wrap the session middleware to handle store errors gracefully
  return (req, res, next) => {
    sessionMiddleware(req, res, (err) => {
      if (err && err.message && err.message.includes('Mongo')) {
        return next();
      }
      next(err);
    });
  };
}

export async function requireAuth(req, res, next) {
  const userId = req.session?.userId;
  if (!userId) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      },
    });
  }

  const User = await getUserModel();
  const user = await User.findById(userId);
  if (!user) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'User not found',
      },
    });
  }

  req.user = user;
  next();
}

export async function optionalAuth(req, res, next) {
  const userId = req.session?.userId;
  if (!userId) {
    return next();
  }

  const User = await getUserModel();
  const user = await User.findById(userId).lean();
  if (user) {
    req.user = user;
  }

  next();
}