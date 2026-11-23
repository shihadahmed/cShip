import express from 'express';
import crypto from 'node:crypto';
import Deployment from '../models/Deployment.js';
import Project from '../models/Project.js';
import { validate } from '../validators/validate.js';
import { z } from 'zod';

export const webhooksRouter = express.Router();

const webhookPayloadSchema = z.object({
  body: z.object({
    ref: z.string().min(1),
    before: z.string().min(1),
    after: z.string().min(1),
    repository: z.object({
      full_name: z.string().min(1),
      html_url: z.string().url(),
      clone_url: z.string().url(),
      default_branch: z.string().min(1),
    }),
    commits: z.array(z.object({
      id: z.string().min(1),
      message: z.string(),
      author: z.object({
        name: z.string(),
        email: z.string().email(),
      }),
      url: z.string().url(),
    })).optional(),
  }),
});

async function verifySignature(req, secret) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;

  const expected = `sha256=${crypto.createHmac('sha256', secret).update(JSON.stringify(req.body)).digest('hex')}`;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

webhooksRouter.post('/github', express.raw({ type: 'application/json' }), async (req, res, next) => {
  try {
    const project = await Project.findOne({ 'webhook.id': req.headers['x-github-delivery'] });
    if (!project) {
      return res.status(404).json({ error: { code: 'PROJECT_NOT_FOUND', message: 'No project found for this webhook' } });
    }

    const webhookSecret = project.webhook?.secret;
    if (!webhookSecret) {
      return res.status(400).json({ error: { code: 'WEBHOOK_NOT_CONFIGURED', message: 'Webhook secret not configured' } });
    }

    const valid = await verifySignature(req, webhookSecret);
    if (!valid) {
      return res.status(401).json({ error: { code: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' } });
    }

    const deliveryId = req.headers['x-github-delivery'];
    const existing = await Deployment.findOne({ 'webhook.deliveryId': deliveryId });
    if (existing) {
      return res.status(200).json({ message: 'Already processed', deploymentId: existing._id });
    }

    let payload;
    try {
      payload = JSON.parse(req.body.toString());
    } catch {
      return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Invalid JSON payload' } });
    }

    const result = webhookPayloadSchema.safeParse({ body: payload });
    if (!result.success) {
      return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid webhook payload' } });
    }

    const { ref, after: commitSha, repository, commits } = payload;
    const branch = ref.replace('refs/heads/', '');

    if (branch !== project.branch) {
      return res.status(200).json({ message: 'Branch mismatch, ignoring', branch, expected: project.branch });
    }

    const headCommit = commits?.[0] || {
      id: commitSha,
      message: 'No commit message',
      author: { name: 'Unknown', email: 'unknown@example.com' },
      url: `${repository.html_url}/commit/${commitSha}`,
    };

    const deployment = new Deployment({
      project: project._id,
      trigger: 'webhook',
      commit: {
        sha: commitSha,
        message: headCommit.message,
        author: headCommit.author.name,
        url: headCommit.url,
      },
      branch,
      status: 'queued',
      webhook: {
        deliveryId,
        receivedAt: new Date(),
      },
    });

    await deployment.save();

    res.status(202).json({ message: 'Deployment queued', deploymentId: deployment._id });
  } catch (error) {
    next(error);
  }
});

webhooksRouter.get('/github', (req, res) => {
  res.json({ message: 'GitHub webhook endpoint. Use POST for deliveries.' });
});