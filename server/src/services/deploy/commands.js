import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join, resolve } from 'node:path';

export class CommandError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'CommandError';
    this.code = code;
    this.details = details;
  }
}

export function getDeploymentsRoot(config) {
  return config.DEPLOYMENTS_ROOT || process.env.DEPLOYMENTS_ROOT || resolve(process.cwd(), 'deployments');
}

export function getProjectDir(deploymentsRoot, projectId) {
  return join(deploymentsRoot, projectId.toString());
}

function getEnvPath(projectDir) {
  return join(projectDir, '.env');
}

function getRestartTxtPath(appPath) {
  return join(appPath, 'tmp', 'restart.txt');
}

export async function prepareWorkingCopy({ projectDir, commitSha, logger }) {
  logger.debug('Preparing working copy', { projectDir, commitSha });

  try {
    await fs.access(join(projectDir, '.git'));
    logger.debug('Git repo exists, fetching and checking out');
    await runCommand('git', ['fetch', '--prune', 'origin'], { cwd: projectDir, logger });
    await runCommand('git', ['checkout', '--force', commitSha], { cwd: projectDir, logger });
  } catch (error) {
    if (error.code === 'ENOENT') {
      logger.debug('Git repo does not exist, cloning');
      await fs.mkdir(projectDir, { recursive: true });
      await runCommand('git', ['clone', '--depth', '1', '--branch', commitSha, '--single-branch', 'origin', projectDir], { logger });
    } else {
      throw error;
    }
  }

  const { stdout } = await runCommand('git', ['rev-parse', 'HEAD'], { cwd: projectDir, logger });
  const actualSha = stdout.trim();
  if (actualSha !== commitSha) {
    logger.warn('Checked out commit differs from requested', { requested: commitSha, actual: actualSha });
  }

  return { sha: actualSha };
}

export async function writeEnvFile({ projectDir, envVars, logger }) {
  const envPath = getEnvPath(projectDir);
  const lines = [];

  for (const [key, value] of Object.entries(envVars)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      logger.warn('Skipping invalid env key', { key });
      continue;
    }
    const escaped = String(value).replace(/"/g, '\\"');
    lines.push(`${key}="${escaped}"`);
  }

  const content = lines.join('\n') + '\n';
  await fs.writeFile(envPath, content, { mode: 0o600 });
  logger.debug('Environment file written', { path: envPath, keys: Object.keys(envVars).length });
}

export async function runInstall({ projectDir, logger, npmClient = 'npm' }) {
  logger.info('Running npm install');

  const hasLockfile = await fs.access(join(projectDir, 'package-lock.json')).then(() => true).catch(() => false);
  const args = hasLockfile ? ['ci', '--prefer-offline', '--no-audit', '--no-fund'] : ['install', '--prefer-offline', '--no-audit', '--no-fund'];

  const { stdout, stderr, code } = await runCommand(npmClient, args, {
    cwd: projectDir,
    logger,
    env: {
      ...process.env,
      CI: '1',
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      GIT_TERMINAL_PROMPT: '0',
    },
  });

  if (code !== 0) {
    throw new CommandError(`npm install failed with code ${code}`, 'NPM_INSTALL_FAILED', { stdout, stderr });
  }

  return { stdout, stderr };
}

export async function runBuild({ projectDir, buildCommand, logger }) {
  logger.info('Running build command', { buildCommand });

  const { stdout, stderr, code } = await runCommand('sh', ['-c', buildCommand], {
    cwd: projectDir,
    logger,
    env: {
      ...process.env,
      CI: '1',
      NODE_ENV: 'production',
    },
  });

  if (code !== 0) {
    throw new CommandError(`Build failed with code ${code}`, 'BUILD_FAILED', { stdout, stderr, command: buildCommand });
  }

  return { stdout, stderr };
}

export async function runCommand(command, args, options = {}) {
  const { cwd, logger, env = {}, timeout = 900000 } = options;

  logger?.debug('Running command', { command, args, cwd });

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    const timeoutHandle = setTimeout(() => {
      killed = true;
      killProcessTree(child.pid);
      logger?.warn('Command timed out', { command, args, timeout });
      reject(new CommandError(`Command timed out after ${timeout}ms`, 'COMMAND_TIMEOUT', { command, args }));
    }, timeout);

    child.stdout?.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeoutHandle);
      if (!killed) {
        logger?.error('Command spawn failed', { command, args, error: error.message });
        reject(new CommandError(`Failed to spawn: ${error.message}`, 'SPAWN_FAILED', { command, args }));
      }
    });

    child.on('close', (code) => {
      clearTimeout(timeoutHandle);
      if (!killed) {
        logger?.debug('Command completed', { command, args, code: code ?? 0 });
        resolve({ stdout, stderr, code: code ?? 0 });
      }
    });
  });
}

function killProcessTree(pid) {
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', pid.toString(), '/T', '/F'], { windowsHide: true });
    } catch {
      // Ignore
    }
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // Ignore
      }
    }
  }
}

export async function copyStaticOutput({ projectDir, outputDir, documentRoot, logger }) {
  logger.info('Copying static output to document root', { outputDir, documentRoot });

  const sourcePath = join(projectDir, outputDir);
  const destPath = documentRoot;

  try {
    await fs.access(sourcePath);
  } catch {
    throw new CommandError(`Output directory not found: ${outputDir}`, 'OUTPUT_DIR_MISSING', { sourcePath });
  }

  await fs.mkdir(destPath, { recursive: true });

  const files = await fs.readdir(sourcePath);
  for (const file of files) {
    const src = join(sourcePath, file);
    const dest = join(destPath, file);
    await fs.cp(src, dest, { recursive: true, force: true });
  }

  logger.info('Static files copied', { count: files.length });
}

export async function writeRestartTxt({ appPath, logger }) {
  const restartPath = getRestartTxtPath(appPath);
  await fs.mkdir(join(appPath, 'tmp'), { recursive: true });
  await fs.writeFile(restartPath, `${Date.now()}\n`);
  logger.info('Passenger restart.txt written', { path: restartPath });
}

export function buildEnvVars({ project, config, decryptedToken }) {
  const env = {};

  for (const [key, value] of Object.entries(project.envVars || {})) {
    env[key] = value;
  }

  env.NODE_ENV = 'production';
  env.PORT = String(config.PORT || 3000);

  if (decryptedToken) {
    env.GITHUB_TOKEN = decryptedToken;
  }

  return env;
}