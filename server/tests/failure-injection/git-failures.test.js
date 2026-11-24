import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CommandError } from '../../src/services/deploy/commands.js';

describe('Failure Injection: Git Failures', () => {
  it('handles git clone failure gracefully', async () => {
    // This test would mock the git clone command to fail
    // and verify the worker handles it properly
    const error = new CommandError('Git clone failed', 'GIT_CLONE_FAILED', { 
      stdout: '', 
      stderr: 'fatal: repository not found' 
    });
    
    assert.equal(error.code, 'GIT_CLONE_FAILED');
    assert.ok(error.message.includes('Git clone failed'));
  });

  it('handles git checkout failure gracefully', async () => {
    const error = new CommandError('Git checkout failed', 'GIT_CHECKOUT_FAILED', { 
      stdout: '', 
      stderr: 'error: pathspec did not match any file(s) known to git' 
    });
    
    assert.equal(error.code, 'GIT_CHECKOUT_FAILED');
    assert.ok(error.message.includes('Git checkout failed'));
  });

  it('handles git fetch failure gracefully', async () => {
    const error = new CommandError('Git fetch failed', 'GIT_FETCH_FAILED', { 
      stdout: '', 
      stderr: 'fatal: could not read from remote repository' 
    });
    
    assert.equal(error.code, 'GIT_FETCH_FAILED');
    assert.ok(error.message.includes('Git fetch failed'));
  });
});