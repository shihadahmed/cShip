# Phase 4: Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a comprehensive project settings page with tabs for General, Build & Deploy, Domain, Environment Variables, Webhooks, and Danger Zone settings.

**Architecture:** Extend the existing Project model with missing fields from the design spec, update validators and routes, then build a client-side settings page with React state management for each section. Follows the existing vertical-slice pattern (server route + client UI).

**Tech Stack:** Express 4, Mongoose 8, Zod 4, Next.js 15 App Router, React 19, Tailwind CSS 3. Pure JavaScript only.

**Spec:** `docs/superpowers/specs/2026-11-23-cship-design.md` (Project data model, Phase 4 section)

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
| Invalid framework value in PATCH | 400 with `VALIDATION_ERROR`; only `nextjs`, `react`, `express`, `static` accepted |
| Subdomain collision on update | 409 with `DUPLICATE_SUBDOMAIN`; no partial update applied |
| Empty envVars object | Accepted; clears all env vars for project |
| Webhook secret not returned in GET | GET `/api/projects/:id` never returns webhook secret in plaintext |
| Delete project with active deployment | 409 with `ACTIVE_DEPLOYMENT`; project not deleted |

---

### Task 1: Extend Project Model with Design Spec Fields

**Files:**
- Modify: `server/src/models/Project.js`
- Test: `server/tests/models/Project.test.js`

**Interfaces:**
- Consumes: Mongoose connection, `crypto` for encryption (future)
- Produces: Extended `Project` model with all design spec fields

- [ ] **Step 1: Write failing tests for new fields**

```js
// server/tests/models/Project.test.js
test('Project accepts framework enum', async () => {
  const Project = (await import('../src/models/Project.js')).default;
  const p = new Project({ userId: new mongoose.Types.ObjectId(), repoFullName: 'owner/repo', framework: 'nextjs' });
  await p.validate(); // should pass
});

test('Project rejects invalid framework', async () => {
  const Project = (await import('../src/models/Project.js')).default;
  const p = new Project({ userId: new mongoose.Types.ObjectId(), repoFullName: 'owner/repo', framework: 'invalid' });
  await assert.rejects(p.validate(), /framework/);
});

test('Project accepts build/install/start commands and outputDirectory', async () => {
  const Project = (await import('../src/models/Project.js')).default;
  const p = new Project({
    userId: new mongoose.Types.ObjectId(),
    repoFullName: 'owner/repo',
    buildCommand: 'npm run build',
    installCommand: 'npm ci',
    startCommand: 'npm start',
    outputDirectory: '.next'
  });
  await p.validate(); // should pass
});

test('Project accepts passenger subdocument', async () => {
  const Project = (await import('../src/models/Project.js')).default;
  const p = new Project({
    userId: new mongoose.Types.ObjectId(),
    repoFullName: 'owner/repo',
    passenger: { registered: true, applicationName: 'myapp', baseUri: '/myapp' }
  });
  await p.validate(); // should pass
});

test('Project accepts webhook subdocument', async () => {
  const Project = (await import('../src/models/Project.js')).default;
  const p = new Project({
    userId: new mongoose.Types.ObjectId(),
    repoFullName: 'owner/repo',
    webhook: { id: '123', secret: 'encrypted', active: true }
  });
  await p.validate(); // should pass
});

test('Project accepts documentRoot and projectRoot', async () => {
  const Project = (await import('../src/models/Project.js')).default;
  const p = new Project({
    userId: new mongoose.Types.ObjectId(),
    repoFullName: 'owner/repo',
    documentRoot: '/home/user/public_html/myapp',
    projectRoot: '/home/user/deployments/myapp'
  });
  await p.validate(); // should pass
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix server test -- tests/models/Project.test.js`
Expected: FAIL — fields not defined in schema

- [ ] **Step 3: Extend `Project.js` model with all design spec fields**

Add fields to match design spec:
- `slug` (String, unique, sparse) — URL-friendly identifier
- `repo` (Object: fullName, htmlUrl, cloneUrl, defaultBranch) — replace `repoFullName` (keep for backward compat or migrate)
- `branch` (String) — separate from `defaultBranch`
- `framework` (Enum: 'nextjs', 'react', 'express', 'static', default: 'nextjs')
- `domain` (String) — custom domain
- `documentRoot` (String) — resolved cPanel document root
- `projectRoot` (String) — deployment working copy path
- `buildCommand` (String, default: 'npm run build')
- `installCommand` (String, default: 'npm ci')
- `startCommand` (String, default: 'npm start')
- `outputDirectory` (String, default: '.next')
- `passenger` (Object: registered, applicationName, baseUri)
- `webhook` (Object: id, secret, active)
- `lastDeployment` (ObjectId, ref Deployment)

Keep `repoFullName` for backward compatibility; add virtual or alias.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix server test -- tests/models/Project.test.js`
Expected: PASS

- [ ] **Step 5: Run full server test suite**

Run: `npm --prefix server test`
Expected: All tests pass

---

### Task 2: Update Project Validators for New Fields

**Files:**
- Modify: `server/src/validators/projects.js`
- Test: `server/tests/projects.test.js` (update existing tests)

**Interfaces:**
- Consumes: Extended Project model fields
- Produces: Zod schemas for create/update with new fields

- [ ] **Step 1: Write failing tests for new validation rules**

```js
// server/tests/projects.test.js - add to existing test file
test('PATCH /api/projects/:id accepts framework', async () => {
  const res = await request(app)
    .patch(`/api/projects/${projectId}`)
    .set('Cookie', sessionCookie)
    .set('X-CSRF-Token', csrfToken)
    .send({ framework: 'static' });
  assert.equal(res.status, 200);
  assert.equal(res.body.project.framework, 'static');
});

test('PATCH /api/projects/:id rejects invalid framework', async () => {
  const res = await request(app)
    .patch(`/api/projects/${projectId}`)
    .set('Cookie', sessionCookie)
    .set('X-CSRF-Token', csrfToken)
    .send({ framework: 'vue' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('PATCH /api/projects/:id accepts build/install/start commands', async () => {
  const res = await request(app)
    .patch(`/api/projects/${projectId}`)
    .set('Cookie', sessionCookie)
    .set('X-CSRF-Token', csrfToken)
    .send({ buildCommand: 'npm run build', installCommand: 'npm ci', startCommand: 'npm start', outputDirectory: 'dist' });
  assert.equal(res.status, 200);
  assert.equal(res.body.project.buildCommand, 'npm run build');
});

test('PATCH /api/projects/:id accepts subdomain', async () => {
  const res = await request(app)
    .patch(`/api/projects/${projectId}`)
    .set('Cookie', sessionCookie)
    .set('X-CSRF-Token', csrfToken)
    .send({ subdomain: 'myapp' });
  assert.equal(res.status, 200);
  assert.equal(res.body.project.subdomain, 'myapp');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix server test -- tests/projects.test.js`
Expected: FAIL — validators don't include new fields

- [ ] **Step 3: Update `projects.js` validators**

Add to `createProjectSchema` body (all optional):
- `framework`: z.enum(['nextjs', 'react', 'express', 'static']).optional()
- `buildCommand`: z.string().max(200).optional()
- `installCommand`: z.string().max(200).optional()
- `startCommand`: z.string().max(200).optional()
- `outputDirectory`: z.string().max(100).optional()
- `subdomain`: z.string().min(1).max(63).regex(/^[a-z0-9-]+$/).optional()
- `domain`: z.string().max(253).optional()
- `slug`: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/).optional()

Add to `updateProjectSchema` body (all optional):
- Same as above plus `branch`: z.string().max(100).optional()

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix server test -- tests/projects.test.js`
Expected: PASS

- [ ] **Step 5: Run full server test suite**

Run: `npm --prefix server test`
Expected: All tests pass

---

### Task 3: Update Project Routes for New Fields

**Files:**
- Modify: `server/src/routes/projects.routes.js`
- Test: `server/tests/projects.test.js` (ensure integration works)

**Interfaces:**
- Consumes: Extended Project model, updated validators
- Produces: PATCH route handles all new fields; GET returns all fields

- [ ] **Step 1: Ensure PATCH route passes through new fields**

The existing PATCH route uses `{ $set: updates }` which already passes through all validated fields. Verify no field filtering blocks new fields.

- [ ] **Step 2: Ensure GET route returns all new fields**

The existing GET route uses `.lean()` which returns all fields. Verify new fields are included.

- [ ] **Step 3: Add webhook management endpoints**

Add to `projects.routes.js`:
- POST `/api/projects/:id/webhook` — register webhook (calls GitHub API, stores encrypted secret)
- DELETE `/api/projects/:id/webhook` — unregister webhook

These already exist in `client/lib/api.js` as `registerWebhook`/`unregisterWebhook` — implement server side.

- [ ] **Step 4: Add active deployment check on DELETE**

Before deleting, check for deployments with status `queued` or `building`; return 409 if found.

- [ ] **Step 5: Run full server test suite**

Run: `npm --prefix server test`
Expected: All tests pass

---

### Task 4: Create Client Settings Page Layout & Navigation

**Files:**
- Create: `client/app/(dashboard)/projects/[id]/settings/page.jsx`
- Modify: `client/app/(dashboard)/projects/[id]/page.jsx` (add Settings tab/link)
- Create: `client/components/ui/tabs.jsx` (accessible tabs component)

**Interfaces:**
- Consumes: Project data from `/api/projects/:id`, `updateProject`, `registerWebhook`, `unregisterWebhook`
- Produces: Settings page with 6 tabs, each with form controls

- [ ] **Step 1: Create accessible Tabs component**

`client/components/ui/tabs.jsx` — Radix-style tabs with keyboard navigation, ARIA attributes.

- [ ] **Step 2: Create settings page shell with tabs**

Tabs: General, Build & Deploy, Domain, Environment, Webhooks, Danger Zone

- [ ] **Step 3: Add Settings link/tab to project detail page**

Update `client/app/(dashboard)/projects/[id]/page.jsx` to include navigation to settings.

- [ ] **Step 4: Manual verification**

Run dev servers; navigate to project detail → click Settings → tabs render.

---

### Task 5: Implement General Settings Tab

**Files:**
- Modify: `client/app/(dashboard)/projects/[id]/settings/page.jsx`
- Test: Manual verification

**Interfaces:**
- Consumes: `/api/projects/:id` (GET), `/api/projects/:id` (PATCH)
- Produces: Form for name, framework, branch

- [ ] **Step 1: Add General tab content**

Fields:
- Project name (text input)
- Framework (select: nextjs, react, express, static)
- Default branch (text input)
- Save button with CSRF token

- [ ] **Step 2: Connect to API**

Use `updateProject(id, data)` from `client/lib/api.js`

- [ ] **Step 3: Manual verification**

Change framework, save, refresh, verify persisted.

---

### Task 6: Implement Build & Deploy Settings Tab

**Files:**
- Modify: `client/app/(dashboard)/projects/[id]/settings/page.jsx`
- Test: Manual verification

**Interfaces:**
- Consumes: Same as General tab
- Produces: Form for build/install/start commands, output directory

- [ ] **Step 1: Add Build & Deploy tab content**

Fields:
- Install command (text, default: `npm ci`)
- Build command (text, default: `npm run build`)
- Start command (text, default: `npm start`)
- Output directory (text, default: `.next` for Next.js, `dist` for others)
- Framework-specific defaults hint

- [ ] **Step 2: Connect to API**

Use `updateProject(id, data)`

- [ ] **Step 3: Manual verification**

Change build command, save, verify persisted.

---

### Task 7: Implement Domain Settings Tab

**Files:**
- Modify: `client/app/(dashboard)/projects/[id]/settings/page.jsx`
- Test: Manual verification

**Interfaces:**
- Consumes: Same as General tab
- Produces: Form for subdomain, custom domain

- [ ] **Step 1: Add Domain tab content**

Fields:
- Subdomain (text, lowercase alphanumeric + hyphens, max 63 chars)
- Custom domain (text, optional)
- Show current document root (read-only, from project.documentRoot)
- Save button

- [ ] **Step 2: Add subdomain validation feedback**

Client-side regex validation matching server: `^[a-z0-9-]+$`

- [ ] **Step 3: Connect to API**

Use `updateProject(id, data)`

- [ ] **Step 4: Manual verification**

Set subdomain, save, verify persisted; test duplicate subdomain error.

---

### Task 8: Implement Environment Variables Tab

**Files:**
- Modify: `client/app/(dashboard)/projects/[id]/settings/page.jsx`
- Test: Manual verification

**Interfaces:**
- Consumes: Same as General tab
- Produces: Key-value editor for encrypted env vars

- [ ] **Step 1: Add Environment tab content**

UI: Key-value pair list with add/remove rows
- Each row: key (text), value (password input with toggle visibility)
- "Add variable" button
- Save button (sends entire envVars object)

- [ ] **Step 2: Handle encryption transparency**

Server encrypts values; client never sees plaintext after save. Show masked values (`••••••••`) with reveal toggle.

- [ ] **Step 3: Connect to API**

Use `updateProject(id, { envVars: { KEY: 'value' } })`

- [ ] **Step 4: Manual verification**

Add env var, save, refresh, verify masked value shown; toggle reveal shows plaintext (from server? No — server shouldn't return plaintext. Show only masked).

Note: GET `/api/projects/:id` should return envVars with masked values or keys only. Server needs to mask on read.

---

### Task 9: Implement Webhooks Tab

**Files:**
- Modify: `client/app/(dashboard)/projects/[id]/settings/page.jsx`
- Test: Manual verification

**Interfaces:**
- Consumes: `/api/projects/:id/webhook` (POST/DELETE), project.webhook data
- Produces: Webhook status, register/unregister buttons, secret display (once)

- [ ] **Step 1: Add Webhooks tab content**

Display:
- Webhook status: Active/Inactive
- Webhook URL: `${PUBLIC_SERVER_URL}/api/webhooks/github/:projectId`
- Webhook secret: Show once on creation, then masked
- Register button (calls POST `/api/projects/:id/webhook`)
- Unregister button (calls DELETE `/api/projects/:id/webhook`)

- [ ] **Step 2: Connect to API**

Use `registerWebhook(projectId)` and `unregisterWebhook(projectId)` from `client/lib/api.js`

- [ ] **Step 3: Manual verification**

Register webhook, verify secret shown once, verify GitHub webhook created (check GitHub repo settings).

---

### Task 10: Implement Danger Zone Tab

**Files:**
- Modify: `client/app/(dashboard)/projects/[id]/settings/page.jsx`
- Test: Manual verification

**Interfaces:**
- Consumes: `/api/projects/:id` (DELETE), check for active deployments
- Produces: Delete project with confirmation

- [ ] **Step 1: Add Danger Zone tab content**

UI:
- Warning text
- "Delete project" button (red, destructive)
- Confirmation modal: type project name to confirm
- On confirm: DELETE `/api/projects/:id`, redirect to `/projects`

- [ ] **Step 2: Handle active deployment check**

Server returns 409 if active deployment; show error message.

- [ ] **Step 3: Manual verification**

Create test project, add deployment, try delete → blocked. Complete/failed deployment → delete works.

---

### Task 11: Server-Side Env Var Masking & Webhook Secret Handling

**Files:**
- Modify: `server/src/routes/projects.routes.js`
- Test: `server/tests/projects.test.js`

**Interfaces:**
- Consumes: Project model with envVars Map
- Produces: GET masks env var values; webhook secret never returned

- [ ] **Step 1: Write failing tests**

```js
test('GET /api/projects/:id masks env var values', async () => {
  const res = await request(app).get(`/api/projects/${projectId}`).set('Cookie', sessionCookie);
  assert.equal(res.status, 200);
  // envVars should be object with keys but values masked
  assert.ok(res.body.project.envVars);
  Object.values(res.body.project.envVars).forEach(v => assert.equal(v, '••••••••'));
});

test('GET /api/projects/:id never returns webhook secret', async () => {
  const res = await request(app).get(`/api/projects/${projectId}`).set('Cookie', sessionCookie);
  assert.equal(res.status, 200);
  assert.ok(!res.body.project.webhook?.secret); // secret not in response
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix server test -- tests/projects.test.js`
Expected: FAIL

- [ ] **Step 3: Implement masking in GET route**

Transform `envVars` Map to object with masked values. Exclude `webhook.secret` from response.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix server test -- tests/projects.test.js`
Expected: PASS

---

### Task 12: Full Integration Verification

**Files:** None new

- [ ] **Step 1: Run full server test suite**

Run: `npm --prefix server test`
Expected: All tests pass

- [ ] **Step 2: Run client lint and build**

Run: `npm --prefix client run lint && npm --prefix client run build`
Expected: Lint clean, build succeeds

- [ ] **Step 3: Run root test + lint**

Run: `npm test && npm run lint`
Expected: Server + client tests pass, both linters clean

- [ ] **Step 4: Manual end-to-end verification**

Start both dev servers. Sign in. Create project. Navigate to settings. Test each tab:
1. General: change framework, save, refresh
2. Build & Deploy: change build command, save, refresh
3. Domain: set subdomain, save, verify
4. Environment: add env var, save, verify masked
5. Webhooks: register, verify secret shown once, unregister
6. Danger Zone: delete project with/without active deployment

- [ ] **Step 5: Update plan with verification record**

Add test counts, runtime results, and any deferred items to this plan doc.