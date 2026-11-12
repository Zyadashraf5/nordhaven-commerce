import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { API_BASE_URL, API_PREFIX } from './config';

/**
 * Server-side half of the F06 integration (BFF). The backend issues an opaque
 * bearer session; the storefront keeps it in an httpOnly cookie so page
 * scripts never see it, and every browser call goes through same-origin
 * route handlers that attach it. Nothing here decides authorisation — the
 * backend enforces roles, MFA and ownership on every request.
 */

export const SESSION_COOKIE = 'hc_session';

/** Mutating browser calls must carry this header (simple CSRF guard: a
 * cross-site page cannot set it without a CORS preflight, which we never
 * answer). */
export const CSRF_HEADER = 'x-hc-request';
export const CSRF_VALUE = 'storefront';

/** Development default: the NestJS API on :3000 (see .env.example). */
export function backendBaseUrl(): string {
  return API_BASE_URL.length > 0 ? API_BASE_URL : 'http://localhost:3000';
}

export function backendUrl(path: string, search = ''): string {
  return `${backendBaseUrl()}${API_PREFIX}/${path.replace(/^\/+/, '')}${search}`;
}

export async function readSessionToken(): Promise<string | undefined> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value;
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: string): void {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

export function hasCsrfHeader(request: Request): boolean {
  return request.headers.get(CSRF_HEADER) === CSRF_VALUE;
}

/** The closed error shape the backend uses, for errors raised here. */
export function localError(statusCode: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    { statusCode, code, message, correlationId: 'storefront' },
    { status: statusCode },
  );
}

export interface BackendResult {
  status: number;
  body: unknown;
  headers: Headers;
}

/** Calls the backend and returns status + parsed body; network failures map
 * to 503 so the UI shows "unavailable" instead of a false success. */
export async function callBackend(
  method: string,
  path: string,
  init: {
    body?: string | undefined;
    token?: string | undefined;
    search?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<BackendResult> {
  if (process.env.NORDHAVEN_DEMO === '1') {
    return {
      status: 503,
      body: {
        statusCode: 503,
        code: 'PORTFOLIO_READ_ONLY',
        message: 'This portfolio preview is read-only. Orders, accounts and payments are disabled.',
      },
      headers: new Headers(),
    };
  }
  const headers: Record<string, string> = { accept: 'application/json', ...init.headers };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  try {
    const response = await fetch(backendUrl(path, init.search ?? ''), {
      method,
      headers,
      body: init.body ?? null,
      cache: 'no-store',
    });
    const text = await response.text();
    let body: unknown = undefined;
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    return { status: response.status, body, headers: response.headers };
  } catch {
    return {
      status: 503,
      body: {
        statusCode: 503,
        code: 'BACKEND_UNAVAILABLE',
        message: 'The store service is not reachable right now.',
        correlationId: 'storefront',
      },
      headers: new Headers(),
    };
  }
}

/** Builds the browser response for a backend result (no body for 204). */
export function relay(result: BackendResult): NextResponse {
  if (result.status === 204 || result.body === undefined) {
    return new NextResponse(null, { status: result.status });
  }
  const response = NextResponse.json(result.body, { status: result.status });
  const correlation = result.headers.get('x-correlation-id');
  if (correlation) response.headers.set('x-correlation-id', correlation);
  return response;
}
