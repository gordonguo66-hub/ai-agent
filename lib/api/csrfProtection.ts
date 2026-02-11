/**
 * CSRF (Cross-Site Request Forgery) Protection Utility
 *
 * Validates that requests originate from allowed origins to prevent
 * cross-site request forgery attacks.
 */

import { NextRequest, NextResponse } from "next/server";

/**
 * Allowed origins for cross-origin requests
 * These origins are permitted to make requests to the API
 */
const ALLOWED_ORIGINS: string[] = [
  // Production domains
  process.env.NEXT_PUBLIC_APP_URL,
  // Development
  'http://localhost:3000',
  'http://127.0.0.1:3000',
].filter((origin): origin is string => !!origin);

/**
 * Validate the origin of a request
 *
 * This function checks the Origin and Referer headers to ensure
 * the request comes from an allowed origin.
 *
 * @param request - The incoming NextRequest
 * @returns Object with valid boolean and optional error response
 */
export function validateOrigin(request: NextRequest): {
  valid: boolean;
  response?: NextResponse;
} {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  // When both Origin and Referer are missing, we CANNOT verify the request origin.
  // Browsers always send at least one of these headers on cross-origin POST/PUT/DELETE.
  // Missing both typically means: (a) server-to-server call, or (b) a crafted request.
  // Webhooks and cron endpoints bypass CSRF via shouldBypassCsrf() and have their own auth.
  // For user-facing mutation endpoints, require at least one header.
  if (!origin && !referer) {
    console.warn("[CSRF Protection] Blocked request: both Origin and Referer headers are missing");
    return {
      valid: false,
      response: NextResponse.json(
        { error: "Origin header required" },
        { status: 403 }
      ),
    };
  }

  // Extract the origin from referer if origin header is missing
  let requestOrigin: string | null = origin;
  if (!requestOrigin && referer) {
    try {
      requestOrigin = new URL(referer).origin;
    } catch {
      // Invalid referer URL
      requestOrigin = null;
    }
  }

  if (requestOrigin && !ALLOWED_ORIGINS.includes(requestOrigin)) {
    console.warn(`[CSRF Protection] Blocked request from origin: ${requestOrigin}`);
    return {
      valid: false,
      response: NextResponse.json(
        { error: "Invalid origin" },
        { status: 403 }
      ),
    };
  }

  return { valid: true };
}

/**
 * Middleware wrapper for CSRF protection
 *
 * Use this to wrap state-changing API route handlers (POST, PUT, DELETE)
 * to automatically validate the request origin.
 *
 * Exception routes (webhooks, cron) should NOT use this - they should
 * use their own authentication mechanisms (signatures, API keys).
 *
 * @example
 * export async function POST(request: NextRequest) {
 *   const csrfCheck = validateOrigin(request);
 *   if (!csrfCheck.valid) return csrfCheck.response;
 *
 *   // ... rest of handler
 * }
 */
export function requireValidOrigin(request: NextRequest): NextResponse | null {
  const { valid, response } = validateOrigin(request);
  return valid ? null : response || NextResponse.json(
    { error: "CSRF validation failed" },
    { status: 403 }
  );
}

/**
 * Check if a request should bypass CSRF protection
 *
 * Some endpoints need to accept requests from external sources:
 * - Stripe webhooks (validated by signature)
 * - Cron jobs (validated by API key)
 * - OAuth callbacks
 *
 * @param pathname - The request pathname
 * @returns true if the route should bypass CSRF checks
 */
export function shouldBypassCsrf(pathname: string): boolean {
  const bypassPaths = [
    '/api/webhooks/stripe',
    '/api/cron/',
    '/api/auth/callback',
  ];

  return bypassPaths.some(path => pathname.startsWith(path));
}
