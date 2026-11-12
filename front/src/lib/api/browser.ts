import { ApiError, type QueryValue } from './client';

/**
 * Browser-side access to the backend (F06). Every call goes to the
 * storefront's own origin — `/api/hc/*` for API operations and
 * `/api/session/*` for the account-access flows — so the session credential
 * stays in an httpOnly cookie and the backend needs no CORS.
 */

const CSRF = { 'x-hc-request': 'storefront' };

/** The backend's closed error shape (ErrorResponse in openapi.json). */
export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  correlationId: string;
  details?: unknown;
}

export function errorBody(error: unknown): ApiErrorBody | null {
  if (error instanceof ApiError && error.body && typeof error.body === 'object') {
    const body = error.body as Partial<ApiErrorBody>;
    if (typeof body.code === 'string' && typeof body.message === 'string') {
      return body as ApiErrorBody;
    }
  }
  return null;
}

/** A short, honest message for a failed call; never claims success. */
export function errorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (error instanceof ApiError) {
    if (error.status === 503)
      return 'The store is not reachable right now. Please try again shortly.';
    if (error.status === 429) return 'Too many attempts. Please wait a moment and try again.';
    const body = errorBody(error);
    if (body) return body.message;
  }
  return fallback;
}

function search(query?: Record<string, QueryValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((item) => params.append(key, String(item)));
    else params.set(key, String(value));
  }
  const text = params.toString();
  return text.length > 0 ? `?${text}` : '';
}

async function send<T>(
  method: string,
  url: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      ...(method === 'GET' ? {} : CSRF),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await fetch(url, init);
  const text = await response.text();
  let parsed: unknown = undefined;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      parsed,
      `Request failed: ${method} ${url} (${response.status})`,
    );
  }
  return parsed as T;
}

export interface CallOptions {
  query?: Record<string, QueryValue>;
  /** Sent as the `Idempotency-Key` header where the contract asks for one. */
  idempotencyKey?: string;
}

function headersFor(options?: CallOptions): Record<string, string> {
  return options?.idempotencyKey ? { 'idempotency-key': options.idempotencyKey } : {};
}

/** `path` is relative to /api/v1, e.g. `catalog/products`. */
export const api = {
  get: <T>(path: string, options?: CallOptions) =>
    send<T>('GET', `/api/hc/${path}${search(options?.query)}`, undefined, headersFor(options)),
  post: <T>(path: string, body?: unknown, options?: CallOptions) =>
    send<T>('POST', `/api/hc/${path}${search(options?.query)}`, body ?? {}, headersFor(options)),
  put: <T>(path: string, body?: unknown, options?: CallOptions) =>
    send<T>('PUT', `/api/hc/${path}${search(options?.query)}`, body ?? {}, headersFor(options)),
  patch: <T>(path: string, body?: unknown, options?: CallOptions) =>
    send<T>('PATCH', `/api/hc/${path}${search(options?.query)}`, body ?? {}, headersFor(options)),
  delete: <T>(path: string, options?: CallOptions) =>
    send<T>('DELETE', `/api/hc/${path}${search(options?.query)}`, undefined, headersFor(options)),
};

export type SessionAction =
  | 'sign-in'
  | 'mfa'
  | 'mfa-enrollment'
  | 'mfa-enrollment-confirmation'
  | 'register'
  | 'password-reset'
  | 'password-reset-confirmation'
  | 'sign-out';

export function sessionAction<T>(action: SessionAction, body?: unknown): Promise<T> {
  return send<T>('POST', `/api/session/${action}`, body);
}

/** A fresh idempotency key for one user intent (e.g. one "Place order" tap). */
export function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
