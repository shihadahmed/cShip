import { HttpError } from '../lib/http-error.js';

/**
 * Middleware to sanitize request body, query, and params to prevent NoSQL injection
 * and other injection attacks.
 */
export function sanitizeInput() {
  return (req, res, next) => {
    // Sanitize body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query);
    }

    // Sanitize params
    if (req.params && typeof req.params === 'object') {
      req.params = sanitizeObject(req.params);
    }

    next();
  };
}

/**
 * Recursively sanitize an object by removing MongoDB operator keys
 * and other potentially dangerous keys.
 */
function sanitizeObject(obj, seen = new WeakSet()) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  // Prevent circular references
  if (seen.has(obj)) {
    return obj;
  }
  seen.add(obj);

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, seen));
  }

  // Handle plain objects
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    // Skip MongoDB operator keys (starting with $)
    if (key.startsWith('$')) {
      continue;
    }

    // Skip keys that could be used for prototype pollution
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      continue;
    }

    // Recursively sanitize nested objects
    if (value && typeof value === 'object') {
      sanitized[key] = sanitizeObject(value, seen);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Middleware to validate request body size against configurable limit
 */
export function bodySizeLimit(maxSize = '1mb') {
  // Parse size string (e.g., '1mb', '500kb', '1000000')
  const parseSize = (size) => {
    if (typeof size === 'number') return size;
    const match = String(size).match(/^(\d+(?:\.\d+)?)\s*(kb|mb|gb)?$/i);
    if (!match) return 1024 * 1024; // Default 1MB
    const value = parseFloat(match[1]);
    const unit = (match[2] || 'mb').toLowerCase();
    switch (unit) {
      case 'kb': return value * 1024;
      case 'mb': return value * 1024 * 1024;
      case 'gb': return value * 1024 * 1024 * 1024;
      default: return value * 1024 * 1024;
    }
  };

  const limit = parseSize(maxSize);

  return (req, res, next) => {
    const contentLength = req.headers['content-length'];
    if (contentLength) {
      const length = parseInt(contentLength, 10);
      if (length > limit) {
        throw new HttpError(413, 'Request entity too large', { code: 'PAYLOAD_TOO_LARGE' });
      }
    }
    next();
  };
}