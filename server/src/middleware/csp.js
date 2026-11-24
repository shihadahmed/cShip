import crypto from 'node:crypto';

/**
 * Creates a Content Security Policy middleware with nonce support for inline scripts/styles.
 * Generates a unique nonce per request and makes it available to views via res.locals.cspNonce.
 */
export function createCspMiddleware(config) {
  const isProduction = config.isProduction === true;

  // Base CSP directives - restrictive by default
  const baseDirectives = {
    'default-src': ["'self'"],
    'script-src': ["'self'"],
    'style-src': ["'self'"],
    'img-src': ["'self'", 'data:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
  };

  // In development, allow more relaxed policies for hot reloading
  if (!isProduction) {
    baseDirectives['script-src'].push("'unsafe-eval'", "'unsafe-inline'");
    baseDirectives['style-src'].push("'unsafe-inline'");
    baseDirectives['connect-src'].push('ws:', 'wss:');
  }

  // Add configured client origins to connect-src for API calls
  if (config.clientOrigins && config.clientOrigins.length > 0) {
    baseDirectives['connect-src'].push(...config.clientOrigins);
  }

  return (req, res, next) => {
    // Generate a unique nonce for this request
    const nonce = crypto.randomBytes(16).toString('base64');
    res.locals.cspNonce = nonce;

    // Build CSP header with nonce for inline scripts/styles
    const directives = { ...baseDirectives };
    directives['script-src'] = [...directives['script-src'], `'nonce-${nonce}'`];
    directives['style-src'] = [...directives['style-src'], `'nonce-${nonce}'`];

    // Build CSP header string
    const cspHeader = Object.entries(directives)
      .map(([key, values]) => `${key} ${values.join(' ')}`)
      .join('; ');

    res.setHeader('Content-Security-Policy', cspHeader);

    // Also set other security headers that helmet doesn't set by default
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('X-Download-Options', 'noopen');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');

    // HSTS header in production
    if (isProduction) {
      // 1 year, include subdomains, preload
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    }

    next();
  };
}

/**
 * Helper to get CSP nonce in views
 */
export function getCspNonce(res) {
  return res.locals?.cspNonce || '';
}