import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { silentLogger, testConfig } from './helpers.js';

test('GET /api/health reports service state', async () => {
  const app = await createApp({ config: testConfig(), logger: silentLogger });

  const response = await request(app)
    .get('/api/health')
    .set('Origin', 'http://localhost:3000');

  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
  assert.equal(response.body.service, 'cship-server');
  assert.equal(response.body.environment, 'test');
  assert.equal(response.body.database.configured, false);
  assert.equal(response.body.database.status, 'disconnected');
  assert.equal(response.body.build.memoryLimitMb, 512);
  assert.equal(response.body.build.maxConcurrent, 1);
  assert.match(response.headers['x-request-id'], /^[0-9a-f-]{36}$/);
  assert.equal(
    response.headers['access-control-allow-origin'],
    'http://localhost:3000',
  );
  assert.equal(response.headers['x-powered-by'], undefined);
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('GET /api/health echoes a supplied request id', async () => {
  const app = await createApp({ config: testConfig(), logger: silentLogger });

  const response = await request(app)
    .get('/api/health')
    .set('X-Request-Id', 'req_123');

  assert.equal(response.headers['x-request-id'], 'req_123');
});
