import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { startServer } from '../src/start-server.js';
import { silentLogger, testConfig } from './helpers.js';

test('production boots and serves degraded health when the database is unreachable', async () => {
  let attempts = 0;

  const instance = await startServer({
    config: testConfig({
      NODE_ENV: 'production',
      isProduction: true,
      MONGODB_URI: 'mongodb://127.0.0.1:1/cship',
      PORT: 0,
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
