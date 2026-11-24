import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CommandError } from '../../src/services/deploy/commands.js';

describe('Failure Injection: Build Failures', () => {
  it('handles build command failure gracefully', async () => {
    const error = new CommandError('Build failed with code 1', 'BUILD_FAILED', { 
      stdout: '',
      stderr: 'Error: Build failed - missing dependencies' 
    });
    
    assert.equal(error.code, 'BUILD_FAILED');
    assert.ok(error.message.includes('Build failed'));
  });

  it('handles missing output directory', async () => {
    const error = new CommandError('Output directory not found: .next', 'OUTPUT_DIR_MISSING', { 
      sourcePath: '/project/.next' 
    });
    
    assert.equal(error.code, 'OUTPUT_DIR_MISSING');
    assert.ok(error.message.includes('Output directory not found'));
  });

  it('handles build timeout', async () => {
    const error = new CommandError('Command timed out after 900000ms', 'COMMAND_TIMEOUT', { 
      command: 'npm', 
      args: ['run', 'build'] 
    });
    
    assert.equal(error.code, 'COMMAND_TIMEOUT');
    assert.ok(error.message.includes('timed out'));
  });

  it('handles spawn failure', async () => {
    const error = new CommandError('Failed to spawn: ENOENT', 'SPAWN_FAILED', { 
      command: 'nonexistent-command', 
      args: [] 
    });
    
    assert.equal(error.code, 'SPAWN_FAILED');
    assert.ok(error.message.includes('Failed to spawn'));
  });
});