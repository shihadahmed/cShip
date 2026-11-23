import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { HttpError } from '../src/lib/http-error.js';
import { testConfig } from './helpers.js';

function recordingLogger() {
  const entries = [];
  return {
    entries,
    debug() {},
    info() {},
    warn() {},
    error(message, meta) {
      entries.push({ message, meta });
    },
    child() {
      return this;
    },
  };
}

test('HttpError status and message are returned to the client', async () => {
  const logger = recordingLogger();
  const app = createApp({
    config: testConfig(),
    logger,
    registerRoutes(app) {
      app.get('/api/teapot', () => {
        throw new HttpError(418, 'Short and stout', 'TEAPOT');
      });
    },
  });

  const response = await request(app).get('/api/teapot');

  assert.equal(response.status, 418);
  assert.equal(response.body.error.code, 'TEAPOT');
  assert.equal(response.body.error.message, 'Short and stout');
  assert.equal(logger.entries.length, 1);
});

test('unexpected errors are logged and hidden from the client', async () => {
  const logger = recordingLogger();
  const app = createApp({
    config: testConfig(),
    logger,
    registerRoutes(app) {
      app.get('/api/crash', () => {
        throw new Error('database exploded');
      });
    },
  });

  const response = await request(app).get('/api/crash');

  assert.equal(response.status, 500);
  assert.equal(response.body.error.code, 'INTERNAL_ERROR');
  assert.equal(response.body.error.message, 'Internal server error');
  assert.equal(JSON.stringify(response.body).includes('database exploded'), false);
  assert.equal(logger.entries.length, 1);
  assert.equal(logger.entries[0].meta.error, 'database exploded');
});

test('server errors never leak internal error codes', async () => {
  const logger = recordingLogger();
  const app = createApp({
    config: testConfig(),
    logger,
    registerRoutes(app) {
      app.get('/api/db-fail', () => {
        const error = new Error('credentials rejected');
        error.code = 'DB_CREDENTIALS_REJECTED';
        throw error;
      });
    },
  });

  const response = await request(app).get('/api/db-fail');

  assert.equal(response.status, 500);
  assert.equal(response.body.error.code, 'INTERNAL_ERROR');
  assert.equal(
    JSON.stringify(response.body).includes('DB_CREDENTIALS_REJECTED'),
    false,
  );
});

test('logs the route path without the query string', async () => {
  const logger = recordingLogger();
  const app = createApp({
    config: testConfig(),
    logger,
    registerRoutes(app) {
      app.get('/api/explode', () => {
        throw new Error('boom');
      });
    },
  });

  await request(app).get('/api/explode?token=super-secret');

  assert.equal(logger.entries[0].meta.path, '/api/explode');
  assert.equal(
    JSON.stringify(logger.entries[0]).includes('super-secret'),
    false,
  );
});
