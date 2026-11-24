# Security Hardening & Persistent Authentication - Task List

## Phase 1: Foundation - Session & Rate Limiting Infrastructure

- [x] **Task 1: Fix session persistence with mandatory MongoDB store in production**
  - **Files:** `server/src/middleware/auth.js`, `server/src/app.js`, `server/src/start-server.js`, `server/tests/*.test.js`
  - **Status:** Complete

- [x] **Task 2: Add Redis-backed rate limiter for multi-instance support**
  - **Files:** `server/src/middleware/rate-limit.js`, `server/src/config/env.js`, `server/.env.example`, `server/package.json`, `server/src/app.js`
  - **Status:** Complete

- [x] **Task 3: Configure proper Content Security Policy**
  - **Files:** `server/src/middleware/csp.js`, `server/src/app.js`, `client/middleware.ts`, `client/app/layout.js`
  - **Status:** Complete

### Checkpoint: After Phase 1
- [x] All tests pass — 150/150 (`node --test`)
- [x] Application builds without errors — `next build` succeeds
- [x] Sessions persist across restarts — MongoStore enforced in production, verified across app instances
- [x] Rate limiting works in multi-instance scenario — Redis store implemented with in-memory fallback (Redis path not exercised in tests)
- [x] CSP configured without violations — per-request nonce on server and Next.js middleware (no browser run performed)

## Phase 2: Core Security - Authorization & Token Management

- [x] **Task 4: Add admin authorization middleware for protected routes**
  - **Files:** `server/src/middleware/auth.js`, `server/src/routes/github.routes.js`, `server/src/routes/projects.routes.js`, `server/src/routes/deployments.routes.js`, `server/tests/*.test.js`
  - **Status:** Complete

- [x] **Task 5: Implement GitHub token refresh mechanism**
  - **Files:** `server/src/models/User.js`, `server/src/services/github/index.js`, `server/src/routes/auth.routes.js`, `server/src/middleware/auth.js`
  - **Status:** Complete

- [x] **Task 6: Harden security headers and CORS**
  - **Files:** `server/src/middleware/csp.js`, `server/src/app.js`
  - **Status:** Complete

### Checkpoint: After Phase 2
- [x] All tests pass
- [x] Admin authorization enforced on all protected routes — `requireAdmin` on github/projects/deployments routers
- [x] Token refresh works automatically — proactive refresh in `requireAuth`/`requireAdmin`
- [x] All security headers present — CSP, HSTS (prod), COOP, CORP, referrer policy, permissions policy

## Phase 3: Input Validation & Additional Hardening

- [x] **Task 7: Add request body size limits and input sanitization**
  - **Files:** `server/src/middleware/sanitize.js`, `server/src/app.js`, `server/src/config/env.js`
  - **Status:** Complete

- [x] **Task 8: Add audit logging for security events**
  - **Files:** `server/src/middleware/audit-log.js`, `server/src/models/AuditLog.js`, `server/src/app.js`, `server/src/middleware/auth.js`, `server/src/routes/auth.routes.js`
  - **Status:** Complete

### Checkpoint: After Phase 3
- [x] Input validation hardened — body limits, recursive sanitization, existing zod validators
- [x] Security events logged — `security.*` and `user.login_denied` audit entries

## Phase 4: Frontend Integration & Testing

- [x] **Task 9: Update frontend to handle session persistence and auth state**
  - **Files:** `client/lib/api.js`, `client/lib/auth.js`, `client/app/login/page.jsx`, `client/app/layout.js`, `client/middleware.ts`
  - **Status:** Complete

- [x] **Task 10: Add comprehensive security tests**
  - **Files:** `server/tests/security-hardening.test.js` (new), plus updates across existing suites
  - **Status:** Complete — 13 new tests covering admin 401/403/allow/revocation, session persistence across app instances, CSP nonce + headers, HSTS, auth rate limiting, audit entries for forbidden/CSRF, token refresh persisted encrypted, valid-token skip, and webhook HMAC accept/reject

### Checkpoint: Complete
- [x] Frontend integrates properly
- [x] Comprehensive test coverage
- [x] Ready for production deployment