import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CommandError } from '../../src/services/deploy/commands.js';

describe('Failure Injection: NPM Failures', () => {
  it('handles npm install failure gracefully', async () => {
    const error = new CommandError('npm install failed with code 1', 'NPM_INSTALL_FAILED', { 
      stdout: 'npm ERR! code E404',
      stderr: 'npm ERR! 404 Not Found - GET https://registry.npmjs.org/not-a-real-package' 
    });
    
    assert.equal(error.code, 'NPM_INSTALL_FAILED');
    assert.ok(error.message.includes('npm install failed'));
  });

  it('handles npm ci failure when lockfile missing', async () => {
    const error = new CommandError('npm ci failed with code 1', 'NPM_INSTALL_FAILED', { 
      stdout: '',
      stderr: 'npm ERR! This command can only work with a package-lock.json' 
    });
    
    assert.equal(error.code, 'NPM_INSTALL_FAILED');
    assert.ok(error.message.includes('npm ci failed'));
  });

  it('handles npm audit failure', async () => {
    const error = new CommandError('npm install failed with code 1', 'NPM_INSTALL_FAILED', { 
      stdout: '',
      stderr: 'npm ERR! audit: found 5 vulnerabilities' 
    });
    
    assert.equal(error.code, 'NPM_INSTALL_FAILED');
    assert.ok(error.message.includes('npm install failed'));
  });
});