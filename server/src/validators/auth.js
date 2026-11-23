import { z } from 'zod';

export const githubCallbackSchema = z.object({
  query: z.object({
    code: z.string().min(1, 'OAuth code is required'),
    state: z.string().min(1, 'OAuth state is required'),
  }),
});

export const logoutSchema = z.object({
  body: z.object({}),
});

export const authStateSchema = z.object({
  query: z.object({
    state: z.string().min(1, 'State is required'),
  }),
});