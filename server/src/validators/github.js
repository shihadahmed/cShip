import { z } from 'zod';

export const repoParamsSchema = z.object({
  params: z.object({
    owner: z.string().min(1, 'Owner is required').regex(/^[a-zA-Z0-9_.-]+$/, 'Invalid owner format'),
    repo: z.string().min(1, 'Repo is required').regex(/^[a-zA-Z0-9_.-]+$/, 'Invalid repo format'),
  }),
});

export const branchParamsSchema = z.object({
  params: z.object({
    owner: z.string().min(1, 'Owner is required').regex(/^[a-zA-Z0-9_.-]+$/, 'Invalid owner format'),
    repo: z.string().min(1, 'Repo is required').regex(/^[a-zA-Z0-9_.-]+$/, 'Invalid repo format'),
    branch: z.string().min(1, 'Branch is required').regex(/^[a-zA-Z0-9_.\/-]+$/, 'Invalid branch format'),
  }),
});