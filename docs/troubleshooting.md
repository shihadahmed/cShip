# Troubleshooting Guide

## Quick Diagnosis

Run these first:
```bash
# Check API health
curl -s https://api.example.com/api/health | jq .

# Check dashboard
curl -I https://cship.example.com/

# Check logs
# Passenger logs: cPanel → Node.js Selector → App → View Log
# Application logs: check console output
```

## Common Issues

### Authentication

| Symptom | Cause | Fix |
|---------|-------|-----|
| Login redirects to GitHub but returns 404 | Wrong callback URL | Verify `GITHUB_CALLBACK_URL` matches GitHub OAuth app |
| "Invalid state" on callback | Session lost or CSRF mismatch | Ensure `SESSION_SECRET` is set; check cookie domain |
| 401 on all API calls | Session expired or not set | Verify `CLIENT_ORIGIN` matches dashboard URL exactly |
| 403 CSRF on mutations | Missing CSRF token | Include `X-CSRF-Token` header from `<meta name="csrf-token">` |

### Rate Limiting

| Symptom | Cause | Fix |
|---------|-------|-----|
| 429 on login | Too many attempts | Wait 15 min or increase `RATE_LIMIT_AUTH_MAX` |
| 429 on webhook | GitHub retries | Increase `RATE_LIMIT_WEBHOOK_MAX`; verify webhook secret |
| 429 on API | Dashboard polling | Increase `RATE_LIMIT_API_MAX` |

### Deployments

| Symptom | Cause | Fix |
|---------|-------|-----|
| Build queued but never starts | Worker not running | Check `worker.isRunning()`; restart API |
| Build fails with OOM | Memory limit too low | Optimize build or increase `BUILD_MEMORY_MB` (carefully) |
| Build timeout | `BUILD_TIMEOUT_MS` exceeded | Optimize build or increase timeout |
| "Output directory not found" | Build didn't produce output | Check `outputDirectory` matches framework; verify build script |
| `git pull` fails | Auth or network | Use deploy key; check `GIT_TERMINAL_PROMPT=0` |
| Subdomain creation fails | UAPI permission | Verify cPanel token has subdomain permission; check for existing subdomain |

### Webhooks

| Symptom | Cause | Fix |
|---------|-------|-----|
| Webhook 401 | Secret mismatch | Re-register webhook; verify secret in project settings |
| Webhook 404 | Project not found | Check `webhook.id` matches project |
| Duplicate deployments | Missing dedupe | Verify `X-GitHub-Delivery` and `(project, commit SHA)` uniqueness |

### SSL/DNS

| Symptom | Cause | Fix |
|---------|-------|-----|
| Subdomain shows "pending" | DNS not propagated | Wait for DNS (up to 48h); verify `CPANEL_ROOT_DOMAIN` |
| SSL verification fails | Certificate not issued | Wait for AutoSSL; check domain ownership |
| `verifyDns` returns false | Wrong root domain | Set `CPANEL_ROOT_DOMAIN` in server `.env` |

### Database

| Symptom | Cause | Fix |
|---------|-------|-----|
| Health shows "degraded" | Atlas unreachable | Check `MONGODB_URI`, Atlas IP whitelist, TLS |
| "MONGODB_URI required" | Missing in production | Add to server `.env` and cPanel app env |
| Connection timeout | Network/Egress | Verify outbound connectivity from cPanel |

### Backups

| Symptom | Cause | Fix |
|---------|-------|-----|
| `mongodump` fails | Credentials/network | Check `MONGODB_URI`; test connectivity |
| Backup too large | Unbounded growth | Check retention; audit log size |
| Restore hangs | Large dataset | Use Atlas point-in-time restore instead |

## Debugging Commands

```bash
# Test MongoDB connectivity
node -e "require('mongoose').connect(process.env.MONGODB_URI).then(()=>console.log('OK')).catch(console.error)"

# Test GitHub API
curl -H "Authorization: token YOUR_TOKEN" https://api.github.com/user

# Test cPanel UAPI
curl -H "Authorization: cpanel user:token" https://host:2083/execute/SubDomain/addsubdomain

# Check disk space
df -h /home/user/cship/apps

# Check memory
free -h

# View build logs
# Dashboard → Project → Deployments → Logs

# Check audit logs
# MongoDB Atlas → Collections → auditlogs
```

## Log Locations

| Component | Location |
|-----------|----------|
| API (Passenger) | cPanel → Node.js Selector → server app → View Log |
| Dashboard (Passenger) | cPanel → Node.js Selector → client app → View Log |
| Build worker | API console output (same as API log) |
| MongoDB | Atlas → Monitoring → Logs |
| cPanel UAPI | cPanel → Error Log |

## Getting Help

1. Check `/api/health` for current status
2. Review relevant logs above
3. Check this guide for matching symptom
4. If unresolved, create issue with:
   - Health endpoint output
   - Relevant log excerpts
   - Steps to reproduce
   - Environment (cPanel version, Node version, etc.)