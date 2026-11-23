import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { silentLogger, testConfig } from './helpers.js';

test('does not emit CORS headers for origins outside the allowlist', async () => {
  const app = createApp({ config: testConfig({ MONGODB_URI: undefined }), logger: silentLogger });

  const response = await request(app)
    .get('/api/health')
    .set('Origin', 'https://evil.example');

  assert.equal(response.headers['access-control-allow-origin'], undefined);
});

test('replaces unsafe request ids instead of trusting them', async () => {
  const app = createApp({ config: testConfig({ MONGODB_URI: undefined }), logger: silentLogger });

  const response = await request(app)
    .get('/api/health')
    .set('X-Request-Id', 'bad id with spaces');

  assert.notEqual(response.headers['x-request-id'], 'bad id with spaces');
  assert.match(response.headers['x-request-id'], /^[0-9a-f-]{36}$/);
});

test('returns a structured 400 for malformed JSON', async () => {
  const app = createApp({ config: testConfig({ MONGODB_URI: undefined }), logger: silentLogger });

  const response = await request(app)
    .post('/api/health')
    .set('Content-Type', 'application/json')
    .send('{"broken":');

  assert.equal(response.status, 400);
  assert.equal(typeof response.body.error.code, 'string');
  assert.equal(
    response.body.error.requestId,
    response.headers['x-request-id'],
  );
});
