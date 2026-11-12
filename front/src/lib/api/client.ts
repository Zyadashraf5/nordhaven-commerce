/**
 * A very small typed HTTP client for the Nordhaven Commerce API.
 *
 * It intentionally has no dependencies: the storefront only needs GET/POST with
 * JSON bodies, a bearer token, and a predictable error shape.
 */

export interface ApiClientOptions {
  baseUrl: string;
  /** Bearer token for authenticated endpoints. */
  token?: string | undefined;
  /** Injectable fetch, so tests do not need a network. */
  fetchImpl?: typeof fetch;
  /** Extra headers merged into every request. */
  headers?: Record<string, string>;
}

export type QueryValue = string | number | boolean | undefined | (string | number | boolean)[];

export interface ApiRequestOptions {
  query?: Record<string, QueryValue>;
  signal?: AbortSignal | undefined;
  headers?: Record<string, string>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

export interface ApiClient {
  request<T>(
    method: string,
    path: string,
    options?: ApiRequestOptions & { body?: unknown },
  ): Promise<T>;
  get<T>(path: string, options?: ApiRequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T>;
}

function buildUrl(baseUrl: string, path: string, query?: ApiRequestOptions['query']): string {
  const url = new URL(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export function createApiClient(options: ApiClientOptions): ApiClient {
  const { baseUrl, token, headers: extraHeaders, fetchImpl } = options;
  const doFetch = fetchImpl ?? fetch;

  async function request<T>(
    method: string,
    path: string,
    requestOptions: ApiRequestOptions & { body?: unknown } = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...extraHeaders,
      ...requestOptions.headers,
    };
    if (requestOptions.body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    if (token) {
      headers.authorization = `Bearer ${token}`;
    }

    const init: RequestInit = { method, headers };
    if (requestOptions.body !== undefined) {
      init.body = JSON.stringify(requestOptions.body);
    }
    if (requestOptions.signal !== undefined) {
      init.signal = requestOptions.signal;
    }

    const response = await doFetch(buildUrl(baseUrl, path, requestOptions.query), init);

    const text = await response.text();
    const body: unknown = text.length > 0 ? safeParse(text) : undefined;

    if (!response.ok) {
      throw new ApiError(
        response.status,
        body,
        `Request failed: ${method} ${path} (${response.status})`,
      );
    }
    return body as T;
  }

  return {
    request,
    get: (path, requestOptions) => request('GET', path, requestOptions),
    post: (path, body, requestOptions) => request('POST', path, { ...requestOptions, body }),
  };
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
