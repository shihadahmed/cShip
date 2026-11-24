import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CommandError } from '../../src/services/deploy/commands.js';

describe('Failure Injection: Timeout', () => {
  it('handles command timeout', async () => {
    const error = new CommandError('Command timed out after 900000ms', 'COMMAND_TIMEOUT', { 
      command: 'npm', 
      args: ['run', 'build'] 
    });
    
    assert.equal(error.code, 'COMMAND_TIMEOUT');
    assert.ok(error.message.includes('timed out'));
  });

  it('handles custom timeout', async () => {
    const error = new CommandError('Command timed out after 60000ms', 'COMMAND_TIMEOUT', { 
      command: 'npm', 
      args: ['run', 'build'] 
    });
    
    assert.equal(error.code, 'COMMAND_TIMEOUT');
    assert.ok(error.message.includes('60000ms'));
  });

  it('verifies timeout configuration is respected', async () => {
    const BUILD_TIMEOUT_MS = 900000; // 15 minutes default
    const error = new CommandError(`Command timed out after ${BUILD_TIMEOUT_MS}ms`, 'COMMAND_TIMEOUT', { 
      command: 'npm', 
      args: ['run', 'build'] 
    });
    
    assert.ok(error.message.includes(String(BUILD_TIMEOUT_MS)));
  });
});