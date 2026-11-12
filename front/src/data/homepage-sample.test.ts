import { describe, expect, it } from 'vitest';
import { homepageSample } from './homepage-sample';
import {
  getColourValues,
  getSizeValues,
  resolveAvailability,
  resolveCardAction,
} from '../lib/product';

const product = (slug: string) => {
  const found = homepageSample.products.find((item) => item.slug === slug);
  if (!found) throw new Error(`missing sample product: ${slug}`);
  return found;
};

describe('resolveCardAction', () => {
  it('offers "Choose options" when a product varies by two attributes', () => {
    const casserole = product('enamelled-cast-iron-casserole');
    expect(casserole.options.length).toBe(2);
    expect(resolveCardAction(casserole).kind).toBe('options');
    expect(resolveCardAction(casserole).label).toBe('Choose options');
  });

  it('offers "Add to cart" for a product with one sellable SKU', () => {
    const board = product('olive-wood-serving-board');
    expect(resolveCardAction(board).kind).toBe('add');
    expect(resolveCardAction(board).label).toBe('Add to cart');
  });

  it('offers "Add to cart" for a product that varies by colour only, while the colour is in stock', () => {
    const mug = product('stoneware-mug-350ml');
    expect(resolveCardAction(mug, 'sage').kind).toBe('add');
  });

  it('disables the action and names the reason when the selected colour is out of stock', () => {
    const mug = product('stoneware-mug-350ml');
    const action = resolveCardAction(mug, 'cream');
    expect(action.kind).toBe('disabled');
    expect(action.label).toBe('Cream is out of stock');
  });

  it('disables the action for a product that is out of stock', () => {
    const jars = product('glass-storage-jars-set-of-3');
    const action = resolveCardAction(jars);
    expect(action.kind).toBe('disabled');
    expect(action.label).toBe('Out of stock');
  });

  it('links to details only for a pre-order product', () => {
    const kettle = product('pour-over-kettle-1l');
    const action = resolveCardAction(kettle);
    expect(action.kind).toBe('preorder');
    expect(action.label).toBe('View details');
  });
});

describe('resolveAvailability', () => {
  it('reports the sizes that are sellable for the selected colour', () => {
    const casserole = product('enamelled-cast-iron-casserole');
    const terracotta = resolveAvailability(casserole, 'terracotta');
    expect(terracotta.state).toBe('in_stock');
    expect(terracotta.text).toBe('In stock in Terracotta');

    const sage = resolveAvailability(casserole, 'sage');
    expect(sage.state).toBe('partial');
    expect(sage.text).toBe('Sage: 24 cm in stock, 28 cm out');

    const cream = resolveAvailability(casserole, 'cream');
    expect(cream.state).toBe('out_of_stock');
    expect(cream.text).toBe('Cream is out of stock');
  });

  it('uses the selected colour for a product that has no size option', () => {
    const mug = product('stoneware-mug-350ml');
    expect(resolveAvailability(mug, 'sage').text).toBe('In stock in Sage');
    expect(resolveAvailability(mug, 'cream').text).toBe('Cream is out of stock');
  });

  it('marks a pre-order product without reserving stock', () => {
    const kettle = product('pour-over-kettle-1l');
    const availability = resolveAvailability(kettle);
    expect(availability.state).toBe('preorder');
    expect(availability.text).toBe('Pre-order · charged only when in stock');
  });

  it('writes the state as a character for the narrow layout', () => {
    const board = product('olive-wood-serving-board');
    expect(resolveAvailability(board).shortWithSymbol).toBe('✓ In stock');
  });
});

describe('the sample catalogue', () => {
  it('models the casserole with three colours and two sizes', () => {
    const casserole = product('enamelled-cast-iron-casserole');
    expect(getColourValues(casserole).map((value) => value.id)).toEqual([
      'terracotta',
      'sage',
      'cream',
    ]);
    expect(getSizeValues(casserole).map((value) => value.id)).toEqual(['24', '28']);
  });

  it('models the fixed bundle with its own stock and the dynamic bundle with derived stock', () => {
    const fixed = homepageSample.bundles.find((bundle) => bundle.kind === 'fixed');
    const dynamic = homepageSample.bundles.find((bundle) => bundle.kind === 'dynamic');
    expect(fixed?.inStock).toBe(true);
    expect(fixed?.available).toBe(true);
    expect(dynamic?.available).toBe(dynamic?.components.every((component) => component.inStock));
  });

  it('keeps the two bundle kinds on separate inventory rules', () => {
    const dynamic = homepageSample.bundles.find((bundle) => bundle.kind === 'dynamic');
    const outOfStock = dynamic?.components.map((component) => ({ ...component, inStock: false }));
    expect(dynamic?.components.some((component) => !component.inStock)).toBe(false);
    expect(outOfStock?.every((component) => !component.inStock)).toBe(true);
  });
});
