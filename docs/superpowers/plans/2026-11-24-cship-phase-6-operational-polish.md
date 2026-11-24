# Phase 6: Operational Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Production-hardening for cShip: complete cPanel deployment runbook, SSL/DNS verification, backup/restore procedures, observability enhancements, and documentation.

**Architecture:** Extends existing modules with operational tooling. Follows the existing patterns.

**Tech Stack:** Express 4, Mongoose 8, Zod 4, Next.js 15 App Router, React 19, Tailwind CSS 3. Pure JavaScript only.

**Spec:** `docs/superpowers/specs/2026-11-23-cship-design.md` (Phase 6 section)

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
| Subdomain DNS not propagated | Health check shows `pending` until DNS resolves |
| SSL certificate not issued | Health check shows `pending` until cert is valid |
| Backup script runs | Creates timestamped dump in configured location |
| Restore script runs | Restores from dump, verifies collections |
| Health endpoint includes metrics | Returns queue depth, worker status, disk space, DB latency |

---

### Task 1: Update cPanel Deployment Runbook

**Files:**
- Modify: `docs/cpanel-deployment.md`

**Interfaces:**
- Consumes: Phase 1-5 implementation details
- Produces: Complete production deployment guide

- [ ] **Step 1: Add Phase 5 configuration to runbook**

Document new environment variables:
```bash
# Rate Limiting
RATE_LIMIT_AUTH_MAX=5
RATE_LIMIT_AUTH_WINDOW_MS=900000
RATE_LIMIT_WEBHOOK_MAX=30
RATE_LIMIT_WEBHOOK_WINDOW_MS=60000
RATE_LIMIT_API_MAX=100
RATE_LIMIT_API_WINDOW_MS=60000

# Release Retention (per-project, set in UI)
# releaseRetention: 5 (default)
```

- [ ] **Step 2: Document rollback procedure**

```bash
# Manual rollback via API
curl -X POST https://api.yourdomain.com/api/deployments/<projectId>/rollback \
  -H "X-CSRF-Token: <token>" \
  -H "Cookie: <session>" \
  -d '{"releaseName": "release-1700000000"}'
```

- [ ] **Step 3: Document audit log access**

```bash
# Query audit logs via MongoDB Atlas
# Filter by userId, action, resource, date range
```

- [ ] **Step 4: Document rate limit tuning**

Adjust based on traffic:
- Auth: stricter for public endpoints
- Webhook: match GitHub retry behavior
- API: generous for dashboard usage

- [ ] **Step 5: Add troubleshooting section**

Common issues:
- Rate limit 429 on auth → check `RATE_LIMIT_AUTH_MAX`
- Webhook 429 → check `RATE_LIMIT_WEBHOOK_MAX`, GitHub retry-after
- Rollback fails → verify release exists, Passenger app running
- Audit log not appearing → check middleware order, user session

---

### Task 2: SSL/DNS Verification Worker Task

**Files:**
- Create: `server/src/services/cpanel/ssl-dns.js`
- Modify: `server/src/services/deploy/worker.js` — add verification step
- Test: `server/tests/ssl-dns.test.js`

**Interfaces:**
- Consumes: Project (subdomain, domain), cPanel UAPI
- Produces: DNS resolution status, SSL certificate status

- [ ] **Step 1: Write failing tests for SSL/DNS verification**

```js
// server/tests/ssl-dns.test.js
test('verifyDns resolves subdomain to correct IP', async () => {
  const result = await verifyDns('myapp.example.com');
  assert.ok(result.resolved);
  assert.equal(result.ip, 'expected-ip');
});

test('verifySsl checks certificate validity', async () => {
  const result = await verifySsl('myapp.example.com');
  assert.ok(result.valid);
  assert.ok(result.expiresAt > Date.now());
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix server test -- tests/ssl-dns.test.js`
Expected: FAIL — module not implemented

- [ ] **Step 3: Implement `ssl-dns.js` service**

```js
// server/src/services/cpanel/ssl-dns.js
import dns from 'node:dns';
import { promisify } from 'node:util';
import https from 'node:https';
import tls from 'node:tls';

const resolveDns = promisify(dns.resolve4);

export async function verifyDns(hostname, expectedIp) {
  try {
    const ips = await resolveDns(hostname);
    return {
      resolved: true,
      ip: ips[0],
      matchesExpected: expectedIp ? ips.includes(expectedIp) : true,
    };
  } catch (error) {
    return { resolved: false, error: error.message };
  }
}

export async function verifySsl(hostname) {
  return new Promise((resolve) => {
    const socket = tls.connect(443, hostname, {
      servername: hostname,
      rejectUnauthorized: false,
    }, () => {
      const cert = socket.getPeerCertificate();
      const valid = cert && cert.subject && cert.valid_to;
      resolve({
        valid,
        subject: cert?.subject,
        issuer: cert?.issuer,
        validFrom: cert?.valid_from,
        validTo: cert?.valid_to,
        expiresAt: cert?.valid_to ? new Date(cert.valid_to).getTime() : null,
        daysUntilExpiry: cert?.valid_to ? Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86400000) : null,
      });
      socket.destroy();
    });

    socket.on('error', (err) => {
      resolve({ valid: false, error: err.message });
    });

    socket.setTimeout(10000, () => {
      socket.destroy();
      resolve({ valid: false, error: 'Connection timeout' });
    });
  });
}

export async function verifyDomain(project) {
  const results = {
    subdomain: null,
    customDomain: null,
  };

  if (project.subdomain) {
    const fqdn = `${project.subdomain}.${project.rootDomain}`;
    results.subdomain = {
      fqdn,
      dns: await verifyDns(fqdn),
      ssl: await verifySsl(fqdn),
    };
  }

  if (project.domain) {
    results.customDomain = {
      fqdn: project.domain,
      dns: await verifyDns(project.domain),
      ssl: await verifySsl(project.domain),
    };
  }

  return results;
}
```

- [ ] **Step 4: Add verification to worker after deployment**

In `worker.js` `runDeployment`, after successful deployment:
```js
const verification = await sslDns.verifyDomain(project);
// Log results, update project with verification status
```

- [ ] **Step 5: Add verification status to Project model**

```js
// server/src/models/Project.js
domainVerification: {
  subdomain: { dns: Boolean, ssl: Boolean, lastChecked: Date, error: String },
  customDomain: { dns: Boolean, ssl: Boolean, lastChecked: Date, error: String },
},
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm --prefix server test -- tests/ssl-dns.test.js`
Expected: PASS

- [ ] **Step 7: Run full server test suite**

Run: `npm --prefix server test`
Expected: All tests pass

---

### Task 3: Backup/Restore Procedures

**Files:**
- Create: `scripts/backup.sh`
- Create: `scripts/restore.sh`
- Create: `scripts/verify-backup.sh`
- Document: `docs/backup-restore.md`

**Interfaces:**
- Consumes: MongoDB Atlas connection, backup storage location
- Produces: Timestamped backup archives, restore verification

- [ ] **Step 1: Create backup script**

```bash
#!/bin/bash
# scripts/backup.sh
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
MONGODB_URI="${MONGODB_URI}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_NAME="cship-${TIMESTAMP}"

mkdir -p "${BACKUP_DIR}"

echo "Starting backup: ${BACKUP_NAME}"
mongodump --uri="${MONGODB_URI}" --out="${BACKUP_DIR}/${BACKUP_NAME}"
tar -czf "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" -C "${BACKUP_DIR}" "${BACKUP_NAME}"
rm -rf "${BACKUP_DIR}/${BACKUP_NAME}"

# Keep last 7 daily, 4 weekly, 3 monthly
find "${BACKUP_DIR}" -name 'cship-*.tar.gz' -mtime +7 -delete
# Weekly/monthly retention logic here

echo "Backup completed: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
```

- [ ] **Step 2: Create restore script**

```bash
#!/bin/bash
# scripts/restore.sh
set -euo pipefail

BACKUP_FILE="${1}"
MONGODB_URI="${MONGODB_URI}"

if [[ -z "${BACKUP_FILE}" ]]; then
  echo "Usage: $0 <backup-file.tar.gz>"
  exit 1
fi

if [[ ! -f "${BACKUP_FILE}" ]]; then
  echo "Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

TEMP_DIR=$(mktemp -d)
tar -xzf "${BACKUP_FILE}" -C "${TEMP_DIR}"

echo "Restoring from ${BACKUP_FILE}..."
mongorestore --uri="${MONGODB_URI}" --drop "${TEMP_DIR}/cship-*"

rm -rf "${TEMP_DIR}"
echo "Restore completed"
```

- [ ] **Step 3: Create verification script**

```bash
#!/bin/bash
# scripts/verify-backup.sh
set -euo pipefail

BACKUP_FILE="${1}"

if [[ -z "${BACKUP_FILE}" ]]; then
  echo "Usage: $0 <backup-file.tar.gz>"
  exit 1
fi

TEMP_DIR=$(mktemp -d)
tar -xzf "${BACKUP_FILE}" -C "${TEMP_DIR}"

# Verify collections exist
for collection in users projects deployments auditlogs; do
  if [[ ! -f "${TEMP_DIR}/cship-*/${collection}.bson" ]]; then
    echo "ERROR: Missing collection: ${collection}"
    rm -rf "${TEMP_DIR}"
    exit 1
  fi
done

# Count documents
for collection in users projects deployments auditlogs; do
  count=$(bsondump "${TEMP_DIR}/cship-*/${collection}.bson" | wc -l)
  echo "${collection}: ${count} documents"
done

rm -rf "${TEMP_DIR}"
echo "Backup verification passed"
```

- [ ] **Step 4: Document backup/restore procedures**

Create `docs/backup-restore.md` with:
- Automated scheduling (cron/systemd timer)
- Manual backup/restore commands
- Point-in-time recovery using Atlas
- Testing restore in staging

---

### Task 4: Observability Enhancements

**Files:**
- Modify: `server/src/routes/health.routes.js` — add detailed metrics
- Modify: `server/src/lib/queue.js` — expose queue stats
- Modify: `server/src/services/deploy/worker.js` — expose worker stats
- Test: `server/tests/health-metrics.test.js`

**Interfaces:**
- Consumes: Internal metrics (queue depth, worker status, disk, DB)
- Produces: `/api/health` with detailed status

- [ ] **Step 1: Write failing tests for enhanced health endpoint**

```js
// server/tests/health-metrics.test.js
test('GET /api/health includes queue metrics', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.ok(res.body.queue);
  assert.ok(typeof res.body.queue.depth === 'number');
  assert.ok(typeof res.body.queue.processing === 'number');
});

test('GET /api/health includes worker status', async () => {
  const res = await request(app).get('/api/health');
  assert.ok(res.body.worker);
  assert.ok(['running', 'stopped'].includes(res.body.worker.status));
});

test('GET /api/health includes disk space', async () => {
  const res = await request(app).get('/api/health');
  assert.ok(res.body.disk);
  assert.ok(typeof res.body.disk.free === 'number');
  assert.ok(typeof res.body.disk.total === 'number');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm --prefix server test -- tests/health-metrics.test.js`
Expected: FAIL — metrics not implemented

- [ ] **Step 3: Enhance health endpoint**

```js
// server/src/routes/health.routes.js
import { getQueueStats } from '../lib/queue.js';
import { getWorkerStats } from '../services/deploy/worker.js';
import { getDiskSpace } from '../lib/disk.js'; // new helper

healthRouter.get('/', async (req, res, next) => {
  try {
    const config = req.app.locals.config;
    const logger = req.app.locals.logger;
    
    // Database health
    const dbState = mongoose.connection.readyState;
    const dbStatus = ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown';
    
    // Queue stats
    const queue = req.app.locals.queue;
    const queueStats = queue ? await queue.getStats() : { depth: 0, processing: 0 };
    
    // Worker stats
    const worker = req.app.locals.worker;
    const workerStats = worker ? worker.getStats() : { status: 'not_started' };
    
    // Disk space
    const deploymentsRoot = config.DEPLOYMENTS_ROOT || process.cwd();
    const disk = await getDiskSpace(deploymentsRoot);
    
    // Memory
    const mem = process.memoryUsage();
    
    res.json({
      status: dbState === 1 ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      database: { status: dbStatus, state: dbState },
      queue: queueStats,
      worker: workerStats,
      disk,
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
      },
      uptime: process.uptime(),
    });
  } catch (error) {
    next(error);
  }
});
```

- [ ] **Step 4: Add queue stats method**

```js
// server/src/lib/queue.js
export async function getQueueStats() {
  const queued = await this.collection.countDocuments({ status: 'queued' });
  const processing = await this.collection.countDocuments({ status: 'building' });
  return { depth: queued, processing };
}
```

- [ ] **Step 5: Add worker stats method**

```js
// server/src/services/deploy/worker.js
getStats() {
  return {
    status: this.isRunning() ? 'running' : 'stopped',
    workerId: this.workerId,
  };
}
```

- [ ] **Step 6: Add disk space helper**

```js
// server/src/lib/disk.js
import { promises as fs } from 'node:fs';

export async function getDiskSpace(path) {
  try {
    const stats = await fs.statfs(path);
    const free = stats.bfree * stats.bsize;
    const total = stats.blocks * stats.bsize;
    const used = total - free;
    return { free, total, used, usagePercent: Math.round((used / total) * 100) };
  } catch {
    return { free: 0, total: 0, used: 0, usagePercent: 0 };
  }
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm --prefix server test -- tests/health-metrics.test.js`
Expected: PASS

- [ ] **Step 8: Run full server test suite**

Run: `npm --prefix server test`
Expected: All tests pass

---

### Task 5: Documentation Updates

**Files:**
- Modify: `README.md` — add Phase 5/6 features
- Modify: `docs/superpowers/specs/2026-11-23-cship-design.md` — mark phases complete
- Create: `docs/api-reference.md` — API endpoint documentation
- Create: `docs/troubleshooting.md` — common issues

- [ ] **Step 1: Update README with new features**

Add to roadmap:
- Phase 5: Rate limiting, release retention, rollback, audit logs, failure-injection tests ✅
- Phase 6: SSL/DNS verification, backup/restore, observability, documentation 🚧

- [ ] **Step 2: Create API reference**

Document all endpoints:
- Auth: `/api/auth/*`
- Projects: `/api/projects/*`
- Deployments: `/api/deployments/*`
- Webhooks: `/api/webhooks/*`
- Health: `/api/health`

- [ ] **Step 3: Create troubleshooting guide**

Common issues and solutions:
- Rate limiting
- Deployment failures
- Webhook delivery issues
- SSL/DNS problems
- Backup/restore

---

### Task 6: Full Verification

- [ ] **Step 1: Run full server test suite**

Run: `npm --prefix server test`
Expected: All tests pass (including new ssl-dns, health-metrics tests)

- [ ] **Step 2: Run client lint and build**

Run: `npm --prefix client run lint && npm --prefix client run build`
Expected: Lint clean, build succeeds

- [ ] **Step 3: Run root test + lint**

Run: `npm test && npm run lint`
Expected: Server + client tests pass, both linters clean

- [ ] **Step 4: Manual end-to-end verification**

1. Deploy to cPanel staging
2. Configure rate limits
3. Create project, deploy, verify SSL/DNS check
4. Trigger rollback, verify works
5. Check audit logs in Atlas
6. Run backup script, verify output
7. Run restore script on staging DB
8. Check `/api/health` shows all metrics

- [ ] **Step 5: Update plan with verification record**

Add test counts, runtime results, and any deferred items to this plan doc.