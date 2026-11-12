import { vi } from 'vitest';

/**
 * A tiny fetch mock for component tests of the API-connected screens: routes
 * are matched by "METHOD /path" and answered in order; anything unmocked
 * answers 500 so a test never passes by accident.
 */

export interface MockReply {
  status?: number;
  body?: unknown;
}

export interface MockCall {
  method: string;
  url: string;
  body: unknown;
  headers: Record<string, string>;
}

export function installFetchMock(
  routes: Record<string, MockReply | MockReply[] | ((call: MockCall) => MockReply)>,
) {
  const calls: MockCall[] = [];
  const queue = new Map<string, MockReply[]>();
  for (const [key, value] of Object.entries(routes)) {
    if (Array.isArray(value)) queue.set(key, [...value]);
  }
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit = {}) => {
      const method = (init.method ?? 'GET').toUpperCase();
      const call: MockCall = {
        method,
        url,
        body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
        headers: (init.headers ?? {}) as Record<string, string>,
      };
      calls.push(call);
      const key = `${method} ${url}`;
      const route = routes[key];
      let reply: MockReply = {
        status: 500,
        body: { code: 'UNMOCKED', message: `unmocked ${key}` },
      };
      if (Array.isArray(route)) {
        const list = queue.get(key) ?? [];
        reply = list.length > 1 ? (list.shift() as MockReply) : (list[0] ?? reply);
      } else if (typeof route === 'function') {
        reply = route(call);
      } else if (route) {
        reply = route;
      }
      const status = reply.status ?? 200;
      return Promise.resolve(
        new Response(
          status === 204 || reply.body === undefined ? null : JSON.stringify(reply.body),
          { status },
        ),
      );
    }),
  );
  return calls;
}
