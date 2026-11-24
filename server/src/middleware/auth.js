import session from 'express-session';
import MongoStore from 'connect-mongo';
import { MemoryStore } from 'express-session';

let userModulePromise = null;

async function getUserModule() {
  if (!userModulePromise) {
    userModulePromise = import('../models/User.js');
  }
  return userModulePromise;
}

async function getUserModel() {
  const module = await getUserModule();
  return module.default;
}

/**
 * Creates a session store that enforces MongoDB in production.
 * In development, falls back to MemoryStore if MongoDB is not configured.
 * In production, throws an error if MongoDB session store cannot be established.
 */
async function createSessionStore(config) {
  const sessionMongoUri = config.SESSION_MONGODB_URI ?? config.MONGODB_URI;
  const isProduction = config.isProduction === true;

  // In production, MongoDB is mandatory for session persistence
  if (isProduction) {
    if (!sessionMongoUri || sessionMongoUri === 'memory' || sessionMongoUri === '') {
      throw new Error('SESSION_MONGODB_URI or MONGODB_URI is required in production for session persistence');
    }

    try {
      const mongoStore = MongoStore.create({
        mongoUrl: sessionMongoUri,
        ttl: 14 * 24 * 60 * 60, // 14 days
        autoRemove: 'native',
        touchAfter: 24 * 3600, // 24 hours
      });

      // Wait for the store to initialize (client + TTL index) so an unreachable
      // database fails startup instead of failing on the first login.
      await mongoStore.collectionP;
      console.log('MongoStore connected successfully');
      return mongoStore;
    } catch (error) {
      throw new Error(`Failed to connect to MongoDB session store: ${error.message}`);
    }
  }

  // Development: allow MemoryStore fallback for convenience
  if (!sessionMongoUri || sessionMongoUri === 'memory' || sessionMongoUri === '') {
    console.warn('Development mode: Using MemoryStore for sessions (sessions will not persist across restarts)');
    return new MemoryStore();
  }

  try {
    const mongoStore = MongoStore.create({
      mongoUrl: sessionMongoUri,
      ttl: 14 * 24 * 60 * 60,
      autoRemove: 'native',
      touchAfter: 24 * 3600, // 24 hours
    });

    await mongoStore.collectionP;
    console.log('MongoStore connected successfully');
    return mongoStore;
  } catch (error) {
    console.warn('MongoStore connection failed, falling back to MemoryStore:', error.message);
    return new MemoryStore();
  }
}

export async function createSessionMiddleware(config) {
  const store = await createSessionStore(config);

  const sessionMiddleware = session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store,
    cookie: {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      maxAge: 14 * 24 * 60 * 60 * 1000, // 14 days
    },
  });

  // Wrap the session middleware to handle store errors gracefully
  const middleware = (req, res, next) => {
    sessionMiddleware(req, res, (err) => {
      if (err && err.message && err.message.includes('Mongo')) {
        // In production, don't silently ignore MongoDB errors
        if (config.isProduction) {
          return next(err);
        }
        return next();
      }
      next(err);
    });
  };

  // Expose the store so the server can close its Mongo client on shutdown.
  middleware.store = store;
  return middleware;
}

/**
 * Refreshes the user's GitHub access token when it is expired (or about to
 * expire) and returns the up-to-date user document. Refresh failures are
 * non-fatal: the existing token may still work, so the user is returned as-is.
 */
async function refreshUserTokenIfNeeded(user, config) {
  if (!config?.GITHUB_CLIENT_ID || !config?.GITHUB_CLIENT_SECRET) {
    return user;
  }

  try {
    const { createGitHubClient } = await import('../services/github/index.js');
    const githubClient = createGitHubClient({
      getDecryptedToken: () => user.getDecryptedToken(),
      getDecryptedRefreshToken: () => user.getDecryptedRefreshToken(),
    });

    const refreshedToken = await githubClient.refreshTokenIfNeeded(
      user,
      config.GITHUB_CLIENT_ID,
      config.GITHUB_CLIENT_SECRET,
    );
    if (!refreshedToken) return user;

    const User = await getUserModel();
    const refreshedUser = (await User.findById(user._id)) ?? user;

    const { default: AuditLog } = await import('../models/AuditLog.js');
    if (AuditLog.db?.readyState === 1) {
      AuditLog.create({
        userId: user._id,
        action: 'user.token_refreshed',
        resource: 'user',
        resourceId: user._id,
        metadata: {},
        severity: 'info',
      }).catch(() => {});
    }

    return refreshedUser;
  } catch (error) {
    // Do not fail the request: the existing token might still be valid.
    console.warn('Token refresh check failed:', error.message);
    return user;
  }
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
  let user = await User.findById(userId);
  if (!user) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'User not found',
      },
    });
  }

  user = await refreshUserTokenIfNeeded(user, req.app.locals.config);

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

/**
 * Middleware to require admin authorization.
 * Checks if the authenticated user is in the ADMIN_GITHUB_LOGINS list.
 * Must be used after requireAuth.
 */
export async function requireAdmin(req, res, next) {
  // First ensure user is authenticated
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
  let user = await User.findById(userId);
  if (!user) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'User not found',
      },
    });
  }

  user = await refreshUserTokenIfNeeded(user, req.app.locals.config);

  // Admin membership is resolved from configuration (ADMIN_GITHUB_LOGINS), not
  // from a stored flag, so revoked admins lose access on their next request.
  const { getAdminLogins } = await getUserModule();
  const config = req.app.locals.config;
  const adminLogins = Array.isArray(config?.adminGithubLogins)
    ? config.adminGithubLogins
    : getAdminLogins();

  if (!adminLogins.includes(user.login)) {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'Admin access required',
      },
    });
  }

  req.user = user;
  next();
}