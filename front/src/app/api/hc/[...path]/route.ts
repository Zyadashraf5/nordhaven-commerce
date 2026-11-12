import type { NextResponse } from 'next/server';
import {
  callBackend,
  clearSessionCookie,
  hasCsrfHeader,
  localError,
  readSessionToken,
  relay,
} from '../../../../lib/api/server';

/**
 * Same-origin proxy: /api/hc/{path} → {API}/api/v1/{path}, with the session
 * cookie turned into the bearer header. It adds no authority of its own —
 * the backend checks the role, MFA and ownership of every call — and it
 * refuses the routes that have dedicated handlers or are not for browsers.
 */
export const dynamic = 'force-dynamic';

const BLOCKED_PREFIXES = [
  'auth/login',
  'auth/register',
  'auth/password-reset',
  'payments/webhooks',
];
const FORWARDED_HEADERS = ['idempotency-key', 'if-match'];

async function handle(
  request: Request,
  params: Promise<{ path: string[] }>,
): Promise<NextResponse> {
  const { path: segments } = await params;
  if (segments.some((segment) => segment === '..' || segment === '.' || segment.length === 0)) {
    return localError(400, 'BAD_PATH', 'Invalid path.');
  }
  const path = segments.map(encodeURIComponent).join('/');
  if (BLOCKED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return localError(404, 'NOT_FOUND', 'Not available through this route.');
  }
  const method = request.method.toUpperCase();
  if (method !== 'GET' && !hasCsrfHeader(request)) {
    return localError(403, 'CSRF_HEADER_REQUIRED', 'This request must come from the storefront.');
  }

  const headers: Record<string, string> = {};
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }
  const body = method === 'GET' || method === 'DELETE' ? undefined : await request.text();
  const token = await readSessionToken();
  const result = await callBackend(method, path, {
    token,
    body: body && body.length > 0 ? body : undefined,
    search: new URL(request.url).search,
    headers,
  });

  const response = relay(result);
  // A rejected session is dead: drop it so the UI shows "signed out". A 401
  // that rejects a password the request carried (POST auth/password with a
  // wrong current password) says nothing about the session, so it stays.
  const code = (result.body as { code?: unknown } | undefined)?.code;
  if (result.status === 401 && token && code !== 'INVALID_CREDENTIALS')
    clearSessionCookie(response);
  return response;
}

type Context = { params: Promise<{ path: string[] }> };

export function GET(request: Request, context: Context) {
  return handle(request, context.params);
}
export function POST(request: Request, context: Context) {
  return handle(request, context.params);
}
export function PUT(request: Request, context: Context) {
  return handle(request, context.params);
}
export function PATCH(request: Request, context: Context) {
  return handle(request, context.params);
}
export function DELETE(request: Request, context: Context) {
  return handle(request, context.params);
}
