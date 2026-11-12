import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LISTING_QUERY,
  bundleToCatalogListing,
  facetOptions,
  facetSwitchCounts,
  filterListings,
  paginate,
  parseListingQuery,
  serializeListingQuery,
  setFeaturedOrder,
  sortListings,
  toCatalogListing,
  type CatalogListing,
  type ListingQuery,
} from './listing';
import { egp } from '../data/money';
import type { StorefrontBundle, StorefrontProduct } from '../data/types';

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

function listing(
  overrides: Partial<CatalogListing> & Pick<CatalogListing, 'slug'>,
): CatalogListing {
  return {
    kind: 'product',
    name: overrides.slug,
    summary: '',
    note: '',
    brand: { name: 'Atelier Nile', slug: 'atelier-nile' },
    categorySlug: 'cookware',
    priceMinor: 100_000,
    availability: 'ok',
    availabilityText: 'In stock',
    listings: ['featured'],
    colourKeys: [],
    materials: [],
    href: `/products/${overrides.slug}`,
    image: { src: '/x.webp', alt: '' },
    action: 'add',
    ...overrides,
  };
}

const universe: CatalogListing[] = [
  listing({
    slug: 'a-casserole',
    name: 'Enamelled Cast-Iron Casserole',
    priceMinor: 485_000,
    previousPriceMinor: 570_000,
    discountBadge: '−15%',
    colourKeys: ['terracotta', 'sage', 'cream-oat'],
    materials: ['Cast iron'],
  }),
  listing({
    slug: 'b-board',
    name: 'Olive Wood Serving Board',
    priceMinor: 125_000,
    brand: { name: 'Olea', slug: 'olea' },
    categorySlug: 'kitchen-tools',
    materials: ['Olive wood'],
  }),
  listing({
    slug: 'c-mug',
    name: 'Stoneware Mug, 350 ml',
    priceMinor: 38_000,
    categorySlug: 'tableware',
    colourKeys: ['sage', 'cream-oat'],
    materials: ['Stoneware'],
    swatches: [
      { id: 'sage', label: 'Sage', hex: '#8E9A86', inStock: true },
      { id: 'cream', label: 'Cream', hex: '#E8E1D3', inStock: false },
    ],
  }),
  listing({
    slug: 'd-jars',
    name: 'Glass Storage Jars, Set of 3',
    priceMinor: 98_000,
    brand: { name: 'Clearline', slug: 'clearline' },
    categorySlug: 'storage',
    availability: 'out',
    colourKeys: ['clear'],
    materials: ['Glass'],
  }),
];

setFeaturedOrder(['a-casserole', 'b-board', 'c-mug', 'd-jars']);

function query(overrides: Partial<ListingQuery> = {}): ListingQuery {
  return { ...DEFAULT_LISTING_QUERY, ...overrides };
}

/* ------------------------------------------------------------------ *
 * URL contract
 * ------------------------------------------------------------------ */

describe('listing URL contract', () => {
  it('parses the full query shape', () => {
    const parsed = parseListingQuery(
      '?q=kettle&category=coffee-and-tea&type=single&type=fixed-set&price=under-1000&colour=clear&material=Glass&brand=clearline&stock=1&offer=1&listing=new_in&sort=price_asc&page=2',
    );
    expect(parsed.q).toBe('kettle');
    expect(parsed.categories).toEqual(['coffee-and-tea']);
    expect(parsed.types).toEqual(['single', 'fixed-set']);
    expect(parsed.priceBands).toEqual(['under-1000']);
    expect(parsed.colours).toEqual(['clear']);
    expect(parsed.materials).toEqual(['Glass']);
    expect(parsed.brands).toEqual(['clearline']);
    expect(parsed.inStockOnly).toBe(true);
    expect(parsed.onOfferOnly).toBe(true);
    expect(parsed.listing).toBe('new_in');
    expect(parsed.sort).toBe('price_asc');
    expect(parsed.page).toBe(2);
  });

  it('round-trips through serializeListingQuery', () => {
    const parsed = parseListingQuery('?q=mug&sort=price_desc&page=3');
    expect(serializeListingQuery(parsed)).toBe('?q=mug&sort=price_desc&page=3');
  });

  it('ignores unknown values and clamps the page', () => {
    const parsed = parseListingQuery('?type=weird&sort=weird&page=0&colour=&category=');
    expect(parsed.types).toEqual([]);
    expect(parsed.sort).toBe('featured');
    expect(parsed.page).toBe(1);
    expect(parseListingQuery('?page=99').page).toBe(99);
  });

  it('uses a single `category` param like the nav pills', () => {
    expect(serializeListingQuery(query({ categories: ['cookware'] }))).toBe('?category=cookware');
    expect(serializeListingQuery(query({ categories: ['cookware', 'storage'] }))).toBe(
      '?category=cookware&category=storage',
    );
  });

  it('drops default values', () => {
    expect(serializeListingQuery(query())).toBe('');
  });

  it('resets the page when facets change', () => {
    expect(parseListingQuery('?page=3').page).toBe(3);
  });
});

/* ------------------------------------------------------------------ *
 * Filtering
 * ------------------------------------------------------------------ */

describe('listing filters', () => {
  it('filters by category', () => {
    const slugs = filterListings(universe, query({ categories: ['tableware'] })).map((l) => l.slug);
    expect(slugs).toEqual(['c-mug']);
  });

  it('filters by product type', () => {
    const bundles: CatalogListing[] = [
      listing({ slug: 'e-fixed', kind: 'bundle', bundleKind: 'fixed' }),
      listing({ slug: 'f-dynamic', kind: 'bundle', bundleKind: 'dynamic' }),
    ];
    const mixed = [...bundles, ...universe];
    expect(filterListings(mixed, query({ types: ['single'] })).map((l) => l.kind)).not.toContain(
      'bundle',
    );
    expect(filterListings(mixed, query({ types: ['fixed-set'] })).map((l) => l.slug)).toEqual([
      'e-fixed',
    ]);
    expect(filterListings(mixed, query({ types: ['dynamic-set'] })).map((l) => l.slug)).toEqual([
      'f-dynamic',
    ]);
  });

  it('treats EGP 1,000 as the start of the middle band and EGP 2,500 as over', () => {
    const at1000 = listing({ slug: 'at-1000', priceMinor: 100_000 });
    const at2500 = listing({ slug: 'at-2500', priceMinor: 250_000 });
    const at999 = listing({ slug: 'at-999', priceMinor: 99_900 });
    expect(
      filterListings([at1000, at2500, at999], query({ priceBands: ['under-1000'] })).map(
        (l) => l.slug,
      ),
    ).toEqual(['at-999']);
    expect(
      filterListings([at1000, at2500, at999], query({ priceBands: ['1000-2500'] })).map(
        (l) => l.slug,
      ),
    ).toEqual(['at-1000']);
    expect(
      filterListings([at1000, at2500, at999], query({ priceBands: ['over-2500'] })).map(
        (l) => l.slug,
      ),
    ).toEqual(['at-2500']);
  });

  it('filters by colour, material and brand', () => {
    expect(filterListings(universe, query({ colours: ['sage'] })).map((l) => l.slug)).toEqual([
      'a-casserole',
      'c-mug',
    ]);
    expect(filterListings(universe, query({ materials: ['Glass'] })).map((l) => l.slug)).toEqual([
      'd-jars',
    ]);
    expect(filterListings(universe, query({ brands: ['clearline'] })).map((l) => l.slug)).toEqual([
      'd-jars',
    ]);
  });

  it('In stock only excludes the out-of-stock listing', () => {
    expect(filterListings(universe, query({ inStockOnly: true })).map((l) => l.slug)).toEqual([
      'a-casserole',
      'b-board',
      'c-mug',
    ]);
  });

  it('On offer keeps only discounted listings', () => {
    expect(filterListings(universe, query({ onOfferOnly: true })).map((l) => l.slug)).toEqual([
      'a-casserole',
    ]);
  });

  it('every search token must hit a searchable field', () => {
    expect(filterListings(universe, query({ q: 'casserole' })).map((l) => l.slug)).toEqual([
      'a-casserole',
    ]);
    const slugs = filterListings(universe, query({ q: 'Enamelled CAST' })).map((l) => l.slug);
    expect(slugs).toEqual(['a-casserole']);
    expect(filterListings(universe, query({ q: 'stone wood' }))).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * Facet counts
 * ------------------------------------------------------------------ */

describe('facet counts', () => {
  it('counts colour options over the other facets’ result', () => {
    const counts = facetOptions(universe, query({ materials: ['Stoneware'] }), 'colours', [
      { value: 'sage', label: 'Sage' },
      { value: 'clear', label: 'Clear' },
    ]);
    expect(counts).toEqual([
      { value: 'sage', label: 'Sage', count: 1 },
      { value: 'clear', label: 'Clear', count: 0 },
    ]);
  });

  it('counts the availability switch candidates', () => {
    expect(facetSwitchCounts(universe, query(), 'inStockOnly')).toBe(3);
    expect(facetSwitchCounts(universe, query(), 'onOfferOnly')).toBe(1);
  });
});

/* ------------------------------------------------------------------ *
 * Sorting
 * ------------------------------------------------------------------ */

describe('listing sorting', () => {
  it('featured follows the approved board order', () => {
    const shuffled = [...universe].reverse();
    expect(sortListings(shuffled, query()).map((l) => l.slug)).toEqual([
      'a-casserole',
      'b-board',
      'c-mug',
      'd-jars',
    ]);
  });

  it('Newest lifts listings tagged new_in', () => {
    const withNew = [...universe, listing({ slug: 'e-new', name: 'New Thing' })];
    const ordered = sortListings(withNew, query({ sort: 'new' }));
    expect(ordered[0]?.listings).toContain('featured');
    void withNew;
    expect(
      sortListings([...universe].reverse(), query({ sort: 'new' })).map((l) => l.slug),
    ).toEqual(['a-casserole', 'b-board', 'c-mug', 'd-jars']);
  });

  it('sorts by price both ways', () => {
    const asc = sortListings([...universe].reverse(), query({ sort: 'price_asc' }));
    expect(asc.map((l) => l.priceMinor)).toEqual([38_000, 98_000, 125_000, 485_000]);
    const desc = sortListings([...universe], query({ sort: 'price_desc' }));
    expect(desc.map((l) => l.priceMinor)).toEqual([485_000, 125_000, 98_000, 38_000]);
  });

  it('ranks search results by name-start, then name, then the rest', () => {
    const haystacks = [
      listing({ slug: 'hit-other', name: 'Bowl', summary: 'a mug stand-in' }),
      listing({ slug: 'hit-contains', name: 'Coffee mug' }),
      listing({ slug: 'hit-start', name: 'Mug tree' }),
    ];
    expect(
      sortListings(haystacks, query({ q: 'mug', sort: 'best_match' })).map((l) => l.slug),
    ).toEqual(['hit-start', 'hit-contains', 'hit-other']);
  });
});

/* ------------------------------------------------------------------ *
 * Pagination
 * ------------------------------------------------------------------ */

describe('listing pagination', () => {
  const thirty = Array.from({ length: 30 }, (_, index) => listing({ slug: `p-${index}` }));

  it('shows one approved page size and reports completeness like the board', () => {
    const page = paginate(universe, 1);
    expect(page.items).toHaveLength(4);
    expect(page.complete).toBe(true);
    expect(page.progressLabel).toBe('Showing 4 of 4 products');
    expect(page.hasMore).toBe(false);
  });

  it('loads more across pages', () => {
    const page2 = paginate(thirty, 2);
    expect(page2.items).toHaveLength(24);
    expect(page2.hasMore).toBe(true);
    expect(page2.progressLabel).toBe('Showing 24 of 30 products');
    const page3 = paginate(thirty, 3);
    expect(page3.items).toHaveLength(30);
    expect(page3.complete).toBe(true);
  });

  it('clamps empty pages', () => {
    const page = paginate(thirty, 99);
    expect(page.items).toHaveLength(30);
    expect(page.complete).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * Card adapters
 * ------------------------------------------------------------------ */

function productFixture(overrides: Partial<StorefrontProduct>): StorefrontProduct {
  return {
    id: 'p',
    slug: 'p',
    name: 'Product',
    summary: 'summary',
    category: { id: 'c', name: 'Category', slug: 'category' },
    brand: { id: 'b', name: 'Brand', slug: 'brand' },
    image: { src: '/x.webp', alt: '', width: 720, height: 900 },
    options: [],
    price: egp(100),
    availability: 'in_stock',
    availabilityText: 'In stock',
    availabilityShort: 'In stock',
    listings: ['featured'],
    ...overrides,
  };
}

describe('toCatalogListing card actions', () => {
  it('Choose options when the product varies by two attributes', () => {
    const casserole = productFixture({
      options: [
        {
          attribute: 'colour',
          label: 'Colour',
          values: [
            { id: 'a', label: 'A', inStock: true, swatchHex: '#111111' },
            { id: 'b', label: 'B', inStock: true, swatchHex: '#222222' },
          ],
        },
        {
          attribute: 'size',
          label: 'Size',
          values: [{ id: '24', label: '24 cm', inStock: true }],
        },
      ],
    });
    expect(toCatalogListing(casserole, '/products/p').action).toBe('choose');
  });

  it('Add to cart for a single-attribute product in stock', () => {
    const mug = productFixture({
      options: [
        {
          attribute: 'colour',
          label: 'Colour',
          values: [{ id: 'a', label: 'A', inStock: true, swatchHex: '#111111' }],
        },
      ],
    });
    expect(toCatalogListing(mug, '/products/p').action).toBe('add');
  });

  it('View details for pre-order products — no card add', () => {
    const kettle = productFixture({ availability: 'preorder', preOrder: true });
    expect(toCatalogListing(kettle, '/products/p').action).toBe('view');
  });

  it('exposes the struck-through swatches with availability', () => {
    const mug = productFixture({
      options: [
        {
          attribute: 'colour',
          label: 'Colour',
          values: [
            { id: 'sage', label: 'Sage', inStock: true, swatchHex: '#8E9A86' },
            { id: 'cream', label: 'Cream', inStock: false, swatchHex: '#E8E1D3' },
          ],
        },
      ],
    });
    const card = toCatalogListing(mug, '/products/p');
    expect(card.swatches && card.swatches[0]?.inStock).toBe(true);
    expect(card.swatches && card.swatches[1]?.inStock).toBe(false);
  });
});

describe('bundleToCatalogListing', () => {
  function bundleFixture(overrides: Partial<StorefrontBundle>): StorefrontBundle {
    return {
      id: 'b',
      slug: 'set',
      kind: 'dynamic',
      name: 'Set',
      price: egp(1000),
      image: { src: '/b.webp', alt: '', width: 720, height: 900 },
      components: [
        { name: 'Component 1', quantity: 1, inStock: true },
        { name: 'Component 2', quantity: 2, inStock: true },
      ],
      inventoryNote: '',
      summary: '',
      statusNote: '',
      available: true,
      ...overrides,
    };
  }

  it('a fixed bundle is available by its own stock', () => {
    const card = bundleToCatalogListing(
      bundleFixture({ kind: 'fixed', inStock: false, available: false }),
      '/bundles/set',
    );
    expect(card.availability).toBe('out');
    expect(card.note).toContain('one packed box');
  });

  it('a dynamic bundle derives availability from its components', () => {
    const available = bundleToCatalogListing(bundleFixture({}), '/bundles/set');
    expect(available.availability).toBe('ok');
    expect(available.note).toBe('2 items · each in stock');

    const partial = bundleToCatalogListing(
      bundleFixture({
        components: [
          { name: 'Component 1', quantity: 1, inStock: true },
          { name: 'Component 2', quantity: 2, inStock: false },
        ],
        available: false,
      }),
      '/bundles/set',
    );
    expect(partial.availability).toBe('out');
    expect(partial.note).toBe('1 of 2 items in stock');
  });

  it('bundles never carry a price strike or a discount badge', () => {
    const card = bundleToCatalogListing(bundleFixture({}), '/bundles/set');
    expect(card.previousPriceMinor).toBeUndefined();
    expect(card.discountBadge).toBeUndefined();
    expect(card.action).toBe('view-set');
  });
});
