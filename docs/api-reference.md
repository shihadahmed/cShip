# API Reference

Base URL: `https://api.example.com`

All endpoints require authentication via session cookie (except webhooks and health).

## Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auth/github` | Initiate GitHub OAuth |
| GET | `/api/auth/github/callback` | OAuth callback |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/csrf-token` | Get CSRF token |

## Projects

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/projects` | List user's projects |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/:id` | Get project details |
| PATCH | `/api/projects/:id` | Update project |
| DELETE | `/api/projects/:id` | Delete project |

### Project Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/projects/:id/webhook` | Register GitHub webhook |
| DELETE | `/api/projects/:id/webhook` | Unregister webhook |

### Project Settings (via PATCH `/api/projects/:id`)

Fields: `name`, `framework`, `branch`, `subdomain`, `domain`, `slug`, `buildCommand`, `installCommand`, `startCommand`, `outputDirectory`, `envVars`, `releaseRetention`

## Deployments

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/deployments/:projectId` | List deployments |
| GET | `/api/deployments/:projectId/:id` | Get deployment |
| POST | `/api/deployments/:projectId` | Trigger deployment |
| POST | `/api/deployments/:projectId/redeploy` | Redeploy from previous |
| POST | `/api/deployments/:projectId/rollback` | Rollback to release |
| GET | `/api/deployments/:projectId/:id/logs` | Stream logs (SSE) |
| DELETE | `/api/deployments/:projectId/:id` | Delete deployment |

## GitHub

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/github/repos` | List repositories |
| GET | `/api/github/repos/:owner/:repo/branches` | List branches |
| GET | `/api/github/repos/:owner/:repo/commits/:branch` | Get latest commit |

## Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhooks/github` | GitHub push webhook (no auth) |
| GET | `/api/webhooks/github` | Webhook info |

## Health

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Service health + metrics |

### Health Response

```json
{
  "status": "ok|degraded",
  "service": "cship-server",
  "version": "0.1.0",
  "environment": "production",
  "uptime": 3600,
  "timestamp": "2026-01-01T00:00:00.000Z",
  "database": {
    "configured": true,
    "status": "connected",
    "readyState": 1
  },
  "queue": { "depth": 0, "processing": 1 },
  "worker": { "status": "running", "workerId": "worker-123-456" },
  "disk": { "free": 10737418240, "total": 53687091200, "used": 42949672960, "usagePercent": 80 },
  "memory": { "rss": 50000000, "heapUsed": 30000000, "heapTotal": 40000000, "external": 5000000, "usagePercent": 75 },
  "build": { "memoryLimitMb": 512, "maxConcurrent": 1, "timeoutMs": 900000 },
  "rateLimit": {
    "auth": { "max": 5, "windowMs": 900000 },
    "webhook": { "max": 30, "windowMs": 60000 },
    "api": { "max": 100, "windowMs": 60000 }
  }
}
```

## Error Responses

All errors follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

Common codes:
- `NOT_FOUND` (404)
- `VALIDATION_ERROR` (400)
- `UNAUTHORIZED` (401)
- `FORBIDDEN` (403)
- `RATE_LIMITED` (429)
- `DUPLICATE_SUBDOMAIN` (409)
- `ACTIVE_DEPLOYMENT` (409)
- `INTERNAL` (500)

## Rate Limits

Headers returned on all responses:
- `X-RateLimit-Limit` — Max requests in window
- `X-RateLimit-Remaining` — Requests remaining
- `X-RateLimit-Reset` — ISO timestamp when window resets
- `Retry-After` — Seconds until retry (on 429)

Default limits:
- Auth: 5 req / 15 min
- Webhook: 30 req / 1 min
- API: 100 req / 1 min

Configure via `RATE_LIMIT_*_MAX` and `RATE_LIMIT_*_WINDOW_MS` env vars.