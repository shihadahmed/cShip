import express from 'express';
import crypto from 'node:crypto';
import { requireAuth } from '../middleware/auth.js';
import { validateCsrf } from '../middleware/csrf.js';
import { projectIdSchema, createProjectSchema, updateProjectSchema } from '../validators/projects.js';
import { validate } from '../validators/validate.js';
import Project from '../models/Project.js';
import Deployment from '../models/Deployment.js';
import { createGitHubClient } from '../services/github/index.js';

export const projectsRouter = express.Router();

projectsRouter.use(requireAuth);

projectsRouter.get('/', async (req, res, next) => {
  try {
    const projects = await Project.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ projects });
  } catch (error) {
    next(error);
  }
});

projectsRouter.post('/', validateCsrf, validate(createProjectSchema), async (req, res, next) => {
  try {
    const { 
      repoFullName, name, defaultBranch, envVars, 
      framework, buildCommand, installCommand, startCommand, outputDirectory,
      subdomain, slug, branch, domain 
    } = req.body;

    const project = new Project({
      userId: req.user._id,
      repoFullName,
      name: name || repoFullName.split('/')[1],
      defaultBranch: defaultBranch || 'main',
      envVars: envVars ? new Map(Object.entries(envVars)) : new Map(),
      framework,
      buildCommand,
      installCommand,
      startCommand,
      outputDirectory,
      subdomain,
      slug,
      branch,
      domain,
    });

    await project.save();
    res.status(201).json({ project });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        error: { code: 'DUPLICATE_SUBDOMAIN', message: 'Subdomain already in use' },
      });
    }
    next(error);
  }
});

projectsRouter.get('/:id', validate(projectIdSchema), async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, userId: req.user._id }).lean();
    if (!project) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      });
    }

    // Mask env var values for security
    const maskedProject = { ...project };
    if (maskedProject.envVars) {
      const maskedEnvVars = {};
      for (const key of Object.keys(maskedProject.envVars)) {
        maskedEnvVars[key] = '••••••••';
      }
      maskedProject.envVars = maskedEnvVars;
    }

    // Never return webhook secret
    if (maskedProject.webhook) {
      maskedProject.webhook = {
        ...maskedProject.webhook,
        secret: undefined,
      };
    }

    res.json({ project: maskedProject });
  } catch (error) {
    next(error);
  }
});

projectsRouter.patch('/:id', validateCsrf, validate(projectIdSchema), validate(updateProjectSchema), async (req, res, next) => {
  try {
    const updates = { ...req.body };
    if (updates.envVars) {
      updates.envVars = new Map(Object.entries(updates.envVars));
    }

    // Check for duplicate subdomain/slug before updating
    if (updates.subdomain) {
      const existing = await Project.findOne({ subdomain: updates.subdomain, userId: req.user._id, _id: { $ne: req.params.id } });
      if (existing) {
        return res.status(409).json({
          error: { code: 'DUPLICATE_SUBDOMAIN', message: 'Subdomain already in use' },
        });
      }
    }
    if (updates.slug) {
      const existing = await Project.findOne({ slug: updates.slug, userId: req.user._id, _id: { $ne: req.params.id } });
      if (existing) {
        return res.status(409).json({
          error: { code: 'DUPLICATE_SUBDOMAIN', message: 'Slug already in use' },
        });
      }
    }

    const project = await Project.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { $set: updates },
      { new: true, runValidators: true }
    ).lean();

    if (!project) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      });
    }

    res.json({ project });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        error: { code: 'DUPLICATE_SUBDOMAIN', message: 'Subdomain already in use' },
      });
    }
    next(error);
  }
});

// POST /api/projects/:id/webhook — register GitHub webhook
projectsRouter.post('/:id/webhook', validateCsrf, validate(projectIdSchema), async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, userId: req.user._id });
    if (!project) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      });
    }

    const [owner, repo] = project.repoFullName.split('/');
    const webhookUrl = `${req.config.PUBLIC_SERVER_URL}/api/webhooks/github/${project._id}`;
    
    const github = createGitHubClient({
      getDecryptedToken: () => project.getDecryptedToken(),
      mock: req.config.NODE_ENV === 'test',
    });

    const hook = await github.createWebhook(owner, repo, {
      name: 'web',
      active: true,
      events: ['push'],
      config: {
        url: webhookUrl,
        content_type: 'json',
        secret: crypto.randomBytes(32).toString('hex'),
      },
    });

    project.webhook = {
      id: hook.id.toString(),
      secret: hook.config.secret,
      active: true,
    };
    await project.save();

    res.json({ webhook: { id: hook.id, url: webhookUrl, active: true } });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/projects/:id/webhook — unregister GitHub webhook
projectsRouter.delete('/:id/webhook', validateCsrf, validate(projectIdSchema), async (req, res, next) => {
  try {
    const project = await Project.findOne({ _id: req.params.id, userId: req.user._id });
    if (!project) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      });
    }

    if (!project.webhook?.id) {
      return res.status(400).json({
        error: { code: 'NO_WEBHOOK', message: 'No webhook registered for this project' },
      });
    }

    const [owner, repo] = project.repoFullName.split('/');
    
    const github = createGitHubClient({
      getDecryptedToken: () => project.getDecryptedToken(),
      mock: req.config.NODE_ENV === 'test',
    });

    await github.deleteWebhook(owner, repo, project.webhook.id);

    project.webhook = { id: '', secret: '', active: false };
    await project.save();

    res.json({ message: 'Webhook unregistered successfully' });
  } catch (error) {
    next(error);
  }
});

projectsRouter.delete('/:id', validateCsrf, validate(projectIdSchema), async (req, res, next) => {
  try {
    // Check for active deployments (queued or building)
    const activeDeployment = await Deployment.findOne({
      projectId: req.params.id,
      status: { $in: ['queued', 'building'] },
    });

    if (activeDeployment) {
      return res.status(409).json({
        error: { code: 'ACTIVE_DEPLOYMENT', message: 'Cannot delete project with active deployment' },
      });
    }

    const result = await Project.deleteOne({ _id: req.params.id, userId: req.user._id });
    if (result.deletedCount === 0) {
      return res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Project not found' },
      });
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});