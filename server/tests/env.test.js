import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { loadEnv, EnvValidationError } from '../src/config/env.js';

test('loadEnv applies development defaults', () => {
  const config = loadEnv({});

  assert.equal(config.NODE_ENV, 'development');
  assert.equal(config.PORT, 4000);
  assert.equal(config.BUILD_MEMORY_MB, 512);
  assert.equal(config.MAX_CONCURRENT_BUILDS, 1);
  assert.equal(config.SSE_HEARTBEAT_MS, 15000);
  assert.deepEqual(config.clientOrigins, ['http://localhost:3000']);
  assert.equal(config.isProduction, false);
});

test('loadEnv parses comma-separated origins and admin logins', () => {
  const config = loadEnv({
    CLIENT_ORIGIN: 'https://cship.example.com, https://admin.example.com',
    ADMIN_GITHUB_LOGINS: 'alice, bob',
  });

  assert.deepEqual(config.clientOrigins, [
    'https://cship.example.com',
    'https://admin.example.com',
  ]);
  assert.deepEqual(config.adminGithubLogins, ['alice', 'bob']);
});

test('loadEnv rejects an invalid port', () => {
  assert.throws(() => loadEnv({ PORT: 'not-a-port' }), EnvValidationError);
});

test('loadEnv requires MONGODB_URI in production', () => {
  assert.throws(
    () => loadEnv({ NODE_ENV: 'production' }),
    /MONGODB_URI/,
  );
});

test('loadEnv accepts a complete production config', () => {
  const config = loadEnv({
    NODE_ENV: 'production',
    MONGODB_URI: 'mongodb+srv://user:pass@cluster.example.net/cship',
    SESSION_SECRET: 's'.repeat(32),
    TOKEN_ENCRYPTION_KEY: 'a'.repeat(64),
    CLIENT_ORIGIN: 'https://cship.example.com',
    GITHUB_CLIENT_ID: 'test-client-id',
    GITHUB_CLIENT_SECRET: 'test-client-secret',
    GITHUB_CALLBACK_URL: 'https://cship.example.com/api/auth/github/callback',
    ADMIN_GITHUB_LOGINS: 'alice,bob',
  });

  assert.equal(config.isProduction, true);
  assert.equal(config.NODE_ENV, 'production');
  assert.deepEqual(config.adminGithubLogins, ['alice', 'bob']);
});

test('loadEnv rejects a malformed encryption key', () => {
  assert.throws(
    () => loadEnv({ TOKEN_ENCRYPTION_KEY: 'too-short' }),
    /TOKEN_ENCRYPTION_KEY/,
  );
});

test('the shipped server env template boots in development', () => {
  const template = readFileSync(
    new URL('../.env.example', import.meta.url),
    'utf8',
  );
  const config = loadEnv(parse(template));

  assert.equal(config.NODE_ENV, 'development');
  assert.equal(config.PORT, 4000);
  assert.equal(config.MONGODB_URI, undefined);
});
