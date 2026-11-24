import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateCsrf } from '../middleware/csrf.js';
import { validate } from '../validators/validate.js';
import { projectIdSchema, deploymentIdSchema, createDeploymentSchema, redeploySchema, rollbackSchema } from '../validators/deployments.js';
import Deployment from '../models/Deployment.js';
import Project from '../models/Project.js';
import * as commands from '../services/deploy/commands.js';
import * as releases from '../services/deploy/releases.js';
import { resolve } from 'node:path';

export const deploymentsRouter = express.Router();

deploymentsRouter.use(requireAuth);

deploymentsRouter.get('/:projectId', validate(projectIdSchema), async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.projectId, userId: req.user._id }).lean();
    if (!project) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }

    const { status, limit = 50, skip = 0 } = req.query;
    const filter = { project: project._id };
    if (status) filter.status = status;

    const deployments = await Deployment.find(filter)
      .sort({ createdAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .lean();

    const total = await Deployment.countDocuments(filter);

    res.json({ deployments, total, page: Math.floor(skip / limit) + 1, pageSize: limit });
  } catch (error) {
    next(error);
  }
});

deploymentsRouter.get('/:projectId/:id', validate(deploymentIdSchema), async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.projectId, userId: req.user._id }).lean();
    if (!project) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }

    const deployment = await Deployment.findOne({ _id: req.params.id, project: project._id }).lean();
    if (!deployment) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Deployment not found' } });
    }

    res.json({ deployment });
  } catch (error) {
    next(error);
  }
});

deploymentsRouter.post('/:projectId', validate(projectIdSchema), validateCsrf, validate(createDeploymentSchema), async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.projectId, userId: req.user._id });
    if (!project) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }

    const { trigger = 'manual', commitSha, branch } = req.body;

    const targetSha = commitSha || project.lastDeploymentSha;
    const targetBranch = branch || project.branch;

    if (!targetSha) {
      return res.status(400).json({ error: { code: 'MISSING_COMMIT', message: 'No commit SHA provided and no last deployment found' } });
    }

    const deployment = new Deployment({
      project: project._id,
      trigger,
      commit: {
        sha: targetSha,
        message: 'Manual deployment',
        author: req.user.name || req.user.login,
        url: `${project.repoUrl}/commit/${targetSha}`,
      },
      branch: targetBranch,
      status: 'queued',
    });

    await deployment.save();

    req.app.locals.worker?.triggerDeployment({
      projectId: project._id,
      commitSha: targetSha,
      branch: targetBranch,
      trigger: 'manual',
    }).catch(err => {
      console.error('Failed to queue deployment:', err);
    });

    res.status(201).json({ deployment });
  } catch (error) {
    next(error);
  }
});

deploymentsRouter.post('/:projectId/redeploy', validate(projectIdSchema), validateCsrf, validate(redeploySchema), async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.projectId, userId: req.user._id });
    if (!project) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }

    const { deploymentId } = req.body;
    const previous = await Deployment.findOne({ _id: deploymentId, project: project._id }).lean();
    if (!previous) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Previous deployment not found' } });
    }

    const deployment = new Deployment({
      project: project._id,
      trigger: 'rollback',
      commit: previous.commit,
      branch: previous.branch,
      status: 'queued',
    });

    await deployment.save();

    req.app.locals.worker?.triggerDeployment({
      projectId: project._id,
      commitSha: previous.commit.sha,
      branch: previous.branch,
      trigger: 'rollback',
    }).catch(err => {
      console.error('Failed to queue rollback:', err);
    });

    res.status(201).json({ deployment });
  } catch (error) {
    next(error);
  }
});

deploymentsRouter.post('/:projectId/rollback', validate(projectIdSchema), validateCsrf, validate(rollbackSchema), async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.projectId, userId: req.user._id });
    if (!project) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }

    const { releaseName } = req.body;

    const deploymentsRoot = req.app.locals.config.DEPLOYMENTS_ROOT || resolve(process.cwd(), 'deployments');
    const projectDir = commands.getProjectDir(deploymentsRoot, project._id);

    // Verify the release exists
    const releaseList = await releases.listReleases(projectDir, 100);
    const targetRelease = releaseList.find(r => r.name === releaseName);
    if (!targetRelease) {
      return res.status(404).json({ error: { code: 'RELEASE_NOT_FOUND', message: `Release not found: ${releaseName}` } });
    }

    // Activate the release (switch symlink)
    await releases.activateRelease(projectDir, releaseName);

    // Restart Passenger app if document root exists
    if (project.documentRoot) {
      await commands.writeRestartTxt({ appPath: project.documentRoot, logger: req.app.locals.logger });
    }

    // Create deployment record for rollback
    const deployment = new Deployment({
      project: project._id,
      trigger: 'rollback',
      commit: {
        sha: releaseName,
        message: `Rollback to ${releaseName}`,
        author: req.user.name || req.user.login,
        url: '',
      },
      branch: project.branch,
      status: 'ready',
      finishedAt: new Date(),
    });

    await deployment.save();

    res.json({ deployment });
  } catch (error) {
    next(error);
  }
});

deploymentsRouter.get('/:projectId/:id/logs', validate(deploymentIdSchema), async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.projectId, userId: req.user._id }).lean();
    if (!project) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }

    const deployment = await Deployment.findOne({ _id: req.params.id, project: project._id }).lean();
    if (!deployment) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Deployment not found' } });
    }

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();

    const queue = req.app.locals.queue;
    if (queue) {
      const job = await queue.getJob(deployment._id);
      if (job) {
        res.write(`data: ${JSON.stringify({ type: 'history', logs: job.logs })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'complete', status: deployment.status })}\n\n`);
    res.end();
  } catch (error) {
    next(error);
  }
});

deploymentsRouter.delete('/:projectId/:id', validate(deploymentIdSchema), validateCsrf, async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.projectId, userId: req.user._id }).lean();
    if (!project) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }

    const result = await Deployment.deleteOne({ _id: req.params.id, project: project._id });
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Deployment not found' } });
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});