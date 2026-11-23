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
  if (!config.MONGODB_URI) {
    throw new Error('MONGODB_URI is required for session middleware');
  }

  let store;
  let useMongoStore = false;

  try {
    const mongoStore = MongoStore.create({
      mongoUrl: config.MONGODB_URI,
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
    useMongoStore = false;

    // Try to use MongoStore asynchronously
    mongoStore.clientPromise
      .then((client) => {
        store = mongoStore;
        useMongoStore = true;
        console.log('MongoStore connected successfully');
      })
      .catch((err) => {
        console.warn('MongoStore connection failed, using memory store:', err.message);
        // Keep using memory store
      });
  } catch {
    console.warn('MongoStore creation failed, falling back to memory store');
    store = new MemoryStore();
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
  const user = await User.findById(userId).lean();
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