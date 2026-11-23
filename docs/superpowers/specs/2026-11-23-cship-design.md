# cShip Design

**Status:** Approved — Option A selected by the operator on 2026-11-23
**Scope:** Self-hosted, Vercel-like deployment control panel for a single cPanel account

## Intent

cShip lets one authorized administrator connect GitHub repositories to a cPanel account and deploy them to subdomains without manually creating directories, writing `.env` files, or restarting Passenger apps. It should feel like a small Vercel dashboard while respecting shared-hosting limits.

## Goals

- GitHub OAuth login restricted to an admin allowlist.
- Import repositories, pick a branch, configure build/start commands, env vars, and target subdomain.
- Provision subdomains and Passenger apps through cPanel UAPI.
- Register GitHub push webhooks and deploy on matching branch pushes.
- Run builds sequentially with a hard memory cap on the same cPanel account.
- Stream build logs to the browser over SSE, including replay after reconnect.
- Track projects, deployments, commit metadata, duration, and logs in MongoDB Atlas.
- Redeploy and roll back to a previous deployment.
- Remain deployable itself through cPanel Node.js Selector (Phusion Passenger).

## Non-goals

- Multi-tenant hosting or multiple cPanel accounts in v1.
- Docker, Kubernetes, or long-running external CI as the primary build path.
- Replacing cPanel's DNS, SSL, or email management.
- Supporting TypeScript or Vite anywhere in this repository.
- Real-time collaboration or non-admin users.

## Anti-goals

- A build that can exhaust the shared account's memory or leave orphaned processes.
- A webhook or build path that trusts unsigned payloads.
- Plaintext GitHub tokens or env values at rest.
- A UI that hides failures behind optimistic statuses.
- Silent divergence between the database record and the filesystem state.

## Constraints

- Pure JavaScript only (`.js`, `.jsx`). No TypeScript, no Vite.
- Monorepo: `/client` (Next.js App Router, React, Tailwind) and `/server` (Node.js, Express, Mongoose).
- Both apps must be cPanel-ready: Passenger-compatible entrypoints, `tmp/restart.txt` restart convention, environment-variable configuration.
- MongoDB is external (MongoDB Atlas). Standard cPanel accounts do not provide MongoDB.
- The engine runs on the same cPanel account it manages (Option A). cPanel UAPI is the control plane; `child_process` is the execution plane.
- Builds run asynchronously, outside the HTTP request lifecycle, one at a time.
- Build child processes receive `NODE_OPTIONS=--max-old-space-size=512` by default.
- SSE responses disable proxy buffering and compression.

## Architecture

### Runtime topology

```
Browser (admin)
   │  HTTPS
   ▼
Next.js dashboard (Passenger, cPanel subdomain)
   │  HTTPS + CORS + session cookie
   ▼
Express API + build worker (Passenger, cPanel subdomain)
   │                         │
   │ Mongoose                │ child_process (git, npm, build commands)
   ▼                         ▼
MongoDB Atlas          cPanel account filesystem
                             │
                             ├─ deployment working copies
                             ├─ project .env files
                             └─ public_html / Passenger app roots
   │
   └─ cPanel UAPI (subdomains, Passenger app registration, restarts)
```

### Why Option A

UAPI cannot execute arbitrary shell commands, so a remote-only control plane could not run `git pull`, `npm install`, or `npm run build` on the account. Co-locating the engine on the cPanel account makes the filesystem and child processes local, keeps UAPI for control-plane operations, and avoids a second deployable. The tradeoff is that the engine shares the account's memory and process limits, which the build queue and memory caps address.

### Core modules

1. **Auth** — GitHub OAuth, state validation, admin allowlist, encrypted GitHub token, HTTP-only session cookie, CSRF protection for mutating routes.
2. **GitHub** — repository/branch/commit listing, webhook registration, push event verification and deduplication.
3. **cPanel** — UAPI client with typed errors, capability detection, subdomain provisioning, Passenger app lifecycle, document-root resolution, restart.
4. **Projects** — CRUD, slug/path validation, env encryption, framework presets, domain mapping.
5. **Deployments** — Mongo-backed sequential queue, atomic job claim, process supervisor, log capture, status transitions, rollback.
6. **Streaming** — SSE hub with persisted log replay, heartbeats, and proxy-buffering headers.

## Data model

### User

- `githubId` (unique), `login`, `name`, `avatarUrl`, `email`
- `role` (`admin`)
- `githubAccessToken` (AES-256-GCM ciphertext + IV + auth tag)
- timestamps

### Project

- `name`, `slug` (unique), `owner` (User ref)
- `repo` (`fullName`, `htmlUrl`, `cloneUrl`, `defaultBranch`)
- `branch`
- `framework` (`nextjs`, `react`, `express`, `static`)
- `subdomain`, `domain`, `documentRoot`, `projectRoot`
- `buildCommand`, `installCommand`, `startCommand`, `outputDirectory`
- `passenger` (`registered`, `applicationName`, `baseUri`)
- `envVars` (encrypted map or encrypted serialized blob)
- `webhook` (`id`, `secret` encrypted, `active`)
- `lastDeployment` (Deployment ref), timestamps

### Deployment

- `project` (Project ref), `trigger` (`manual`, `webhook`, `rollback`)
- `commit` (`sha`, `message`, `author`, `url`)
- `status` (`Queued`, `Building`, `Ready`, `Failed`, `Cancelled`)
- `startedAt`, `finishedAt`, `durationMs`
- `logs` (bounded string or chunked log collection), `logBytes`
- `error` (code, message)
- `release` (path or identifier), timestamps

Indexes: `{ project: 1, createdAt: -1 }`, `{ status: 1, createdAt: 1 }`, unique `{ project: 1, commit.sha: 1 }` for idempotent webhook deploys.

## Deployment pipeline

1. Webhook or manual redeploy creates a `Queued` deployment.
2. Worker atomically claims the oldest queued deployment from Mongo (safe across Passenger workers).
3. Worker resolves the project, prepares the working copy, and writes the merged `.env` with mode `0600`.
4. Commands run through a supervised child process:
   - `git fetch --prune origin && git checkout --force <sha>` (or `git pull --ff-only` for the branch)
   - `npm ci` (fallback `npm install` when no lockfile)
   - configured build command
5. Static preset: copy output directory into the subdomain document root.
   Node presets: ensure the Passenger app points at the project root (or standalone output), restart via `tmp/restart.txt`.
6. Status transitions `Building → Ready | Failed`; logs are persisted incrementally and published to SSE subscribers.
7. On timeout or failure, terminate the process tree, record the error, and release the queue lock.

### Build safety

- One active build by default (`MAX_CONCURRENT_BUILDS=1`). Additional builds wait in Mongo.
- `NODE_OPTIONS=--max-old-space-size=${BUILD_MEMORY_MB}` (default 512).
- `CI=1`, `npm_config_audit=false`, `npm_config_fund=false`, `GIT_TERMINAL_PROMPT=0`.
- Default timeout 15 minutes; configurable per project.
- Process-tree termination: POSIX process group kill, Windows `taskkill /T /F`.
- Log cap per deployment (default 5 MB) with an explicit truncation marker.
- Interrupted `Building` records are marked `Failed` on engine startup.

## cPanel integration notes

- **UAPI client:** HTTPS to `CPANEL_URL` (usually `https://host:2083`), `Authorization: cpanel <username>:<token>`. Never log the token. Surface UAPI `status`/`errors` as typed failures.
- **Subdomains:** call `SubDomain::addsubdomain` with the target domain, root domain, and document-root directory. Resolve document roots from `DomainInfo` instead of hardcoding `public_html`. Handle "already exists" idempotently. DNS/SSL propagation is asynchronous; the UI must show pending state.
- **Passenger apps:** use `PassengerApps` UAPI where available to register/edit/restart apps. Capability-detect at startup. If the module is unavailable on the host, fall back to a documented manual registration step and still manage files, env, and `tmp/restart.txt`. cPanel versions differ here; do not assume a single API shape.
- **Restart:** write/touch `<appRoot>/tmp/restart.txt`. Verify the app responds after restart; restart alone does not prove a successful deploy.
- **Paths:** all project paths must stay under `DEPLOYMENTS_ROOT`; reject `..`, absolute paths, and symlink escapes. Use the cPanel user's home, not a hardcoded username.
- **Env:** write `.env` into the project root with `0600`. For Next.js, also ensure runtime values are available to the server process; where the host exposes Passenger app env vars, set them through the API as a second path.
- **Static preset:** no Passenger app is needed; copy build output into the subdomain document root and preserve the previous release for rollback.
- **Next.js on Passenger:** use a custom Node entrypoint or standalone output. `next build` must complete before restart. A missing `.next` directory is a deploy failure, not a successful restart.

## SSE through cPanel

- Endpoint headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`, `X-Accel-Buffering: no`.
- Call `res.flushHeaders()` and write an initial comment plus a heartbeat every 15 seconds.
- Disable compression for the stream; `no-transform` prevents proxy rewriting.
- Send `id:` per event and support `Last-Event-ID` replay from persisted logs.
- Auth via the admin session cookie or a short-lived signed stream ticket (EventSource cannot set custom headers).
- Because Passenger may run multiple app processes, do not rely on an in-memory-only log bus. Persist logs and replay from Mongo; optionally use Atlas change streams, otherwise poll incrementally.
- Builds continue independently of any connected browser; closing the console does not cancel a deployment.

## Security

- Admin allowlist by GitHub login and immutable GitHub user id.
- OAuth `state` validation; short-lived session cookie with `HttpOnly`, `Secure`, `SameSite=Lax`.
- AES-256-GCM encryption for GitHub tokens, webhook secrets, and env values; key from `TOKEN_ENCRYPTION_KEY`, never logged.
- Webhook HMAC verification on the raw body; delivery-id idempotency.
- CSRF tokens or strict same-site cookies plus origin checks on mutating routes.
- Helmet, CORS allowlist, request IDs, rate limiting on auth and webhook endpoints.
- No secrets in logs; redact env values and authorization headers.
- Deployment commands are admin-authored code execution by design. Validate project slugs and paths; never interpolate user input into shell commands without a controlled argv or explicit shell policy.
- MongoDB Atlas: TLS, least-privilege database user, restricted IP access where the host's egress allows it.

## Edge cases and mitigations

| Edge case | Mitigation |
|---|---|
| UAPI token lacks subdomain or Passenger permissions | Capability probe at startup; show actionable error with required permissions |
| `PassengerApps` UAPI missing on host | Manual-registration fallback; cShip still owns files/env/restart |
| Subdomain already exists or DNS not propagated | Idempotent create; pending domain state; verification polling |
| Shared RAM exhausted during build | Single-build queue, 512 MB heap cap, timeout, process-tree kill, log cap |
| Two Passenger workers run the queue twice | Atomic Mongo claim and unique deployment/commit index |
| cShip restarts mid-build | Mark interrupted builds failed; queued jobs resume; logs persisted |
| Webhook retries duplicate a deployment | Delivery-id dedupe and unique `(project, commit.sha)` guard |
| GitHub token expires/revoked | Detect 401, mark integration unhealthy, prompt re-auth |
| Git checkout has local changes or wrong branch | Force clean checkout of the requested SHA; never deploy a dirty tree |
| Static output directory missing | Fail the deployment with the expected path in the error |
| `.env` values contain newlines/quotes | Serialize with proper escaping; reject invalid keys; never shell-interpolate |
| Proxy buffers SSE | `X-Accel-Buffering: no`, `no-transform`, heartbeat, compression disabled |
| Passenger buffers SSE | Flush headers and heartbeat; verify with a real proxied request |
| Path traversal via project name/slug | Slug allowlist, resolved-path containment checks, symlink checks |
| Account home path unknown | Resolve from UAPI/`HOME`, never hardcode `/home/user` |
| Next.js build OOM | Heap cap, sequential builds, external artifact sync as a later preset option |
| Mongo Atlas unreachable from cPanel | Clear degraded health state; connection retry with backoff; documented egress requirement |
| Rollback to an older commit | Rebuild from SHA in an isolated release directory, then switch; keep last N releases |
| Delete project with active deployment | Block deletion or cancel/terminate first; require typed confirmation |

## Visual direction (Phase 1)

**Concept:** "Harbor control" — a calm instrument panel for a small fleet, not a generic SaaS card grid. The dashboard is list-first, with a narrow system rail that reads like equipment telemetry. A faint blueprint grid and a single sea-glass accent carry the identity; amber is reserved for degraded states.

**Tokens**

- Dark: ink `#0A0F16`, panel `#111823`, raised `#161F2B`, border `#263241`, text `#E7ECF2`, muted `#8693A3`, accent `#1FD1A0`, warning `#F4B942`, danger `#F16A6A`.
- Light: paper `#F8F7F3`, panel `#FFFFFF`, border `#DDE2E8`, text `#111823`, muted `#5B6675`, accent `#0F7A66`, warning `#B45309`, danger `#C24141`.
- Type: Geist Sans for UI, Geist Mono for commit hashes, log output, and numeric readouts only.
- Layout: 248px left rail, 64px top bar, main list column plus 320px system rail; 10px radius on panels, 6px on controls; hairline borders; one restrained page-load reveal; reduced-motion respected.
- Avoid: identical rounded cards for every section, gradient washes, all-caps eyebrow labels, decorative numbered markers.

## Folder tree

```
cship/
├─ package.json                         # root scripts only; no workspaces
├─ .gitignore
├─ README.md
├─ docs/
│  ├─ cpanel-deployment.md
│  └─ superpowers/
│     ├─ specs/2026-11-23-cship-design.md
│     └─ plans/2026-11-23-cship-phase-1-foundation.md
├─ server/
│  ├─ package.json
│  ├─ .env.example
│  ├─ server.js                         # Passenger/Node entrypoint
│  ├─ tmp/.gitkeep                      # touch tmp/restart.txt
│  ├─ src/
│  │  ├─ app.js                         # Express app factory
│  │  ├─ start-server.js                # listen-first startup + DB retry
│  │  ├─ config/
│  │  │  ├─ env.js                      # zod validation
│  │  │  └─ db.js                       # Mongoose connection
│  │  ├─ lib/
│  │  │  ├─ logger.js
│  │  │  ├─ http-error.js
│  │  │  ├─ crypto.js                   # Phase 2
│  │  │  ├─ queue.js                    # Phase 3
│  │  │  └─ sse-hub.js                  # Phase 3
│  │  ├─ middleware/
│  │  │  ├─ request-id.js
│  │  │  ├─ not-found.js
│  │  │  ├─ error-handler.js
│  │  │  └─ auth.js                     # Phase 2
│  │  ├─ models/                        # Phase 2: user, project, deployment
│  │  ├─ services/
│  │  │  ├─ github/                     # Phase 2: oauth, api, webhooks
│  │  │  ├─ cpanel/                     # Phase 3: uapi client, subdomains, passenger
│  │  │  └─ deploy/                     # Phase 3: worker, commands, releases
│  │  ├─ routes/
│  │  │  ├─ health.routes.js
│  │  │  ├─ auth.routes.js              # Phase 2
│  │  │  ├─ projects.routes.js          # Phase 2/3
│  │  │  ├─ deployments.routes.js       # Phase 3
│  │  │  ├─ webhooks.routes.js          # Phase 3
│  │  │  └─ settings.routes.js          # Phase 4
│  │  └─ validators/                    # Phase 2
│  └─ tests/
│     ├─ env.test.js
│     ├─ app.test.js
│     ├─ health.test.js
│     ├─ not-found.test.js
│     ├─ errors.test.js
│     ├─ logger.test.js
│     ├─ startup.test.js
│     └─ db.test.js
└─ client/
   ├─ package.json
   ├─ next.config.mjs
   ├─ jsconfig.json
   ├─ postcss.config.mjs
   ├─ tailwind.config.js
   ├─ server.js                         # Passenger/Next custom server
   ├─ .env.example
   ├─ tmp/.gitkeep
   ├─ app/
   │  ├─ layout.js
   │  ├─ globals.css
   │  ├─ not-found.js
   │  ├─ error.js
   │  ├─ (dashboard)/
   │  │  ├─ layout.js
   │  │  ├─ loading.js
   │  │  ├─ page.js                     # Overview
   │  │  ├─ projects/new/page.js        # Phase 4
   │  │  ├─ projects/[id]/page.js       # Phase 4
   │  │  └─ settings/page.js            # Phase 4
   │  └─ api/                           # optional BFF routes; Phase 2+
   ├─ components/
   │  ├─ sidebar.jsx
   │  ├─ topbar.jsx
   │  ├─ system-status.jsx
   │  ├─ theme-toggle.jsx
   │  ├─ icons.jsx
   │  └─ ui/                            # badge, panel, button, status-dot
   ├─ lib/
   │  ├─ api.js
   │  ├─ system-state.js
   │  └─ cn.js
   └─ tests/
      └─ system-state.test.js
```

## Phase plan

1. **Foundation (this phase):** repo scaffold, env templates, Express app with health/error handling, Mongoose connection, cPanel-ready entrypoints, dashboard shell and live system status, deployment docs.
2. **Auth and data:** User/Project/Deployment models, GitHub OAuth, admin allowlist, encrypted token storage, project CRUD, GitHub repo/branch/commit API.
3. **Deployment engine:** cPanel UAPI adapter, subdomain and Passenger provisioning, webhook registration/verification, Mongo-backed queue, supervised builds, SSE log replay.
4. **Dashboard features:** New Project wizard, project details, deployment history, live console, settings, env editor, redeploy/rollback.
5. **Hardening:** CSRF/rate limits, release retention, rollback releases, audit log, integration tests, failure-injection tests.
6. **Operational polish:** cPanel deployment runbook, SSL/DNS verification, backup/restore, observability, docs.

## Deferred decisions

- Exact `PassengerApps` UAPI parameter shape must be confirmed against the target cPanel version; build a capability adapter.
- Whether to use Atlas change streams or incremental polling for SSE replay depends on the Atlas tier.
- Whether deployed Next.js apps use standalone output or a custom server depends on the target Node version and Passenger behavior.
- Rollback strategy: rebuild-from-SHA vs retained release directories; start with rebuild-from-SHA for correctness, add retained releases for speed.
