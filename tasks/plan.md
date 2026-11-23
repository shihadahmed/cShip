# Implementation Plan: Complete Phase 2 & Start Phase 3

## Overview
Complete the remaining Phase 2 tasks (Auth routes, GitHub API routes, Project CRUD routes, Client auth UI, Client project management UI) and begin Phase 3 (cPanel UAPI, deployment engine, build queue, SSE streaming).

## Architecture Decisions
- **Vertical slices**: Each feature slice delivers end-to-end functionality (server route + client UI)
- **Security first**: Auth and encryption must be solid before building on top
- **cPanel-ready**: All entrypoints remain `server.js`, Passenger-compatible
- **Sequential builds**: Phase 3 will enforce single-build queue with 512MB heap cap

## Task List

### Phase 2A: Server Auth & GitHub Integration (Foundation for everything)
- [ ] **Task 2A.1**: Implement `server/src/routes/auth.routes.js` — GitHub OAuth flow (init, callback, logout, me)
- [ ] **Task 2A.2**: Implement `server/src/validators/auth.js` — Zod schemas for OAuth callback
- [ ] **Task 2A.3**: Implement `server/src/services/github.js` — GitHub API client with token management
- [ ] **Task 2A.4**: Implement `server/src/routes/github.routes.js` — GET repos/branches/commits (requireAuth)
- [ ] **Task 2A.5**: Implement `server/src/validators/github.js` — Zod schemas for GitHub route params
- [ ] **Task 2A.6**: Mount auth + github routes in `server/src/app.js` via `registerRoutes`
- [ ] **Task 2A.7**: Update `server/src/config/env.js` — production validation for Phase 2 vars
- [ ] **Task 2A.8**: Update `server/.env.example` — uncomment Phase 2 vars with generation hints

### Checkpoint: Phase 2A Server Auth Complete
- [ ] Server tests pass (all auth/github routes tested)
- [ ] Manual OAuth flow works against GitHub sandbox

### Phase 2B: Server Project CRUD
- [ ] **Task 2B.1**: Implement `server/src/routes/projects.routes.js` — full CRUD (requireAuth + CSRF on mutations)
- [ ] **Task 2B.2**: Implement `server/src/validators/projects.js` — Zod schemas for project create/update
- [ ] **Task 2B.3**: Mount projects routes in `server/src/app.js`
- [ ] **Task 2B.4**: Run full server test suite

### Checkpoint: Phase 2B Server Projects Complete
- [ ] All server tests pass (~40+ tests)
- [ ] Project CRUD works via API (tested manually)

### Phase 2C: Client Auth & Dashboard Integration
- [ ] **Task 2C.1**: Implement `client/lib/auth.js` — `fetchMe()`, `login()`, `logout()`, CSRF token handling
- [ ] **Task 2C.2**: Implement `client/components/auth/AuthProvider.jsx` — React context with auto-fetch + redirect
- [ ] **Task 2C.3**: Implement `client/app/login/page.jsx` — "Sign in with GitHub" button + branding
- [ ] **Task 2C.4**: Update `client/app/(dashboard)/layout.jsx` — wrap with AuthProvider, redirect unauthenticated
- [ ] **Task 2C.5**: Update `client/components/topbar.jsx` — user avatar, name, logout button
- [ ] **Task 2C.6**: Update `client/lib/api.js` — add `fetchGitHubRepos()`, `fetchBranches()`, `fetchCommits()`, `createProject()`, `fetchProjects()`

### Phase 2D: Client Project Management UI
- [ ] **Task 2D.1**: Implement `client/components/ui/Select.jsx` — accessible select with search filter
- [ ] **Task 2D.2**: Implement `client/components/RepoSelector.jsx` — searchable dropdown for repos
- [ ] **Task 2D.3**: Implement `client/components/BranchSelector.jsx` — dropdown with latest commit preview
- [ ] **Task 2D.4**: Implement `client/components/ProjectCard.jsx` — project summary card with delete action
- [ ] **Task 2D.5**: Implement `client/app/(dashboard)/projects/page.jsx` — project list + "New project" button
- [ ] **Task 2D.6**: Implement `client/app/(dashboard)/projects/new/page.jsx` — 3-step wizard (repo → branch → create)
- [ ] **Task 2D.7**: Update `client/app/(dashboard)/page.js` — "Create first project" CTA when empty

### Checkpoint: Phase 2 Complete (End-to-End)
- [ ] Client lint + build pass
- [ ] Root test + lint pass
- [ ] Manual E2E: OAuth → dashboard → create project → appears in list → logout works

### Phase 3A: cPanel UAPI Client & Core Services
- [ ] **Task 3A.1**: Implement `server/src/services/cpanel/uapi-client.js` — HTTPS client with auth, typed errors, capability detection
- [ ] **Task 3A.2**: Implement `server/src/services/cpanel/subdomains.js` — addsubdomain, list, resolve document roots
- [ ] **Task 3A.3**: Implement `server/src/services/cpanel/passenger.js` — register/edit/restart apps, capability fallback
- [ ] **Task 3A.4**: Implement `server/src/lib/queue.js` — Mongo-backed sequential queue with atomic claim
- [ ] **Task 3A.5**: Implement `server/src/lib/sse-hub.js` — SSE hub with persisted log replay, heartbeats, proxy headers

### Phase 3B: Deployment Worker & Webhooks
- [ ] **Task 3B.1**: Implement `server/src/services/deploy/worker.js` — supervised child process, git/npm/build, status transitions
- [ ] **Task 3B.2**: Implement `server/src/services/deploy/commands.js` — git fetch/checkout, npm ci, build command, output handling
- [ ] **Task 3B.3**: Implement `server/src/services/deploy/releases.js` — release directories, rollback, static vs Node presets
- [ ] **Task 3B.4**: Implement `server/src/routes/webhooks.routes.js` — GitHub push webhook, HMAC verification, dedupe
- [ ] **Task 3B.5**: Implement `server/src/routes/deployments.routes.js` — list, trigger manual, get logs (SSE), redeploy, rollback

### Phase 3C: Client Deployment UI
- [ ] **Task 3C.1**: Implement `client/components/DeploymentConsole.jsx` — live SSE log stream with reconnect/replay
- [ ] **Task 3C.2**: Implement `client/app/(dashboard)/projects/[id]/page.jsx` — project detail, deployment history, trigger
- [ ] **Task 3C.3**: Update `client/lib/api.js` — deployment CRUD, SSE connection, webhook registration

### Checkpoint: Phase 3 Core Complete
- [ ] Server tests pass (new modules tested)
- [ ] Client build passes
- [ ] Manual: webhook triggers build → logs stream → deployment Ready/Failed → rollback works

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| GitHub OAuth app not configured | Blocks Phase 2A testing | Use test values in .env.example; document setup |
| cPanel UAPI differences across versions | Phase 3A breaks on some hosts | Capability detection + manual fallback from start |
| MongoDB Atlas connection flaky in CI | Server tests timeout | Use mongodb-memory-server for unit tests; integration tests optional |
| SSE buffering by Passenger/proxy | Logs don't stream live | Implement all headers (X-Accel-Buffering: no, no-transform) + heartbeat from day 1 |
| Process tree kill on Windows | Build cleanup fails | Platform-specific kill logic; test early |

## Open Questions
- [ ] Exact `PassengerApps` UAPI parameter shape for target cPanel version (need to probe)
- [ ] Atlas change streams vs polling for SSE replay (depends on Atlas tier)
- [ ] Next.js standalone output vs custom server for Passenger (depends on Node version)

## Verification Gates
1. **After Phase 2A**: `npm --prefix server test` → all auth/github tests pass
2. **After Phase 2B**: `npm --prefix server test` → all server tests pass (~40+)
3. **After Phase 2D**: `npm --prefix client run lint && npm --prefix client run build` → clean
4. **After Phase 3A**: `npm --prefix server test` → new service tests pass
5. **After Phase 3C**: Full manual deployment cycle works