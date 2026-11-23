import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

process.env.TOKEN_ENCRYPTION_KEY = '0'.repeat(64);

let mongod;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

test.after(async () => {
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
  return app;
}

test('CSRF token set on GET /api/csrf-token', async () => {
  const config = {
    SESSION_SECRET: 'a'.repeat(32),
    CLIENT_ORIGIN: 'http://localhost:3000',
    isProduction: false,
  };
  const app = createApp(config);
  
  const { validateCsrf, csrfTokenRoute } = await import('../src/middleware/csrf.js');
  app.get('/api/csrf-token', csrfTokenRoute);
  app.post('/api/test', validateCsrf, (req, res) => res.json({ ok: true }));

  const res = await request(app).get('/api/csrf-token');
  assert.equal(res.status, 200);
  assert.ok(res.body.csrfToken);
  assert.ok(res.headers['set-cookie']?.some(c => c.startsWith('csrf_token=')));
});

test('POST without CSRF token returns 403', async () => {
  const config = {
    SESSION_SECRET: 'a'.repeat(32),
    CLIENT_ORIGIN: 'http://localhost:3000',
    isProduction: false,
  };
  const app = createApp(config);
  
  const { validateCsrf, csrfTokenRoute } = await import('../src/middleware/csrf.js');
  app.get('/api/csrf-token', csrfTokenRoute);
  app.post('/api/test', validateCsrf, (req, res) => res.json({ ok: true }));

  const res = await request(app).post('/api/test').send({});
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'CSRF_ERROR');
});

test('POST with valid CSRF header passes', async () => {
  const config = {
    SESSION_SECRET: 'a'.repeat(32),
    CLIENT_ORIGIN: 'http://localhost:3000',
    isProduction: false,
  };
  const app = createApp(config);
  
  const { validateCsrf, csrfTokenRoute } = await import('../src/middleware/csrf.js');
  app.get('/api/csrf-token', csrfTokenRoute);
  app.post('/api/test', validateCsrf, (req, res) => res.json({ ok: true }));

  const getRes = await request(app).get('/api/csrf-token');
  const csrfToken = getRes.body.csrfToken;
  const cookie = getRes.headers['set-cookie'];

  const res = await request(app)
    .post('/api/test')
    .set('Cookie', cookie)
    .set('x-csrf-token', csrfToken)
    .send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('GET requests are exempt from CSRF validation', async () => {
  const config = {
    SESSION_SECRET: 'a'.repeat(32),
    CLIENT_ORIGIN: 'http://localhost:3000',
    isProduction: false,
  };
  const app = createApp(config);
  
  const { validateCsrf, csrfTokenRoute } = await import('../src/middleware/csrf.js');
  app.get('/api/csrf-token', csrfTokenRoute);
  app.get('/api/test', validateCsrf, (req, res) => res.json({ ok: true }));

  const res = await request(app).get('/api/test');
  assert.equal(res.status, 200);
  assert.equal(res.body.ok, true);
});

test('HEAD requests are exempt from CSRF validation', async () => {
  const config = {
    SESSION_SECRET: 'a'.repeat(32),
    CLIENT_ORIGIN: 'http://localhost:3000',
    isProduction: false,
  };
  const app = createApp(config);
  
  const { validateCsrf, csrfTokenRoute } = await import('../src/middleware/csrf.js');
  app.get('/api/csrf-token', csrfTokenRoute);
  app.head('/api/test', validateCsrf, (req, res) => res.json({ ok: true }));

  const res = await request(app).head('/api/test');
  assert.equal(res.status, 200);
});

test('OPTIONS requests are exempt from CSRF validation', async () => {
  const config = {
    SESSION_SECRET: 'a'.repeat(32),
    CLIENT_ORIGIN: 'http://localhost:3000',
    isProduction: false,
  };
  const app = createApp(config);
  
  const { validateCsrf, csrfTokenRoute } = await import('../src/middleware/csrf.js');
  app.get('/api/csrf-token', csrfTokenRoute);
  app.options('/api/test', validateCsrf, (req, res) => res.json({ ok: true }));

  const res = await request(app).options('/api/test');
  assert.equal(res.status, 200);
});

test('CSRF cookie has correct attributes in production', async () => {
  const config = {
    SESSION_SECRET: 'a'.repeat(32),
    CLIENT_ORIGIN: 'http://localhost:3000',
    isProduction: true,
  };
  const app = createApp(config);
  
  const { csrfTokenRoute } = await import('../src/middleware/csrf.js');
  app.get('/api/csrf-token', csrfTokenRoute);

  const res = await request(app).get('/api/csrf-token');
  const cookie = res.headers['set-cookie'][0];
  assert.ok(cookie.includes('HttpOnly'));
  assert.ok(cookie.includes('Secure'));
  assert.ok(cookie.includes('SameSite=Lax'));
  assert.ok(cookie.includes('Max-Age='));
});

test('CSRF cookie has correct attributes in development', async () => {
  const config = {
    SESSION_SECRET: 'a'.repeat(32),
    CLIENT_ORIGIN: 'http://localhost:3000',
    isProduction: false,
  };
  const app = createApp(config);
  
  const { csrfTokenRoute } = await import('../src/middleware/csrf.js');
  app.get('/api/csrf-token', csrfTokenRoute);

  const res = await request(app).get('/api/csrf-token');
  const cookie = res.headers['set-cookie'][0];
  assert.ok(cookie.includes('HttpOnly'));
  assert.ok(!cookie.includes('Secure'));
  assert.ok(cookie.includes('SameSite=Lax'));
  assert.ok(cookie.includes('Max-Age='));
});