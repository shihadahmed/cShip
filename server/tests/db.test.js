import test from 'node:test';
import assert from 'node:assert/strict';
import { connectDatabase, getDatabaseStatus } from '../src/config/db.js';

test('maps mongoose ready states to readable labels', () => {
  assert.equal(getDatabaseStatus(0), 'disconnected');
  assert.equal(getDatabaseStatus(1), 'connected');
  assert.equal(getDatabaseStatus(2), 'connecting');
  assert.equal(getDatabaseStatus(3), 'disconnecting');
  assert.equal(getDatabaseStatus(99), 'unknown');
});

test('connectDatabase skips the connection when no URI is configured', async () => {
  let warned = false;
  const logger = {
    warn() {
      warned = true;
    },
    info() {},
    error() {},
  };

  const connection = await connectDatabase({
    config: { MONGODB_URI: undefined },
    logger,
  });

  assert.equal(connection, null);
  assert.equal(warned, true);
});
