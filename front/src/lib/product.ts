import type {
  AvailabilityState,
  ProductOption,
  ProductOptionValue,
  StorefrontProduct,
} from '../data/types';

/**
 * Product presentation rules, transcribed from the approved boards
 * ("Mini style guide v0.2" → "Product card" and the homepage card anatomy).
 *
 * | When the product…                          | Card action                    |
 * | ------------------------------------------- | ------------------------------ |
 * | has one sellable SKU, in stock              | Add to cart (solid)            |
 * | varies by one attribute, swatch picks a SKU | Add to cart for that SKU       |
 * | varies by two or more attributes            | Choose options (outline)       |
 * | selected variant / product out of stock     | Disabled, names the reason     |
 * | is a pre-order item                         | View details — no card add     |
 * | is a fixed or dynamic bundle                | View set only                  |
 */

export function getOption(
  product: StorefrontProduct,
  attribute: ProductOption['attribute'],
): ProductOption | undefined {
  return product.options.find((option) => option.attribute === attribute);
}

export function getColourValues(product: StorefrontProduct): ProductOptionValue[] {
  return getOption(product, 'colour')?.values ?? [];
}

export function getSizeValues(product: StorefrontProduct): ProductOptionValue[] {
  return getOption(product, 'size')?.values ?? [];
}

export interface ResolvedAvailability {
  state: AvailabilityState;
  /** Long sentence used on the wide layout. */
  text: string;
  /** Short sentence used on the narrow layout. */
  short: string;
  /**
   * The narrow board writes the state as a character in front of the sentence
   * instead of drawing an icon.
   */
  symbol: string;
  /** The narrow sentence, including its leading character. */
  shortWithSymbol: string;
}

/** Availability of the currently selected colour, resolved against the size matrix. */
export function resolveAvailability(
  product: StorefrontProduct,
  selectedColourId?: string,
): ResolvedAvailability {
  if (product.availability === 'unknown') {
    const text = 'Availability confirmed at checkout';
    return { state: 'unknown', text, short: text, symbol: '', shortWithSymbol: text };
  }

  if (product.preOrder) {
    return {
      state: 'preorder',
      text: 'Pre-order · charged only when in stock',
      short: 'Pre-order · charged when in stock',
      symbol: '',
      shortWithSymbol: 'Pre-order · charged when in stock',
    };
  }

  const colours = getColourValues(product);
  const sizes = getSizeValues(product);
  const colour = colours.find((value) => value.id === selectedColourId) ?? colours[0];

  if (colour === undefined) {
    if (product.availability === 'in_stock') {
      return availability('in_stock', 'In stock');
    }
    if (product.availability === 'partial') {
      return availability('partial', 'Partly in stock');
    }
    return availability('out_of_stock', 'Out of stock');
  }

  // A product that varies by colour only: the selected colour decides the state.
  if (sizes.length === 0) {
    if (colour.inStock) {
      return availability('in_stock', `In stock in ${colour.label}`, `${colour.label} · in stock`);
    }
    return availability(
      'out_of_stock',
      `${colour.label} is out of stock`,
      `${colour.label} · out of stock`,
    );
  }

  const sellableSizes = sizes.filter((size) =>
    colour.availableSizes === undefined ? size.inStock : colour.availableSizes.includes(size.id),
  );

  if (sellableSizes.length === 0) {
    return availability(
      'out_of_stock',
      `${colour.label} is out of stock`,
      `${colour.label} · out of stock`,
    );
  }

  if (sellableSizes.length < sizes.length) {
    const missing = sizes
      .filter((size) => !sellableSizes.includes(size))
      .map((size) => size.label.split(' · ')[0])
      .join(', ');
    return availability(
      'partial',
      `${colour.label}: ${sellableSizes.map((size) => size.label.split(' · ')[0]).join(', ')} in stock, ${missing} out`,
      `${colour.label} · ${sellableSizes.map((size) => size.label.split(' · ')[0]).join(', ')} only`,
    );
  }

  return availability('in_stock', `In stock in ${colour.label}`, `${colour.label} · in stock`);
}

function availability(state: AvailabilityState, text: string, short = text): ResolvedAvailability {
  const symbol =
    state === 'in_stock' ? '✓' : state === 'partial' ? '◐' : state === 'out_of_stock' ? '✕' : '';
  return { state, text, short, symbol, shortWithSymbol: symbol ? `${symbol} ${short}` : short };
}

export type CardActionKind = 'add' | 'options' | 'disabled' | 'preorder';

export interface ResolvedCardAction {
  kind: CardActionKind;
  label: string;
  /** The label the disabled state uses to name the reason. */
  disabledReason?: string;
}

/**
 * The action a card offers, following the approved rules above.
 * Bundles never appear in the product grid: they are shown in the sets section
 * with a "View set" action only.
 */
export function resolveCardAction(
  product: StorefrontProduct,
  selectedColourId?: string,
): ResolvedCardAction {
  if (product.preOrder) {
    return { kind: 'preorder', label: 'View details' };
  }

  const optionCount = product.options.length;

  if (optionCount >= 2) {
    return { kind: 'options', label: 'Choose options' };
  }

  const availability = resolveAvailability(product, selectedColourId);

  if (availability.state === 'out_of_stock') {
    return {
      kind: 'disabled',
      label: availability.text,
      disabledReason: availability.text,
    };
  }

  return { kind: 'add', label: 'Add to cart' };
}
