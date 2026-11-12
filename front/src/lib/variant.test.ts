import { describe, expect, it } from 'vitest';
import { homepageSample } from '../data/homepage-sample';
import { getCatalogProduct } from './catalog';
import {
  defaultColourId,
  defaultSizeId,
  isComboAvailable,
  resolveSelectionFromParams,
  resolveVariant,
  skuWithSize,
  serializeVariantParams,
} from './variant';

const casserole = homepageSample.products.find(
  (product) => product.slug === 'enamelled-cast-iron-casserole',
)!;
const mug = homepageSample.products.find((product) => product.slug === 'stoneware-mug-350ml')!;

describe('variant resolution — the boards’ colour × size behaviour', () => {
  it('defaults to the first sellable colour and its first sellable size', () => {
    expect(defaultColourId(casserole)).toBe('terracotta');
    expect(defaultSizeId(casserole, 'terracotta')).toBe('24');
  });

  it('matrix: cream has no sizes; sage is 24 cm only; terracotta has both', () => {
    expect(isComboAvailable(casserole, 'cream', '24')).toBe(false);
    expect(isComboAvailable(casserole, 'cream', '28')).toBe(false);
    expect(isComboAvailable(casserole, 'sage', '24')).toBe(true);
    expect(isComboAvailable(casserole, 'sage', '28')).toBe(false);
    expect(isComboAvailable(casserole, 'terracotta', '24')).toBe(true);
    expect(isComboAvailable(casserole, 'terracotta', '28')).toBe(true);
  });

  it('price and previous price follow the size tile', () => {
    const at24 = resolveVariant(casserole, { colourId: 'terracotta', sizeId: '24' });
    const at28 = resolveVariant(casserole, { colourId: 'terracotta', sizeId: '28' });
    expect(at24.price.amountMinor).toBe(485_000);
    expect(at24.previousPrice?.amountMinor).toBe(570_000);
    expect(at28.price.amountMinor).toBe(595_000);
    expect(at28.previousPrice?.amountMinor).toBe(700_000);
  });

  it('the SKU line follows the colour code with the size segment swapped', () => {
    expect(skuWithSize('HC-CI-CAS-24-TER', casserole.options[1]!.values, '28')).toBe(
      'HC-CI-CAS-28-TER',
    );
    const at24 = resolveVariant(casserole, { colourId: 'terracotta', sizeId: '24' });
    expect(at24.sku).toBe('HC-CI-CAS-24-TER');
    expect(resolveVariant(casserole, { colourId: 'sage', sizeId: '24' }).sku).toBe(
      'HC-CI-CAS-24-SAG',
    );
  });

  it('the status sentence names the selection, like the board', () => {
    expect(resolveVariant(casserole, { colourId: 'terracotta', sizeId: '24' }).statusText).toBe(
      'In stock — Terracotta, 24 cm · 4.2 L',
    );
  });

  it('an unavailable combination stays selectable but names the reason', () => {
    const cream = resolveVariant(casserole, { colourId: 'cream', sizeId: '24' });
    expect(cream.inStock).toBe(false);
    expect(cream.disabledReason).toContain('out of stock');
    const sage28 = resolveVariant(casserole, { colourId: 'sage', sizeId: '28' });
    expect(sage28.inStock).toBe(false);
    expect(sage28.disabledReason).toMatch(/another colour or size/i);
  });

  it('colour-only products resolve through the colour value', () => {
    const sageMug = resolveVariant(mug, { colourId: 'sage' });
    expect(sageMug.inStock).toBe(true);
    expect(sageMug.statusText).toBe('In stock — Sage');
    expect(resolveVariant(mug, { colourId: 'cream' }).inStock).toBe(false);
  });

  it('single-SKU products resolve from the record', () => {
    const variant = resolveVariant(getCatalogProduct('olive-wood-serving-board')!, {});
    expect(variant.inStock).toBe(true);
    expect(variant.sku).toBe('HC-KT-BRD-45-OLV');
  });
});

describe('variant URL contract (?sku=…&size=…)', () => {
  it('serializes the selected SKU with the current size segment', () => {
    const selection = { colourId: 'terracotta', sizeId: '28' };
    expect(serializeVariantParams(casserole, selection)).toBe('?sku=HC-CI-CAS-28-TER&size=28');
  });

  it('restores colour from a SKU code, size-param-insensitively', () => {
    // A stale or swapped size inside the sku must still select the colour.
    const from36 = resolveSelectionFromParams(casserole, { sku: 'HC-CI-CAS-36-TER', size: '24' });
    expect(from36.colourId).toBe('terracotta');
    expect(from36.sizeId).toBe('24');
  });

  it('falls back to plain colour ids when the sample has no sku', () => {
    const selection = resolveSelectionFromParams(mug, { colour: 'sage' });
    expect(selection.colourId).toBe('sage');
  });

  it('an unknown size falls back to the first sellable one', () => {
    const selection = resolveSelectionFromParams(casserole, {
      sku: 'HC-CI-CAS-24-TER',
      size: '36',
    });
    expect(selection.sizeId).toBe('24');
  });
});

describe('the sample seam injects the sku codes', () => {
  it('colour codes reach the merged PDP record', () => {
    const merged = getCatalogProduct('enamelled-cast-iron-casserole')!;
    expect(merged.options[0]!.values[0]!.sku).toBe('HC-CI-CAS-24-TER');
    // The homepage record itself must remain exactly the F01 object.
    expect(casserole.options[0]!.values[0]!.sku).toBe('HC-CI-CAS-24-TER');
  });

  it('single-code products carry their record-level code', () => {
    const variant = resolveVariant(getCatalogProduct('olive-wood-serving-board')!, {});
    expect(variant.sku).toBe('HC-KT-BRD-45-OLV');
    const bakeDish = getCatalogProduct('stoneware-baking-dish-30cm')!;
    expect(bakeDish.sku).toBe('HC-BW-DSH-30-OAT');
  });
});
