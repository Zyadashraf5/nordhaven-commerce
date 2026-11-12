import { describe, expect, it } from 'vitest';
import type { ApiProductDetail } from './api/catalog-types';
import { buildFacets } from './catalog-facets';
import { colourKey, discountBadge, normaliseImageUrl, toStorefrontProduct } from './catalog-mapper';
import { resolveVariant, resolveSelectionFromParams, serializeVariantParams } from './variant';
import { resolveAvailability } from './product';
import { filterListings, parseListingQuery, sortListings, toCatalogListing } from './listing';

/** A ProductDetailResponse as the backend returns it (shape from openapi.json). */
function detail(overrides: Partial<ApiProductDetail> = {}): ApiProductDetail {
  return {
    id: 'p1',
    name: 'Enamelled Cast-Iron Casserole',
    slug: 'enamelled-cast-iron-casserole',
    status: 'PUBLISHED',
    description: 'A tight-lid casserole.',
    baseCurrency: 'EGP',
    basePriceMinor: 570000,
    discountBasisPoints: 1500,
    effectivePriceMinor: 484500,
    brand: { id: 'b1', name: 'Atelier Nile', slug: 'atelier-nile' },
    category: { id: 'c1', name: 'Cookware', slug: 'cookware' },
    createdAt: '2026-10-20T10:00:00Z',
    updatedAt: '2026-10-20T10:00:00Z',
    images: [
      {
        url: 'http://localhost:3003/images/cookware-casserole.webp',
        altText: 'Casserole, front',
        position: 0,
      },
      { url: 'https://cdn.example.test/side.webp', altText: null, position: 1 },
    ],
    attributes: [
      { name: 'Material', value: 'Cast iron', position: 0 },
      { name: 'Capacity', value: '4.2 L', position: 1 },
      { name: 'Colour', value: 'Terracotta', position: 2 },
    ],
    variants: [
      {
        id: 'v1',
        sku: 'HC-CI-CAS-24-TER',
        color: 'Terracotta',
        size: '24 cm',
        material: 'Cast iron',
        position: 0,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'v2',
        sku: 'HC-CI-CAS-24-SAG',
        color: 'Sage',
        size: '24 cm',
        material: 'Cast iron',
        position: 1,
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'v3',
        sku: 'HC-CI-CAS-28-TER',
        color: 'Terracotta',
        size: '28 cm',
        material: 'Cast iron',
        position: 2,
        createdAt: '',
        updatedAt: '',
      },
    ],
    ...overrides,
  };
}

const NOW = new Date('2026-10-24T00:00:00Z');

describe('toStorefrontProduct', () => {
  it('uses the effective price and the base price as the previous price, from exact minor units', () => {
    const product = toStorefrontProduct(detail(), NOW);
    expect(product.price).toEqual({ amountMinor: 484500, currency: 'EGP' });
    expect(product.previousPrice).toEqual({ amountMinor: 570000, currency: 'EGP' });
    expect(product.discountBadge).toBe('−15%');
    expect(product.listings).toEqual(['featured', 'on_offer', 'new_in']);
  });

  it('has no previous price or badge without a discount, and is not "New in" when older than 30 days', () => {
    const product = toStorefrontProduct(
      detail({
        discountBasisPoints: 0,
        effectivePriceMinor: 570000,
        createdAt: '2026-08-01T00:00:00Z',
      }),
      NOW,
    );
    expect(product.previousPrice).toBeUndefined();
    expect(product.discountBadge).toBeUndefined();
    expect(product.listings).toEqual(['featured']);
  });

  it('never claims stock: availability is unknown and the text says it is confirmed at checkout', () => {
    const product = toStorefrontProduct(detail(), NOW);
    expect(product.availability).toBe('unknown');
    const resolved = resolveAvailability(product);
    expect(resolved.state).toBe('unknown');
    expect(resolved.text).toBe('Availability confirmed at checkout');
    expect(resolved.text).not.toMatch(/in stock/i);
    const variant = resolveVariant(product, { colourId: 'terracotta', sizeId: '24-cm' });
    expect(variant.statusText).toBe('Availability confirmed at checkout');
    expect(variant.overall).toBe('unknown');
    expect(variant.inStock).toBe(true);
  });

  it('builds colour and size options from the variants, in variant order', () => {
    const product = toStorefrontProduct(detail(), NOW);
    expect(product.options.map((o) => o.attribute)).toEqual(['colour', 'size']);
    expect(product.options[0]?.values.map((v) => v.label)).toEqual(['Terracotta', 'Sage']);
    expect(product.options[1]?.values.map((v) => v.label)).toEqual(['24 cm', '28 cm']);
    expect(product.summary).toBe('2 sizes · 2 colours');
    // Sage has no 28 cm variant, so that size is not offered in Sage.
    expect(product.options[0]?.values[1]?.availableSizes).toEqual(['24-cm']);
  });

  it('shows the API SKU of the selected colour × size, and round-trips it through the URL', () => {
    const product = toStorefrontProduct(detail(), NOW);
    expect(resolveVariant(product, { colourId: 'terracotta', sizeId: '28-cm' }).sku).toBe(
      'HC-CI-CAS-28-TER',
    );
    expect(resolveVariant(product, { colourId: 'sage', sizeId: '24-cm' }).sku).toBe(
      'HC-CI-CAS-24-SAG',
    );
    const search = serializeVariantParams(product, { colourId: 'terracotta', sizeId: '28-cm' });
    expect(search).toContain('sku=HC-CI-CAS-28-TER');
    expect(resolveSelectionFromParams(product, { sku: 'HC-CI-CAS-28-TER' })).toEqual({
      colourId: 'terracotta',
      sizeId: '28-cm',
    });
  });

  it('reads materials and colour keys from variants and attributes', () => {
    const product = toStorefrontProduct(detail(), NOW);
    expect(product.materials).toEqual(['Cast iron']);
    expect(product.colourKeys).toEqual(['terracotta', 'sage']);
    const single = toStorefrontProduct(
      detail({
        variants: [
          {
            id: 'v',
            sku: 'S-1',
            color: null,
            size: null,
            material: null,
            position: 0,
            createdAt: '',
            updatedAt: '',
          },
        ],
        attributes: [
          { name: 'Material', value: 'Linen', position: 0 },
          { name: 'Colour', value: 'Oat, Terracotta, Sage', position: 1 },
        ],
      }),
      NOW,
    );
    expect(single.options).toEqual([]);
    expect(single.sku).toBe('S-1');
    expect(single.materials).toEqual(['Linen']);
    expect(single.colourKeys).toEqual(['cream-oat', 'terracotta', 'sage']);
  });

  it('keeps unsupported detail blocks absent instead of inventing them', () => {
    const product = toStorefrontProduct(detail(), NOW);
    expect(product.care).toBeUndefined();
    expect(product.boxContents).toBeUndefined();
    expect(product.dimensions).toBeUndefined();
    expect(product.goesWellWith).toBeUndefined();
    expect(product.specs?.map((s) => s.label)).toEqual(['Material', 'Capacity']);
  });

  it('uses a neutral file when a product has no image', () => {
    const product = toStorefrontProduct(detail({ images: [] }), NOW);
    expect(product.image.src).toBe('/images/placeholder-product.svg');
    expect(product.image.alt).toBe('Enamelled Cast-Iron Casserole');
  });
});

describe('helpers', () => {
  it('formats discount badges', () => {
    expect(discountBadge(0)).toBeUndefined();
    expect(discountBadge(2000)).toBe('−20%');
    expect(discountBadge(1250)).toBe('−12.5%');
  });

  it('maps colour words onto the facet keys', () => {
    expect(colourKey('Terracotta')).toBe('terracotta');
    expect(colourKey('Cream & oat')).toBe('cream-oat');
    expect(colourKey('Natural wood')).toBe('natural-wood');
    expect(colourKey('Midnight')).toBe('midnight');
  });

  it('serves the storefront’s own /images files same-origin and leaves other hosts alone', () => {
    expect(normaliseImageUrl('http://localhost:3003/images/a.webp')).toBe('/images/a.webp');
    expect(normaliseImageUrl('http://127.0.0.1:3001/images/a.webp')).toBe('/images/a.webp');
    expect(normaliseImageUrl('https://cdn.example.test/images/a.webp')).toBe(
      'https://cdn.example.test/images/a.webp',
    );
    expect(normaliseImageUrl('http://localhost:3003/other/a.webp')).toBe(
      'http://localhost:3003/other/a.webp',
    );
  });
});

describe('live listings through the engine', () => {
  const products = [
    toStorefrontProduct(detail(), NOW),
    toStorefrontProduct(
      detail({
        id: 'p2',
        name: 'Olive Wood Serving Board',
        slug: 'olive-wood-serving-board',
        description: 'Oil-finished olive wood that serves bread and cheese.',
        discountBasisPoints: 0,
        basePriceMinor: 125000,
        effectivePriceMinor: 125000,
        brand: { id: 'b2', name: 'Olea', slug: 'olea' },
        category: { id: 'c2', name: 'Kitchen tools', slug: 'kitchen-tools' },
        createdAt: '2026-09-01T00:00:00Z',
        variants: [
          {
            id: 'v9',
            sku: 'HC-KT-BRD-45-OLV',
            color: null,
            size: null,
            material: 'Olive wood',
            position: 0,
            createdAt: '',
            updatedAt: '',
          },
        ],
        attributes: [{ name: 'Material', value: 'Olive wood', position: 0 }],
      }),
      NOW,
    ),
  ];
  const listings = products.map((product, index) => {
    const listing = toCatalogListing(product, `/products/${product.slug}`);
    listing.rank = index;
    listing.createdAt = product.id === 'p1' ? '2026-10-20T10:00:00Z' : '2026-09-01T00:00:00Z';
    listing.searchText = `${product.description} ${product.category.name}`;
    return listing;
  });

  it('marks live cards availability-unknown with the honest sentence and an add action', () => {
    expect(listings[0]?.availability).toBe('unknown');
    expect(listings[0]?.availabilityText).toBe('Availability confirmed at checkout');
  });

  it('filters by category, brand, on-offer and price band like the API filters', () => {
    expect(
      filterListings(listings, parseListingQuery('?category=cookware')).map((l) => l.slug),
    ).toEqual(['enamelled-cast-iron-casserole']);
    expect(filterListings(listings, parseListingQuery('?brand=olea')).map((l) => l.slug)).toEqual([
      'olive-wood-serving-board',
    ]);
    expect(filterListings(listings, parseListingQuery('?offer=1')).map((l) => l.slug)).toEqual([
      'enamelled-cast-iron-casserole',
    ]);
    expect(filterListings(listings, parseListingQuery('?price=under-1000')).length).toBe(0);
    expect(
      filterListings(listings, parseListingQuery('?price=1000-2500')).map((l) => l.slug),
    ).toEqual(['olive-wood-serving-board']);
    expect(
      filterListings(listings, parseListingQuery('?price=over-2500')).map((l) => l.slug),
    ).toEqual(['enamelled-cast-iron-casserole']);
  });

  it('searches names, descriptions and brands', () => {
    expect(filterListings(listings, parseListingQuery('?q=cheese')).map((l) => l.slug)).toEqual([
      'olive-wood-serving-board',
    ]);
    expect(filterListings(listings, parseListingQuery('?q=atelier')).length).toBe(1);
    expect(filterListings(listings, parseListingQuery('?q=zzz')).length).toBe(0);
  });

  it('sorts by price and by newest first using the real creation time', () => {
    expect(
      sortListings(listings, parseListingQuery('?sort=price_asc')).map((l) => l.priceMinor),
    ).toEqual([125000, 484500]);
    expect(
      sortListings(listings, parseListingQuery('?sort=price_desc')).map((l) => l.priceMinor),
    ).toEqual([484500, 125000]);
    expect(sortListings(listings, parseListingQuery('?sort=new')).map((l) => l.slug)[0]).toBe(
      'enamelled-cast-iron-casserole',
    );
    // Featured keeps the API's own order.
    expect(sortListings(listings, parseListingQuery('')).map((l) => l.slug)).toEqual([
      'enamelled-cast-iron-casserole',
      'olive-wood-serving-board',
    ]);
  });

  it('a parent category lists its children’s products', () => {
    const child = {
      ...listings[1]!,
      categorySlug: 'cast-iron',
      categoryPath: ['cast-iron', 'cookware'],
    };
    expect(filterListings([child], parseListingQuery('?category=cookware'))).toHaveLength(1);
    expect(filterListings([child], parseListingQuery('?category=tableware'))).toHaveLength(0);
  });

  it('hides the stock switch and the product-type filter when the data cannot support them', () => {
    const facets = buildFacets(listings, [], []);
    expect(facets.showStockSwitch).toBe(false);
    expect(facets.showTypeFilter).toBe(false);
    expect(facets.colours.map((c) => c.id)).toEqual(['terracotta', 'sage']);
    expect(facets.materials).toEqual(['Cast iron', 'Olive wood']);
  });
});
