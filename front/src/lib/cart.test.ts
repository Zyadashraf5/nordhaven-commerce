import { describe, expect, it } from 'vitest';
import { resolveCartLine, summariseCart, type CartCatalogItem } from './cart';
import { CART_ITEMS, DEMO_CART_LINES, findCartItem } from '../data/cart-sample';

/**
 * Stage 3 cart engine tests. Every expectation below mirrors a rule stated
 * on the approved boards: the demo cart never reserves stock, prices may
 * change before checkout, dynamic sets derive availability per component,
 * and unavailable rows never contribute to totals.
 */

const Casserole = (key: string): CartCatalogItem => {
  const item = findCartItem(key);
  if (item === undefined) throw new Error(`missing sample cart item: ${key}`);
  return item;
};

describe('cart line resolution', () => {
  it('marks a low-stock line with its count', () => {
    const line = resolveCartLine(Casserole('enamelled-cast-iron-casserole:sage:24'), {
      key: 'enamelled-cast-iron-casserole:sage:24',
      qty: 1,
    });
    expect(line.availability).toEqual({ tone: 'low', text: 'Only 3 left' });
    expect(line.available).toBe(true);
  });

  it('caps increments at the stock ceiling with the board hint', () => {
    const line = resolveCartLine(Casserole('enamelled-cast-iron-casserole:sage:24'), {
      key: 'enamelled-cast-iron-casserole:sage:24',
      qty: 3,
    });
    expect(line.atMax).toBe(true);
    expect(line.maxText).toBe('You’ve added all 3 we have left');
  });

  it('derives the dynamic set maximum from its components', () => {
    const set = findCartItem('morning-coffee-set');
    expect(set).toBeDefined();
    const line = resolveCartLine(set!, { key: 'morning-coffee-set', qty: 1 });
    /* grinder 6, server 5 (1 per set), mugs 10 (2 per set) → 5 */
    expect(line.maxQty).toBe(5);
    expect(line.availability).toEqual({ tone: 'ok', text: 'All 3 items in stock' });
  });

  it('shows per-component over-checks when the set quantity rises', () => {
    const set = findCartItem('morning-coffee-set');
    const line = resolveCartLine(set!, { key: 'morning-coffee-set', qty: 5 });
    expect(line.available).toBe(true);
    const mugs = line.components?.find((c) => c.component.perSet === 2);
    expect(mugs?.ok).toBe(true); /* 2 × 5 = 10 ≤ 10 */
    const raised = resolveCartLine(set!, { key: 'morning-coffee-set', qty: 6 });
    expect(raised.available).toBe(false);
  });

  it('names the missing components when a dynamic set is unavailable', () => {
    const line = resolveCartLine(Casserole('glass-storage-jars-set-of-3'), {
      key: 'glass-storage-jars-set-of-3',
      qty: 1,
    });
    expect(line.available).toBe(false);
    expect(line.availability.text).toBe('Out of stock');
    expect(line.unavailable?.title).toBe('No longer available');
  });

  it('formats line money with the was-price pairing', () => {
    const line = resolveCartLine(Casserole('enamelled-cast-iron-casserole:sage:24'), {
      key: 'enamelled-cast-iron-casserole:sage:24',
      qty: 1,
    });
    expect(line.total).toBe('EGP 4,850');
    expect(line.wasTotal).toBe('EGP 5,700');
    expect(line.saveText).toBe('You save EGP 850');
  });

  it('appends the each-unit hint for quantity > 1', () => {
    const line = resolveCartLine(Casserole('stoneware-dinner-plates-set-of-4'), {
      key: 'stoneware-dinner-plates-set-of-4',
      qty: 2,
    });
    expect(line.each).toBe('EGP 1,680 each');
    expect(line.total).toBe('EGP 3,360');
  });

  it('carries the price-change notice for the rising line', () => {
    const line = resolveCartLine(Casserole('olive-wood-serving-board'), {
      key: 'olive-wood-serving-board',
      qty: 1,
    });
    expect(line.priceChangeNote).toBe(
      'Price updated since you added it: was EGP 1,180, now EGP 1,250',
    );
  });

  it('deletes the dynamic set from totals and names its block reason', () => {
    const summary = summariseCart(CART_ITEMS, DEMO_CART_LINES);
    expect(summary.blocked).toBe(true);
    expect(summary.blockTitle).toBe('1 item in your cart is unavailable');
    expect(summary.blockText).toContain('Glass Storage Jars');
    expect(summary.excludedText).toBe('1 unavailable item isn’t included');
  });

  it('sums only available lines into money totals', () => {
    const summary = summariseCart(CART_ITEMS, DEMO_CART_LINES);
    /* available lines (subtotal at was-price where present):
       terrace 5,700 + sage 5,700 + plates ×2 3,360 + board 1,250
       + fixed 6,200 + dynamic 2,850 = 25,060; jars excluded. */
    expect(summary.subtotal).toBe('EGP 25,060');
    expect(summary.discount).toBe('−EGP 1,700');
    expect(summary.total).toBe('EGP 23,360');
    expect(summary.subLabel).toBe('Subtotal (7 items)');
  });
});
