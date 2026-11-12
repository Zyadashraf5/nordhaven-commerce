import { describe, expect, it } from 'vitest';
import { toStorefrontProduct } from './catalog-mapper';
import { resolveCartLine } from './cart';
import {
  blockerMessage,
  canCancelOrder,
  cartItemFromLine,
  orderReference,
  variantLabel,
} from './commerce-mapper';
import { casseroleDetail, cartLine, orderFor } from '../test/commerce-fixtures';

describe('commerce mapper', () => {
  const product = toStorefrontProduct(casseroleDetail);

  it('prices a cart line from the API line, with the product’s strike-through only when it matches', () => {
    const item = cartItemFromLine(cartLine({ quantity: 2 }), product);
    const resolved = resolveCartLine(item, { key: item.key, qty: 2 });
    expect(item.priceEgp).toBe(4845);
    expect(item.wasEgp).toBe(5700);
    expect(resolved.total).toBe('EGP 9,690');
    expect(resolved.availability).toEqual({
      tone: 'unknown',
      text: 'Availability confirmed at checkout',
    });
    expect(item.href).toBe('/products/enamelled-cast-iron-casserole?sku=HC-CI-CAS-28-SAG');

    const repriced = cartItemFromLine(cartLine({ currentUnitPriceMinor: 500000 }), product);
    expect(repriced.wasEgp).toBeUndefined();
  });

  it('reports a price change and an unpublished line honestly', () => {
    const changed = cartItemFromLine(
      cartLine({ priceChanged: true, lastKnownUnitPriceMinor: 470000 }),
      product,
    );
    expect(resolveCartLine(changed, { key: changed.key, qty: 1 }).priceChangeNote).toBe(
      'Price updated since you added it: was EGP 4,700, now EGP 4,845',
    );
    const gone = cartItemFromLine(cartLine({ purchasable: false }), product);
    const resolved = resolveCartLine(gone, { key: gone.key, qty: 1 });
    expect(resolved.available).toBe(false);
    expect(resolved.availability.text).toBe('Not available');
    expect(resolved.unavailable?.title).toBe('No longer available');
  });

  it('names the exact variant', () => {
    expect(variantLabel(product, 'HC-CI-CAS-28-SAG')).toBe('Sage · 28 cm');
    expect(variantLabel(undefined, 'X')).toBe('');
  });

  it('explains checkout blockers in customer words', () => {
    expect(blockerMessage({ code: 'INSUFFICIENT_STOCK', sku: 'HC-1' })).toBe(
      'Not enough stock for SKU HC-1. Lower the quantity or remove it.',
    );
    expect(blockerMessage({ code: 'DESTINATION_NOT_SUPPORTED' })).toBe(
      'We don’t deliver to this address’s country yet.',
    );
  });

  it('references and cancellability follow the order', () => {
    expect(orderReference(orderFor())).toBe('HC-0D2F6A1C');
    expect(canCancelOrder(orderFor())).toBe(true);
    expect(canCancelOrder(orderFor({ status: 'PAID' }))).toBe(false);
    expect(canCancelOrder(orderFor({ expiresAt: '2000-01-01T00:00:00Z' }))).toBe(false);
  });
});
