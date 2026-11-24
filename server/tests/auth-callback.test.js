// Set test encryption key before dynamic imports that read it at module load.
process.env.TOKEN_ENCRYPTION_KEY = '0'.repeat(64);

import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { notFound } from '../src/middleware/not-found.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { silentLogger } from './helpers.js';

const DASHBOARD_URL = 'http://localhost:3000';
const API_URL = 'http://localhost:4000';

let mongod;
let authRouter;

const originalFetch = globalThis.fetch;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function config() {
  return {
    NODE_ENV: 'test',
    isProduction: false,
    SESSION_SECRET: 'a'.repeat(32),
    CLIENT_ORIGIN: DASHBOARD_URL,
    clientOrigins: [DASHBOARD_URL],
    PUBLIC_SERVER_URL: API_URL,
    GITHUB_CLIENT_ID: 'test-client-id',
    GITHUB_CLIENT_SECRET: 'test-client-secret',
    GITHUB_CALLBACK_URL: `${API_URL}/api/auth/github/callback`,
    adminGithubLogins: ['admin'],
  };
}

function createApp(cfg) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());
  app.use(cookieParser());
  app.locals.config = cfg;
  app.locals.logger = silentLogger;
  app.use(
    session({
      secret: cfg.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax' },
    }),
  );
  app.use('/api/auth', authRouter);
  app.use(notFound);
  app.use(errorHandler({ logger: silentLogger, config: cfg }));
  return app;
}

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  ({ authRouter } = await import('../src/routes/auth.routes.js'));

  globalThis.fetch = async (url) => {
    const href = typeof url === 'string' ? url : url.toString();

    if (href.includes('github.com/login/oauth/access_token')) {
      return jsonResponse({ access_token: 'gho_test_token' });
    }

    if (href === 'https://api.github.com/user') {
      return jsonResponse({
        id: 4242,
        login: 'admin',
        name: 'Admin User',
        avatar_url: 'https://avatars.example/u/4242',
      });
    }

    throw new Error(`Unexpected GitHub request: ${href}`);
  };

  await mongoose.connection.db.dropDatabase();
});

test.after(async () => {
  globalThis.fetch = originalFetch;
  await mongoose.disconnect();
  await mongod.stop();
});

test.beforeEach(async () => {
  await mongoose.connection.db.dropDatabase();
});

test('successful GitHub login redirects to the dashboard, not the API root', async () => {
  const agent = request.agent(createApp(config()));

  const start = await agent.get('/api/auth/github');
  assert.equal(start.status, 302);

  const state = new URL(start.headers.location).searchParams.get('state');
  assert.ok(state, 'OAuth start should include a state parameter');

  const callback = await agent.get(
    `/api/auth/github/callback?code=test-code&state=${state}`,
  );

  assert.equal(callback.status, 302);
  assert.equal(callback.headers.location, DASHBOARD_URL);

  const me = await agent.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.login, 'admin');
});
