import crypto from 'node:crypto';

export function csrfTokenRoute(req, res) {
  const config = req.config || { isProduction: false };
  const token = crypto.randomBytes(32).toString('hex');
  res.cookie('csrf_token', token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    maxAge: 14 * 24 * 60 * 60 * 1000,
    path: '/',
  });
  res.json({ csrfToken: token });
}

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/**
 * Webhook endpoints are authenticated by their provider signature (HMAC), not
 * by a browser session, so they cannot participate in CSRF double-submit.
 */
function isCsrfExempt(req) {
  return (
    req.path?.startsWith('/api/webhooks') ||
    req.originalUrl?.startsWith('/api/webhooks')
  );
}

export function validateCsrf(req, res, next) {
  if (SAFE_METHODS.includes(req.method) || isCsrfExempt(req)) {
    return next();
  }

  const cookieToken = req.cookies?.csrf_token;
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({
      error: {
        code: 'CSRF_ERROR',
        message: 'Invalid or missing CSRF token',
      },
    });
  }

  next();
}

export function createCsrfMiddleware(config) {
  function csrfTokenRoute(req, res) {
    const cfg = req.config || config;
    const token = crypto.randomBytes(32).toString('hex');
    res.cookie('csrf_token', token, {
      httpOnly: true,
      secure: cfg.isProduction,
      sameSite: 'lax',
      maxAge: 14 * 24 * 60 * 60 * 1000,
      path: '/',
    });
    res.json({ csrfToken: token });
  }

  function validateCsrf(req, res, next) {
    if (SAFE_METHODS.includes(req.method) || isCsrfExempt(req)) {
      return next();
    }

    const cookieToken = req.cookies?.csrf_token;
    const headerToken = req.headers['x-csrf-token'];

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      return res.status(403).json({
        error: {
          code: 'CSRF_ERROR',
          message: 'Invalid or missing CSRF token',
        },
      });
    }

    next();
  }

  return { csrfTokenRoute, validateCsrf };
}

export { createCsrfMiddleware as default };