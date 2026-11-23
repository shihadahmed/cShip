import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '../src/lib/logger.js';

function captureConsole(fn) {
  const lines = [];
  const original = {
    log: console.log,
    warn: console.warn,
    error: console.error,
  };

  console.log = (...args) => lines.push(args.join(' '));
  console.warn = (...args) => lines.push(args.join(' '));
  console.error = (...args) => lines.push(args.join(' '));

  try {
    fn();
  } finally {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
  }

  return lines.join('\n');
}

test('redacts secret keys, URI credentials, and child bindings', () => {
  const output = captureConsole(() => {
    const logger = createLogger({
      level: 'debug',
      nodeEnv: 'production',
    }).child({ token: 'LEAKED-TOKEN' });

    logger.info('db connection', {
      MONGODB_URI: 'mongodb+srv://user:supersecret@cluster.example.net/cship',
      nested: { password: 'nested-secret' },
    });
  });

  assert.equal(output.includes('LEAKED-TOKEN'), false);
  assert.equal(output.includes('supersecret'), false);
  assert.equal(output.includes('nested-secret'), false);
  assert.match(output, /\[redacted\]/);
});

test('redacts Error values without losing the message', () => {
  const output = captureConsole(() => {
    const logger = createLogger({ nodeEnv: 'production' });
    logger.error('failed', {
      error: new Error('connect mongodb://user:secret@host/cship failed'),
    });
  });

  assert.equal(output.includes('secret'), false);
  assert.match(output, /connect/);
});

test('includes child bindings in development text output', () => {
  const output = captureConsole(() => {
    const logger = createLogger({ nodeEnv: 'development' }).child({
      component: 'queue',
    });
    logger.info('worker ready');
  });

  assert.match(output, /component=queue/);
});

test('silent logger emits nothing', () => {
  const output = captureConsole(() => {
    const logger = createLogger({ level: 'silent' });
    logger.debug('no');
    logger.info('no');
    logger.warn('no');
    logger.error('no');
  });

  assert.equal(output, '');
});
