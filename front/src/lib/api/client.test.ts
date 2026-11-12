import { describe, expect, it } from 'vitest';
import { ApiError, createApiClient } from './client';

/** A fetch stub that records the request and answers with a fixed response. */
function stubFetch(responder: (url: string, init: RequestInit | undefined) => Response): {
  fetchImpl: typeof fetch;
  calls: { url: string; init: RequestInit | undefined }[];
} {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    return Promise.resolve(responder(url, init));
  };
  return { fetchImpl, calls };
}

describe('createApiClient', () => {
  it('builds the request URL with the query parameters the catalog endpoint expects', async () => {
    const { fetchImpl, calls } = stubFetch(
      () => new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 }),
    );
    const client = createApiClient({ baseUrl: 'http://localhost:3000', fetchImpl });

    await client.get('/api/v1/catalog/products', {
      query: { category: 'cookware', limit: 24, attribute: ['colour:terracotta', 'size:24'] },
    });

    const url = new URL(calls[0]?.url ?? '');
    expect(url.pathname).toBe('/api/v1/catalog/products');
    expect(url.searchParams.get('category')).toBe('cookware');
    expect(url.searchParams.get('limit')).toBe('24');
    expect(url.searchParams.getAll('attribute')).toEqual(['colour:terracotta', 'size:24']);
  });

  it('sends the bearer token when one is configured', async () => {
    const { fetchImpl, calls } = stubFetch(() => new Response('{}', { status: 200 }));
    const client = createApiClient({
      baseUrl: 'http://localhost:3000',
      token: 'token-value',
      fetchImpl,
    });

    await client.get('/api/v1/catalog/categories');
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe('Bearer token-value');
  });

  it('raises an ApiError for a failed response', async () => {
    const { fetchImpl } = stubFetch(
      () =>
        new Response(JSON.stringify({ message: 'nope' }), {
          status: 422,
          statusText: 'Unprocessable',
        }),
    );
    const client = createApiClient({ baseUrl: 'http://localhost:3000', fetchImpl });

    await expect(client.get('/api/v1/catalog/products')).rejects.toBeInstanceOf(ApiError);
  });

  it('serialises a JSON body for writes', async () => {
    const { fetchImpl, calls } = stubFetch(() => new Response('{}', { status: 201 }));
    const client = createApiClient({ baseUrl: 'http://localhost:3000', fetchImpl });

    await client.post('/api/v1/cart/items', { sku: 'HC-CI-CAS-24-TER', quantity: 1 });
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ sku: 'HC-CI-CAS-24-TER', quantity: 1 }));
  });
});
