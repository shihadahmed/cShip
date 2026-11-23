import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { silentLogger, testConfig } from './helpers.js';

test('unknown routes return a structured 404', async () => {
  const app = createApp({ config: testConfig(), logger: silentLogger });

  const response = await request(app).get('/api/does-not-exist');

  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, 'NOT_FOUND');
  assert.equal(response.body.error.message, 'Route not found');
  assert.equal(
    response.body.error.requestId,
    response.headers['x-request-id'],
  );
});
