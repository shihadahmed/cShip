import mongoose from 'mongoose';
import AuditLog from '../models/AuditLog.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SECURITY_STATUSES = new Set([401, 403, 429]);

/**
 * Records an immutable audit trail for state-changing requests and for
 * security-relevant responses (unauthorized, forbidden, rate limited).
 *
 * Entries are written fire-and-forget after the response has been flushed, so
 * audit logging never delays or breaks a request. Writes are skipped entirely
 * when there is no live MongoDB connection (e.g. in unit tests), which avoids
 * mongoose command buffering.
 */
export function createAuditMiddleware({ logger } = {}) {
  return function auditMiddleware(req, res, next) {
    const sessionUserId = req.session?.userId;
    let responseBody;

    // Capture the JSON payload without changing the response.
    const originalJson = res.json;
    res.json = function captureJson(body) {
      responseBody = body;
      return originalJson.call(this, body);
    };

    res.on('finish', () => {
      try {
        if (mongoose.connection.readyState !== 1) return;

        const entry = buildAuditEntry(req, res, responseBody, sessionUserId);
        if (!entry) return;

        AuditLog.create(entry).catch((error) => {
          const message = `Audit log write failed: ${error.message}`;
          if (logger?.warn) logger.warn(message, { requestId: req.id });
          else console.warn(message);
        });
      } catch (error) {
        const message = `Audit log build failed: ${error.message}`;
        if (logger?.warn) logger.warn(message, { requestId: req.id });
        else console.warn(message);
      }
    });

    next();
  };
}

function buildAuditEntry(req, res, responseBody, sessionUserId) {
  const status = res.statusCode;
  const path = req.path;
  const userId = getUserId(req, sessionUserId);
  const errorCode = getErrorCode(responseBody);

  if (SECURITY_STATUSES.has(status)) {
    // The SPA probes /api/auth/me on every load; an anonymous 401 there is
    // expected and would flood the audit log.
    if (status === 401 && path === '/api/auth/me') return null;

    const action = inferSecurityAction({ status, path, errorCode });
    const isAuthPath = path.startsWith('/api/auth');

    return {
      userId,
      action,
      resource: isAuthPath ? 'user' : 'security',
      resourceId: isAuthPath ? toObjectId(userId) : undefined,
      metadata: {
        method: req.method,
        path,
        status,
        errorCode: errorCode || undefined,
        requestId: req.id,
      },
      severity: 'warning',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    };
  }

  if (!MUTATING_METHODS.has(req.method) || status >= 400) {
    return null;
  }

  const action = inferAction(req);
  if (!action) return null;

  // Session-based actions need an actor; without one there is nothing to audit.
  if (!userId) return null;

  return {
    userId,
    action,
    resource: inferResource(req),
    resourceId: toObjectId(inferResourceId(req, responseBody)),
    metadata: extractMetadata(req, responseBody),
    severity: 'info',
    ip: req.ip,
    userAgent: req.get('user-agent'),
  };
}

function inferSecurityAction({ status, path, errorCode }) {
  if (status === 429) return 'security.rate_limited';
  if (status === 403 && errorCode === 'CSRF_ERROR') return 'security.invalid_csrf';
  if (status === 403 && path.startsWith('/api/auth')) return 'user.login_denied';
  if (status === 403) return 'security.forbidden';
  return 'security.unauthorized';
}

function inferAction(req) {
  const path = req.path;
  const method = req.method;

  if (path === '/api/auth/github' && method === 'GET') return 'user.login';
  if (path === '/api/auth/github/callback' && method === 'GET') return 'user.login';
  if (path === '/api/auth/logout' && method === 'POST') return 'user.logout';
  if (path === '/api/projects' && method === 'POST') return 'project.create';
  if (path.match(/^\/api\/projects\/[^/]+$/) && method === 'PATCH') return 'project.update';
  if (path.match(/^\/api\/projects\/[^/]+$/) && method === 'DELETE') return 'project.delete';
  if (path.match(/^\/api\/projects\/[^/]+\/webhook$/) && method === 'POST') return 'project.webhook.register';
  if (path.match(/^\/api\/projects\/[^/]+\/webhook$/) && method === 'DELETE') return 'project.webhook.unregister';
  if (path.match(/^\/api\/deployments\/[^/]+\/redeploy/) && method === 'POST') return 'project.redeploy';
  if (path.match(/^\/api\/deployments\/[^/]+\/rollback/) && method === 'POST') return 'project.rollback';
  if (path.match(/^\/api\/deployments\/[^/]+$/) && method === 'POST') return 'project.deploy';
  if (path.match(/^\/api\/projects\/[^/]+\/settings/) && method === 'PATCH') return 'settings.update';

  return null;
}

function inferResource(req) {
  const path = req.path;
  if (path.startsWith('/api/projects')) return 'project';
  if (path.startsWith('/api/deployments')) return 'deployment';
  if (path.startsWith('/api/auth')) return 'user';
  return 'settings';
}

function inferResourceId(req, responseBody) {
  const parsed = typeof responseBody === 'string' ? safeJsonParse(responseBody) : responseBody;
  return (
    parsed?.project?._id ||
    parsed?.deployment?._id ||
    req.params?.id ||
    req.params?.projectId
  );
}

function extractMetadata(req, responseBody) {
  const parsed = typeof responseBody === 'string' ? safeJsonParse(responseBody) : responseBody;
  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // Only whitelisted, non-sensitive fields are stored.
  const metadata = {
    name: body.name ?? parsed?.project?.name,
    framework: body.framework ?? parsed?.project?.framework,
    subdomain: body.subdomain ?? parsed?.project?.subdomain,
    domain: body.domain ?? parsed?.project?.domain,
    trigger: parsed?.deployment?.trigger,
    deploymentStatus: parsed?.deployment?.status,
  };

  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined),
  );
}

function getUserId(req, sessionUserId) {
  return req.user?._id ?? req.session?.userId ?? sessionUserId ?? undefined;
}

function getErrorCode(responseBody) {
  const parsed = typeof responseBody === 'string' ? safeJsonParse(responseBody) : responseBody;
  return typeof parsed?.error?.code === 'string' ? parsed.error.code : undefined;
}

function toObjectId(value) {
  if (!value) return undefined;
  if (typeof value === 'string') {
    return /^[a-f0-9]{24}$/i.test(value) ? value : undefined;
  }
  return value;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
