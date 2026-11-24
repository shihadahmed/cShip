// Set environment variables BEFORE importing modules that read them.
process.env.TOKEN_ENCRYPTION_KEY = '0'.repeat(64);
process.env.ADMIN_GITHUB_LOGINS = 'testadmin';

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import MongoStore from 'connect-mongo';
import { createApp } from '../src/app.js';
import { requireAdmin } from '../src/middleware/auth.js';
import { createAuditMiddleware } from '../src/middleware/audit-log.js';
import { createCsrfMiddleware } from '../src/middleware/csrf.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { notFound } from '../src/middleware/not-found.js';
import { silentLogger, testConfig } from './helpers.js';

const SESSION_SECRET = 'a'.repeat(32);

let mongod;
let User;
let AuditLog;
let clearAdminLoginsCache;
const stores = [];

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const userModule = await import('../src/models/User.js');
  User = userModule.default;
  clearAdminLoginsCache = userModule.clearAdminLoginsCache;
  AuditLog = (await import('../src/models/AuditLog.js')).default;
});

test.after(async () => {
  for (const store of stores) {
    await store.close().catch(() => {});
  }
  await mongoose.disconnect();
  await mongod.stop();
});

test.beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  clearAdminLoginsCache();
});

function createStore() {
  const store = MongoStore.create({ mongoUrl: mongod.getUri() });
  stores.push(store);
  return store;
}

function createAuthApp({ adminGithubLogins = ['testadmin'] } = {}) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.locals.config = {
    SESSION_SECRET,
    isProduction: false,
    adminGithubLogins,
  };
  app.use(
    session({
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: createStore(),
      cookie: { httpOnly: true, sameSite: 'lax' },
    }),
  );
  app.post('/api/test-login', (req, res) => {
    req.session.userId = req.body.userId;
    req.session.save(() => res.json({ ok: true }));
  });
  app.get('/api/session', (req, res) => {
    res.json({ userId: req.session.userId ?? null });
  });
  app.get('/api/admin-only', requireAdmin, (req, res) => {
    res.json({ login: req.user.login });
  });
  app.use(notFound);
  app.use(errorHandler({ logger: silentLogger, config: app.locals.config }));
  return app;
}

async function createUser(login) {
  return User.create({
    githubId: Math.floor(Math.random() * 1_000_000),
    login,
    name: login,
    avatarUrl: 'https://example.com/avatar.png',
    encryptedToken: 'ghp_test_token',
  });
}

test('requireAdmin returns 401 without a session', async () => {
  const app = createAuthApp();
  const response = await request(app).get('/api/admin-only');
  assert.equal(response.status, 401);
  assert.equal(response.body.error.code, 'UNAUTHORIZED');
});

test('requireAdmin allows a configured admin login', async () => {
  const app = createAuthApp({ adminGithubLogins: ['testadmin'] });
  const admin = await createUser('testadmin');

  const agent = request.agent(app);
  await agent.post('/api/test-login').send({ userId: admin._id.toString() });
  const response = await agent.get('/api/admin-only');

  assert.equal(response.status, 200);
  assert.equal(response.body.login, 'testadmin');
});

test('requireAdmin returns 403 for an authenticated non-admin user', async () => {
  const app = createAuthApp({ adminGithubLogins: ['testadmin'] });
  const outsider = await createUser('outsider');

  const agent = request.agent(app);
  await agent.post('/api/test-login').send({ userId: outsider._id.toString() });
  const response = await agent.get('/api/admin-only');

  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'FORBIDDEN');
});

test('requireAdmin revokes access when the login is removed from the admin list', async () => {
  const app = createAuthApp({ adminGithubLogins: [] });
  const admin = await createUser('testadmin');

  const agent = request.agent(app);
  await agent.post('/api/test-login').send({ userId: admin._id.toString() });
  const response = await agent.get('/api/admin-only');

  assert.equal(response.status, 403);
});

test('sessions persist across application instances via MongoDB', async () => {
  const firstApp = createAuthApp();
  const user = await createUser('testadmin');

  const agent = request.agent(firstApp);
  const login = await agent.post('/api/test-login').send({ userId: user._id.toString() });
  assert.equal(login.status, 200);

  const cookieHeader = (login.headers['set-cookie'] || [])
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
  assert.match(cookieHeader, /connect\.sid=/);

  // A brand new app + store (simulating a restart) must resolve the session
  // from MongoDB rather than from process memory.
  const secondApp = createAuthApp();
  const response = await request(secondApp)
    .get('/api/session')
    .set('Cookie', cookieHeader);

  assert.equal(response.status, 200);
  assert.equal(response.body.userId, user._id.toString());
});

test('security headers are set, including a per-request CSP nonce', async () => {
  const app = await createApp({
    config: testConfig({ MONGODB_URI: undefined }),
    logger: silentLogger,
  });

  const response = await request(app).get('/api/health');

  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-frame-options'], 'DENY');
  assert.equal(response.headers['referrer-policy'], 'strict-origin-when-cross-origin');
  assert.equal(response.headers['cross-origin-opener-policy'], 'same-origin');
  assert.match(response.headers['permissions-policy'], /camera=\(\)/);

  const csp = response.headers['content-security-policy'];
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /script-src [^;]*'nonce-[^']+'/);
  assert.equal(response.headers['strict-transport-security'], undefined);
});

test('HSTS is emitted in production', async () => {
  const app = await createApp({
    config: testConfig({ MONGODB_URI: undefined, isProduction: true }),
    logger: silentLogger,
  });

  const response = await request(app).get('/api/health');

  assert.match(
    response.headers['strict-transport-security'],
    /max-age=31536000; includeSubDomains; preload/,
  );
});

test('authentication endpoints are rate limited', async () => {
  const app = await createApp({
    config: testConfig({ MONGODB_URI: undefined }),
    logger: silentLogger,
  });

  let lastStatus = 0;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await request(app).get('/api/auth/github');
    lastStatus = response.status;
  }

  assert.equal(lastStatus, 429);
});

test('forbidden admin access is written to the audit log', async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.locals.config = { SESSION_SECRET, isProduction: false, adminGithubLogins: ['testadmin'] };
  app.use(
    session({
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: createStore(),
    }),
  );
  app.use(createAuditMiddleware({ logger: silentLogger }));
  app.post('/api/test-login', (req, res) => {
    req.session.userId = req.body.userId;
    req.session.save(() => res.json({ ok: true }));
  });
  app.get('/api/admin-only', requireAdmin, (req, res) => res.json({ ok: true }));
  app.use(errorHandler({ logger: silentLogger, config: app.locals.config }));

  const outsider = await createUser('outsider');
  const agent = request.agent(app);
  await agent.post('/api/test-login').send({ userId: outsider._id.toString() });

  const response = await agent.get('/api/admin-only');
  assert.equal(response.status, 403);

  const entry = await waitForAuditLog({ action: 'security.forbidden' });
  assert.ok(entry, 'expected a security.forbidden audit entry');
  assert.equal(entry.severity, 'warning');
  assert.equal(String(entry.userId), outsider._id.toString());
});

test('CSRF rejections are written to the audit log', async () => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.locals.config = { SESSION_SECRET, isProduction: false, adminGithubLogins: ['testadmin'] };
  app.use(
    session({
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: createStore(),
    }),
  );
  app.use(createAuditMiddleware({ logger: silentLogger }));
  const { validateCsrf } = createCsrfMiddleware(app.locals.config);
  app.post('/api/projects', validateCsrf, (req, res) => res.status(201).json({ ok: true }));
  app.use(errorHandler({ logger: silentLogger, config: app.locals.config }));

  const user = await createUser('testadmin');
  const agent = request.agent(app);
  await agent.post('/api/test-login').send({ userId: user._id.toString() });

  const response = await agent.post('/api/projects').send({ name: 'nope' });
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'CSRF_ERROR');

  const entry = await waitForAuditLog({ action: 'security.invalid_csrf' });
  assert.ok(entry, 'expected a security.invalid_csrf audit entry');
});

async function waitForAuditLog(query, attempts = 20) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const entry = await AuditLog.findOne(query).lean();
    if (entry) return entry;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return null;
}

test('expired GitHub tokens are refreshed and persisted encrypted', async () => {
  const { createGitHubClient } = await import('../src/services/github/index.js');
  const user = await User.create({
    githubId: 999001,
    login: 'testadmin',
    name: 'Admin',
    encryptedToken: 'old-access-token',
    encryptedRefreshToken: 'old-refresh-token',
    tokenExpiresAt: new Date(Date.now() - 60_000),
  });

  const originalFetch = globalThis.fetch;
  let refreshBody = '';
  globalThis.fetch = async (url, options = {}) => {
    refreshBody = String(options.body || '');
    return new Response(
      JSON.stringify({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };

  try {
    const client = createGitHubClient({
      getDecryptedToken: () => user.getDecryptedToken(),
      getDecryptedRefreshToken: () => user.getDecryptedRefreshToken(),
    });

    const token = await client.refreshTokenIfNeeded(user, 'client-id', 'client-secret');
    assert.equal(token, 'new-access-token');
    assert.match(refreshBody, /grant_type=refresh_token/);
    assert.match(refreshBody, /refresh_token=old-refresh-token/);

    const updated = await User.findById(user._id);
    assert.equal(updated.getDecryptedToken(), 'new-access-token');
    assert.equal(updated.getDecryptedRefreshToken(), 'new-refresh-token');
    assert.ok(updated.tokenExpiresAt.getTime() > Date.now());
    // Stored tokens must remain encrypted at rest.
    assert.equal(typeof updated.encryptedToken, 'object');
    assert.ok(updated.encryptedToken.ciphertext);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('valid GitHub tokens are not refreshed', async () => {
  const { createGitHubClient } = await import('../src/services/github/index.js');
  const user = await User.create({
    githubId: 999002,
    login: 'testadmin',
    name: 'Admin',
    encryptedToken: 'valid-access-token',
    encryptedRefreshToken: 'refresh-token',
    tokenExpiresAt: new Date(Date.now() + 3_600_000),
  });

  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = async () => {
    fetchCalled = true;
    throw new Error('fetch should not be called for a valid token');
  };

  try {
    const client = createGitHubClient({
      getDecryptedToken: () => user.getDecryptedToken(),
      getDecryptedRefreshToken: () => user.getDecryptedRefreshToken(),
    });

    const token = await client.refreshTokenIfNeeded(user, 'client-id', 'client-secret');
    assert.equal(token, null);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GitHub webhooks verify HMAC signatures and bypass CSRF', async () => {
  const { webhooksRouter } = await import('../src/routes/webhooks.routes.js');
  const Project = (await import('../src/models/Project.js')).default;

  const secret = 'webhook-test-secret';
  await Project.collection.insertOne({
    branch: 'main',
    webhook: { id: 'hook-42', secret, active: true },
  });

  const app = express();
  app.use(cookieParser());
  const jsonParser = express.json();
  app.use((req, res, next) => {
    if (req.path === '/api/webhooks/github') return next();
    return jsonParser(req, res, next);
  });
  app.use('/api/webhooks', webhooksRouter);
  app.use(errorHandler({ logger: silentLogger, config: {} }));

  const payload = JSON.stringify({
    ref: 'refs/heads/main',
    before: 'a'.repeat(40),
    after: 'b'.repeat(40),
    repository: {
      full_name: 'owner/repo',
      html_url: 'https://github.com/owner/repo',
      clone_url: 'https://github.com/owner/repo.git',
      default_branch: 'main',
    },
    commits: [
      {
        id: 'b'.repeat(40),
        message: 'test commit',
        author: { name: 'A', email: 'a@example.com' },
        url: 'https://github.com/owner/repo/commit/bbb',
      },
    ],
  });

  const signature = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')}`;

  const accepted = await request(app)
    .post('/api/webhooks/github')
    .set('Content-Type', 'application/json')
    .set('X-GitHub-Hook-ID', 'hook-42')
    .set('X-GitHub-Delivery', 'delivery-1')
    .set('X-Hub-Signature-256', signature)
    .send(payload);

  assert.equal(accepted.status, 202);
  assert.equal(accepted.body.message, 'Deployment queued');

  const rejected = await request(app)
    .post('/api/webhooks/github')
    .set('Content-Type', 'application/json')
    .set('X-GitHub-Hook-ID', 'hook-42')
    .set('X-GitHub-Delivery', 'delivery-2')
    .set('X-Hub-Signature-256', `sha256=${'0'.repeat(64)}`)
    .send(payload);

  assert.equal(rejected.status, 401);
  assert.equal(rejected.body.error.code, 'INVALID_SIGNATURE');
});
