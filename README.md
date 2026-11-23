# cShip

cShip is a self-hosted, Vercel-like deployment control panel for a shared **cPanel** account. It connects GitHub repositories to cPanel subdomains, manages project `.env` files, restarts Passenger apps, and streams deployment logs to a small, focused dashboard.

> **Current status: Phase 1 foundation.** The API, MongoDB lifecycle, cPanel-ready entrypoints, and dashboard shell are running. GitHub authentication, project import, the cPanel UAPI adapter, the build queue, and SSE log replay arrive in later phases.

## Stack

- **Client:** Next.js 15 App Router, React 19, Tailwind CSS 3, Geist fonts — pure JavaScript.
- **Server:** Node.js 20+, Express 4, Mongoose 8, Zod 4 — pure JavaScript.
- **Database:** MongoDB Atlas.
- **Hosting target:** cPanel Node.js Selector / Phusion Passenger.
- **No TypeScript. No Vite.**

## Repository layout

```
cship/
├─ client/                 Next.js dashboard (App Router)
├─ server/                 Express API and future deployment worker
├─ docs/
│  ├─ cpanel-deployment.md cPanel runbook
│  └─ superpowers/         Design and implementation plans
├─ package.json            Root convenience scripts
└─ README.md
```

## Quick start

Prerequisites: Node.js 20+, npm 10+, and a MongoDB Atlas connection string for database-backed features.

```bash
npm run install:all

# API
copy server\.env.example server\.env
npm run dev:server

# Dashboard (second terminal)
copy client\.env.example client\.env.local
npm run dev:client
```

Open `http://localhost:3000`. The API health endpoint is `http://localhost:4000/api/health`.

If `MONGODB_URI` is not set in development, the API still boots and reports the database as not configured. Production requires `MONGODB_URI`; if Atlas is unreachable, the API stays up, reports `degraded`, and retries in the background.

## Environment

### Server (`server/.env`)

| Variable | Purpose |
|---|---|
| `NODE_ENV` | `development`, `test`, or `production`. |
| `PORT` | API port. Passenger provides this in production. |
| `MONGODB_URI` | MongoDB Atlas connection string. Required in production. |
| `CLIENT_ORIGIN` | Comma-separated dashboard origins allowed by CORS. |
| `PUBLIC_SERVER_URL` | Public API base URL used for GitHub webhook callbacks. |
| `SESSION_SECRET` | Session signing secret, at least 32 characters. Phase 2. |
| `TOKEN_ENCRYPTION_KEY` | 64 hex characters for AES-256-GCM. Phase 2. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth app credentials. Phase 2. |
| `GITHUB_CALLBACK_URL` | OAuth callback URL. Phase 2. |
| `ADMIN_GITHUB_LOGINS` | Comma-separated GitHub logins allowed to sign in. Phase 2. |
| `CPANEL_URL` | cPanel endpoint, usually `https://host:2083`. Phase 3. |
| `CPANEL_USERNAME` / `CPANEL_API_TOKEN` | UAPI credentials. Phase 3. |
| `DEPLOYMENTS_ROOT` | Private directory for deployment working copies. Phase 3. |
| `BUILD_MEMORY_MB` | Heap cap for build children. Default `512`. |
| `MAX_CONCURRENT_BUILDS` | Default `1`; keep this at `1` on shared hosting. |
| `BUILD_TIMEOUT_MS` | Default 15 minutes. |
| `SSE_HEARTBEAT_MS` | Default 15 seconds. |

Generate an encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Client (`client/.env.local`)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Browser-visible API base URL. Inlined at build time. |
| `PORT` | Local custom-server port. Passenger provides this in production. |

## Scripts

| Command | Action |
|---|---|
| `npm run install:all` | Install root, server, and client dependencies. |
| `npm run dev` | Run API and dashboard together. |
| `npm run dev:server` | Run the API with Node watch mode. |
| `npm run dev:client` | Run the Next.js dev server. |
| `npm test` | Run server and client tests. |
| `npm run build` | Build the Next.js dashboard. |
| `npm run lint` | Lint server and client. |
| `npm run start:server` | Start the API entrypoint. |
| `npm run start:client` | Start the dashboard custom server. |

## cPanel deployment

See [`docs/cpanel-deployment.md`](docs/cpanel-deployment.md) for the full runbook. The short version:

1. Create two Node.js Selector applications: `server` and `client`.
2. Use `server.js` as the startup file for both.
3. Set environment variables in cPanel and install dependencies.
4. Build the client before starting it.
5. Restart by touching `tmp/restart.txt` in the application root.

Both apps are already structured for Passenger: they listen on `process.env.PORT`, expose a `server.js` entrypoint, and keep a `tmp/` directory for restarts.

## Design and plan

- Design: [`docs/superpowers/specs/2026-11-23-cship-design.md`](docs/superpowers/specs/2026-11-23-cship-design.md)
- Phase 1 plan: [`docs/superpowers/plans/2026-11-23-cship-phase-1-foundation.md`](docs/superpowers/plans/2026-11-23-cship-phase-1-foundation.md)

## Roadmap

- **Phase 2:** User/Project/Deployment models, GitHub OAuth, admin allowlist, encrypted tokens, project CRUD, repository import.
- **Phase 3:** cPanel UAPI adapter, subdomain/Passenger provisioning, webhook registration, Mongo-backed sequential queue, SSE log replay.
- **Phase 4:** New Project wizard, project details, live console, settings, env editor, redeploy/rollback.
- **Phase 5:** Hardening, rate limits, release retention, audit log, failure-injection tests.
- **Phase 6:** Operational polish and production runbooks.
