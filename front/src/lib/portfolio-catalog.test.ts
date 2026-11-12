import { describe, expect, it } from 'vitest';
import { getDemoCatalog, getDemoProduct } from './portfolio-catalog';

describe('explicit portfolio catalogue', () => {
  it('has unique products with matching listings and integer monetary amounts', () => {
    const catalog = getDemoCatalog();
    expect(catalog.products.length).toBeGreaterThan(4);
    expect(new Set(catalog.products.map((product) => product.slug)).size).toBe(
      catalog.products.length,
    );
    expect(catalog.listings.length).toBe(catalog.products.length);
    for (const listing of catalog.listings) {
      expect(Number.isInteger(listing.priceMinor)).toBe(true);
      expect(listing.priceMinor).toBeGreaterThan(0);
    }
  });
  it('returns a product only when the slug exists', () => {
    const product = getDemoCatalog().products[0]!;
    expect(getDemoProduct(product.slug)?.id).toBe(product.id);
    expect(getDemoProduct('not-a-product')).toBeNull();
  });
});
