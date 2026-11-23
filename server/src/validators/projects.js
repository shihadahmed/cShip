import { z } from 'zod';

export const projectIdSchema = z.object({
  params: z.object({
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid project ID'),
  }),
});

const optionalFields = {
  framework: z.enum(['nextjs', 'react', 'express', 'static']).optional(),
  buildCommand: z.string().max(200).optional(),
  installCommand: z.string().max(200).optional(),
  startCommand: z.string().max(200).optional(),
  outputDirectory: z.string().max(100).optional(),
  subdomain: z.string().min(1).max(63).regex(/^[a-z0-9-]+$/, 'Subdomain must be lowercase alphanumeric with hyphens').optional(),
  domain: z.string().max(253).optional(),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens').optional(),
  branch: z.string().max(100).optional(),
};

export const createProjectSchema = z.object({
  body: z.object({
    repoFullName: z.string().min(1, 'Repository full name is required').regex(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/, 'Invalid repository format (expected owner/repo)'),
    name: z.string().min(1, 'Project name is required').max(100).optional(),
    defaultBranch: z.string().min(1).max(100).optional(),
    envVars: z.record(z.string()).optional(),
    ...optionalFields,
  }),
});

export const updateProjectSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    defaultBranch: z.string().min(1).max(100).optional(),
    envVars: z.record(z.string()).optional(),
    ...optionalFields,
  }),
});