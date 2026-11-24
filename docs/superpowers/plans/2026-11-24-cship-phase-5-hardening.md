# Phase 5: Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the cShip deployment platform with rate limiting, release retention, rollback functionality, audit logging, and comprehensive testing.

**Architecture:** Extends existing modules with security, reliability, and observability features. Follows the existing vertical-slice pattern.

**Tech Stack:** Express 4, Mongoose 8, Zod 4, Next.js 15 App Router, React 19, Tailwind CSS 3. Pure JavaScript only.

**Spec:** `docs/superpowers/specs/2026-11-23-cship-design.md` (Phase 5 section)

## Global Constraints

- **Pure JavaScript only** — no TypeScript, no `.ts`/`.tsx` files, no Vite
- **Node.js 20+** — use native `crypto` for encryption, no extra crypto deps
- **cPanel/Passenger compatible** — all entrypoints are `server.js`; no custom binaries
- **Sequential builds** — max 1 concurrent; `NODE_OPTIONS=--max-old-space-size=512`
- **SSE headers** — `X-Accel-Buffering: no`, `Cache-Control: no-cache`
- **Security** — HTTP-only, Secure, SameSite=Lax cookies; CSRF tokens on all mutating routes; tokens encrypted at rest with AES-256-GCM
- **Admin allowlist** — only GitHub logins in `ADMIN_GITHUB_LOGINS` may sign in
- **No commits** — operator has not explicitly requested commits; working tree only

## Review Focus

| Input / Condition | Expected Behavior |
|-------------------|-------------------|
| Exceed rate limit on auth endpoints | 429 with `RATE_LIMITED`; retry-after header |
| Exceed rate limit on webhook endpoint | 429 with `RATE_LIMITED`; webhook delivery retries |
| Release count exceeds retention limit | Oldest releases deleted automatically |
| Rollback to previous release | Switches `current` symlink to target release |
| Audit log entry created | Immutable record with user, action, resource, timestamp |
| Build failure injection | Simulated failures trigger proper error handling |

---

### Task 1: Rate Limiting Middleware & Configuration

**Files:**
- Create: `server/src/middleware/rate-limit.js`
- Modify: `server/src/config/env.js` — add rate limit config
- Modify: `server/src/app.js` — apply rate limiters
- Test: `server/tests/rate-limit.test.js`

**Interfaces:**
- Consumes: `config` (rate limit settings), Express request/response
- Produces: Rate limit headers, 429 responses when exceeded

- [ ] **Step 1: Write failing tests for rate limiting**

```js
// server/tests/rate-limit.test.js
test('rate limiter allows requests under limit', async () => {
  const app = await createTestApp();
  for (let i = 0; i < 5; i++) {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
  }
});

test('rate limiter blocks requests over limit', async () => {
  const app = await createTestApp();
  // Make requests up to limit
  for (let i = 0; i < 10; i++) {
    await request(app).get('/api/health');
  }
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 429);
  assert.equal(res.body.error.code, 'RATE_LIMITED');
  assert.ok(res.headers['retry-after']);
});

test('rate limiter applies different limits per endpoint group', async () => {
  const app = await createTestApp();
  // Auth endpoints should have stricter limits
  for (let i = 0; i < 3; i++) {
    const res = await request(app).post('/api/auth/github').send({});
    assert.notEqual(res.status, 429);
  }
  const res = await request(app).post('/api/auth/github').send({});
  assert.equal(res.status, 429);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix server test -- tests/rate-limit.test.js`
Expected: FAIL — middleware not implemented

- [ ] **Step 3: Implement `rate-limit.js` middleware**

Use `express-rate-limit` or custom implementation with:
- In-memory store (Redis not available on shared hosting)
- Separate limiters for: auth (strict), webhook (moderate), api (generous)
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After`
- Key generator: IP + user ID (when authenticated)

```js
// server/src/middleware/rate-limit.js
import { HttpError } from '../lib/http-error.js';

export function createRateLimiter({ windowMs, max, keyPrefix, message }) {
  const store = new Map();
  
  return async (req, res, next) => {
    const key = `${keyPrefix}:${getClientKey(req)}`;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    const hits = (store.get(key) || []).filter(t => t > windowStart);
    hits.push(now);
    store.set(key, hits);
    
    const remaining = Math.max(0, max - hits.length);
    res.set({
      'X-RateLimit-Limit': max,
      'X-RateLimit-Remaining': remaining,
      'X-RateLimit-Reset': new Date(now + windowMs).toISOString(),
    });
    
    if (hits.length > max) {
      res.set('Retry-After', Math.ceil(windowMs / 1000));
      throw new HttpError(429, message || 'Too many requests', { code: 'RATE_LIMITED' });
    }
    
    next();
  };
}

function getClientKey(req) {
  // Use user ID if authenticated, otherwise IP
  if (req.user?._id) return `user:${req.user._id}`;
  return `ip:${req.ip || req.connection.remoteAddress}`;
}

// Pre-configured limiters
export const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  keyPrefix: 'auth',
  message: 'Too many authentication attempts, please try again later',
});

export const webhookRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 webhooks per minute
  keyPrefix: 'webhook',
  message: 'Webhook rate limit exceeded',
});

export const apiRateLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  keyPrefix: 'api',
  message: 'API rate limit exceeded',
});
```

- [ ] **Step 4: Update `env.js` with rate limit config**

Add to env schema:
- `RATE_LIMIT_AUTH_MAX` (default: 5)
- `RATE_LIMIT_AUTH_WINDOW_MS` (default: 900000)
- `RATE_LIMIT_WEBHOOK_MAX` (default: 30)
- `RATE_LIMIT_WEBHOOK_WINDOW_MS` (default: 60000)
- `RATE_LIMIT_API_MAX` (default: 100)
- `RATE_LIMIT_API_WINDOW_MS` (default: 60000)

- [ ] **Step 5: Apply rate limiters in `app.js`**

```js
// Apply to auth routes
import { authRateLimiter } from './middleware/rate-limit.js';
app.use('/api/auth', authRateLimiter);

// Apply to webhook routes
import { webhookRateLimiter } from './middleware/rate-limit.js';
app.use('/api/webhooks', webhookRateLimiter);

// Apply to general API routes
import { apiRateLimiter } from './middleware/rate-limit.js';
app.use('/api', apiRateLimiter);
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm --prefix server test -- tests/rate-limit.test.js`
Expected: PASS

- [ ] **Step 7: Run full server test suite**

Run: `npm --prefix server test`
Expected: All tests pass

---

### Task 2: Release Retention Policy

**Files:**
- Modify: `server/src/services/deploy/releases.js` — add retention config
- Modify: `server/src/services/deploy/worker.js` — call cleanup after deployment
- Modify: `server/src/models/Project.js` — add `releaseRetention` field
- Test: `server/tests/releases.test.js`

**Interfaces:**
- Consumes: Project config (retention count), deployment completion
- Produces: Cleanup of old release directories

- [ ] **Step 1: Write failing tests for release retention**

```js
// server/tests/releases.test.js
test('cleanupOldReleases keeps only N most recent', async () => {
  const { createReleaseDir, cleanupOldReleases, listReleases } = await import('../src/services/deploy/releases.js');
  const projectDir = await setupTestProjectDir();
  
  // Create 7 releases
  for (let i = 0; i < 7; i++) {
    await createReleaseDir(projectDir);
    await sleep(10);
  }
  
  await cleanupOldReleases(projectDir, 3);
  const releases = await listReleases(projectDir, 10);
  assert.equal(releases.length, 3);
});

test('cleanupOldReleases called after successful deployment', async () => {
  // Integration test with worker
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix server test -- tests/releases.test.js`
Expected: FAIL — retention not implemented in worker

- [ ] **Step 3: Add `releaseRetention` field to Project model**

```js
// server/src/models/Project.js
releaseRetention: {
  type: Number,
  default: 5,
  min: 1,
  max: 20,
},
```

- [ ] **Step 4: Update worker to call cleanup after successful deployment**

In `worker.js` `runDeployment` function, after deployment succeeds:
```js
const retention = project.releaseRetention || 5;
await releases.cleanupOldReleases(projectDir, retention);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm --prefix server test -- tests/releases.test.js`
Expected: PASS

- [ ] **Step 6: Run full server test suite**

Run: `npm --prefix server test`
Expected: All tests pass

---

### Task 3: Rollback Releases Functionality

**Files:**
- Modify: `server/src/services/deploy/releases.js` — ensure rollback works
- Modify: `server/src/routes/deployments.routes.js` — add rollback endpoint
- Modify: `client/lib/api.js` — add rollback helper
- Modify: `client/app/(dashboard)/projects/[id]/page.jsx` — add rollback UI
- Test: `server/tests/deployments-rollback.test.js`

**Interfaces:**
- Consumes: Deployment ID, target release name
- Produces: Symlink switch, new deployment record with `trigger: 'rollback'`

- [ ] **Step 1: Write failing tests for rollback**

```js
// server/tests/deployments-rollback.test.js
test('POST /api/deployments/:projectId/rollback rolls back to release', async () => {
  const res = await request(app)
    .post(`/api/deployments/${projectId}/rollback`)
    .set('Cookie', sessionCookie)
    .set('X-CSRF-Token', csrfToken)
    .send({ releaseName: 'release-123' });
  assert.equal(res.status, 200);
  assert.equal(res.body.deployment.trigger, 'rollback');
});

test('Rollback creates new deployment with correct commit SHA', async () => {
  // Verify rollback deployment points to same commit as target release
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix server test -- tests/deployments-rollback.test.js`
Expected: FAIL — endpoint not implemented

- [ ] **Step 3: Add rollback endpoint to `deployments.routes.js`**

```js
// POST /api/deployments/:projectId/rollback
deploymentsRouter.post('/:projectId/rollback', validateCsrf, validate(projectIdSchema), validate(rollbackSchema), async (req, res, next) => {
  try {
    const { releaseName } = req.body;
    const project = await Project.findOne({ _id: req.params.projectId, userId: req.user._id });
    if (!project) return 404;
    
    const deploymentsRoot = config.DEPLOYMENTS_ROOT || resolve(process.cwd(), 'deployments');
    const projectDir = commands.getProjectDir(deploymentsRoot, project._id);
    
    // Activate the release
    await releases.activateRelease(projectDir, releaseName);
    
    // Restart Passenger app
    await commands.writeRestartTxt({ appPath: project.documentRoot, logger });
    
    // Create deployment record
    const deployment = new Deployment({
      project: project._id,
      trigger: 'rollback',
      commit: { sha: releaseName, message: `Rollback to ${releaseName}`, author: req.user.login, url: '' },
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
```

- [ ] **Step 4: Add rollback schema to `validators/deployments.js`**

```js
export const rollbackSchema = z.object({
  body: z.object({
    releaseName: z.string().min(1, 'Release name is required'),
  }),
});
```

- [ ] **Step 5: Add client-side rollback helper**

```js
// client/lib/api.js
export async function rollbackDeployment(projectId, releaseName) {
  return fetchJson(`/api/deployments/${projectId}/rollback`, {
    method: 'POST',
    body: JSON.stringify({ releaseName }),
  });
}
```

- [ ] **Step 6: Add rollback button to project detail page**

In `client/app/(dashboard)/projects/[id]/page.jsx`, add rollback button next to redeploy for ready/failed deployments.

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm --prefix server test -- tests/deployments-rollback.test.js`
Expected: PASS

- [ ] **Step 8: Run full server test suite**

Run: `npm --prefix server test`
Expected: All tests pass

---

### Task 4: Audit Log Model & Middleware

**Files:**
- Create: `server/src/models/AuditLog.js`
- Create: `server/src/middleware/audit-log.js`
- Modify: `server/src/routes/*.js` — add audit logging to mutating routes
- Test: `server/tests/audit-log.test.js`

**Interfaces:**
- Consumes: Request context (user, action, resource, metadata)
- Produces: Immutable audit log entries in MongoDB

- [ ] **Step 1: Write failing tests for audit log**

```js
// server/tests/audit-log.test.js
test('AuditLog model creates immutable entries', async () => {
  const AuditLog = (await import('../src/models/AuditLog.js')).default;
  const log = new AuditLog({
    userId: user._id,
    action: 'project.create',
    resource: 'project',
    resourceId: project._id,
    metadata: { name: project.name },
  });
  await log.save();
  // Should not be modifiable
});

test('Audit middleware logs project creation', async () => {
  const res = await request(app)
    .post('/api/projects')
    .set('Cookie', sessionCookie)
    .set('X-CSRF-Token', csrfToken)
    .send({ repoFullName: 'owner/repo', name: 'Test' });
  assert.equal(res.status, 201);
  
  const logs = await AuditLog.find({ action: 'project.create' });
  assert.equal(logs.length, 1);
  assert.equal(logs[0].resourceId.toString(), res.body.project._id);
});

test('Audit log entries cannot be deleted or modified', async () => {
  // Attempt to delete should fail or be ignored
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix server test -- tests/audit-log.test.js`
Expected: FAIL — model/middleware not implemented

- [ ] **Step 3: Create `AuditLog` model**

```js
// server/src/models/AuditLog.js
import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        'user.login', 'user.logout',
        'project.create', 'project.update', 'project.delete',
        'project.deploy', 'project.redeploy', 'project.rollback',
        'project.webhook.register', 'project.webhook.unregister',
        'settings.update',
      ],
    },
    resource: {
      type: String,
      required: true,
      enum: ['user', 'project', 'deployment', 'webhook', 'settings'],
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    ip: { type: String },
    userAgent: { type: String },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Immutable - no updatedAt
  }
);

auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ resource: 1, resourceId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

// Prevent updates
auditLogSchema.pre('findOneAndUpdate', function() {
  throw new Error('Audit logs are immutable');
});
auditLogSchema.pre('updateOne', function() {
  throw new Error('Audit logs are immutable');
});
auditLogSchema.pre('updateMany', function() {
  throw new Error('Audit logs are immutable');
});

export default mongoose.model('AuditLog', auditLogSchema);
```

- [ ] **Step 4: Create audit log middleware**

```js
// server/src/middleware/audit-log.js
import AuditLog from '../models/AuditLog.js';

export function createAuditMiddleware() {
  return async (req, res, next) => {
    const originalSend = res.send;
    res.send = function(body) {
      // Only log successful mutating requests
      if (['POST', 'PATCH', 'DELETE'].includes(req.method) && res.statusCode < 400) {
        const action = inferAction(req);
        if (action && req.user) {
          // Fire and forget - don't await
          AuditLog.create({
            userId: req.user._id,
            action,
            resource: inferResource(req),
            resourceId: inferResourceId(req, body),
            metadata: extractMetadata(req, body),
            ip: req.ip,
            userAgent: req.get('user-agent'),
          }).catch(err => console.error('Audit log failed:', err));
        }
      }
      return originalSend.call(this, body);
    };
    next();
  };
}

function inferAction(req) {
  const path = req.path;
  const method = req.method;
  
  if (path === '/api/auth/github' && method === 'GET') return 'user.login';
  if (path === '/api/auth/logout' && method === 'POST') return 'user.logout';
  if (path === '/api/projects' && method === 'POST') return 'project.create';
  if (path.match(/^\/api\/projects\/[^\/]+$/) && method === 'PATCH') return 'project.update';
  if (path.match(/^\/api\/projects\/[^\/]+$/) && method === 'DELETE') return 'project.delete';
  if (path.match(/^\/api\/projects\/[^\/]+\/webhook$/) && method === 'POST') return 'project.webhook.register';
  if (path.match(/^\/api\/projects\/[^\/]+\/webhook$/) && method === 'DELETE') return 'project.webhook.unregister';
  if (path.match(/^\/api\/deployments\/[^\/]+\/redeploy/) && method === 'POST') return 'project.redeploy';
  if (path.match(/^\/api\/deployments\/[^\/]+\/rollback/) && method === 'POST') return 'project.rollback';
  if (path.match(/^\/api\/deployments\/[^\/]+$/) && method === 'POST') return 'project.deploy';
  if (path.match(/^\/api\/projects\/[^\/]+\/settings/) && method === 'PATCH') return 'settings.update';
  
  return null;
}

function inferResource(req) {
  const path = req.path;
  if (path.startsWith('/api/projects')) return 'project';
  if (path.startsWith('/api/deployments')) return 'deployment';
  if (path.startsWith('/api/auth')) return 'user';
  return 'settings';
}

function inferResourceId(req, body) {
  // Try to extract from response body
  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    return parsed?.project?._id || parsed?.deployment?._id || parsed?.webhook?.id || req.params.id;
  } catch {
    return req.params.id;
  }
}

function extractMetadata(req, body) {
  // Extract relevant metadata for audit trail
  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    return {
      name: parsed?.project?.name,
      framework: parsed?.project?.framework,
      status: parsed?.deployment?.status,
      trigger: parsed?.deployment?.trigger,
    };
  } catch {
    return {};
  }
}
```

- [ ] **Step 5: Apply audit middleware in `app.js`**

```js
import { createAuditMiddleware } from './middleware/audit-log.js';
app.use(createAuditMiddleware());
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm --prefix server test -- tests/audit-log.test.js`
Expected: PASS

- [ ] **Step 7: Run full server test suite**

Run: `npm --prefix server test`
Expected: All tests pass

---

### Task 5: Integration Tests for Critical Paths

**Files:**
- Create: `server/tests/integration/*.test.js`
- Create: `client/tests/integration/*.test.js`

**Interfaces:**
- Consumes: Full application stack (Express + MongoDB + Next.js)
- Produces: End-to-end test coverage for critical user flows

- [ ] **Step 1: Create integration test for OAuth → Project Create → Deploy flow**

```js
// server/tests/integration/oauth-project-deploy.test.js
test('Full flow: OAuth login → create project → trigger deployment → verify ready', async () => {
  // 1. Mock GitHub OAuth
  // 2. Login and get session
  // 3. Create project via API
  // 4. Trigger manual deployment
  // 5. Wait for worker to process (or mock worker)
  // 6. Verify deployment status = ready
});
```

- [ ] **Step 2: Create integration test for Webhook → Auto-deploy flow**

```js
// server/tests/integration/webhook-deploy.test.js
test('GitHub webhook triggers deployment', async () => {
  // 1. Register webhook for project
  // 2. Send mock webhook payload
  // 3. Verify deployment queued
  // 4. Verify worker processes it
});
```

- [ ] **Step 3: Create integration test for Rollback flow**

```js
// server/tests/integration/rollback.test.js
test('Rollback switches to previous release', async () => {
  // 1. Create project with multiple deployments
  // 2. Call rollback endpoint
  // 3. Verify new deployment with trigger=rollback
  // 4. Verify current symlink points to target release
});
```

- [ ] **Step 4: Run integration tests**

Run: `npm --prefix server test -- tests/integration/`
Expected: PASS

---

### Task 6: Failure-Injection Tests for Build Resilience

**Files:**
- Create: `server/tests/failure-injection/*.test.js`

**Interfaces:**
- Consumes: Worker, commands, with injected failures
- Produces: Verified error handling and recovery

- [ ] **Step 1: Test git clone failure handling**

```js
// server/tests/failure-injection/git-failures.test.js
test('Worker handles git clone failure gracefully', async () => {
  // Mock git clone to fail
  // Verify deployment marked failed
  // Verify error logged
  // Verify queue lock released
});
```

- [ ] **Step 2: Test npm install failure handling**

```js
// server/tests/failure-injection/npm-failures.test.js
test('Worker handles npm install failure gracefully', async () => {
  // Mock npm install to fail
  // Verify deployment marked failed
  // Verify working copy preserved for debugging
});
```

- [ ] **Step 3: Test build command failure handling**

```js
// server/tests/failure-injection/build-failures.test.js
test('Worker handles build command failure gracefully', async () => {
  // Mock build command to fail
  // Verify deployment marked failed
  // Verify logs captured
});
```

- [ ] **Step 4: Test timeout handling**

```js
// server/tests/failure-injection/timeout.test.js
test('Worker kills process tree on timeout', async () => {
  // Mock long-running command
  // Verify process tree killed
  // Verify deployment marked failed with timeout error
});
```

- [ ] **Step 5: Test disk space / OOM handling**

```js
// server/tests/failure-injection/resource-exhaustion.test.js
test('Worker handles disk space exhaustion', async () => {
  // Simulate ENOSPC
  // Verify graceful failure
});
```

- [ ] **Step 6: Run failure-injection tests**

Run: `npm --prefix server test -- tests/failure-injection/`
Expected: PASS

---

### Task 7: Full Verification

- [ ] **Step 1: Run full server test suite**

Run: `npm --prefix server test`
Expected: All tests pass (including new rate-limit, releases, rollback, audit-log, integration, failure-injection tests)

- [ ] **Step 2: Run client lint and build**

Run: `npm --prefix client run lint && npm --prefix client run build`
Expected: Lint clean, build succeeds

- [ ] **Step 3: Run root test + lint**

Run: `npm test && npm run lint`
Expected: Server + client tests pass, both linters clean

- [ ] **Step 4: Manual end-to-end verification**

Start both dev servers. Test:
1. Rate limiting: exceed auth attempts → 429
2. Create project → verify audit log entry
3. Trigger deployment → verify completes
4. Rollback to previous release → verify works
5. Check release retention cleanup
6. Exceed webhook rate limit → 429

- [ ] **Step 5: Update plan with verification record**

Add test counts, runtime results, and any deferred items to this plan doc.