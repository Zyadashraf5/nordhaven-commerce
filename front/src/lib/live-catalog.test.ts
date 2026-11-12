import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFetchMock } from '../test/api-mock';
import { CatalogUnavailableError, getLiveCatalog, getLiveProduct } from './live-catalog';

/**
 * The live-catalogue reader against a mocked API: which endpoints it calls,
 * how it pages, and — importantly — that an unreachable or failing API raises
 * an error instead of falling back to invented data.
 */

const BASE = 'http://localhost:3000/api/v1';
const summary = (slug: string, name: string, extra = {}) => ({
  id: `id-${slug}`,
  name,
  slug,
  status: 'PUBLISHED',
  baseCurrency: 'EGP',
  basePriceMinor: 125000,
  discountBasisPoints: 0,
  effectivePriceMinor: 125000,
  brand: { id: 'b1', name: 'Olea', slug: 'olea' },
  category: { id: 'c1', name: 'Kitchen tools', slug: 'kitchen-tools' },
  createdAt: '2026-10-23T00:00:00Z',
  updatedAt: '2026-10-23T00:00:00Z',
  ...extra,
});
const detail = (slug: string, name: string, extra = {}) => ({
  ...summary(slug, name, extra),
  description: `About ${name}`,
  images: [{ url: 'http://localhost:3003/images/a.webp', altText: null, position: 0 }],
  attributes: [{ name: 'Material', value: 'Olive wood', position: 0 }],
  variants: [
    {
      id: 'v',
      sku: `SKU-${slug}`,
      color: null,
      size: null,
      material: null,
      position: 0,
      createdAt: '',
      updatedAt: '',
    },
  ],
});

const tree = {
  categories: [
    {
      id: 'c1',
      name: 'Kitchen tools',
      slug: 'kitchen-tools',
      parentId: null,
      position: 0,
      children: [],
      createdAt: '',
      updatedAt: '',
    },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getLiveCatalog', () => {
  it('reads categories, brands, products (all pages) and each product detail from the API', async () => {
    const calls = installFetchMock({
      [`GET ${BASE}/catalog/categories`]: { body: tree },
      [`GET ${BASE}/catalog/brands`]: {
        body: { brands: [{ id: 'b1', name: 'Olea', slug: 'olea', createdAt: '', updatedAt: '' }] },
      },
      [`GET ${BASE}/catalog/products?limit=50`]: {
        body: { items: [summary('board', 'Serving Board')], nextCursor: 'next-1' },
      },
      [`GET ${BASE}/catalog/products?limit=50&cursor=next-1`]: {
        body: { items: [summary('mug', 'Mug')], nextCursor: null },
      },
      [`GET ${BASE}/catalog/products/board`]: { body: detail('board', 'Serving Board') },
      [`GET ${BASE}/catalog/products/mug`]: { body: detail('mug', 'Mug') },
    });
    const catalog = await getLiveCatalog(new Date('2026-10-24T00:00:00Z'));
    expect(catalog.products.map((p) => p.slug)).toEqual(['board', 'mug']);
    expect(catalog.listings.map((l) => l.rank)).toEqual([0, 1]);
    expect(catalog.categories.map((c) => c.slug)).toEqual(['kitchen-tools']);
    expect(catalog.facets.brands.map((b) => b.slug)).toEqual(['olea']);
    expect(catalog.complete).toBe(true);
    expect(calls.every((call) => call.method === 'GET')).toBe(true);
    // No credentials and no session are sent for public catalogue reads.
    expect(calls.every((call) => !('authorization' in call.headers))).toBe(true);
  });

  it('skips a product whose detail disappeared between the list and the read', async () => {
    installFetchMock({
      [`GET ${BASE}/catalog/categories`]: { body: tree },
      [`GET ${BASE}/catalog/brands`]: { body: { brands: [] } },
      [`GET ${BASE}/catalog/products?limit=50`]: {
        body: { items: [summary('gone', 'Gone'), summary('here', 'Here')], nextCursor: null },
      },
      [`GET ${BASE}/catalog/products/gone`]: {
        status: 404,
        body: { statusCode: 404, code: 'NOT_FOUND', message: 'x', correlationId: 'c' },
      },
      [`GET ${BASE}/catalog/products/here`]: { body: detail('here', 'Here') },
    });
    const catalog = await getLiveCatalog();
    expect(catalog.products.map((p) => p.slug)).toEqual(['here']);
  });

  it('raises an unavailable error when the API cannot be reached (no fallback data)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('fetch failed'))),
    );
    await expect(getLiveCatalog()).rejects.toBeInstanceOf(CatalogUnavailableError);
  });

  it('raises an unavailable error when the API answers 5xx or 429', async () => {
    installFetchMock({ [`GET ${BASE}/catalog/categories`]: { status: 500, body: {} } });
    await expect(getLiveCatalog()).rejects.toBeInstanceOf(CatalogUnavailableError);
    installFetchMock({ [`GET ${BASE}/catalog/categories`]: { status: 429, body: {} } });
    await expect(getLiveCatalog()).rejects.toMatchObject({ status: 429 });
  });

  it('gives an empty catalogue (not an error) when the API has no published products', async () => {
    installFetchMock({
      [`GET ${BASE}/catalog/categories`]: { body: tree },
      [`GET ${BASE}/catalog/brands`]: { body: { brands: [] } },
      [`GET ${BASE}/catalog/products?limit=50`]: { body: { items: [], nextCursor: null } },
    });
    const catalog = await getLiveCatalog();
    expect(catalog.products).toEqual([]);
    expect(catalog.listings).toEqual([]);
  });
});

describe('getLiveProduct', () => {
  it('maps one product from GET /catalog/products/{slug}', async () => {
    installFetchMock({
      [`GET ${BASE}/catalog/products/board`]: { body: detail('board', 'Serving Board') },
    });
    const product = await getLiveProduct('board');
    expect(product?.name).toBe('Serving Board');
    expect(product?.availability).toBe('unknown');
  });

  it('returns null for an unknown slug (a 404 page, not an error)', async () => {
    installFetchMock({
      [`GET ${BASE}/catalog/products/nope`]: {
        status: 404,
        body: { statusCode: 404, code: 'NOT_FOUND', message: 'x', correlationId: 'c' },
      },
    });
    expect(await getLiveProduct('nope')).toBeNull();
  });

  it('raises when the API is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('fetch failed'))),
    );
    await expect(getLiveProduct('board')).rejects.toBeInstanceOf(CatalogUnavailableError);
  });
});
