# cPanel Deployment Runbook

This runbook covers deploying cShip's two Node.js applications on a cPanel account using **Node.js Selector (Phusion Passenger)**. It assumes the engine runs on the same cPanel account it manages (Option A).

## 1. Prerequisites

- cPanel with **Node.js Selector** (Application Manager) and a supported Node.js version, 20 or newer.
- Shell access (SSH or cPanel Terminal) with `git`, `npm`, and `node` available.
- A MongoDB Atlas cluster and database user.
- A public domain or subdomain for the dashboard and another for the API, with SSL via AutoSSL.
- A GitHub OAuth app (Phase 2) and a cPanel API token (Phase 3) when those features are enabled.
- Enough account memory for `next build`. The Phase 1 dashboard is small; large projects need the memory safeguards described below.

## 2. Suggested directory layout

Keep both applications outside `public_html`:

```
/home/<cpanel-user>/
├─ cship/
│  ├─ client/
│  └─ server/
├─ cship/apps/            # DEPLOYMENTS_ROOT for future project checkouts
└─ public_html/           # normal web roots only
```

Set `DEPLOYMENTS_ROOT=/home/<cpanel-user>/cship/apps`. Never point it at `public_html`.

## 3. MongoDB Atlas

1. Create a cluster and a database user with access to only the `cship` database.
2. Add the cPanel server's egress IP to the Atlas access list. Shared hosts often use dynamic egress; if a fixed IP is unavailable, use a strong password and restrict access another way. Do not use an admin database user.
3. Use the SRV connection string and keep TLS enabled:
   `mongodb+srv://USER:PASSWORD@cluster.example.net/cship?retryWrites=true&w=majority`
4. Verify outbound connectivity from the account:
   ```bash
   node -e "const dns=require('dns'); dns.promises.resolveSrv('_mongodb._tcp.cluster.example.net').then(console.log).catch(console.error)"
   ```
5. Add `MONGODB_URI` to `server/.env` and the cPanel application environment.

## 4. Deploy the API (`server`)

1. Upload or clone the repository into `/home/<user>/cship`.
2. Install production dependencies:
   ```bash
   cd /home/<user>/cship/server
   npm ci --omit=dev
   ```
3. Create the environment file:
   ```bash
   cp .env.example .env
   chmod 600 .env
   ```
   Set at minimum:
   - `NODE_ENV=production`
   - `MONGODB_URI`
   - `CLIENT_ORIGIN=https://cship.example.com`
   - `PUBLIC_SERVER_URL=https://api.example.com`
   - `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY` (when Phase 2 lands)
   - GitHub and cPanel values (when those phases land)
4. In **cPanel → Setup Node.js App**:
   - Application root: `cship/server`
   - Application URL: `api.example.com`
   - Application startup file: `server.js`
   - Node version: 20 or newer
   - Add the same environment variables in the cPanel UI. Passenger provides `PORT`.
5. Restart:
   ```bash
   mkdir -p /home/<user>/cship/server/tmp
   touch /home/<user>/cship/server/tmp/restart.txt
   ```
6. Verify:
   ```bash
   curl -sS https://api.example.com/api/health
   ```
   Expected: `"status":"ok"` and `"database":{"configured":true,"status":"connected"}`. If Atlas is unreachable, the API returns `"status":"degraded"` rather than crashing.

## 5. Deploy the dashboard (`client`)

1. Install dependencies and build **before** starting the Passenger app:
   ```bash
   cd /home/<user>/cship/client
   NODE_OPTIONS=--max-old-space-size=512 npm ci
   NEXT_PUBLIC_API_URL=https://api.example.com NODE_OPTIONS=--max-old-space-size=512 npm run build
   ```
   `NEXT_PUBLIC_API_URL` is inlined at build time. Rebuild whenever it changes.
2. In **cPanel → Setup Node.js App**:
   - Application root: `cship/client`
   - Application URL: `cship.example.com`
   - Application startup file: `server.js`
   - Node version: 20 or newer
   - Add `NODE_ENV=production` and `NEXT_PUBLIC_API_URL=https://api.example.com`
3. Restart:
   ```bash
   mkdir -p /home/<user>/cship/client/tmp
   touch /home/<user>/cship/client/tmp/restart.txt
   ```
4. Verify:
   ```bash
   curl -I https://cship.example.com/
   ```
   Expected: HTTP 200 and the dashboard HTML.

The client `server.js` is a small custom Next.js server. It is intentionally used instead of `next start` because cPanel's startup-file contract runs `node server.js`, and the custom server binds to `process.env.PORT` provided by Passenger.

## 6. CORS and cookies

- `CLIENT_ORIGIN` on the API must exactly match the dashboard origin, including scheme and port. Multiple origins are comma-separated.
- Cross-subdomain cookies (Phase 2) need a cookie `Domain` covering both hosts, for example `.example.com`. Use `Secure` and `SameSite=Lax`; do not use `SameSite=None` unless the sites are truly cross-site.
- If the dashboard and API are on different registrable domains, use the short-lived SSE ticket flow planned for Phase 3 instead of relying on cookies.

## 7. SSE through cPanel

cPanel front ends Apache or LiteSpeed, sometimes with compression and proxy buffering. The API must send:

```
Content-Type: text/event-stream
Cache-Control: no-cache, no-transform
Connection: keep-alive
X-Accel-Buffering: no
```

And it must:

- call `res.flushHeaders()`;
- write a heartbeat comment every 15 seconds;
- avoid compression on the stream;
- support `Last-Event-ID` replay from persisted logs;
- keep builds running when the browser disconnects.

Test after Phase 3 with:

```bash
curl -N -H "Accept: text/event-stream" https://api.example.com/api/deployments/<id>/logs
```

If events arrive in a burst instead of streaming, the proxy is buffering. Check LiteSpeed/Apache compression rules and confirm `X-Accel-Buffering: no` and `no-transform` survive to the client. Do not gzip the SSE route.

## 8. Shared-host build limits

The engine is designed around a constrained account:

- `MAX_CONCURRENT_BUILDS=1` — builds queue in MongoDB and run one at a time.
- `NODE_OPTIONS=--max-old-space-size=512` — default heap cap for every build child.
- `BUILD_TIMEOUT_MS=900000` — kill and fail builds that exceed 15 minutes.
- `CI=1`, `npm_config_audit=false`, `npm_config_fund=false`, `GIT_TERMINAL_PROMPT=0`.
- Kill the whole process tree on timeout, not just the parent.
- Cap persisted logs (default 5 MB) and mark truncation explicitly.
- If a project still cannot build within the account limit, use the planned external build artifact sync instead of raising the heap cap.

For the cShip dashboard itself, `next build` is the heaviest operation. Run it during a quiet period and keep the 512 MB cap. If the account cannot complete the build, build the client elsewhere and upload `.next` plus `node_modules` (or a standalone artifact), then restart Passenger.

## 9. GitHub and cPanel integrations (later phases)

### GitHub OAuth

- Create a GitHub OAuth app.
- Callback URL: `https://api.example.com/api/auth/github/callback`.
- Request the minimum scopes needed: repository metadata, contents, and webhook administration for the repositories being deployed.
- Restrict login to `ADMIN_GITHUB_LOGINS` and the immutable GitHub user id.
- Store the GitHub access token encrypted with AES-256-GCM; never log it.

### GitHub webhooks

- Public webhook URL: `https://api.example.com/api/webhooks/github`.
- Register a per-project secret and verify the `X-Hub-Signature-256` HMAC against the raw request body.
- Deduplicate by `X-GitHub-Delivery` and by `(project, commit SHA)`.
- Only deploy pushes to the configured branch.
- Webhook endpoints must not require a browser session; verify the signature instead.

### cPanel UAPI

- Create an API token for the cPanel user. Use `CPANEL_URL=https://host:2083`.
- UAPI auth header format: `Authorization: cpanel <username>:<token>`.
- Required capabilities depend on the phase: subdomain management, domain information, and Passenger application management.
- Capability-detect `PassengerApps`; some cPanel versions do not expose it. If unavailable, register the Passenger app manually and let cShip manage files, `.env`, and `tmp/restart.txt`.
- Never log the token. Surface UAPI errors with the module/function name and a safe message.

## 10. Security checklist

- Keep `server/.env` at mode `0600`, owned by the cPanel user.
- Keep application roots outside `public_html`.
- Use HTTPS for both apps; enable AutoSSL.
- Set a strong `SESSION_SECRET` and a unique `TOKEN_ENCRYPTION_KEY`.
- Restrict `CLIENT_ORIGIN` to the real dashboard origin.
- Use a least-privilege Atlas user and a least-privilege cPanel API token.
- Do not expose the API root or `.env` through a web-accessible directory.
- Treat project build commands as admin-authored code execution; validate slugs and paths, and never interpolate untrusted input into shell commands.
- Review Passenger and Apache/LiteSpeed logs after the first deployment.

## 11. Troubleshooting

| Symptom | Likely cause | Action |
|---|---|---|
| Passenger 503 | App not running or startup file wrong | Confirm `server.js`, Node version, dependencies, and `tmp/restart.txt`; read the cPanel app log |
| API boots, health `degraded` | Atlas unreachable or credentials wrong | Check `MONGODB_URI`, Atlas IP access list, TLS, and outbound connectivity |
| Dashboard API row offline | CORS or wrong API URL | Match `CLIENT_ORIGIN`, rebuild the client if `NEXT_PUBLIC_API_URL` changed |
| SSE arrives in bursts | Proxy buffering or compression | Send `X-Accel-Buffering: no` and `no-transform`; disable gzip for the stream; keep heartbeats |
| Build killed or OOM | Shared memory limit | Keep one build at a time, 512 MB cap, reduce build scope, or build externally |
| `next build` OOM | Dashboard build too large for the account | Build elsewhere and upload the artifact; do not raise the cap without checking account limits |
| Subdomain creation fails | UAPI permission, domain ownership, or DNS | Verify token capabilities and domain ownership; check for an existing subdomain |
| Passenger restart has no effect | Wrong `tmp` directory or permissions | Touch `tmp/restart.txt` in the app root and confirm ownership |
| `git pull` prompts or fails | No non-interactive credentials | Use a deploy key or token, set `GIT_TERMINAL_PROMPT=0`, and verify the remote |
| Webhook returns 401 | Secret mismatch or raw body altered | Verify the HMAC against the raw body before JSON parsing |
| `.env` values missing at runtime | App does not load dotenv, or env is build-time only | Load `.env` in the server entrypoint; rebuild Next.js when public env changes |

## 12. Restart and verification commands

```bash
# API
touch /home/<user>/cship/server/tmp/restart.txt
curl -sS https://api.example.com/api/health

# Dashboard
touch /home/<user>/cship/client/tmp/restart.txt
curl -I https://cship.example.com/

# Local verification
npm --prefix server test
npm --prefix server run lint
npm --prefix client run lint
npm --prefix client run build
```
