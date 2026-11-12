import { describe, expect, it } from 'vitest';
import { getLiveCatalog, getLiveProduct } from '../lib/live-catalog';
import { filterListings, parseListingQuery, sortListings } from '../lib/listing';
import { resolveVariant } from '../lib/variant';

/**
 * Real-API verification for F06 Batch 2 (opt-in: needs the local backend and
 * the seeded test catalogue; it only reads).
 *
 *   $env:F06_INTEGRATION = '1'; $env:API_BASE_URL = 'http://localhost:3000'
 *   npx vitest run src/test/catalog.integration.test.ts
 *
 * It checks that what the storefront shows (mapper + listing engine) agrees
 * with the API's own server-side filters for the same question.
 */

const enabled = process.env.F06_INTEGRATION === '1';
const API = `${(process.env.API_BASE_URL ?? 'http://localhost:3000').replace(/\/+$/, '')}/api/v1`;

async function apiSlugs(search: string): Promise<string[]> {
  const response = await fetch(`${API}/catalog/products?limit=50${search}`);
  expect(response.status).toBe(200);
  const page = (await response.json()) as { items: { slug: string }[] };
  return page.items.map((item) => item.slug).sort();
}

describe.skipIf(!enabled)('catalogue against the real API', () => {
  it('loads every published product with exact prices from the API', async () => {
    const catalog = await getLiveCatalog();
    const direct = await apiSlugs('');
    expect(catalog.products.map((p) => p.slug).sort()).toEqual(direct);
    expect(direct.length).toBeGreaterThanOrEqual(10);

    const casserole = catalog.products.find((p) => p.slug === 'enamelled-cast-iron-casserole');
    expect(casserole?.price.amountMinor).toBe(484500);
    expect(casserole?.previousPrice?.amountMinor).toBe(570000);
    expect(casserole?.discountBadge).toBe('−15%');
    expect(catalog.products.every((p) => p.availability === 'unknown')).toBe(true);
  });

  it('category filter equals the API category filter', async () => {
    const catalog = await getLiveCatalog();
    for (const slug of ['cookware', 'tableware', 'coffee-and-tea', 'sets-and-bundles']) {
      const mine = filterListings(catalog.listings, parseListingQuery(`?category=${slug}`))
        .map((l) => l.slug)
        .sort();
      expect(mine).toEqual(await apiSlugs(`&category=${slug}`));
    }
  });

  it('brand filter equals the API brand filter', async () => {
    const catalog = await getLiveCatalog();
    for (const brand of catalog.facets.brands) {
      const mine = filterListings(catalog.listings, parseListingQuery(`?brand=${brand.slug}`))
        .map((l) => l.slug)
        .sort();
      expect(mine).toEqual(await apiSlugs(`&brand=${brand.slug}`));
    }
  });

  it('search finds what the API search finds', async () => {
    const catalog = await getLiveCatalog();
    for (const term of ['casserole', 'linen', 'glass', 'wood', 'stoneware']) {
      const mine = filterListings(catalog.listings, parseListingQuery(`?q=${term}`))
        .map((l) => l.slug)
        .sort();
      const theirs = await apiSlugs(`&q=${term}`);
      // Every product the API matches is shown by the storefront search.
      for (const slug of theirs) expect(mine).toContain(slug);
    }
    expect(filterListings(catalog.listings, parseListingQuery('?q=zzzznothing'))).toHaveLength(0);
    expect(await apiSlugs('&q=zzzznothing')).toEqual([]);
  });

  it('price range equals the API price range', async () => {
    const catalog = await getLiveCatalog();
    const mine = catalog.listings
      .filter((l) => l.priceMinor >= 100000 && l.priceMinor <= 200000)
      .map((l) => l.slug)
      .sort();
    expect(mine).toEqual(await apiSlugs('&minPrice=100000&maxPrice=200000&currency=EGP'));
    expect(mine.length).toBeGreaterThan(0);
  });

  it('colour filter equals the API attribute filter on the Colour attribute', async () => {
    const catalog = await getLiveCatalog();
    const mine = filterListings(catalog.listings, parseListingQuery('?colour=clear'))
      .map((l) => l.slug)
      .sort();
    expect(mine).toEqual(await apiSlugs(`&attribute=${encodeURIComponent('Colour:Clear')}`));
    expect(mine.length).toBeGreaterThan(0);
  });

  it('material filter matches the products whose variants carry that material', async () => {
    const catalog = await getLiveCatalog();
    const mine = filterListings(catalog.listings, parseListingQuery('?material=Glass'))
      .map((l) => l.slug)
      .sort();
    const expected: string[] = [];
    for (const slug of await apiSlugs('')) {
      const detail = (await (await fetch(`${API}/catalog/products/${slug}`)).json()) as {
        variants: { material: string | null }[];
      };
      if (detail.variants.some((v) => v.material === 'Glass')) expected.push(slug);
    }
    expect(mine).toEqual(expected.sort());
    expect(mine.length).toBeGreaterThan(0);
  });

  it('on-offer shows exactly the discounted products', async () => {
    const catalog = await getLiveCatalog();
    const mine = filterListings(catalog.listings, parseListingQuery('?offer=1'))
      .map((l) => l.slug)
      .sort();
    const response = await fetch(`${API}/catalog/products?limit=50`);
    const page = (await response.json()) as {
      items: { slug: string; discountBasisPoints: number }[];
    };
    expect(mine).toEqual(
      page.items
        .filter((i) => i.discountBasisPoints > 0)
        .map((i) => i.slug)
        .sort(),
    );
    expect(mine.length).toBeGreaterThan(0);
  });

  it('sorts by the exact effective price', async () => {
    const catalog = await getLiveCatalog();
    const asc = sortListings(catalog.listings, parseListingQuery('?sort=price_asc')).map(
      (l) => l.priceMinor,
    );
    expect(asc).toEqual([...asc].sort((a, b) => a - b));
    const desc = sortListings(catalog.listings, parseListingQuery('?sort=price_desc')).map(
      (l) => l.priceMinor,
    );
    expect(desc).toEqual([...desc].sort((a, b) => b - a));
  });

  it('a product page has the API variants, SKUs and attributes', async () => {
    const product = await getLiveProduct('enamelled-cast-iron-casserole');
    expect(product).not.toBeNull();
    const skus = product!.variants!.map((v) => v.sku).sort();
    expect(skus).toEqual([
      'HC-CI-CAS-24-CRE',
      'HC-CI-CAS-24-SAG',
      'HC-CI-CAS-24-TER',
      'HC-CI-CAS-28-CRE',
      'HC-CI-CAS-28-SAG',
      'HC-CI-CAS-28-TER',
    ]);
    expect(resolveVariant(product!, { colourId: 'sage', sizeId: '28-cm-6-7-l' }).sku).toBe(
      'HC-CI-CAS-28-SAG',
    );
    expect(product!.specs?.some((s) => s.label === 'Material')).toBe(true);
    expect(await getLiveProduct('no-such-product')).toBeNull();
  });
});
