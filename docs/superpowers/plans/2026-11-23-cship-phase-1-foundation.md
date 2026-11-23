# cShip Phase 1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a bootable, cPanel-ready monorepo foundation with a tested Express API, MongoDB connection lifecycle, and a polished Next.js dashboard shell that reports live engine status.

**Architecture:** Option A from the design: the deployment engine runs on the same cPanel account it manages. Express owns the API and future build worker; Next.js owns the dashboard; both expose Passenger-compatible `server.js` entrypoints that listen on `process.env.PORT`. Phase 1 proves the skeleton, not the deployment pipeline.

**Tech Stack:** Node.js 20+, Express 4, Mongoose 8, Zod 4, MongoDB Atlas, Next.js 15 App Router (JavaScript), React 19, Tailwind CSS 3, Geist fonts.

**Spec:** `docs/superpowers/specs/2026-11-23-cship-design.md`

## Global Constraints

- Pure JavaScript only. No `.ts`, `.tsx`, TypeScript, or Vite anywhere.
- `/client` and `/server` are independently deployable; no npm workspaces.
- Both apps must run under cPanel Node.js Selector / Phusion Passenger with `server.js` as the startup file.
- MongoDB is external (Atlas). Do not assume a local MongoDB service.
- Builds will be sequential, request-independent, and capped at 512 MB heap in Phase 3.
- SSE responses must disable buffering and compression in Phase 3.
- Do not commit unless the operator explicitly asks. The working tree is intentionally left uncommitted.

## Review Focus

- The server must boot and report `degraded` rather than crash when Atlas is configured but unreachable.
- The client must render a useful state when the API is offline; the system panel is the primary failure surface.
- The dashboard must not present disabled Phase 2 actions as if they work.
- Environment validation must fail fast in production without leaking secret values.
- The custom Next.js server must serve the production build under Passenger's `PORT` contract.

---

### Task 1: Monorepo scaffold and environment templates

**Files:**
- Create: `package.json`, `.gitignore`, `README.md`
- Create: `server/package.json`, `server/.env.example`, `server/.eslintrc.json`
- Create: `client/package.json`, `client/.env.example`, `client/.eslintrc.json`
- Create: `server/tmp/.gitkeep`, `client/tmp/.gitkeep`

**Interfaces:**
- Produces: root scripts `install:all`, `dev`, `build`, `test`, `lint`.
- Produces: independent server/client package manifests with Node `>=20`.

- [x] **Step 1: Create root and app manifests with pinned dependency versions.**
- [x] **Step 2: Add environment templates covering Mongo, GitHub, cPanel, build safety, and public API URL.**
- [x] **Step 3: Add root ignore rules for dependencies, builds, secrets, and the SDD workspace.**
- [x] **Step 4: Install root, server, and client dependencies.**
- [x] **Step 5: Verify installs succeed.**

Run: `npm install --prefix server` and `npm install --prefix client`
Expected: both finish with exit 0.

---

### Task 2: Server environment validation and structured logger

**Files:**
- Create: `server/src/config/env.js`
- Create: `server/src/lib/logger.js`
- Create: `server/src/lib/http-error.js`
- Test: `server/tests/env.test.js`

**Interfaces:**
- Produces: `loadEnv(source = process.env) -> config`; throws `EnvValidationError` with `issues`.
- Produces: `createLogger({ level, nodeEnv, bindings }) -> { debug, info, warn, error, child }`.
- Produces: `HttpError(status, message, code, details)`.
- Config adds derived `clientOrigins: string[]`, `adminGithubLogins: string[]`, `isProduction: boolean`.

- [x] **Step 1: Write failing tests for defaults, list parsing, invalid port, production Mongo requirement, valid production config, and malformed encryption key.**
- [x] **Step 2: Run tests to verify RED.**

Run: `npm --prefix server test`
Expected: FAIL with missing `src/config/env.js`.

- [x] **Step 3: Implement Zod schema, defaults, derived lists, and fail-fast production validation.**
- [x] **Step 4: Implement logger with level filtering, production JSON output, and sensitive-key redaction.**
- [x] **Step 5: Implement `HttpError`.**
- [x] **Step 6: Run tests to verify GREEN.**

Run: `npm --prefix server test`
Expected: 6/6 env tests pass.

---

### Task 3: Express HTTP surface, Mongo lifecycle, and Passenger entrypoint

**Files:**
- Create: `server/src/app.js`
- Create: `server/src/config/db.js`
- Create: `server/src/middleware/request-id.js`
- Create: `server/src/middleware/not-found.js`
- Create: `server/src/middleware/error-handler.js`
- Create: `server/src/routes/health.routes.js`
- Create: `server/server.js`
- Test: `server/tests/health.test.js`
- Test: `server/tests/not-found.test.js`
- Test: `server/tests/errors.test.js`
- Test: `server/tests/db.test.js`
- Test: `server/tests/helpers.js`

**Interfaces:**
- Produces: `createApp({ config, logger, registerRoutes }) -> Express app`.
- Produces: `getDatabaseStatus(state = mongoose.connection.readyState) -> 'disconnected' | 'connected' | 'connecting' | 'disconnecting' | 'unknown'`.
- Produces: `connectDatabase({ config, logger }) -> connection | null`; skips when no URI.
- Produces: `GET /api/health` response with `status`, `service`, `environment`, `uptime`, `timestamp`, `database`, and `build`.
- Produces: structured error envelope `{ error: { code, message, requestId } }`.
- Consumes: config and logger from Task 2.

- [x] **Step 1: Write failing tests for health, CORS, request IDs, 404, typed errors, hidden 500 details, and DB status mapping.**
- [x] **Step 2: Run tests to verify RED.**

Run: `npm --prefix server test`
Expected: FAIL with missing app/config modules.

- [x] **Step 3: Implement request ID, 404, and error middleware.**
- [x] **Step 4: Implement health route and Express app factory with Helmet, CORS allowlist, JSON limit, and trust proxy.**
- [x] **Step 5: Implement Mongoose connect/disconnect and health state mapping.**
- [x] **Step 6: Implement `server.js` and `src/start-server.js` with dotenv, listen-first startup, background DB retry with backoff, and graceful shutdown.**
- [x] **Step 7: Run tests and lint to verify GREEN.**

Run: `npm --prefix server test` and `npm --prefix server run lint`
Expected: 25/25 tests pass; ESLint exits 0.

- [x] **Step 8: Boot the API and verify live health output.**

Run: `$env:PORT=4100; node server.js` then `Invoke-RestMethod http://127.0.0.1:4100/api/health`
Expected: `status: ok`, `database.configured: false`, `build.memoryLimitMb: 512`.

---

### Task 4: Client scaffold, design tokens, and cPanel-ready Next.js server

**Files:**
- Create: `client/next.config.mjs`
- Create: `client/jsconfig.json`
- Create: `client/postcss.config.mjs`
- Create: `client/tailwind.config.js`
- Create: `client/server.js`
- Create: `client/app/layout.js`
- Create: `client/app/globals.css`
- Create: `client/app/not-found.js`
- Create: `client/app/error.js`
- Create: `client/app/(dashboard)/loading.js`
- Create: `client/lib/cn.js`, `client/lib/api.js`
- Create: `client/components/icons.jsx`
- Create: `client/components/ui/{panel,badge,button,status-dot}.jsx`

**Interfaces:**
- Produces: Tailwind theme tokens for `background`, `panel`, `raised`, `border`, `muted`, `accent`, `success`, `warning`, `danger`.
- Produces: `getApiBaseUrl()`, `fetchHealth({ signal })`.
- Produces: `cn(...values)`.
- Produces: `server.js` that serves the production build on `process.env.PORT` under Passenger.
- Produces: reusable `Panel`, `Badge`, `Button`, `StatusDot`, and icon set.

- [x] **Step 1: Create the Next.js App Router scaffold with JavaScript and Tailwind 3.**
- [x] **Step 2: Add the harbor-control design tokens, Geist fonts, blueprint background, and reduced-motion handling.**
- [x] **Step 3: Add the custom Passenger entrypoint and pin the output tracing root to the client app.**
- [x] **Step 4: Add shared UI primitives and icon components.**
- [x] **Step 5: Verify the production build.**

Run: `npm --prefix client run build`
Expected: exit 0; `/` and `/_not-found` prerendered.

- [x] **Step 6: Verify the custom server serves the build.**

Run: `$env:NODE_ENV='production'; $env:PORT=3100; node server.js` then `Invoke-WebRequest http://127.0.0.1:3100/`
Expected: HTTP 200 and HTML contains `cShip` and `Overview`.

---

### Task 5: Dashboard shell and live system status

**Files:**
- Create: `client/components/sidebar.jsx`
- Create: `client/components/topbar.jsx`
- Create: `client/components/theme-toggle.jsx`
- Create: `client/components/system-status.jsx`
- Create: `client/app/(dashboard)/layout.js`
- Create: `client/app/(dashboard)/page.js`

**Interfaces:**
- Consumes: `fetchHealth`, `getApiBaseUrl` from Task 4.
- Consumes: UI primitives from Task 4.
- Produces: `/` overview with projects empty state, deployment summary, live system panel, and Phase 2 roadmap.
- Produces: dark-first theme toggle with `localStorage` persistence.

- [x] **Step 1: Build the responsive sidebar/topbar shell with Phase 2 items visibly disabled.**
- [x] **Step 2: Build the overview stats, projects empty state, and deployment summary.**
- [x] **Step 3: Build the live system panel with 15-second polling, request timeout, latency, DB state, build limits, and honest Phase 3 placeholders.**
- [x] **Step 4: Build the theme toggle and no-flash theme script.**
- [x] **Step 5: Verify lint and build.**

Run: `npm --prefix client run lint` and `npm --prefix client run build`
Expected: ESLint exits 0; build exits 0.

- [x] **Step 6: Verify the integrated dashboard in a headless browser with both apps running.**
Expected: API row shows `Online` with latency; MongoDB shows `Not configured`; System badge shows `Live`.

---

### Task 6: Documentation and final verification

**Files:**
- Create: `README.md`
- Create: `docs/cpanel-deployment.md`

- [x] **Step 1: Write the quick-start README with structure, scripts, env setup, and phase roadmap.**
- [x] **Step 2: Write the cPanel runbook for both Passenger apps, Atlas, SSL, SSE, and shared-host limits.**
- [x] **Step 3: Run the full verification suite.**

Run:
```
npm --prefix server test
npm --prefix server run lint
npm --prefix client run lint
npm --prefix client run build
```
Expected: all tests pass, both linters exit 0, build exits 0.

- [x] **Step 4: Run a fresh-context review of the working tree and fix Critical/Important findings.**

Review fixes applied:
- Production now listens first and connects to Mongo in the background with exponential backoff; health stays reachable and reports `degraded` instead of the process exiting.
- Logger redacts sensitive keys, URI credentials, bearer tokens, query secrets, child bindings, and Error values.
- Error responses never expose internal 5xx codes, and request logs omit query strings.
- `.env.example` boots in development without placeholder secrets.
- Client clears stale health on failure, times out requests, prevents overlapping checks, and stops presenting Phase 3 telemetry as live.
- `install:all` installs root dependencies; `npm test` runs server and client tests.
- Client Passenger server binds `0.0.0.0` instead of an inherited `HOSTNAME`.

- [ ] **Step 5: Commit when the operator explicitly requests it.**

## Verification Record

- `server`: 25/25 tests pass; ESLint clean (tests included).
- `client`: 4/4 state tests pass; ESLint clean; Next.js production build succeeded.
- `server` runtime: health returned `ok`, 512 MB heap cap, 1 concurrent build, Mongo not configured.
- `server` production runtime: with Atlas unreachable, the process stayed up and `/api/health` returned `degraded`.
- `client` runtime: custom Passenger-style server served HTTP 200 with dashboard HTML.
- Integrated screenshot: API Online at 10 ms, System Live, MongoDB Not configured.

## Next Phase

Phase 2 adds the Mongoose models, GitHub OAuth, admin allowlist, encrypted token storage, project CRUD, and repository/branch/commit import. Phase 3 adds cPanel UAPI, webhook registration, the Mongo-backed build queue, and SSE log replay.
