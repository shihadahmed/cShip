import AuditLog from '../models/AuditLog.js';

export function createAuditMiddleware() {
  return async (req, res, next) => {
    const originalSend = res.send;
    res.send = function(body) {
      // Only log successful mutating requests
      if (['POST', 'PATCH', 'DELETE'].includes(req.method) && res.statusCode < 400) {
        const action = inferAction(req);
        if (action && req.user) {
          // Fire and forget - don't await
          AuditLog.create({
            userId: req.user._id,
            action,
            resource: inferResource(req),
            resourceId: inferResourceId(req, body),
            metadata: extractMetadata(req, body),
            ip: req.ip,
            userAgent: req.get('user-agent'),
          }).catch(err => console.error('Audit log failed:', err));
        }
      }
      return originalSend.call(this, body);
    };
    next();
  };
}

function inferAction(req) {
  const path = req.path;
  const method = req.method;

  if (path === '/api/auth/github' && method === 'GET') return 'user.login';
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

function inferResourceId(req, body) {
  // Try to extract from response body
  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    return parsed?.project?._id || parsed?.deployment?._id || parsed?.webhook?.id || req.params.id || req.params.projectId;
  } catch {
    return req.params.id || req.params.projectId;
  }
}

function extractMetadata(req, body) {
  // Extract relevant metadata for audit trail
  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    return {
      name: parsed?.project?.name,
      framework: parsed?.project?.framework,
      status: parsed?.deployment?.status,
      trigger: parsed?.deployment?.trigger,
      subdomain: parsed?.project?.subdomain,
      domain: parsed?.project?.domain,
    };
  } catch {
    return {};
  }
}