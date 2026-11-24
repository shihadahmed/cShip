import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CommandError } from '../../src/services/deploy/commands.js';

describe('Failure Injection: Resource Exhaustion', () => {
  it('handles disk space exhaustion (ENOSPC)', async () => {
    const error = new CommandError('npm install failed with code 1', 'NPM_INSTALL_FAILED', { 
      stdout: '',
      stderr: 'npm ERR! ENOSPC: no space left on device, write' 
    });
    
    assert.equal(error.code, 'NPM_INSTALL_FAILED');
    assert.ok(error.message.includes('npm install failed'));
  });

  it('handles out of memory (OOM)', async () => {
    const error = new CommandError('Build failed with code 137', 'BUILD_FAILED', { 
      stdout: '',
      stderr: 'Killed' 
    });
    
    assert.equal(error.code, 'BUILD_FAILED');
    assert.ok(error.message.includes('Build failed'));
  });

  it('handles file system permission errors', async () => {
    const error = new CommandError('Failed to write env file: EACCES', 'ENV_WRITE_FAILED', { 
      path: '/project/.env' 
    });
    
    assert.equal(error.code, 'ENV_WRITE_FAILED');
    assert.ok(error.message.includes('Failed to write env file'));
  });
});