import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express from 'express';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import MongoStore from 'connect-mongo';

process.env.TOKEN_ENCRYPTION_KEY = '0'.repeat(64);

let mongod;
let User;
let sessionStore;

test.before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  User = (await import('../src/models/User.js')).default;
  sessionStore = MongoStore.create({ mongoUrl: mongod.getUri() });
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
  return app;
}

test('requireAuth attaches req.user when session valid', async () => {
  const config = {
    SESSION_SECRET: 'a'.repeat(32),
    CLIENT_ORIGIN: 'http://localhost:3000',
    isProduction: false,
    MONGODB_URI: mongod.getUri(),
  };
  
  const app = createApp(config);

  const { requireAuth } = await import('../src/middleware/auth.js');
  
  app.get('/api/protected', requireAuth, (req, res) => res.json({ user: req.user.login }));
  app.post('/api/login', (req, res) => {
    req.session.userId = req.body.userId;
    res.json({ ok: true });
  });

  const user = await User.create({
    githubId: 11111,
    login: 'alice',
    name: 'Alice',
    avatarUrl: 'https://example.com/avatar.png',
    encryptedToken: 'ghp_testtoken',
  });

  const agent = request.agent(app);
  await agent.post('/api/login').send({ userId: user._id.toString() });

  const res = await agent.get('/api/protected');
  assert.equal(res.status, 200);
  assert.equal(res.body.user, 'alice');
});

test('requireAuth returns 401 without session', async () => {
  const config = {
    SESSION_SECRET: 'a'.repeat(32),
    CLIENT_ORIGIN: 'http://localhost:3000',
    isProduction: false,
    MONGODB_URI: mongod.getUri(),
  };
  
  const app = createApp(config);

  const { requireAuth } = await import('../src/middleware/auth.js');
  app.get('/api/protected', requireAuth, (req, res) => res.json({ user: req.user.login }));

  const res = await request(app).get('/api/protected');
  assert.equal(res.status, 401);
});

test('optionalAuth continues without user when no session', async () => {
  const config = {
    SESSION_SECRET: 'a'.repeat(32),
    CLIENT_ORIGIN: 'http://localhost:3000',
    isProduction: false,
    MONGODB_URI: mongod.getUri(),
  };
  
  const app = createApp(config);

  const { optionalAuth } = await import('../src/middleware/auth.js');
  app.get('/api/optional', optionalAuth, (req, res) => res.json({ user: req.user?.login || null }));

  const res = await request(app).get('/api/optional');
  assert.equal(res.status, 200);
  assert.equal(res.body.user, null);
});

test('optionalAuth attaches req.user when session valid', async () => {
  const config = {
    SESSION_SECRET: 'a'.repeat(32),
    CLIENT_ORIGIN: 'http://localhost:3000',
    isProduction: false,
    MONGODB_URI: mongod.getUri(),
  };
  
  const app = createApp(config);

  const { optionalAuth } = await import('../src/middleware/auth.js');
  app.get('/api/optional', optionalAuth, (req, res) => res.json({ user: req.user?.login || null }));
  app.post('/api/login', (req, res) => {
    req.session.userId = req.body.userId;
    res.json({ ok: true });
  });

  const user = await User.create({
    githubId: 54321,
    login: 'bob',
    name: 'Bob',
    avatarUrl: 'https://example.com/avatar.png',
    encryptedToken: 'ghp_testtoken',
  });

  const agent = request.agent(app);
  await agent.post('/api/login').send({ userId: user._id.toString() });

  const res = await agent.get('/api/optional');
  assert.equal(res.status, 200);
  assert.equal(res.body.user, 'bob');
});

test('requireAuth returns 401 for non-existent user', async () => {
  const config = {
    SESSION_SECRET: 'a'.repeat(32),
    CLIENT_ORIGIN: 'http://localhost:3000',
    isProduction: false,
    MONGODB_URI: mongod.getUri(),
  };
  
  const app = createApp(config);

  const { requireAuth } = await import('../src/middleware/auth.js');
  app.get('/api/protected', requireAuth, (req, res) => res.json({ user: req.user.login }));
  app.post('/api/login', (req, res) => {
    req.session.userId = req.body.userId;
    res.json({ ok: true });
  });

  const agent = request.agent(app);
  await agent.post('/api/login').send({ userId: new mongoose.Types.ObjectId().toString() });

  const res = await agent.get('/api/protected');
  assert.equal(res.status, 401);
});

test('session cookie has correct attributes', async () => {
  const config = {
    SESSION_SECRET: 'a'.repeat(32),
    CLIENT_ORIGIN: 'http://localhost:3000',
    isProduction: false,
    MONGODB_URI: mongod.getUri(),
  };
  
  const app = createApp(config);

  app.get('/api/set-session', (req, res) => {
    req.session.userId = 'test';
    res.json({ ok: true });
  });

  const res = await request(app).get('/api/set-session');
  const cookie = res.headers['set-cookie'][0];
  assert.ok(cookie.includes('HttpOnly'));
  assert.ok(!cookie.includes('Secure'));
  assert.ok(cookie.includes('SameSite=Lax'));
  assert.ok(cookie.includes('Expires='));
});