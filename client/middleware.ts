import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Generates a base64 nonce using the Web Crypto API (available in the Edge
 * runtime used by middleware).
 */
function generateNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * Content Security Policy middleware for Next.js
 * Generates a nonce per request and sets CSP headers
 */
export function middleware(request: NextRequest) {
  const nonce = generateNonce();
  const isProduction = process.env.NODE_ENV === 'production';

  // Base CSP directives
  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", `'nonce-${nonce}'`],
    'style-src': ["'self'", `'nonce-${nonce}'`],
    // Inline style attributes (e.g. dynamic widths) cannot carry a nonce.
    'style-src-attr': ["'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
    'base-uri': ["'self'"],
    'object-src': ["'none'"],
  };

  // In development, allow unsafe-eval and unsafe-inline for hot reloading
  if (!isProduction) {
    directives['script-src'].push("'unsafe-eval'", "'unsafe-inline'");
    directives['style-src'].push("'unsafe-inline'");
    directives['connect-src'].push('ws:', 'wss:');
  }

  // Add API origin to connect-src for API calls
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  try {
    const apiOrigin = new URL(apiUrl).origin;
    if (!directives['connect-src'].includes(apiOrigin)) {
      directives['connect-src'].push(apiOrigin);
    }
  } catch {
    // Invalid URL, ignore
  }

  // Build CSP header
  const cspHeader = Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');

  // Forward the nonce (and CSP) on the request so the root layout can attach
  // it to inline scripts, and so Next.js can nonce its own scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', cspHeader);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Set CSP header
  response.headers.set('Content-Security-Policy', cspHeader);

  // Additional security headers
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};