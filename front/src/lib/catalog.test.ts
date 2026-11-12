import { describe, expect, it } from 'vitest';
import { facetOptions, facetSwitchCounts, filterListings } from './listing';
import { getCatalogBundle, getCatalogListings, getCatalogProduct } from './catalog';
import { DEFAULT_LISTING_QUERY, type ListingQuery } from './listing';

/**
 * These are the facet counts printed on the approved PLP board (board-04).
 * The sample catalog must reproduce them exactly so the staged filter
 * behaviour behaves the way the boards demonstrate it.
 */

function query(overrides: Partial<ListingQuery> = {}) {
  return { ...DEFAULT_LISTING_QUERY, ...overrides };
}

const listings = getCatalogListings();

describe('the Stage 2 sample catalog', () => {
  it('has the twelve listings of the approved board', () => {
    expect(listings).toHaveLength(12);
  });

  it('reproduces the category counts and price-band counts of the board', () => {
    const categories = facetOptions(listings, query(), 'categories', [
      { value: 'cookware', label: 'Cookware' },
      { value: 'bakeware', label: 'Bakeware' },
      { value: 'tableware', label: 'Tableware' },
      { value: 'kitchen-tools', label: 'Kitchen tools' },
      { value: 'storage', label: 'Storage' },
      { value: 'textiles', label: 'Textiles' },
      { value: 'coffee-and-tea', label: 'Coffee & tea' },
    ]);
    expect(categories.map((c) => c.count)).toEqual([1, 1, 2, 1, 1, 1, 3]);

    const price = facetOptions(listings, query(), 'priceBands', [
      { value: 'under-1000', label: 'Under EGP 1,000' },
      { value: '1000-2500', label: 'EGP 1,000 – 2,500' },
      { value: 'over-2500', label: 'Over EGP 2,500' },
    ]);
    expect(price.map((c) => c.count)).toEqual([4, 5, 3]);

    const colours = facetOptions(listings, query(), 'colours', [
      { value: 'terracotta', label: 'Terracotta' },
      { value: 'sage', label: 'Sage' },
      { value: 'cream-oat', label: 'Cream & oat' },
      { value: 'natural-wood', label: 'Natural wood' },
      { value: 'steel', label: 'Steel' },
      { value: 'clear', label: 'Clear' },
    ]);
    expect(colours.map((c) => c.count)).toEqual([2, 3, 5, 1, 2, 2]);
  });

  it('reproduces the material and brand counts of the board', () => {
    const materials = facetOptions(listings, query(), 'materials', [
      { value: 'Cast iron', label: 'Cast iron' },
      { value: 'Stoneware', label: 'Stoneware' },
      { value: 'Olive wood', label: 'Olive wood' },
      { value: 'Glass', label: 'Glass' },
      { value: 'Linen', label: 'Linen' },
      { value: 'Steel', label: 'Steel' },
    ]);
    expect(materials.map((c) => c.count)).toEqual([1, 3, 1, 2, 1, 2]);

    const brands = facetOptions(listings, query(), 'brands', [
      { value: 'atelier-nile', label: 'Atelier Nile' },
      { value: 'kiln-studio', label: 'Kiln Studio' },
      { value: 'olea', label: 'Olea' },
      { value: 'delta-linen', label: 'Delta Linen' },
      { value: 'brew-works', label: 'Brew Works' },
      { value: 'clearline', label: 'Clearline' },
    ]);
    const own = brands.filter((b) => b.value !== 'nordhaven-commerce');
    expect(own.map((b) => b.count)).toEqual([1, 3, 1, 1, 3, 1]);
  });

  it('reproduces the product-type counts of the board', () => {
    const types = facetOptions(listings, query(), 'types', [
      { value: 'single', label: 'Single products' },
      { value: 'fixed-set', label: 'Ready-packed sets' },
      { value: 'dynamic-set', label: 'Sets of individual items' },
    ]);
    expect(types.map((t) => t.count)).toEqual([10, 1, 1]);
  });

  it('shows 8 in-stock candidates and 2 on offer', () => {
    // 12 minus the out-of-stock jars and the pre-order kettle.
    expect(facetSwitchCounts(listings, query(), 'inStockOnly')).toBe(10);
    // The casserole and the tea towels carry a struck price.
    expect(facetSwitchCounts(listings, query(), 'onOfferOnly')).toBe(2);
  });

  it('orders the cards like the approved board', () => {
    expect(listings.map((l) => l.slug)).toEqual([
      'enamelled-cast-iron-casserole',
      'olive-wood-serving-board',
      'stoneware-dinner-plates-set-of-4',
      'stoneware-mug-350ml',
      'stoneware-baking-dish-30cm',
      'steel-hand-coffee-grinder',
      'linen-tea-towels-set-of-3',
      'glass-coffee-server-600ml',
      'glass-storage-jars-set-of-3',
      'pour-over-kettle-1l',
      'the-first-kitchen-set',
      'morning-coffee-set',
    ]);
  });

  it('supplies Sample PDP body data through the seam', () => {
    const casserole = getCatalogProduct('enamelled-cast-iron-casserole');
    expect(casserole).toBeDefined();
    expect(casserole?.brand.name).toBe('Atelier Nile');
    expect(casserole?.gallery).toHaveLength(4);
    expect(casserole?.specs?.length).toBeGreaterThan(0);
    expect(casserole?.dimensions?.depthCm).toBe(24);
    expect(casserole?.alsoInSet).toBe('the-first-kitchen-set');
    expect(casserole?.goesWellWith?.length).toBeGreaterThanOrEqual(3);

    expect(getCatalogProduct('stoneware-baking-dish-30cm')).toBeDefined();
    expect(getCatalogProduct('no-such-product')).toBeUndefined();
  });

  it('finds a product by a content search and keeps its card fields', () => {
    expect(filterListings(listings, query({ q: 'casserole' })).map((l) => l.slug)).toEqual([
      'enamelled-cast-iron-casserole',
      'the-first-kitchen-set',
    ]);
    expect(filterListings(listings, query({ q: 'Cheese' }))).toHaveLength(0);
    expect(filterListings(listings, query({ q: 'kettle' })).map((l) => l.slug)).toEqual([
      'pour-over-kettle-1l',
    ]);
  });

  it('keeps dynamic bundle availability derived from components', () => {
    const morningCoffee = getCatalogBundle('morning-coffee-set');
    expect(morningCoffee?.kind).toBe('dynamic');
    expect(morningCoffee?.components.every((component) => component.inStock)).toBe(true);
    expect(morningCoffee?.description).toBeDefined();

    const firstKitchen = getCatalogBundle('the-first-kitchen-set');
    expect(firstKitchen?.kind).toBe('fixed');
    expect(firstKitchen?.inStock).toBe(true);
    expect(getCatalogBundle('no-such-set')).toBeUndefined();
  });
});
