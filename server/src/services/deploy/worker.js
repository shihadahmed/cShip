import { EventEmitter } from 'node:events';
import { ObjectId } from 'mongodb';
import { createQueue } from '../../lib/queue.js';
import { createSSEHub } from '../../lib/sse-hub.js';
import * as commands from './commands.js';
import * as releases from './releases.js';

export class WorkerError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'WorkerError';
    this.code = code;
    this.details = details;
  }
}

const DEPLOYMENT_STATUSES = Object.freeze({
  QUEUED: 'queued',
  BUILDING: 'building',
  READY: 'ready',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

export function createWorker({ config, logger, models, uapi, sseHub }) {
  const { Deployment, Project } = models;
  const workerId = `worker-${process.pid}-${Date.now()}`;
  const queue = createQueue(config.MONGODB_URI, logger);
  const events = new EventEmitter();

  let running = false;
  let stopped = false;

  async function start() {
    if (running) return;
    await queue.connect();
    running = true;
    stopped = false;
    logger.info('Deployment worker started', { workerId });
    processQueue();
  }

  async function stop() {
    stopped = true;
    running = false;
    await queue.disconnect();
    logger.info('Deployment worker stopped', { workerId });
  }

  async function processQueue() {
    while (running && !stopped) {
      try {
        await queue.markStaleJobsFailed(config.BUILD_TIMEOUT_MS || 900000);

        const job = await queue.claimNext(workerId, { maxConcurrent: config.MAX_CONCURRENT_BUILDS || 1 });
        if (!job) {
          await sleep(1000);
          continue;
        }

        await runDeployment(job);
      } catch (error) {
        logger.error('Worker loop error', { error: error.message, stack: error.stack });
        await sleep(5000);
      }
    }
  }

  async function runDeployment(job) {
    const deploymentId = job._id;
    const projectId = job.projectId;

    logger.info('Starting deployment', { deploymentId, projectId });

    let deployment;
    try {
      deployment = await Deployment.findById(deploymentId);
      if (!deployment) {
        throw new WorkerError('Deployment not found in DB', 'DEPLOYMENT_NOT_FOUND');
      }
    } catch (error) {
      await queue.updateStatus(deploymentId, DEPLOYMENT_STATUSES.FAILED, { error: 'Deployment record not found' });
      return;
    }

    let project;
    try {
      project = await Project.findById(projectId);
      if (!project) {
        throw new WorkerError('Project not found', 'PROJECT_NOT_FOUND');
      }
    } catch (error) {
      await queue.updateStatus(deploymentId, DEPLOYMENT_STATUSES.FAILED, { error: 'Project not found' });
      return;
    }

    await queue.updateStatus(deploymentId, DEPLOYMENT_STATUSES.BUILDING, { status: 'building' });
    await updateDeploymentStatus(deploymentId, DEPLOYMENT_STATUSES.BUILDING);

    const deploymentsRoot = config.DEPLOYMENTS_ROOT || resolve(process.cwd(), 'deployments');
    const projectDir = commands.getProjectDir(deploymentsRoot, projectId);

    const sse = sseHub ? createSSEHub() : null;
    if (sse) {
      sse.startHeartbeat();
    }

    const log = (message, level = 'info') => {
      const entry = { level, message, timestamp: Date.now() };
      logger[level](message, { deploymentId, projectId });
      sse?.addLog(deploymentId.toString(), entry);
      queue.appendLogs(deploymentId, JSON.stringify(entry) + '\n');
    };

    try {
      log(`Starting deployment for ${project.name} (${project.repoFullName}@${job.commitSha})`);

      log('Preparing working copy...');
      await commands.prepareWorkingCopy({ projectDir, commitSha: job.commitSha, logger });

      log('Writing environment file...');
      const decryptedToken = project.getDecryptedToken?.();
      const envVars = commands.buildEnvVars({ project, config, decryptedToken });
      await commands.writeEnvFile({ projectDir, envVars, logger });

      log('Installing dependencies...');
      await commands.runInstall({ projectDir, logger });

      log('Running build...');
      await commands.runBuild({ projectDir, buildCommand: project.buildCommand || 'npm run build', logger });

      log('Build completed successfully');

      await queue.updateStatus(deploymentId, DEPLOYMENT_STATUSES.COMPLETED, {
        status: 'ready',
        finishedAt: new Date(),
      });

      await updateDeploymentStatus(deploymentId, DEPLOYMENT_STATUSES.READY);

      log('Deployment ready!');
      sse?.complete(deploymentId.toString(), { status: 'ready' });

    } catch (error) {
      const errorMessage = error.message || 'Unknown error';
      log(`Deployment failed: ${errorMessage}`, 'error');

      await queue.updateStatus(deploymentId, DEPLOYMENT_STATUSES.FAILED, {
        status: 'failed',
        error: errorMessage,
        finishedAt: new Date(),
      });

      await updateDeploymentStatus(deploymentId, DEPLOYMENT_STATUSES.FAILED, errorMessage);
      sse?.error(deploymentId.toString(), new Error(errorMessage));

    } finally {
      sse?.stopHeartbeat();
    }
  }

  async function updateDeploymentStatus(deploymentId, status, error = null) {
    try {
      const update = { status, updatedAt: new Date() };
      if (error) update.error = error;
      if (status === DEPLOYMENT_STATUSES.BUILDING) update.startedAt = new Date();
      if (['ready', 'failed', 'cancelled'].includes(status)) update.finishedAt = new Date();

      await Deployment.findByIdAndUpdate(deploymentId, { $set: update });
    } catch (err) {
      logger.error('Failed to update deployment status in DB', { deploymentId, error: err.message });
    }
  }

  async function triggerDeployment(deploymentData) {
    const job = await queue.enqueue(deploymentData);
    events.emit('enqueued', job);
    return job;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  return {
    start,
    stop,
    triggerDeployment,
    queue,
    events,
    workerId,
    isRunning: () => running,
  };
}

export async function runManualDeployment({ config, logger, models, deploymentId }) {
  const { Deployment, Project } = models;

  const deployment = await Deployment.findById(deploymentId);
  if (!deployment) throw new WorkerError('Deployment not found', 'DEPLOYMENT_NOT_FOUND');

  const project = await Project.findById(deployment.project);
  if (!project) throw new WorkerError('Project not found', 'PROJECT_NOT_FOUND');

  await Deployment.findByIdAndUpdate(deploymentId, { $set: { status: DEPLOYMENT_STATUSES.BUILDING, startedAt: new Date() } });

  const deploymentsRoot = config.DEPLOYMENTS_ROOT || resolve(process.cwd(), 'deployments');
  const projectDir = commands.getProjectDir(deploymentsRoot, project._id);

  const log = (msg) => logger.info(msg, { deploymentId, projectId: project._id });

  try {
    log('Preparing working copy...');
    await commands.prepareWorkingCopy({ projectDir, commitSha: deployment.commitSha, logger });

    log('Writing environment file...');
    const decryptedToken = project.getDecryptedToken?.();
    const envVars = commands.buildEnvVars({ project, config, decryptedToken });
    await commands.writeEnvFile({ projectDir, envVars, logger });

    log('Installing dependencies...');
    await commands.runInstall({ projectDir, logger });

    log('Running build...');
    await commands.runBuild({ projectDir, buildCommand: project.buildCommand || 'npm run build', logger });

    log('Build completed');

    await Deployment.findByIdAndUpdate(deploymentId, {
      $set: { status: DEPLOYMENT_STATUSES.READY, finishedAt: new Date() },
    });

    return { success: true };
  } catch (error) {
    await Deployment.findByIdAndUpdate(deploymentId, {
      $set: { status: DEPLOYMENT_STATUSES.FAILED, error: error.message, finishedAt: new Date() },
    });
    throw error;
  }
}