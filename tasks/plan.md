# Implementation Plan: Security Hardening & Persistent Authentication

## Overview
This plan implements production-grade security hardening and persistent authentication for cShip. The current codebase has a solid foundation with GitHub OAuth, session-based auth, token encryption, CSRF protection, and rate limiting. However, several critical gaps exist: session persistence falls back to in-memory store, rate limiting uses in-memory Map (not multi-instance safe), CSP is disabled, admin authorization is only checked at login, and GitHub tokens lack refresh mechanism.

## Architecture Decisions
1. **Session Store**: Enforce MongoDB session store in production; fail startup if unavailable instead of silently falling back to MemoryStore
2. **Rate Limiting**: Replace in-memory Map with Redis-backed store for multi-instance support (add ioredis dependency)
3. **CSP**: Configure proper Content Security Policy for the Next.js frontend
4. **Admin Authorization**: Add middleware to verify admin status on every protected request
5. **Token Refresh**: Implement GitHub token refresh on 401 responses and proactively before expiry
6. **Security Headers**: Enable and configure all helmet features properly

## Task List

### Phase 1: Foundation - Session & Rate Limiting Infrastructure

- [x] **Task 1: Fix session persistence with mandatory MongoDB store in production**
  - **Description**: Modify `createSessionMiddleware` to require MongoDB in production and fail fast if unavailable, removing the MemoryStore fallback that breaks persistence.
  - **Acceptance criteria:**
    - [ ] In production, app fails to start if MongoDB session store is unavailable
    - [ ] In development, MemoryStore is still allowed for convenience
    - [ ] Sessions persist across server restarts in production
  - **Verification:**
    - [ ] Tests pass: `npm test` in server directory
    - [ ] Build succeeds: `npm run build` in server directory
    - [ ] Manual check: Restart server, verify session persists
  - **Dependencies:** None
  - **Files likely touched:** `server/src/middleware/auth.js`
  - **Estimated scope:** Small

- [x] **Task 2: Add Redis-backed rate limiter for multi-instance support**
  - **Description**: Replace in-memory Map with Redis store using ioredis. Add Redis configuration to env schema.
  - **Acceptance criteria:**
    - [ ] Rate limiting works correctly across multiple server instances
    - [ ] Redis connection is configurable via environment variables
    - [ ] Falls back gracefully if Redis unavailable (logs warning, allows requests)
    - [ ] Existing rate limit configs (auth, webhook, api) use Redis store
  - **Verification:**
    - [ ] Tests pass: `npm test` in server directory
    - [ ] Build succeeds: `npm run build` in server directory
    - [ ] Manual check: Run multiple instances, verify rate limiting is shared
  - **Dependencies:** None
  - **Files likely touched:** `server/src/middleware/rate-limit.js`, `server/src/config/env.js`, `server/.env.example`, `server/package.json`
  - **Estimated scope:** Medium

- [x] **Task 3: Configure proper Content Security Policy**
  - **Description**: Enable and configure CSP in helmet for both API and frontend. Define policy that allows necessary scripts, styles, and connections.
  - **Acceptance criteria:**
    - [ ] CSP header is present in all responses
    - [ ] Frontend loads without CSP violations
    - [ ] Inline scripts/styles handled via nonce or hash
    - [ ] API endpoints allow necessary origins
  - **Verification:**
    - [ ] Build succeeds: `npm run build` in client directory
    - [ ] Manual check: Browser DevTools shows no CSP violations
  - **Dependencies:** Task 1
  - **Files likely touched:** `server/src/app.js`, `client/next.config.mjs`
  - **Estimated scope:** Medium

### Phase 2: Core Security - Authorization & Token Management

- [x] **Task 4: Add admin authorization middleware for protected routes**
  - **Description**: Create `requireAdmin` middleware that verifies `user.admin === true` on every protected request, not just at login.
  - **Acceptance criteria:**
    - [ ] All protected API routes check admin status
    - [ ] Non-admin users get 403 on protected endpoints
    - [ ] Admin status is derived from ADMIN_GITHUB_LOGINS config (consistent with login check)
  - **Verification:**
    - [ ] Tests pass: `npm test` in server directory
    - [ ] Build succeeds: `npm run build` in server directory
    - [ ] Manual check: Login with non-admin account, verify 403 on dashboard API
  - **Dependencies:** Task 1
  - **Files likely touched:** `server/src/middleware/auth.js`, `server/src/routes/github.routes.js`, `server/src/routes/projects.routes.js`, `server/src/routes/deployments.routes.js`, `server/src/routes/webhooks.routes.js`
  - **Estimated scope:** Medium

- [x] **Task 5: Implement GitHub token refresh mechanism**
  - **Description**: Add automatic token refresh when GitHub API returns 401, and proactive refresh before token expiry. Store token metadata (expires_at, refresh_token) in User model.
  - **Acceptance criteria:**
    - [ ] On 401 from GitHub API, attempt token refresh using refresh_token
    - [ ] If refresh succeeds, retry original request with new token
    - [ ] If refresh fails, invalidate session and redirect to login
    - [ ] Store refresh_token and expires_at in User model (encrypted)
  - **Verification:**
    - [ ] Tests pass: `npm test` in server directory
    - [ ] Build succeeds: `npm run build` in server directory
    - [ ] Manual check: Simulate expired token, verify automatic refresh
  - **Dependencies:** Task 1
  - **Files likely touched:** `server/src/models/User.js`, `server/src/services/github/index.js`, `server/src/routes/auth.routes.js`, `server/src/middleware/auth.js`
  - **Estimated scope:** Medium

- [x] **Task 6: Harden security headers and CORS**
  - **Description**: Enable all helmet features, configure CORS strictly, add additional security headers (Permissions-Policy, Cross-Origin-Opener-Policy, etc.)
  - **Acceptance criteria:**
    - [ ] All helmet features enabled with proper config
    - [ ] CORS only allows configured origins with credentials
    - [ ] Security headers present: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
    - [ ] HSTS enabled in production
  - **Verification:**
    - [ ] Tests pass: `npm test` in server directory
    - [ ] Build succeeds: `npm run build` in server directory
    - [ ] Manual check: `curl -I` shows all security headers
  - **Dependencies:** Task 3
  - **Files likely touched:** `server/src/app.js`, `server/src/config/env.js`
  - **Estimated scope:** Small

### Phase 3: Input Validation & Additional Hardening

- [x] **Task 7: Add request body size limits and input sanitization**
  - **Description**: Add express.json limit configuration, sanitize user inputs, prevent NoSQL injection in MongoDB queries.
  - **Acceptance criteria:**
    - [ ] Request body size limited (1MB default, configurable)
    - [ ] MongoDB queries use parameterized/validated inputs only
    - [ ] No raw user input in query construction
  - **Verification:**
    - [ ] Tests pass: `npm test` in server directory
    - [ ] Build succeeds: `npm run build` in server directory
    - [ ] Manual check: Large payload rejected, injection attempts blocked
  - **Dependencies:** None
  - **Files likely touched:** `server/src/app.js`, `server/src/validators/validate.js`
  - **Estimated scope:** Small

- [x] **Task 8: Add audit logging for security events**
  - **Description**: Enhance existing audit middleware to log authentication events (login, logout, failed attempts), authorization failures, and admin actions.
  - **Acceptance criteria:**
    - [ ] Login/logout events logged with user ID, IP, timestamp
    - [ ] Failed authentication attempts logged
    - [ ] Authorization failures (403) logged
    - [ ] Admin actions (project create/delete, deployment trigger) logged
  - **Verification:**
    - [ ] Tests pass: `npm test` in server directory
    - [ ] Build succeeds: `npm run build` in server directory
    - [ ] Manual check: Check audit log collection for security events
  - **Dependencies:** Task 4
  - **Files likely touched:** `server/src/middleware/audit-log.js`, `server/src/models/AuditLog.js`
  - **Estimated scope:** Medium

### Phase 4: Frontend Integration & Testing

- [x] **Task 9: Update frontend to handle session persistence and auth state**
  - **Description**: Ensure frontend properly handles session cookies, CSRF tokens, and auth state persistence across page reloads. Add proper error handling for 401/403 responses.
  - **Acceptance criteria:**
    - [ ] Session persists across page reloads
    - [ ] CSRF token fetched and included in requests
    - [ ] 401 redirects to login, 403 shows access denied
    - [ ] No "Loading..." flash on authenticated routes
  - **Verification:**
    - [ ] Build succeeds: `npm run build` in client directory
    - [ ] Manual check: Login, reload page, verify still authenticated
  - **Dependencies:** Task 1, Task 4
  - **Files likely touched:** `client/lib/auth.js`, `client/app/(dashboard)/layout.js`, `client/app/login/page.jsx`
  - **Estimated scope:** Medium

- [x] **Task 10: Add comprehensive security tests**
  - **Description**: Add tests for session persistence, rate limiting, admin authorization, token refresh, CSP headers, and security event logging.
  - **Acceptance criteria:**
    - [ ] Session persistence test
    - [ ] Rate limiting test with Redis
    - [ ] Admin authorization test (admin vs non-admin)
    - [ ] Token refresh test
    - [ ] Security headers test
    - [ ] Audit logging test
  - **Verification:**
    - [ ] All tests pass: `npm test` in server directory
    - [ ] Coverage maintained or improved
  - **Dependencies:** All previous tasks
  - **Files likely touched:** `server/tests/*.test.js`
  - **Estimated scope:** Large

## Checkpoints

### Checkpoint: After Phase 1 (Tasks 1-3)
- [ ] All tests pass
- [ ] Application builds without errors
- [ ] Sessions persist across restarts
- [ ] Rate limiting works in multi-instance scenario
- [ ] CSP configured without violations

### Checkpoint: After Phase 2 (Tasks 4-6)
- [ ] All tests pass
- [ ] Admin authorization enforced on all protected routes
- [ ] Token refresh works automatically
- [ ] All security headers present

### Checkpoint: After Phase 3 (Tasks 7-8)
- [ ] Input validation hardened
- [ ] Security events logged

### Checkpoint: Complete (Tasks 9-10)
- [ ] Frontend integrates properly
- [ ] Comprehensive test coverage
- [ ] Ready for production deployment

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Redis dependency adds infrastructure complexity | Medium | Make Redis optional with clear docs; fallback to in-memory with warning |
| CSP breaks frontend functionality | High | Test thoroughly in dev; use report-only mode initially |
| Token refresh fails silently | High | Add explicit error handling and session invalidation |
| MongoDB session store connection issues | High | Fail fast in production with clear error message |
| Breaking changes to auth flow | Medium | Maintain backward compatibility where possible; test thoroughly |

## Open Questions
- Should we add a separate Redis instance for rate limiting, or reuse existing infrastructure?
- What's the expected token expiry from GitHub? (Currently GitHub OAuth tokens don't expire by default but can be revoked)
- Do we need to support multiple admin roles, or is boolean admin sufficient?

## Implementation Status (completed)

All ten tasks are implemented; nested acceptance-criteria boxes above are left as
the original plan text. Actual verification performed:

| Area | Status | Evidence |
|------|--------|----------|
| Session persistence | Done | `MongoStore` mandatory in production (`createSessionMiddleware` throws without a URI); session survives a new app instance in `security-hardening.test.js` |
| Rate limiting | Done | `ioredis` store with in-memory fallback; `/api/auth/github` returns 429 after 5 attempts in tests |
| CSP | Done | Express per-request nonce (`server/src/middleware/csp.js`); Next.js middleware forwards `x-nonce`; `layout.js` uses `await headers()` |
| Admin authorization | Done | `requireAdmin` on github/projects/deployments routers; re-reads `ADMIN_GITHUB_LOGINS` each request; revocation test passes |
| Token refresh | Done | `encryptedRefreshToken` + `tokenExpiresAt` on `User`; proactive refresh in `requireAuth`/`requireAdmin`; refresh + skip tests pass |
| Headers & CORS | Done | CSP, HSTS (prod only), COOP/CORP, referrer policy, permissions policy asserted in tests |
| Input hardening | Done | `BODY_SIZE_LIMIT`, `sanitize.js` recursive sanitizer, webhook raw-body handling, zod validators |
| Audit logging | Done | `security.unauthorized`, `security.forbidden`, `security.rate_limited`, `security.invalid_csrf`, `user.login_denied`, `user.token_refreshed` |
| Frontend auth | Done | Session restore with no protected-content flash, CSRF bootstrap + single retry, 401 event → `/login?error=session_expired`, error messaging on `/login` |
| Tests | Done | `node --test`: 150 passed / 0 failed; `next build` succeeded |

Not verified in this environment: a real Redis instance (multi-instance rate
limiting), and browser DevTools inspection of CSP violations.
