import { authRouter } from './auth.routes.js';
import { githubRouter } from './github.routes.js';
import { projectsRouter } from './projects.routes.js';
import { webhooksRouter } from './webhooks.routes.js';
import { deploymentsRouter } from './deployments.routes.js';

export function registerRoutes(app) {
  app.use('/api/auth', authRouter);
  app.use('/api/github', githubRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/webhooks', webhooksRouter);
  app.use('/api/deployments', deploymentsRouter);
}