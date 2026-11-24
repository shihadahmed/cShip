import { z } from 'zod';

export const projectIdSchema = z.object({
  params: z.object({
    projectId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid project ID'),
  }),
});

export const deploymentIdSchema = z.object({
  params: z.object({
    projectId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid project ID'),
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid deployment ID'),
  }),
});

export const createDeploymentSchema = z.object({
  body: z.object({
    trigger: z.enum(['manual', 'webhook', 'rollback']).default('manual'),
    commitSha: z.string().min(1).max(64).optional(),
    branch: z.string().min(1).max(100).optional(),
  }),
});

export const redeploySchema = z.object({
  body: z.object({
    deploymentId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid deployment ID'),
  }),
});

export const rollbackSchema = z.object({
  body: z.object({
    releaseName: z.string().min(1, 'Release name is required'),
  }),
});