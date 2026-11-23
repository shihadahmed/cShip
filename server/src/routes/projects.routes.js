import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validateCsrf } from '../middleware/csrf.js';
import { projectIdSchema, createProjectSchema, updateProjectSchema } from '../validators/projects.js';
import { validate } from '../validators/validate.js';
import Project from '../models/Project.js';

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
    const { repoFullName, name, defaultBranch, envVars } = req.body;

    const project = new Project({
      userId: req.user._id,
      repoFullName,
      name: name || repoFullName.split('/')[1],
      defaultBranch: defaultBranch || 'main',
      envVars: envVars ? new Map(Object.entries(envVars)) : new Map(),
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
    res.json({ project });
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

projectsRouter.delete('/:id', validateCsrf, validate(projectIdSchema), async (req, res, next) => {
  try {
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