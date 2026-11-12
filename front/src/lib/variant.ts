import type { Money, ProductOptionValue, StorefrontProduct } from '../data/types';

/**
 * Variant resolution for the product detail page (boards 07/08 and the
 * behaviour matrix in board-03):
 *
 * - both dimensions stay selectable; impossible combinations disable the add
 *   action and name the reason, they never grey out the other dimension;
 * - the selected SKU, price and availability follow colour × size;
 * - the URL carries the selected SKU (`?sku=…` plus `?size=` when the product
 *   has a size option) so a specific variant can be restored on reload.
 */

export interface VariantSelection {
  colourId?: string | undefined;
  sizeId?: string | undefined;
}

export interface ResolvedVariant {
  colour?: ProductOptionValue | undefined;
  size?: ProductOptionValue | undefined;
  price: Money;
  previousPrice?: Money | undefined;
  /** The displayed SKU. Undefined when the sample models no code for it. */
  sku?: string | undefined;
  /** True when this colour × size combination is sellable. */
  inStock: boolean;
  /** Why the add action is disabled, spelled out for the customer. */
  disabledReason?: string | undefined;
  /** The board's status sentence, e.g. "In stock — Terracotta, 24 cm". */
  statusText: string;
  overall: 'in_stock' | 'partial' | 'out_of_stock' | 'preorder' | 'unknown';
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

export function getColourOption(product: StorefrontProduct): ProductOptionValue[] {
  return product.options.find((option) => option.attribute === 'colour')?.values ?? [];
}

export function getSizeOption(product: StorefrontProduct): ProductOptionValue[] {
  return product.options.find((option) => option.attribute === 'size')?.values ?? [];
}

/** A colour is out of stock when F01 marks it so or no size can be sold. */
function colourSellable(colour: ProductOptionValue, sizes: ProductOptionValue[]): boolean {
  if (!colour.inStock) return false;
  if (sizes.length === 0) return true;
  return colour.availableSizes !== undefined
    ? colour.availableSizes.some((sizeId) =>
        sizes.some((size) => size.id === sizeId && size.inStock),
      )
    : sizes.some((size) => size.inStock);
}

/** The first sellable colour (falls back to the first colour at all). */
export function defaultColourId(product: StorefrontProduct): string | undefined {
  const colours = getColourOption(product);
  const sizes = getSizeOption(product);
  return colours.find((colour) => colourSellable(colour, sizes))?.id ?? colours[0]?.id;
}

/** First sellable size for a colour; sizes without a colour matrix fall back to the first. */
export function defaultSizeId(product: StorefrontProduct, colourId?: string): string | undefined {
  const sizes = getSizeOption(product);
  if (sizes.length === 0) return undefined;
  const colours = getColourOption(product);
  const colour = colours.find((value) => value.id === colourId);
  const allowedSizes = colour?.availableSizes;
  const allowed =
    allowedSizes !== undefined
      ? sizes.filter((size) => allowedSizes.includes(size.id) && size.inStock)
      : sizes.filter((size) => size.inStock);
  return allowed[0]?.id ?? sizes[0]?.id;
}

/** Is this colour × size combination within the sample's sellable matrix? */
export function isComboAvailable(
  product: StorefrontProduct,
  colourId: string | undefined,
  sizeId: string | undefined,
): boolean {
  const sizes = getSizeOption(product);
  const colours = getColourOption(product);
  const colour = colours.find((value) => value.id === colourId) ?? colours[0];
  if (colour !== undefined && !colour.inStock) return false;
  if (sizes.length === 0 || sizeId === undefined) {
    return colour === undefined ? product.availability !== 'out_of_stock' : colour.inStock;
  }
  const size = sizes.find((value) => value.id === sizeId);
  if (size === undefined || !size.inStock) return false;
  const allowed = colour?.availableSizes;
  if (allowed !== undefined) {
    return allowed.includes(size.id);
  }
  return true;
}

/**
 * The size code inside the sample SKU string: the boards show
 * `HC-CI-CAS-24-TER` for the 24 cm; swapping the size segment produces the
 * matching code for the other size. Where the sample does not model the
 * segment, the colour code is shown unchanged.
 */
export function skuWithSize(
  colourSku: string,
  sizes: ProductOptionValue[],
  sizeId: string | undefined,
): string {
  if (sizeId === undefined) return colourSku;
  const otherSizes = sizes.filter((size) => size.id !== sizeId);
  for (const size of otherSizes) {
    if (colourSku.includes(size.id)) {
      return colourSku.replace(size.id, sizeId);
    }
  }
  return colourSku;
}

export function resolveVariant(
  product: StorefrontProduct,
  selection: VariantSelection,
): ResolvedVariant {
  const colours = getColourOption(product);
  const sizes = getSizeOption(product);
  const colour = colours.find((value) => value.id === selection.colourId) ?? colours[0];
  const size = sizes.find((value) => value.id === selection.sizeId) ?? sizes[0];

  const price = size?.price ?? colour?.price ?? product.price;
  const previousPrice = size?.previousPrice ?? colour?.previousPrice ?? product.previousPrice;

  const colourSku = colour?.sku ?? product.sku;
  const exact = exactSku(product, colour?.id, size?.id);
  const sku =
    exact !== undefined
      ? exact
      : colourSku === undefined
        ? undefined
        : sizes.length > 0
          ? skuWithSize(colourSku, sizes, size?.id)
          : colourSku;

  const preOrder = product.preOrder === true;
  const comboAvailable = isComboAvailable(product, colour?.id, size?.id);
  const productOut = product.availability === 'out_of_stock';

  // The status sentence the boards show under the price.
  const stockUnknown = product.availability === 'unknown';
  let statusText: string;
  if (stockUnknown) {
    statusText = 'Availability confirmed at checkout';
  } else if (productOut) {
    statusText = 'Out of stock';
  } else if (preOrder) {
    statusText = 'Pre-order · charged only when in stock';
  } else if (comboAvailable) {
    statusText =
      colour === undefined
        ? 'In stock'
        : sizes.length > 0
          ? `In stock — ${colour.label}, ${size?.label}`
          : `In stock — ${colour.label}`;
  } else if (colour !== undefined && !colour.inStock) {
    statusText = sizes.length > 0 ? `${colour.label} is out of stock in all sizes` : 'Out of stock';
  } else {
    statusText = `${colour?.label}, ${size?.label} is out of stock`;
  }

  let disabledReason: string | undefined;
  if (productOut) {
    disabledReason = product.availabilityText;
  } else if (!preOrder && !comboAvailable) {
    disabledReason =
      colour !== undefined && !colour.inStock
        ? 'This colour is out of stock in every size right now.'
        : 'This combination is out of stock — pick another colour or size.';
  }

  return {
    colour,
    size,
    price,
    previousPrice,
    sku,
    inStock: stockUnknown || (!productOut && (preOrder || comboAvailable)),
    disabledReason,
    statusText,
    overall: stockUnknown
      ? 'unknown'
      : preOrder
        ? 'preorder'
        : productOut || !comboAvailable
          ? 'out_of_stock'
          : 'in_stock',
  };
}

/* ------------------------------------------------------------------ *
 * URL state (?sku=…&size=…)
 *
 * The boards' matrix states "the URL carries the selected SKU". The sample
 * models one SKU per colour value (e.g. HC-CI-CAS-24-TER), so the colour is
 * restored from that code and the size rides along as `?size=`:
 *
 *   /products/enamelled-cast-iron-casserole?sku=HC-CI-CAS-24-TER&size=28
 *
 * `?sku` is matched size-segment-insensitively (digits collapse), so
 * `…24-SAG&size=28` still selects Sage. `?colour=` is a plain fallback.
 * ------------------------------------------------------------------ */

export interface VariantParams {
  sku?: string | undefined;
  colour?: string | undefined;
  size?: string | undefined;
}

/** Collapsing digit runs makes `…24-TER` and `…28-TER` one colour code. */
function normaliseSku(value: string): string {
  return value.replace(/\d+/g, 'N').toUpperCase();
}

/** Live products: the API's own SKU for a colour × size, when the matrix has one. */
function exactSku(
  product: StorefrontProduct,
  colourId: string | undefined,
  sizeId: string | undefined,
): string | undefined {
  return product.variants?.find((entry) => entry.colourId === colourId && entry.sizeId === sizeId)
    ?.sku;
}

export function resolveSelectionFromParams(
  product: StorefrontProduct,
  params: VariantParams,
): VariantSelection {
  const sizes = getSizeOption(product);
  const byExactSku =
    params.sku !== undefined && product.variants !== undefined
      ? product.variants.find((entry) => entry.sku === params.sku)
      : undefined;
  if (byExactSku !== undefined) {
    return { colourId: byExactSku.colourId, sizeId: byExactSku.sizeId };
  }
  let colourId: string | undefined;
  if (params.sku !== undefined) {
    const normalised = normaliseSku(params.sku);
    colourId = getColourOption(product).find(
      (value) => value.sku !== undefined && normaliseSku(value.sku) === normalised,
    )?.id;
  }
  if (colourId === undefined && params.colour !== undefined) {
    colourId = params.colour;
  }

  let sizeId: string | undefined;
  if (sizes.length > 0) {
    if (params.size !== undefined && sizes.some((size) => size.id === params.size)) {
      sizeId = params.size;
    } else {
      sizeId = defaultSizeId(product, colourId);
    }
  }

  return { colourId, sizeId };
}

export function serializeVariantParams(
  product: StorefrontProduct,
  selection: VariantSelection,
): string {
  const colours = getColourOption(product);
  const colour = colours.find((value) => value.id === selection.colourId);
  const sizes = getSizeOption(product);

  const search = new URLSearchParams();
  const sku = colour?.sku;
  const exact = exactSku(product, selection.colourId, selection.sizeId);
  if (exact !== undefined) {
    search.set('sku', exact);
  } else if (sku !== undefined) {
    search.set('sku', sizes.length > 0 ? skuWithSize(sku, sizes, selection.sizeId) : sku);
  } else if (colour !== undefined) {
    search.set('colour', colour.id);
  }
  if (sizes.length > 0 && selection.sizeId !== undefined) {
    search.set('size', selection.sizeId);
  }
  const value = search.toString();
  return value === '' ? '' : `?${value}`;
}
