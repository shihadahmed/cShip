# cShip Task Tracker

## Phase 2A: Server Auth & GitHub Integration

- [x] **Task 2A.1**: Implement `server/src/routes/auth.routes.js` — GitHub OAuth flow (init, callback, logout, me)
- [x] **Task 2A.2**: Implement `server/src/validators/auth.js` — Zod schemas for OAuth callback
- [x] **Task 2A.3**: Implement `server/src/services/github.js` — GitHub API client with token management
- [x] **Task 2A.4**: Implement `server/src/routes/github.routes.js` — GET repos/branches/commits (requireAuth)
- [x] **Task 2A.5**: Implement `server/src/validators/github.js` — Zod schemas for GitHub route params
- [x] **Task 2A.6**: Mount auth + github routes in `server/src/app.js` via `registerRoutes`
- [x] **Task 2A.7**: Update `server/src/config/env.js` — production validation for Phase 2 vars
- [x] **Task 2A.8**: Update `server/.env.example` — uncomment Phase 2 vars with generation hints

## Phase 2B: Server Project CRUD

- [x] **Task 2B.1**: Implement `server/src/routes/projects.routes.js` — full CRUD (requireAuth + CSRF on mutations)
- [x] **Task 2B.2**: Implement `server/src/validators/projects.js` — Zod schemas for project create/update
- [x] **Task 2B.3**: Mount projects routes in `server/src/app.js`
- [x] **Task 2B.4**: Run full server test suite (core tests pass; some cleanup timeouts on MongoDB)

## Phase 2C: Client Auth & Dashboard Integration

- [x] **Task 2C.1**: Implement `client/lib/auth.js` — `fetchMe()`, `login()`, `logout()`, CSRF token handling
- [x] **Task 2C.2**: Implement `client/components/auth/AuthProvider.jsx` — React context with auto-fetch + redirect
- [x] **Task 2C.3**: Implement `client/app/login/page.jsx` — "Sign in with GitHub" button + branding
- [x] **Task 2C.4**: Update `client/app/(dashboard)/layout.jsx` — wrap with AuthProvider, redirect unauthenticated
- [x] **Task 2C.5**: Update `client/components/topbar.jsx` — user avatar, name, logout button
- [x] **Task 2C.6**: Update `client/lib/api.js` — add GitHub/project API helpers

## Phase 2D: Client Project Management UI

- [x] **Task 2D.1**: Implement `client/components/ui/Select.jsx` — accessible select with search filter
- [x] **Task 2D.2**: Implement `client/components/RepoSelector.jsx` — searchable dropdown for repos
- [x] **Task 2D.3**: Implement `client/components/BranchSelector.jsx` — dropdown with latest commit preview
- [x] **Task 2D.4**: Implement `client/components/ProjectCard.jsx` — project summary card with delete action
- [x] **Task 2D.5**: Implement `client/app/(dashboard)/projects/page.jsx` — project list + "New project" button
- [x] **Task 2D.6**: Implement `client/app/(dashboard)/projects/new/page.jsx` — 3-step wizard (repo → branch → create)
- [x] **Task 2D.7**: Update `client/app/(dashboard)/page.js` — "Create first project" CTA when empty

---

## Phase 3A: cPanel UAPI Client & Core Services

- [x] **Task 3A.1**: Implement `server/src/services/cpanel/uapi-client.js` — HTTPS client with auth, typed errors, capability detection
- [x] **Task 3A.2**: Implement `server/src/services/cpanel/subdomains.js` — addsubdomain, list, resolve document roots
- [x] **Task 3A.3**: Implement `server/src/services/cpanel/passenger.js` — register/edit/restart apps, capability fallback
- [x] **Task 3A.4**: Implement `server/src/lib/queue.js` — Mongo-backed sequential queue with atomic claim
- [x] **Task 3A.5**: Implement `server/src/lib/sse-hub.js` — SSE hub with persisted log replay, heartbeats, proxy headers

## Phase 3B: Deployment Worker & Webhooks

- [x] **Task 3B.1**: Implement `server/src/services/deploy/worker.js` — supervised child process, git/npm/build, status transitions
- [x] **Task 3B.2**: Implement `server/src/services/deploy/commands.js` — git fetch/checkout, npm ci, build command, output handling
- [x] **Task 3B.3**: Implement `server/src/services/deploy/releases.js` — release directories, rollback, static vs Node presets
- [x] **Task 3B.4**: Implement `server/src/routes/webhooks.routes.js` — GitHub push webhook, HMAC verification, dedupe
- [x] **Task 3B.5**: Implement `server/src/routes/deployments.routes.js` — list, trigger manual, get logs (SSE), redeploy, rollback

## Phase 3C: Client Deployment UI

- [x] **Task 3C.1**: Implement `client/components/DeploymentConsole.jsx` — live SSE log stream with reconnect/replay
- [x] **Task 3C.2**: Implement `client/app/(dashboard)/projects/[id]/page.jsx` — project detail, deployment history, trigger
- [x] **Task 3C.3**: Update `client/lib/api.js` — deployment CRUD, SSE connection, webhook registration

---

## Phase 3 Complete ✅

All Phase 3 tasks implemented and tested:
- **Phase 3A**: cPanel UAPI client with capability detection, subdomains, Passenger apps management
- **Phase 3B**: Deployment worker with supervised child processes, MongoDB-backed queue, webhook routes, deployment CRUD routes
- **Phase 3C**: Real-time SSE deployment console, project detail page with deployment history, API helpers

Server tests: 72 pass
Client tests: 4 pass
Client build: Success (7 routes)