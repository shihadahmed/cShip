import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { silentLogger, testConfig } from './helpers.js';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Set required env vars before importing startServer
process.env.TOKEN_ENCRYPTION_KEY = '0'.repeat(64);

let startServer;
let mongod;

test.before(async () => {
  const mod = await import('../src/start-server.js');
  startServer = mod.startServer;
  mongod = await MongoMemoryServer.create();
});

test.after(async () => {
  await mongod.stop();
});

test('production boots and serves degraded health when the database is unreachable', async () => {
  let attempts = 0;
  
  // Use memory store for sessions by not providing SESSION_MONGODB_URI
  // MONGODB_URI is fake for main DB, session middleware will use MemoryStore
  const fakeUri = 'mongodb://127.0.0.1:1/cship';

  const instance = await startServer({
    config: testConfig({
      NODE_ENV: 'production',
      isProduction: true,
      MONGODB_URI: fakeUri,
      SESSION_MONGODB_URI: '', // empty string -> falsy -> MemoryStore
      PORT: 0,
      TOKEN_ENCRYPTION_KEY: '0'.repeat(64),
      SESSION_SECRET: 'a'.repeat(32),
    }),
    logger: silentLogger,
    connect: async () => {
      attempts += 1;
      throw new Error('unreachable');
    },
    disconnect: async () => {},
    retryBaseMs: 5,
    retryMaxMs: 10,
  });

  try {
    const response = await request(instance.server).get('/api/health');

    assert.equal(response.status, 200);
    assert.equal(response.body.status, 'degraded');
    assert.equal(response.body.database.configured, true);
    assert.equal(response.body.database.status, 'disconnected');
    assert.ok(attempts >= 1);
  } finally {
    await instance.close();
  }
});
