import express from 'express';
import crypto from 'node:crypto';
import { optionalAuth } from '../middleware/auth.js';
import { validateCsrf } from '../middleware/csrf.js';
import { githubCallbackSchema, logoutSchema } from '../validators/auth.js';
import { validate } from '../validators/validate.js';
import User from '../models/User.js';
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
      return res.status(400).json({
        error: { code: 'OAUTH_EXCHANGE_FAILED', message: 'Failed to exchange OAuth code' },
      });
    }

    if (!tokenResponse.access_token) {
      return res.status(400).json({
        error: { code: 'NO_ACCESS_TOKEN', message: 'No access token received from GitHub' },
      });
    }

    const tempClient = createGitHubClient({
      getDecryptedToken: () => Promise.resolve(tokenResponse.access_token),
    });

    let githubUser;
    try {
      githubUser = await tempClient.getAuthenticatedUser();
    } catch (error) {
      return res.status(400).json({
        error: { code: 'GITHUB_USER_FETCH_FAILED', message: 'Failed to fetch GitHub user' },
      });
    }

    const adminLogins = config.adminGithubLogins || [];
    if (!adminLogins.includes(githubUser.login)) {
      return res.status(403).json({
        error: { code: 'NOT_ADMIN', message: 'User is not authorized to access cShip' },
      });
    }

    let user = await User.findOne({ githubId: githubUser.id });
    if (!user) {
      user = new User({
        githubId: githubUser.id,
        login: githubUser.login,
        name: githubUser.name,
        avatarUrl: githubUser.avatar_url,
        encryptedToken: tokenResponse.access_token,
      });
    } else {
      user.login = githubUser.login;
      user.name = githubUser.name;
      user.avatarUrl = githubUser.avatar_url;
      user.encryptedToken = tokenResponse.access_token;
    }

    await user.save();

    req.session.userId = user._id;
    req.session.save(err => {
      if (err) return next(err);
      const redirectUrl = getDashboardUrl(config);
      res.redirect(redirectUrl);
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
  res.json({
    user: {
      login: req.user.login,
      name: req.user.name,
      avatarUrl: req.user.avatarUrl,
      admin: req.user.admin,
    },
  });
});