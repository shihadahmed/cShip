import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveSystemState } from '../lib/system-state.js';

test('checking state does not claim the database is configured', () => {
  const state = deriveSystemState({
    phase: 'checking',
    health: null,
    latencyMs: null,
    error: null,
  });

  assert.equal(state.systemLabel, 'Checking');
  assert.equal(state.apiValue, 'Checking');
  assert.equal(state.databaseLabel, 'Unknown');
  assert.equal(state.heapLabel, 'Unknown');
});

test('offline state clears stale health instead of showing old green rows', () => {
  const state = deriveSystemState({
    phase: 'offline',
    health: {
      status: 'ok',
      database: { configured: true, status: 'connected' },
      build: { memoryLimitMb: 512, maxConcurrent: 1 },
    },
    latencyMs: null,
    error: 'Health check timed out',
  });

  assert.equal(state.systemLabel, 'Offline');
  assert.equal(state.apiValue, 'Offline');
  assert.equal(state.databaseLabel, 'Unknown');
  assert.equal(state.heapLabel, 'Unknown');
  assert.equal(state.latencyMs, null);
});

test('degraded health is shown as degraded, not live', () => {
  const state = deriveSystemState({
    phase: 'ready',
    health: {
      status: 'degraded',
      database: { configured: true, status: 'disconnected' },
      build: { memoryLimitMb: 512, maxConcurrent: 1 },
    },
    latencyMs: 12,
    error: null,
  });

  assert.equal(state.systemLabel, 'Degraded');
  assert.equal(state.systemTone, 'warning');
  assert.equal(state.apiValue, 'Online');
  assert.equal(state.databaseLabel, 'Disconnected');
  assert.equal(state.heapLabel, '512 MB');
});

test('healthy state exposes the live database and heap values', () => {
  const state = deriveSystemState({
    phase: 'ready',
    health: {
      status: 'ok',
      database: { configured: true, status: 'connected' },
      build: { memoryLimitMb: 512, maxConcurrent: 1 },
    },
    latencyMs: 10,
    error: null,
  });

  assert.equal(state.systemLabel, 'Live');
  assert.equal(state.systemTone, 'success');
  assert.equal(state.databaseLabel, 'Connected');
  assert.equal(state.databaseTone, 'success');
  assert.equal(state.heapLabel, '512 MB');
  assert.equal(state.latencyMs, 10);
});
