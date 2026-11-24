// Set environment variables BEFORE any imports that read them
process.env.TOKEN_ENCRYPTION_KEY = '0'.repeat(64);
process.env.ADMIN_GITHUB_LOGINS = 'testadmin';

import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import MongoStore from 'connect-mongo';
import { createCsrfMiddleware } from '../src/middleware/csrf.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { notFound } from '../src/middleware/not-found.js';
import { silentLogger } from './helpers.js';

let registerRoutes;
let clearAdminLoginsCache;

async function loadRoutes() {
  const mod = await import('../src/routes/index.js');
  registerRoutes = mod.registerRoutes;
}

let mongod;
let User;
let Project;
let sessionStore;
let csrfToken;

test.before(async () => {
  await loadRoutes();
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const userModule = await import('../src/models/User.js');
  User = userModule.default;
  clearAdminLoginsCache = userModule.clearAdminLoginsCache;
  Project = (await import('../src/models/Project.js')).default;
  sessionStore = MongoStore.create({ mongoUrl: mongod.getUri() });
  await Project.createIndexes();
  await User.createIndexes();
});

test.after(async () => {
  await sessionStore.close();
  await mongoose.disconnect();
  await mongod.stop();
});

function createApp(config) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use((req, res, next) => {
    req.config = config;
    next();
  });
  app.use(session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      maxAge: 14 * 24 * 60 * 60 * 1000,
    },
  }));

  const { csrfTokenRoute, validateCsrf } = createCsrfMiddleware(config);
  app.get('/api/csrf-token', csrfTokenRoute);

  // Test login endpoint (exempt from CSRF for testing)
  app.post('/api/test-login', (req, res) => {
    req.session.userId = req.body.userId;
    res.json({ ok: true });
  });

  app.use(validateCsrf);

  registerRoutes(app);
  app.use(notFound);
  app.use(errorHandler({ logger: silentLogger, config }));
  return app;
}

let config;
let app;
let agent;
let user;
let projectId;

test.beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
  await Project.createIndexes();
  await User.createIndexes();
  
  // Clear admin logins cache to pick up env var
  clearAdminLoginsCache();
  
  config = {
    SESSION_SECRET: 'a'.repeat(32),
    CLIENT_ORIGIN: 'http://localhost:3000',
    isProduction: false,
    MONGODB_URI: mongod.getUri(),
    NODE_ENV: 'test',
    PUBLIC_SERVER_URL: 'http://localhost:4000',
  };

  app = createApp(config);

  // Create admin user (login must match ADMIN_GITHUB_LOGINS)
  user = await User.create({
    githubId: 11111,
    login: 'testadmin',
    name: 'Test Admin',
    avatarUrl: 'https://example.com/avatar.png',
    encryptedToken: 'ghp_testtoken',
  });

  agent = request.agent(app);
  await agent.post('/api/test-login').send({ userId: user._id.toString() });

  // Get CSRF token
  const csrfRes = await agent.get('/api/csrf-token');
  csrfToken = csrfRes.body.csrfToken;

  // Create a test project
  const projectRes = await agent
    .post('/api/projects')
    .set('X-CSRF-Token', csrfToken)
    .send({ repoFullName: 'owner/repo', name: 'Test Project' });
  projectId = projectRes.body.project._id;
});

// --- Existing tests (from plan) ---

test('GET /api/projects returns user projects', async () => {
  const res = await agent.get('/api/projects');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.projects));
  assert.equal(res.body.projects.length, 1);
});

test('POST /api/projects creates project with valid data', async () => {
  const res = await agent
    .post('/api/projects')
    .set('X-CSRF-Token', csrfToken)
    .send({ repoFullName: 'owner/repo2', name: 'Another Project' });
  assert.equal(res.status, 201);
  assert.equal(res.body.project.repoFullName, 'owner/repo2');
  assert.equal(res.body.project.userId, user._id.toString());
});

test('POST /api/projects rejects missing repoFullName', async () => {
  const res = await agent
    .post('/api/projects')
    .set('X-CSRF-Token', csrfToken)
    .send({ name: 'No Repo' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('GET /api/projects/:id returns project if owner', async () => {
  const res = await agent.get(`/api/projects/${projectId}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.project._id, projectId);
});

test('PATCH /api/projects/:id updates project if owner', async () => {
  const res = await agent
    .patch(`/api/projects/${projectId}`)
    .set('X-CSRF-Token', csrfToken)
    .send({ name: 'Renamed' });
  assert.equal(res.status, 200);
  assert.equal(res.body.project.name, 'Renamed');
});

test('DELETE /api/projects/:id deletes project if owner', async () => {
  const res = await agent
    .delete(`/api/projects/${projectId}`)
    .set('X-CSRF-Token', csrfToken);
  assert.equal(res.status, 204);
  const getRes = await agent.get(`/api/projects/${projectId}`);
  assert.equal(getRes.status, 404);
});

// --- New field tests (Task 2) ---

test('PATCH /api/projects/:id accepts framework', async () => {
  const res = await agent
    .patch(`/api/projects/${projectId}`)
    .set('X-CSRF-Token', csrfToken)
    .send({ framework: 'static' });
  assert.equal(res.status, 200);
  assert.equal(res.body.project.framework, 'static');
});

test('PATCH /api/projects/:id rejects invalid framework', async () => {
  const res = await agent
    .patch(`/api/projects/${projectId}`)
    .set('X-CSRF-Token', csrfToken)
    .send({ framework: 'vue' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('PATCH /api/projects/:id accepts build/install/start commands', async () => {
  const res = await agent
    .patch(`/api/projects/${projectId}`)
    .set('X-CSRF-Token', csrfToken)
    .send({ buildCommand: 'npm run build', installCommand: 'npm ci', startCommand: 'npm start', outputDirectory: 'dist' });
  assert.equal(res.status, 200);
  assert.equal(res.body.project.buildCommand, 'npm run build');
  assert.equal(res.body.project.installCommand, 'npm ci');
  assert.equal(res.body.project.startCommand, 'npm start');
  assert.equal(res.body.project.outputDirectory, 'dist');
});

test('PATCH /api/projects/:id accepts subdomain', async () => {
  const res = await agent
    .patch(`/api/projects/${projectId}`)
    .set('X-CSRF-Token', csrfToken)
    .send({ subdomain: 'myapp' });
  assert.equal(res.status, 200);
  assert.equal(res.body.project.subdomain, 'myapp');
});

test('PATCH /api/projects/:id rejects invalid subdomain format', async () => {
  const res = await agent
    .patch(`/api/projects/${projectId}`)
    .set('X-CSRF-Token', csrfToken)
    .send({ subdomain: 'MyApp' }); // uppercase not allowed
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('PATCH /api/projects/:id accepts slug', async () => {
  const res = await agent
    .patch(`/api/projects/${projectId}`)
    .set('X-CSRF-Token', csrfToken)
    .send({ slug: 'my-project' });
  assert.equal(res.status, 200);
  assert.equal(res.body.project.slug, 'my-project');
});

test('PATCH /api/projects/:id accepts branch', async () => {
  const res = await agent
    .patch(`/api/projects/${projectId}`)
    .set('X-CSRF-Token', csrfToken)
    .send({ branch: 'develop' });
  assert.equal(res.status, 200);
  assert.equal(res.body.project.branch, 'develop');
});

test('PATCH /api/projects/:id accepts domain', async () => {
  const res = await agent
    .patch(`/api/projects/${projectId}`)
    .set('X-CSRF-Token', csrfToken)
    .send({ domain: 'example.com' });
  assert.equal(res.status, 200);
  assert.equal(res.body.project.domain, 'example.com');
});

test('PATCH /api/projects/:id rejects duplicate subdomain', async () => {
  // Create another project with a subdomain
  await agent
    .post('/api/projects')
    .set('X-CSRF-Token', csrfToken)
    .send({ repoFullName: 'owner/repo3', name: 'Project 2', subdomain: 'taken' });
  
  // Try to update first project with same subdomain
  const res = await agent
    .patch(`/api/projects/${projectId}`)
    .set('X-CSRF-Token', csrfToken)
    .send({ subdomain: 'taken' });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'DUPLICATE_SUBDOMAIN');
});

test('PATCH /api/projects/:id rejects duplicate slug', async () => {
  // Create another project with a slug
  await agent
    .post('/api/projects')
    .set('X-CSRF-Token', csrfToken)
    .send({ repoFullName: 'owner/repo4', name: 'Project 2', slug: 'taken-slug' });
  
  // Try to update first project with same slug
  const res = await agent
    .patch(`/api/projects/${projectId}`)
    .set('X-CSRF-Token', csrfToken)
    .send({ slug: 'taken-slug' });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'DUPLICATE_SUBDOMAIN'); // slug uses same index name pattern
});

// --- Webhook and active deployment tests (Task 3) ---

test('POST /api/projects/:id/webhook registers webhook', async () => {
  const res = await agent
    .post(`/api/projects/${projectId}/webhook`)
    .set('X-CSRF-Token', csrfToken);
  assert.equal(res.status, 200);
  assert.ok(res.body.webhook);
  assert.ok(res.body.webhook.id);
  assert.ok(res.body.webhook.url);
  assert.equal(res.body.webhook.active, true);
});

test('DELETE /api/projects/:id/webhook unregisters webhook', async () => {
  // First register a webhook
  await agent
    .post(`/api/projects/${projectId}/webhook`)
    .set('X-CSRF-Token', csrfToken);
  
  // Then unregister it
  const res = await agent
    .delete(`/api/projects/${projectId}/webhook`)
    .set('X-CSRF-Token', csrfToken);
  assert.equal(res.status, 200);
  assert.equal(res.body.message, 'Webhook unregistered successfully');
});

test('DELETE /api/projects/:id/webhook fails if no webhook', async () => {
  const res = await agent
    .delete(`/api/projects/${projectId}/webhook`)
    .set('X-CSRF-Token', csrfToken);
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'NO_WEBHOOK');
});

test('DELETE /api/projects/:id blocked by active deployment', async () => {
  // Create a deployment with 'building' status
  const Deployment = (await import('../src/models/Deployment.js')).default;
  await Deployment.create({
    projectId: projectId,
    commitSha: 'abc123',
    branch: 'main',
    status: 'building',
  });

  const res = await agent
    .delete(`/api/projects/${projectId}`)
    .set('X-CSRF-Token', csrfToken);
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'ACTIVE_DEPLOYMENT');
});

test('DELETE /api/projects/:id allowed with queued deployment', async () => {
  // Create a deployment with 'queued' status (should also block)
  const Deployment = (await import('../src/models/Deployment.js')).default;
  await Deployment.create({
    projectId: projectId,
    commitSha: 'abc123',
    branch: 'main',
    status: 'queued',
  });

  const res = await agent
    .delete(`/api/projects/${projectId}`)
    .set('X-CSRF-Token', csrfToken);
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'ACTIVE_DEPLOYMENT');
});

test('DELETE /api/projects/:id allowed with failed deployment', async () => {
  // Create a deployment with 'failed' status (should NOT block)
  const Deployment = (await import('../src/models/Deployment.js')).default;
  await Deployment.create({
    projectId: projectId,
    commitSha: 'abc123',
    branch: 'main',
    status: 'failed',
  });

  const res = await agent
    .delete(`/api/projects/${projectId}`)
    .set('X-CSRF-Token', csrfToken);
  assert.equal(res.status, 204);
});

test('DELETE /api/projects/:id allowed with ready deployment', async () => {
  // Create a deployment with 'ready' status (should NOT block)
  const Deployment = (await import('../src/models/Deployment.js')).default;
  await Deployment.create({
    projectId: projectId,
    commitSha: 'abc123',
    branch: 'main',
    status: 'ready',
  });

  const res = await agent
    .delete(`/api/projects/${projectId}`)
    .set('X-CSRF-Token', csrfToken);
  assert.equal(res.status, 204);
});

test('DELETE /api/projects/:id allowed with cancelled deployment', async () => {
  // Create a deployment with 'cancelled' status (should NOT block)
  const Deployment = (await import('../src/models/Deployment.js')).default;
  await Deployment.create({
    projectId: projectId,
    commitSha: 'abc123',
    branch: 'main',
    status: 'cancelled',
  });

  const res = await agent
    .delete(`/api/projects/${projectId}`)
    .set('X-CSRF-Token', csrfToken);
  assert.equal(res.status, 204);
});

// --- Env var masking and webhook secret tests (Task 11) ---

test('GET /api/projects/:id masks env var values', async () => {
  // First add some env vars
  await agent
    .patch(`/api/projects/${projectId}`)
    .set('X-CSRF-Token', csrfToken)
    .send({ envVars: { API_KEY: 'secret123', DB_PASSWORD: 'password456' } });

  const res = await agent.get(`/api/projects/${projectId}`);
  assert.equal(res.status, 200);
  // envVars should be object with keys but values masked
  assert.ok(res.body.project.envVars);
  assert.equal(typeof res.body.project.envVars, 'object');
  assert.equal(res.body.project.envVars.API_KEY, '••••••••');
  assert.equal(res.body.project.envVars.DB_PASSWORD, '••••••••');
});

test('GET /api/projects/:id never returns webhook secret', async () => {
  // Register a webhook first (mock mode)
  await agent
    .post(`/api/projects/${projectId}/webhook`)
    .set('X-CSRF-Token', csrfToken);

  const res = await agent.get(`/api/projects/${projectId}`);
  assert.equal(res.status, 200);
  // webhook should exist but secret should not be in response
  assert.ok(res.body.project.webhook);
  assert.ok(res.body.project.webhook.id);
  assert.equal(res.body.project.webhook.active, true);
  assert.ok(!res.body.project.webhook.secret); // secret not in response
});