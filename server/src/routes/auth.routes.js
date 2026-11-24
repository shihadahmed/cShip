import express from 'express';
import crypto from 'node:crypto';
import { optionalAuth } from '../middleware/auth.js';
import { validateCsrf } from '../middleware/csrf.js';
import { githubCallbackSchema, logoutSchema } from '../validators/auth.js';
import { validate } from '../validators/validate.js';
import User, { getAdminLogins } from '../models/User.js';
import AuditLog from '../models/AuditLog.js';
import { createGitHubClient } from '../services/github/index.js';

export const authRouter = express.Router();

function generateState() {
  return crypto.randomBytes(32).toString('hex');
}

function getDashboardUrl(config) {
  const origins =
    Array.isArray(config.clientOrigins) && config.clientOrigins.length > 0
      ? config.clientOrigins
      : String(config.CLIENT_ORIGIN || '')
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean);

  return origins[0] || '/';
}

function getLoginUrl(config, errorCode) {
  const origin = getDashboardUrl(config);
  const suffix = `/login?error=${encodeURIComponent(errorCode)}`;
  if (!origin || origin === '/') return suffix;
  return `${origin.replace(/\/$/, '')}${suffix}`;
}

authRouter.get('/github', (req, res) => {
  const config = req.app.locals.config;
  const state = generateState();
  req.session.oauthState = state;

  const params = new URLSearchParams({
    client_id: config.GITHUB_CLIENT_ID,
    redirect_uri: config.GITHUB_CALLBACK_URL,
    scope: 'repo user:email',
    state,
    allow_signup: 'false',
  });

  res.redirect(`${config.GITHUB_OAUTH_URL || 'https://github.com/login/oauth/authorize'}?${params}`);
});

authRouter.get('/github/callback', validate(githubCallbackSchema), async (req, res, next) => {
  try {
    const config = req.app.locals.config;
    const { code, state } = req.query;

    if (state !== req.session.oauthState) {
      return res.status(400).json({
        error: { code: 'INVALID_OAUTH_STATE', message: 'Invalid OAuth state parameter' },
      });
    }

    delete req.session.oauthState;

    const client = createGitHubClient({
      getDecryptedToken: async () => '',
      baseUrl: 'https://api.github.com',
    });

    let tokenResponse;
    try {
      tokenResponse = await client.exchangeCodeForToken(
        code,
        config.GITHUB_CLIENT_ID,
        config.GITHUB_CLIENT_SECRET,
        config.GITHUB_CALLBACK_URL
      );
    } catch (error) {
      return res.redirect(getLoginUrl(config, 'auth_failed'));
    }

    if (!tokenResponse.access_token) {
      return res.redirect(getLoginUrl(config, 'auth_failed'));
    }

    const tempClient = createGitHubClient({
      getDecryptedToken: () => Promise.resolve(tokenResponse.access_token),
    });

    let githubUser;
    try {
      githubUser = await tempClient.getAuthenticatedUser();
    } catch (error) {
      return res.redirect(getLoginUrl(config, 'auth_failed'));
    }

    const adminLogins = config.adminGithubLogins || [];
    if (!adminLogins.includes(githubUser.login)) {
      if (AuditLog.db?.readyState === 1) {
        AuditLog.create({
          action: 'user.login_denied',
          resource: 'user',
          metadata: { login: githubUser.login, requestId: req.id },
          severity: 'warning',
          ip: req.ip,
          userAgent: req.get('user-agent'),
        }).catch(() => {});
      }
      return res.redirect(getLoginUrl(config, 'not_admin'));
    }

    let user = await User.findOne({ githubId: githubUser.id });
    if (!user) {
      user = new User({
        githubId: githubUser.id,
        login: githubUser.login,
        name: githubUser.name,
        avatarUrl: githubUser.avatar_url,
        encryptedToken: tokenResponse.access_token,
        encryptedRefreshToken: tokenResponse.refresh_token,
        tokenExpiresAt: tokenResponse.expires_in ? new Date(Date.now() + tokenResponse.expires_in * 1000) : undefined,
      });
    } else {
      user.login = githubUser.login;
      user.name = githubUser.name;
      user.avatarUrl = githubUser.avatar_url;
      user.encryptedToken = tokenResponse.access_token;
      if (tokenResponse.refresh_token) {
        user.encryptedRefreshToken = tokenResponse.refresh_token;
      }
      if (tokenResponse.expires_in) {
        user.tokenExpiresAt = new Date(Date.now() + tokenResponse.expires_in * 1000);
      }
    }

    await user.save();

    // Regenerate the session on login to prevent session fixation.
    req.session.regenerate((regenerateError) => {
      if (regenerateError) return next(regenerateError);
      req.session.userId = user._id;
      req.session.save((saveError) => {
        if (saveError) return next(saveError);
        if (AuditLog.db?.readyState === 1) {
          AuditLog.create({
            userId: user._id,
            action: 'user.login',
            resource: 'user',
            resourceId: user._id,
            metadata: { login: user.login },
            severity: 'info',
            ip: req.ip,
            userAgent: req.get('user-agent'),
          }).catch(() => {});
        }
        res.redirect(getDashboardUrl(config));
      });
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/logout', validate(logoutSchema), validateCsrf, (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({
        error: { code: 'LOGOUT_FAILED', message: 'Failed to destroy session' },
      });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

authRouter.get('/me', optionalAuth, (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Not authenticated' },
    });
  }

  const config = req.app.locals.config;
  const adminLogins = Array.isArray(config?.adminGithubLogins)
    ? config.adminGithubLogins
    : getAdminLogins();

  // Admin membership is re-checked on every request so removing a user from
  // ADMIN_GITHUB_LOGINS revokes access immediately (on next server restart).
  if (!adminLogins.includes(req.user.login)) {
    return req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Not authorized' },
      });
    });
  }

  res.json({
    user: {
      login: req.user.login,
      name: req.user.name,
      avatarUrl: req.user.avatarUrl,
      admin: true,
    },
  });
});