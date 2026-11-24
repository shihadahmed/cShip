import { promises as fs } from 'node:fs';
import { join } from 'node:path';

export class ReleaseError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'ReleaseError';
    this.code = code;
    this.details = details;
  }
}

function getReleasesDir(projectDir) {
  return join(projectDir, 'releases');
}

function getCurrentSymlink(projectDir) {
  return join(projectDir, 'current');
}

export async function createReleaseDir(projectDir) {
  const releasesDir = getReleasesDir(projectDir);
  await fs.mkdir(releasesDir, { recursive: true });

  const timestamp = Date.now();
  const releaseName = `release-${timestamp}`;
  const releasePath = join(releasesDir, releaseName);

  await fs.mkdir(releasePath, { recursive: true });

  return { releasePath, releaseName, timestamp };
}

export async function activateRelease(projectDir, releaseName) {
  const releasesDir = getReleasesDir(projectDir);
  const releasePath = join(releasesDir, releaseName);
  const currentLink = getCurrentSymlink(projectDir);

  try {
    await fs.access(releasePath);
  } catch {
    throw new ReleaseError(`Release not found: ${releaseName}`, 'RELEASE_NOT_FOUND');
  }

  try {
    await fs.unlink(currentLink);
  } catch {
    // Link doesn't exist yet
  }

  await fs.symlink(releasePath, currentLink);

  return { releasePath, currentLink };
}

export async function listReleases(projectDir, limit = 10) {
  const releasesDir = getReleasesDir(projectDir);

  try {
    const entries = await fs.readdir(releasesDir, { withFileTypes: true });
    const releases = entries
      .filter(d => d.isDirectory() && d.name.startsWith('release-'))
      .map(d => {
        const match = d.name.match(/release-(\d+)/);
        const timestamp = match ? parseInt(match[1], 10) : 0;
        return {
          name: d.name,
          timestamp,
          path: join(releasesDir, d.name),
        };
      })
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);

    return releases;
  } catch {
    return [];
  }
}

export async function cleanupOldReleases(projectDir, keep = 5) {
  const releases = await listReleases(projectDir, 100);
  const toDelete = releases.slice(keep);

  for (const release of toDelete) {
    try {
      await fs.rm(release.path, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  return toDelete.length;
}

export async function getActiveRelease(projectDir) {
  const currentLink = getCurrentSymlink(projectDir);

  try {
    const target = await fs.readlink(currentLink);
    return { path: target, name: target.split('/').pop() };
  } catch {
    return null;
  }
}

export async function rollbackRelease(projectDir, releaseName) {
  const releases = await listReleases(projectDir, 100);
  const release = releases.find(r => r.name === releaseName);

  if (!release) {
    throw new ReleaseError(`Release not found: ${releaseName}`, 'RELEASE_NOT_FOUND');
  }

  await activateRelease(projectDir, releaseName);
  return release;
}

export async function copyBuildToRelease({ buildDir, releasePath, logger }) {
  logger.debug('Copying build to release', { buildDir, releasePath });

  try {
    await fs.access(buildDir);
  } catch {
    throw new ReleaseError(`Build directory not found: ${buildDir}`, 'BUILD_DIR_MISSING');
  }

  await fs.cp(buildDir, releasePath, { recursive: true, force: true });

  logger.debug('Build copied to release');
}