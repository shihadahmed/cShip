# Phase 2: Auth, Models, and GitHub Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement GitHub OAuth authentication with admin allowlist, secure session cookies with CSRF protection, encrypted GitHub token storage, Mongoose models (User, Project, Deployment), GitHub API integration endpoints, Project CRUD APIs, and the initial dashboard repository import UI.

**Architecture:** Pure JavaScript monorepo (server Express + client Next.js App Router). Server adds auth routes (`/api/auth/*`), GitHub API routes (`/api/github/*`), project routes (`/api/projects/*`), crypto utilities for AES-256-GCM token encryption, auth middleware, and three Mongoose models. Client adds login page, auth context, project list/creation UI, and repository/branch selection components.

**Tech Stack:** Express 4, Mongoose 8, Zod 4, `crypto` (native), `csurf` for CSRF, `express-session` with Mongo store, `axios` or `fetch` for GitHub API calls, React 19, Next.js 15, Tailwind 3.

**Spec:** `docs/superpowers/specs/2026-11-23-cship-design.md` (Phase 2 section)

---

## Global Constraints

- **Pure JavaScript only** — no TypeScript, no `.ts`/`.tsx` files, no Vite.
- **Node.js 20+** — use native `crypto` for encryption, no extra crypto deps.
- **cPanel/Passenger compatible** — all entrypoints are `server.js`; no custom binaries.
- **Sequential builds** — max 1 concurrent; `NODE_OPTIONS=--max-old-space-size=512`.
- **SSE headers** — `X-Accel-Buffering: no`, `Cache-Control: no-cache`.
- **Environment** — `SESSION_SECRET` (min 32 chars), `TOKEN_ENCRYPTION_KEY` (64 hex), `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`, `ADMIN_GITHUB_LOGINS` required in production; `MONGODB_URI` already required.
- **Security** — HTTP-only, Secure, SameSite=Lax cookies; CSRF tokens on all mutating routes; tokens encrypted at rest with AES-256-GCM.
- **Admin allowlist** — only GitHub logins in `ADMIN_GITHUB_LOGINS` may sign in.
- **No commits** — operator has not explicitly requested commits; working tree only.

---

## Review Focus

| Input / Condition | Expected Behavior |
|-------------------|-------------------|
| Invalid/expired GitHub OAuth `code` | OAuth callback returns 400 with clear error; no session created |
| Non-admin GitHub login | OAuth callback rejects with 403; no session created |
| Missing/invalid CSRF token on POST | 403 with `CSRF_ERROR` code; request not processed |
| Malformed/encrypted token in DB | Decryption throws; API returns 500 with `INTERNAL_ERROR` (no plaintext leaked) |
| Session cookie tampering | `express-session` invalidates; user logged out, no server crash |

Each item above gets a test in the task that owns the relevant code.

---

## File Map

### Server (new)

| Path | Responsibility |
|------|----------------|
| `server/src/lib/crypto.js` | AES-256-GCM encrypt/decrypt using `TOKEN_ENCRYPTION_KEY` |
| `server/src/middleware/auth.js` | Session check, `req.user` attachment, optional CSRF |
| `server/src/middleware/csrf.js` | CSRF token generation + validation (double-submit cookie) |
| `server/src/models/User.js` | Mongoose schema: githubId, login, name, avatarUrl, encryptedToken, admin, timestamps |
| `server/src/models/Project.js` | Mongoose schema: userId, name, repoFullName, defaultBranch, subdomain, envVars, timestamps |
| `server/src/models/Deployment.js` | Mongoose schema: projectId, commitSha, branch, status, logs, startedAt, finishedAt |
| `server/src/routes/auth.routes.js` | GET `/auth/github`, GET `/auth/github/callback`, POST `/auth/logout`, GET `/auth/me` |
| `server/src/routes/github.routes.js` | GET `/github/repos`, GET `/github/repos/:owner/:repo/branches`, GET `/github/repos/:owner/:repo/commits/:branch` |
| `server/src/routes/projects.routes.js` | CRUD for projects: list, create, get, update, delete |
| `server/src/services/github.js` | GitHub API client with token management (refresh via OAuth) |
| `server/src/validators/auth.js` | Zod schemas for auth callbacks, project input |
| `server/src/validators/github.js` | Zod schemas for GitHub API params |
| `server/src/validators/projects.js` | Zod schemas for project CRUD |
| `server/tests/crypto.test.js` | Encryption round-trip, tamper detection |
| `server/tests/auth.test.js` | OAuth flow, admin allowlist, logout, me endpoint |
| `server/tests/csrf.test.js` | CSRF token issuance, validation, rejection |
| `server/tests/github.test.js` | GitHub API client with mocked responses |
| `server/tests/projects.test.js` | Project CRUD with auth + validation |
| `server/tests/models/User.test.js` | User model: indexes, encryption hook, admin flag |
| `server/tests/models/Project.test.js` | Project model: indexes, ownership |
| `server/tests/models/Deployment.test.js` | Deployment model: indexes, status enum |

### Server (modified)

| Path | Change |
|------|--------|
| `server/src/app.js` | Mount auth, GitHub, projects routes; add session + CSRF middleware |
| `server/src/config/env.js` | Add production validation for `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, GitHub OAuth vars, `ADMIN_GITHUB_LOGINS` |
| `server/.env.example` | Uncomment Phase 2 vars with generation hints |

### Client (new)

| Path | Responsibility |
|------|----------------|
| `client/app/login/page.jsx` | Login page with "Sign in with GitHub" button |
| `client/app/(dashboard)/projects/page.jsx` | Project list + "New project" wizard (repo/branch select) |
| `client/app/(dashboard)/projects/new/page.jsx` | Multi-step wizard: select repo → select branch → configure |
| `client/components/ProjectCard.jsx` | Project summary card for list view |
| `client/components/RepoSelector.jsx` | Dropdown with search for GitHub repos |
| `client/components/BranchSelector.jsx` | Dropdown for branches + latest commit preview |
| `client/lib/auth.js` | `useAuth()` hook, `login()`, `logout()`, `fetchMe()` |
| `client/components/ui/Select.jsx` | Accessible select component for repo/branch pickers |

### Client (modified)

| Path | Change |
|------|--------|
| `client/app/(dashboard)/layout.jsx` | Wrap with auth provider; redirect unauthenticated to `/login` |
| `client/app/(dashboard)/page.js` | Add "New project" link when no projects exist |
| `client/components/topbar.jsx` | Show user avatar + logout button |
| `client/lib/api.js` | Add `fetchGitHubRepos()`, `fetchBranches()`, `fetchCommits()`, `createProject()`, etc. |
| `client/app/globals.css` | Add any new component styles |

---

## Tasks

### Task 1: Crypto Utility & Token Encryption

**Files:**
- Create: `server/src/lib/crypto.js`
- Test: `server/tests/crypto.test.js`

**Interfaces:**
- Consumes: `config.TOKEN_ENCRYPTION_KEY` (64 hex chars)
- Produces: `encrypt(plaintext: string) => { iv: string, ciphertext: string, tag: string }`, `decrypt({ iv, ciphertext, tag }) => string`

- [ ] **Step 1: Write failing test**

```js
test('encrypt/decrypt round-trip preserves data', () => {
  const { encrypt, decrypt } = await import('../src/lib/crypto.js');
  const data = 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
  const enc = encrypt(data);
  assert.ok(enc.iv && enc.ciphertext && enc.tag);
  const dec = decrypt(enc);
  assert.equal(dec, data);
});

test('tampered ciphertext throws', () => {
  const { encrypt, decrypt } = await import('../src/lib/crypto.js');
  const enc = encrypt('secret');
  enc.ciphertext = enc.ciphertext.slice(0, -1) + 'x';
  assert.throws(() => decrypt(enc), /auth tag/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --prefix server test -- tests/crypto.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `crypto.js`**

Use native `crypto.createCipheriv` / `createDecipheriv` with `aes-256-gcm`. Key = `Buffer.from(TOKEN_ENCRYPTION_KEY, 'hex')`. Generate 12-byte IV per encryption. Return base64-encoded iv, ciphertext, auth tag. Decrypt verifies tag; throw on mismatch.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --prefix server test -- tests/crypto.test.js`
Expected: PASS

- [ ] **Step 5: Run full server test suite**

Run: `npm --prefix server test`
Expected: All tests pass

---

### Task 2: Mongoose Models (User, Project, Deployment)

**Files:**
- Create: `server/src/models/User.js`
- Create: `server/src/models/Project.js`
- Create: `server/src/models/Deployment.js`
- Test: `server/tests/models/User.test.js`
- Test: `server/tests/models/Project.test.js`
- Test: `server/tests/models/Deployment.test.js`

**Interfaces:**
- Consumes: `crypto.encrypt/decrypt` (User), Mongoose connection (db.js)
- Produces: Three Mongoose models with indexes, hooks, and methods

- [ ] **Step 1: Write failing tests**

```js
// User.test.js
test('User encrypts token on save', async () => {
  const User = (await import('../src/models/User.js')).default;
  const user = new User({ githubId: 1, login: 'alice', encryptedToken: 'ghp_xxx' });
  await user.save();
  const saved = await User.findById(user._id);
  assert.notEqual(saved.encryptedToken, 'ghp_xxx'); // should be encrypted object
  assert.ok(saved.encryptedToken?.ciphertext);
});

test('User.admin derived from ADMIN_GITHUB_LOGINS', async () => {
  // mock config.adminGithubLogins = ['alice']
  const User = (await import('../src/models/User.js')).default;
  const user = new User({ githubId: 1, login: 'alice', encryptedToken: 't' });
  assert.equal(user.admin, true);
  const user2 = new User({ githubId: 2, login: 'bob', encryptedToken: 't' });
  assert.equal(user2.admin, false);
});

// Project.test.js
test('Project requires userId and repoFullName', async () => {
  const Project = (await import('../src/models/Project.js')).default;
  const p = new Project({ userId: new mongoose.Types.ObjectId() });
  await assert.rejects(p.validate(), /repoFullName/);
});

// Deployment.test.js
test('Deployment status enum constrained', async () => {
  const Deployment = (await import('../src/models/Deployment.js')).default;
  const d = new Deployment({ projectId: new mongoose.Types.ObjectId(), commitSha: 'abc', branch: 'main', status: 'invalid' });
  await assert.rejects(d.validate(), /status/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix server test -- tests/models/`
Expected: FAIL — models not found

- [ ] **Step 3: Implement models**

**User.js:** Fields: `githubId` (Number, unique, required), `login` (String, unique, required), `name`, `avatarUrl`, `encryptedToken` (Object: { iv, ciphertext, tag }, required), `admin` (Boolean, default false), timestamps. Pre-save hook: if `encryptedToken` is string, encrypt it using `crypto.encrypt`. Method `getDecryptedToken()` returns plaintext. Index on `githubId`, `login`.

**Project.js:** Fields: `userId` (ObjectId, ref User, required), `name` (String, required), `repoFullName` (String, required, e.g., "owner/repo"), `defaultBranch` (String, default "main"), `subdomain` (String, unique, sparse), `envVars` (Map<String,String>, default {}), timestamps. Index on `userId`, `repoFullName`.

**Deployment.js:** Fields: `projectId` (ObjectId, ref Project, required), `commitSha` (String, required), `branch` (String, required), `status` (Enum: 'queued'|'building'|'ready'|'failed'|'cancelled', default 'queued'), `logs` (String, default ''), `startedAt`, `finishedAt`, timestamps. Index on `projectId`, `status`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix server test -- tests/models/`
Expected: PASS

- [ ] **Step 5: Run full server test suite**

Run: `npm --prefix server test`
Expected: All tests pass

---

### Task 3: Session, CSRF, and Auth Middleware

**Files:**
- Create: `server/src/middleware/auth.js`
- Create: `server/src/middleware/csrf.js`
- Test: `server/tests/auth-middleware.test.js`
- Test: `server/tests/csrf.test.js`

**Interfaces:**
- Consumes: `config.SESSION_SECRET`, `config.CLIENT_ORIGIN`, `User` model
- Produces: `session` middleware, `csrf` middleware, `requireAuth` middleware, `optionalAuth` middleware

- [ ] **Step 1: Write failing tests**

```js
// csrf.test.js
test('CSRF token set on GET /api/csrf-token', async () => {
  const app = createApp({ ... });
  const res = await request(app).get('/api/csrf-token');
  assert.equal(res.status, 200);
  assert.ok(res.body.csrfToken);
  assert.ok(res.headers['set-cookie']?.some(c => c.startsWith('csrf_token=')));
});

test('POST without CSRF token returns 403', async () => {
  const app = createApp({ ... });
  const res = await request(app).post('/api/projects').send({});
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'CSRF_ERROR');
});

test('POST with valid CSRF header passes', async () => {
  // get token first, then post with header
});

// auth-middleware.test.js
test('requireAuth attaches req.user when session valid', async () => {
  const app = createApp({ registerRoutes(app) {
    app.get('/api/protected', requireAuth, (req, res) => res.json({ user: req.user.login }));
  }});
  // create session cookie for a user, then request
  const res = await request(app).get('/api/protected').set('Cookie', sessionCookie);
  assert.equal(res.status, 200);
  assert.equal(res.body.user, 'alice');
});

test('requireAuth returns 401 without session', async () => {
  const res = await request(app).get('/api/protected');
  assert.equal(res.status, 401);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix server test -- tests/auth-middleware.test.js tests/csrf.test.js`
Expected: FAIL — middleware not found

- [ ] **Step 3: Implement middleware**

**csrf.js:** Double-submit cookie pattern. GET `/api/csrf-token` sets `csrf_token` cookie (HttpOnly, Secure in prod, SameSite=Lax) and returns `{ csrfToken }`. Middleware `validateCsrf` checks `req.headers['x-csrf-token']` === `req.cookies.csrf_token`. Exempt GET, HEAD, OPTIONS.

**auth.js:** Use `express-session` with `MongoStore` (from `connect-mongo`). Session config: `secret: config.SESSION_SECRET`, `resave: false`, `saveUninitialized: false`, `cookie: { httpOnly: true, secure: config.isProduction, sameSite: 'lax', maxAge: 14*24*60*60*1000 }`. Middleware `requireAuth`: if `req.session.userId`, fetch User, attach `req.user`, else 401. `optionalAuth`: same but continues without user.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix server test -- tests/auth-middleware.test.js tests/csrf.test.js`
Expected: PASS

- [ ] **Step 5: Add `express-session` and `connect-mongo` to server deps**

Run: `npm --prefix server install express-session connect-mongo`
Update `server/package.json` accordingly.

- [ ] **Step 6: Run full server test suite**

Run: `npm --prefix server test`
Expected: All tests pass

---

### Task 4: Auth Routes (GitHub OAuth + Session)

**Files:**
- Create: `server/src/routes/auth.routes.js`
- Create: `server/src/validators/auth.js`
- Test: `server/tests/auth.test.js`
- Modify: `server/src/app.js` (mount auth routes)

**Interfaces:**
- Consumes: `config` (GitHub OAuth vars), `User` model, `crypto`, `requireAuth`, `validateCsrf`
- Produces: GET `/api/auth/github`, GET `/api/auth/github/callback`, POST `/api/auth/logout`, GET `/api/auth/me`

- [ ] **Step 1: Write failing tests**

```js
test('GET /api/auth/github redirects to GitHub OAuth', async () => {
  const app = createApp({ ... });
  const res = await request(app).get('/api/auth/github').redirects(0);
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /github\.com\/login\/oauth\/authorize/);
  assert.match(res.headers.location, /client_id=/);
  assert.match(res.headers.location, /redirect_uri=/);
  assert.match(res.headers.location, /scope=repo/);
  assert.match(res.headers.location, /state=/); // CSRF state
});

test('OAuth callback with invalid code returns 400', async () => {
  const app = createApp({ ... });
  const res = await request(app).get('/api/auth/github/callback?code=bad&state=valid');
  assert.equal(res.status, 400);
});

test('OAuth callback with non-admin login returns 403', async () => {
  // mock GitHub token exchange + user fetch returning non-admin login
  const res = await request(app).get('/api/auth/github/callback?code=valid&state=valid');
  assert.equal(res.status, 403);
});

test('OAuth callback for admin creates session and redirects to dashboard', async () => {
  // mock GitHub responses for admin user
  const res = await request(app).get('/api/auth/github/callback?code=valid&state=valid').redirects(0);
  assert.equal(res.status, 302);
  assert.match(res.headers.location, /\/$/); // redirect to dashboard
  assert.ok(res.headers['set-cookie']?.some(c => c.startsWith('connect.sid=')));
});

test('GET /api/auth/me returns user when authenticated', async () => {
  const res = await request(app).get('/api/auth/me').set('Cookie', sessionCookie);
  assert.equal(res.status, 200);
  assert.equal(res.body.user.login, 'alice');
});

test('POST /api/auth/logout destroys session', async () => {
  const res = await request(app).post('/api/auth/logout').set('Cookie', sessionCookie);
  assert.equal(res.status, 200);
  // subsequent /api/auth/me returns 401
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix server test -- tests/auth.test.js`
Expected: FAIL — routes not found

- [ ] **Step 3: Implement auth routes**

**validators/auth.js:** Zod schemas for callback query (`code`, `state`), logout body (empty).

**auth.routes.js:**
- GET `/auth/github`: Generate random `state`, store in session `oauthState`, redirect to `https://github.com/login/oauth/authorize?client_id=...&redirect_uri=...&scope=repo%20user:email&state=...`
- GET `/auth/github/callback`: Verify `state` matches session; exchange `code` for access token via `POST https://github.com/login/oauth/access_token`; fetch `GET https://api.github.com/user` with token; check `login` in `config.adminGithubLogins`; if not admin, 403; else upsert User (githubId, login, name, avatarUrl, encryptedToken via crypto.encrypt), set `req.session.userId = user._id`, redirect to `config.PUBLIC_SERVER_URL` or `/`.
- POST `/auth/logout`: `req.session.destroy()`, clear cookie, 200.
- GET `/auth/me`: `optionalAuth` middleware; if `req.user`, return `{ user: { login, name, avatarUrl, admin } }`, else 401.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix server test -- tests/auth.test.js`
Expected: PASS

- [ ] **Step 5: Mount routes in `app.js`**

Add `import { authRouter } from './routes/auth.routes.js';` and `app.use('/api/auth', authRouter);` after session/CSRF middleware.

- [ ] **Step 6: Run full server test suite**

Run: `npm --prefix server test`
Expected: All tests pass

---

### Task 5: GitHub API Service & Routes

**Files:**
- Create: `server/src/services/github.js`
- Create: `server/src/routes/github.routes.js`
- Create: `server/src/validators/github.js`
- Test: `server/tests/github.test.js`
- Modify: `server/src/app.js` (mount github routes)

**Interfaces:**
- Consumes: `User.getDecryptedToken()`, `config` (GitHub vars)
- Produces: `githubClient(user)` with `listRepos()`, `listBranches(owner, repo)`, `listCommits(owner, repo, branch)`; routes GET `/api/github/repos`, GET `/api/github/repos/:owner/:repo/branches`, GET `/api/github/repos/:owner/:repo/commits/:branch`

- [ ] **Step 1: Write failing tests**

```js
test('githubClient.listRepos returns repos for authenticated user', async () => {
  const github = await import('../src/services/github.js');
  const client = github.createClient({ getDecryptedToken: () => 'ghp_test' });
  // mock fetch to return [{ full_name: 'owner/repo', private: true, default_branch: 'main' }]
  const repos = await client.listRepos();
  assert.equal(repos[0].full_name, 'owner/repo');
});

test('githubClient handles 401 by throwing', async () => {
  // mock 401 response
  await assert.rejects(client.listRepos(), /401/);
});

test('GET /api/github/repos requires auth and returns repos', async () => {
  const res = await request(app).get('/api/github/repos').set('Cookie', sessionCookie);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.repos));
});

test('GET /api/github/repos/:owner/:repo/branches returns branches', async () => {
  const res = await request(app).get('/api/github/repos/owner/repo/branches').set('Cookie', sessionCookie);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.branches));
});

test('GET /api/github/repos/:owner/:repo/commits/:branch returns latest commit', async () => {
  const res = await request(app).get('/api/github/repos/owner/repo/commits/main').set('Cookie', sessionCookie);
  assert.equal(res.status, 200);
  assert.ok(res.body.commit.sha);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix server test -- tests/github.test.js`
Expected: FAIL — service/routes not found

- [ ] **Step 3: Implement GitHub service**

**services/github.js:** `createClient({ getDecryptedToken, baseUrl = 'https://api.github.com' })` returns object with `async listRepos()`, `async listBranches(owner, repo)`, `async listCommits(owner, repo, branch, perPage = 1)`. Uses `fetch` with `Authorization: Bearer ${token}`, `Accept: application/vnd.github+json`. Handles pagination for repos. Throws on non-2xx with status code.

**routes/github.routes.js:** All routes use `requireAuth`. GET `/repos` calls `client.listRepos()`. GET `/repos/:owner/:repo/branches` calls `client.listBranches()`. GET `/repos/:owner/:repo/commits/:branch` calls `client.listCommits()` and returns first commit.

**validators/github.js:** Zod schemas for route params (`owner`, `repo`, `branch`).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix server test -- tests/github.test.js`
Expected: PASS

- [ ] **Step 5: Mount routes in `app.js`**

Add `app.use('/api/github', githubRouter);` after auth routes.

- [ ] **Step 6: Run full server test suite**

Run: `npm --prefix server test`
Expected: All tests pass

---

### Task 6: Project CRUD Routes

**Files:**
- Create: `server/src/routes/projects.routes.js`
- Create: `server/src/validators/projects.js`
- Test: `server/tests/projects.test.js`
- Modify: `server/src/app.js` (mount projects routes)

**Interfaces:**
- Consumes: `Project` model, `requireAuth`, `validateCsrf`
- Produces: GET `/api/projects`, POST `/api/projects`, GET `/api/projects/:id`, PATCH `/api/projects/:id`, DELETE `/api/projects/:id`

- [ ] **Step 1: Write failing tests**

```js
test('GET /api/projects returns user projects', async () => {
  const res = await request(app).get('/api/projects').set('Cookie', sessionCookie);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.projects));
});

test('POST /api/projects creates project with valid data', async () => {
  const res = await request(app)
    .post('/api/projects')
    .set('Cookie', sessionCookie)
    .set('X-CSRF-Token', csrfToken)
    .send({ repoFullName: 'owner/repo', defaultBranch: 'main', name: 'My App' });
  assert.equal(res.status, 201);
  assert.equal(res.body.project.repoFullName, 'owner/repo');
  assert.equal(res.body.project.userId, userId);
});

test('POST /api/projects rejects missing repoFullName', async () => {
  const res = await request(app)
    .post('/api/projects')
    .set('Cookie', sessionCookie)
    .set('X-CSRF-Token', csrfToken)
    .send({ name: 'No Repo' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('GET /api/projects/:id returns project if owner', async () => {
  const res = await request(app).get(`/api/projects/${projectId}`).set('Cookie', sessionCookie);
  assert.equal(res.status, 200);
  assert.equal(res.body.project._id, projectId);
});

test('PATCH /api/projects/:id updates project if owner', async () => {
  const res = await request(app)
    .patch(`/api/projects/${projectId}`)
    .set('Cookie', sessionCookie)
    .set('X-CSRF-Token', csrfToken)
    .send({ name: 'Renamed' });
  assert.equal(res.status, 200);
  assert.equal(res.body.project.name, 'Renamed');
});

test('DELETE /api/projects/:id deletes project if owner', async () => {
  const res = await request(app)
    .delete(`/api/projects/${projectId}`)
    .set('Cookie', sessionCookie)
    .set('X-CSRF-Token', csrfToken);
  assert.equal(res.status, 204);
  // subsequent GET returns 404
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix server test -- tests/projects.test.js`
Expected: FAIL — routes not found

- [ ] **Step 3: Implement project routes**

**validators/projects.js:** Zod schemas: create (repoFullName string, name string optional, defaultBranch string optional), update (name?, defaultBranch?, envVars?).

**routes/projects.routes.js:** All routes `requireAuth`. GET `/` → `Project.find({ userId: req.user._id })`. POST `/` → `validateCsrf`, create Project with `userId: req.user._id`. GET `/:id` → find by id, verify `project.userId.equals(req.user._id)`. PATCH `/:id` → `validateCsrf`, update allowed fields. DELETE `/:id` → `validateCsrf`, delete if owner.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm --prefix server test -- tests/projects.test.js`
Expected: PASS

- [ ] **Step 5: Mount routes in `app.js`**

Add `app.use('/api/projects', projectsRouter);` after github routes.

- [ ] **Step 6: Run full server test suite**

Run: `npm --prefix server test`
Expected: All tests pass

---

### Task 7: Client Auth Context & Login Page

**Files:**
- Create: `client/app/login/page.jsx`
- Create: `client/lib/auth.js`
- Create: `client/components/auth/AuthProvider.jsx`
- Modify: `client/app/(dashboard)/layout.jsx` (wrap with provider)
- Modify: `client/components/topbar.jsx` (user avatar + logout)

**Interfaces:**
- Consumes: `/api/auth/me`, `/api/auth/github`, `/api/auth/logout`
- Produces: `useAuth()` hook returning `{ user, loading, login, logout }`

- [ ] **Step 1: Write failing client tests** (node --test for pure logic, or manual verification)

```js
// client/tests/auth.test.js (if adding client test runner)
test('useAuth fetches user on mount', async () => {
  // mock fetch for /api/auth/me
});
```

Since client uses Next.js, verify manually via browser after implementation.

- [ ] **Step 2: Implement `auth.js`**

```js
export async function fetchMe() {
  const res = await fetch('/api/auth/me', { credentials: 'include' });
  if (res.status === 401) return null;
  return res.json();
}
export async function login() { window.location.href = '/api/auth/github'; }
export async function logout() {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include', headers: { 'X-CSRRF-Token': getCsrfToken() } });
  window.location.href = '/login';
}
export function getCsrfToken() { /* read from meta tag or cookie */ }
```

**AuthProvider.jsx:** React context. On mount, call `fetchMe()`, set `user` state. Provide `{ user, loading, login, logout }`. If `loading` false and `!user` and not on `/login`, redirect to `/login`.

**login/page.jsx:** Simple page with "Sign in with GitHub" button calling `login()`. Show cShip branding.

**topbar.jsx:** If `user`, show avatar (`user.avatarUrl`), name, logout button.

- [ ] **Step 3: Update dashboard layout**

Wrap children with `<AuthProvider>` in `client/app/(dashboard)/layout.jsx`.

- [ ] **Step 4: Manual verification**

Run `npm --prefix client run dev` and `npm --prefix server run dev`. Visit `http://localhost:3000` → redirects to `/login` → click GitHub → OAuth flow → lands on dashboard with user avatar.

---

### Task 8: Client Project List & Import Wizard

**Files:**
- Create: `client/app/(dashboard)/projects/page.jsx`
- Create: `client/app/(dashboard)/projects/new/page.jsx`
- Create: `client/components/ProjectCard.jsx`
- Create: `client/components/RepoSelector.jsx`
- Create: `client/components/BranchSelector.jsx`
- Create: `client/components/ui/Select.jsx`
- Modify: `client/lib/api.js` (add GitHub/project API calls)
- Modify: `client/app/(dashboard)/page.js` (link to projects)

**Interfaces:**
- Consumes: `/api/github/repos`, `/api/github/repos/:owner/:repo/branches`, `/api/github/repos/:owner/:repo/commits/:branch`, `/api/projects` (CRUD)
- Produces: Project list page, 3-step wizard (repo → branch → create)

- [ ] **Step 1: Implement API helpers in `api.js`**

```js
export async function fetchRepos() { return fetchJson('/api/github/repos'); }
export async function fetchBranches(owner, repo) { return fetchJson(`/api/github/repos/${owner}/${repo}/branches`); }
export async function fetchLatestCommit(owner, repo, branch) { return fetchJson(`/api/github/repos/${owner}/${repo}/commits/${branch}`); }
export async function createProject(data) { return fetchJson('/api/projects', { method: 'POST', body: JSON.stringify(data), headers: { 'X-CSRF-Token': getCsrfToken() } }); }
export async function fetchProjects() { return fetchJson('/api/projects'); }
```

- [ ] **Step 2: Implement Project list page**

`projects/page.jsx`: Fetch projects on mount. Display grid of `ProjectCard` (name, repo, branch, "Deploy" button placeholder, "Delete" with confirmation). "New project" button links to `/projects/new`.

- [ ] **Step 3: Implement wizard — Step 1: Repo selection**

`projects/new/page.jsx`: Multi-step state (`step: 1|2|3`, `selectedRepo`, `selectedBranch`). Step 1: fetch repos via `fetchRepos()`, render `RepoSelector` (searchable select). On select, store `selectedRepo`, go to step 2.

- [ ] **Step 4: Implement wizard — Step 2: Branch selection**

Step 2: fetch branches for `selectedRepo` via `fetchBranches()`, render `BranchSelector` showing branch name + latest commit (fetch via `fetchLatestCommit()` for each). On select, go to step 3.

- [ ] **Step 5: Implement wizard — Step 3: Create project**

Step 3: Input for project name (default from repo). On submit, call `createProject({ repoFullName: selectedRepo.full_name, defaultBranch: selectedBranch, name })`. On success, redirect to `/projects`.

- [ ] **Step 6: Implement UI components**

`RepoSelector.jsx`, `BranchSelector.jsx`: Use `Select` component. `Select.jsx`: accessible native select with search filter (or simple select for Phase 2, enhance later).

`ProjectCard.jsx`: Card with project name, repo badge, branch, last deployment status (placeholder), delete button (calls DELETE `/api/projects/:id` with CSRF).

- [ ] **Step 7: Update overview page**

`page.js`: If `projects.length === 0`, show "Create your first project" button linking to `/projects/new`.

- [ ] **Step 8: Manual verification**

Run both dev servers. Sign in → visit `/projects` → empty state → click "New project" → select repo → select branch → name → create → appears in list.

---

### Task 9: Environment Validation & Docs Updates

**Files:**
- Modify: `server/src/config/env.js` (production validation for Phase 2 vars)
- Modify: `server/.env.example` (uncomment Phase 2 vars with hints)
- Modify: `docs/cpanel-deployment.md` (add Phase 2 deployment notes)
- Modify: `README.md` (update scripts/env table)

- [ ] **Step 1: Update `env.js`**

Add superRefine checks for production:
- `SESSION_SECRET` min 32
- `TOKEN_ENCRYPTION_KEY` 64 hex
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL` required
- `ADMIN_GITHUB_LOGINS` required, at least one

- [ ] **Step 2: Update `.env.example`**

Uncomment `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_CALLBACK_URL`, `ADMIN_GITHUB_LOGINS`. Add generation hint comments.

- [ ] **Step 3: Update deployment docs**

Add section: "Phase 2: GitHub OAuth & Project Import" with required env vars, callback URL setup in GitHub OAuth app, and allowlist configuration.

- [ ] **Step 4: Update README**

Add Phase 2 env vars to table, note `npm run dev` runs both servers.

- [ ] **Step 5: Run tests to verify env validation**

Run: `npm --prefix server test -- tests/env.test.js`
Expected: PASS (new validation tests pass)

---

### Task 10: Full Integration Verification

**Files:** None new

- [ ] **Step 1: Run full server test suite**

Run: `npm --prefix server test`
Expected: All tests pass (target: ~40+ tests)

- [ ] **Step 2: Run client lint and build**

Run: `npm --prefix client run lint && npm --prefix client run build`
Expected: Lint clean, build succeeds

- [ ] **Step 3: Run root test + lint**

Run: `npm test && npm run lint`
Expected: Server + client tests pass, both linters clean

- [ ] **Step 4: Manual end-to-end verification**

Start both dev servers. Complete OAuth flow. Create project via wizard. Verify project appears in list. Verify logout works.

- [ ] **Step 5: Update Phase 2 plan with verification record**

Add test counts, runtime results, and any deferred items to the plan doc.

---

## Deferred to Phase 3+

- Deployment engine (cPanel UAPI, subdomain provisioning, Passenger restart)
- Build queue with MongoDB-backed worker, supervised builds, SSE log streaming
- Deployment history, live console, redeploy/rollback
- Project settings, env editor, custom domains
- Release retention, rollback releases, audit log
- CSRF/rate limiting hardening (Phase 5)

---

## Execution Recommendation

**Recommendation: Subagent-driven development**

Because the tasks are sequential with strong interface dependencies (crypto → models → middleware → auth → GitHub → projects → client), and a mistake in an early task propagates silently to later ones, independent per-task review via subagents catches interface mismatches early. The overhead of fresh contexts is justified by the security-critical nature of auth and encryption.