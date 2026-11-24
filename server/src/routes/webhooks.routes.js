import express from 'express';
import crypto from 'node:crypto';
import Deployment from '../models/Deployment.js';
import Project from '../models/Project.js';
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
  if (!signature || typeof signature !== 'string') return false;
  if (!Buffer.isBuffer(req.body)) return false;

  const expected = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(req.body)
    .digest('hex')}`;

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) return false;

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

webhooksRouter.post('/github', express.raw({ type: 'application/json' }), async (req, res, next) => {
  try {
    // X-GitHub-Hook-ID identifies the registered hook; X-GitHub-Delivery is a
    // per-delivery UUID used only for de-duplication.
    const hookId = req.headers['x-github-hook-id'];
    const project = hookId
      ? await Project.findOne({ 'webhook.id': String(hookId) })
      : null;
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

    const { ref, after: commitSha } = payload;
    const branch = ref.replace('refs/heads/', '');

    if (branch !== project.branch) {
      return res.status(200).json({ message: 'Branch mismatch, ignoring', branch, expected: project.branch });
    }

    const deployment = new Deployment({
      projectId: project._id,
      commitSha,
      branch,
      status: 'queued',
      webhook: {
        deliveryId,
        receivedAt: new Date(),
      },
    });

    try {
      await deployment.save();
    } catch (error) {
      // A concurrent delivery for the same event can race the pre-check.
      if (error?.code === 11000) {
        const existingDeployment = await Deployment.findOne({ 'webhook.deliveryId': deliveryId });
        return res.status(200).json({
          message: 'Already processed',
          deploymentId: existingDeployment?._id,
        });
      }
      throw error;
    }

    res.status(202).json({ message: 'Deployment queued', deploymentId: deployment._id });
  } catch (error) {
    next(error);
  }
});

webhooksRouter.get('/github', (req, res) => {
  res.json({ message: 'GitHub webhook endpoint. Use POST for deliveries.' });
});