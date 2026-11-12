import type { StorefrontProduct } from '../data/types';
import type { WishlistCatalogEntry } from '../data/cart-sample';
import type { CartCatalogItem } from './cart';
import type {
  ApiCartLine,
  ApiCheckoutBlocker,
  ApiOrder,
  ApiWishlistItem,
} from './api/commerce-types';
import { PRODUCT_IMAGE_FALLBACK } from './catalog-mapper';
import { routes } from './links';

/**
 * Live cart, wishlist and order data → the presentation shapes the approved
 * pages already render (F06 Batch 3).
 *
 * Prices always come from the API line (`currentUnitPriceMinor`); the product
 * detail only supplies the picture, the variant's colour/size words and the
 * pre-discount price for the strike-through. Nothing here invents stock: a
 * live line carries `stockKnown: false` and the API's 999 quantity ceiling.
 */

/** The API's per-line quantity ceiling (CartLine.quantity maximum). */
export const CART_LINE_MAX = 999;

/** Exact minor units → the whole/decimal EGP number the cart engine formats. */
function toEgp(minor: number): number {
  return minor / 100;
}

/** "Terracotta · 28 cm (6.7 L)" for one exact SKU of a product. */
export function variantLabel(product: StorefrontProduct | undefined, sku: string): string {
  if (product === undefined) return '';
  const entry = product.variants?.find((variant) => variant.sku === sku);
  if (entry === undefined) return product.variantNote ?? '';
  const colour = product.options
    .find((option) => option.attribute === 'colour')
    ?.values.find((value) => value.id === entry.colourId);
  const size = product.options
    .find((option) => option.attribute === 'size')
    ?.values.find((value) => value.id === entry.sizeId);
  const parts = [colour?.label, size?.label].filter((part): part is string => part !== undefined);
  return parts.length > 0 ? parts.join(' · ') : (product.variantNote ?? '');
}

function variantImage(product: StorefrontProduct | undefined, sku: string) {
  if (product === undefined) return PRODUCT_IMAGE_FALLBACK;
  const entry = product.variants?.find((variant) => variant.sku === sku);
  const colour = product.options
    .find((option) => option.attribute === 'colour')
    ?.values.find((value) => value.id === entry?.colourId);
  return colour?.image ?? product.image;
}

/** The exact product page for a cart line (`?sku=` restores the variant). */
export function lineHref(slug: string, sku: string, product?: StorefrontProduct): string {
  const several = (product?.variants?.length ?? 0) > 1;
  return several ? `${routes.product(slug)}?sku=${encodeURIComponent(sku)}` : routes.product(slug);
}

export function cartItemFromLine(
  line: ApiCartLine,
  product: StorefrontProduct | undefined,
): CartCatalogItem {
  const variant = line.targetKind === 'VARIANT' ? variantLabel(product, line.sku) : 'Set';
  // The strike-through price only when the line is charged exactly the
  // product's current discounted price (so the "was" belongs to this price).
  const was =
    product?.previousPrice !== undefined && product.price.amountMinor === line.currentUnitPriceMinor
      ? toEgp(product.previousPrice.amountMinor)
      : undefined;
  const item: CartCatalogItem = {
    key: line.id,
    kind: 'product',
    name: line.productName,
    nameShort: line.productName,
    variant,
    variantShort: variant,
    sku: line.sku,
    href: lineHref(line.productSlug, line.sku, product),
    image: variantImage(product, line.sku),
    priceEgp: toEgp(line.currentUnitPriceMinor),
    wasEgp: was,
    stock: line.purchasable ? CART_LINE_MAX : 0,
    stockKnown: false,
  };
  if (line.priceChanged) item.priceChangedFromEgp = toEgp(line.lastKnownUnitPriceMinor);
  if (!line.purchasable) {
    item.unavailableReason = {
      title: 'No longer available',
      body: 'This product isn’t on sale any more, so it isn’t included in your total. Remove it or move it to your wishlist.',
    };
  }
  return item;
}

export function wishlistEntryFromItem(
  item: ApiWishlistItem,
  product: StorefrontProduct | undefined,
): WishlistCatalogEntry & { itemId: string; productId: string } {
  const several = (product?.variants?.length ?? 0) > 1;
  const was =
    product?.previousPrice !== undefined && product.price.amountMinor === item.currentPriceMinor
      ? toEgp(product.previousPrice.amountMinor)
      : undefined;
  return {
    key: item.productSlug,
    itemId: item.id,
    productId: item.productId,
    brand: product?.brand.name ?? '',
    name: item.productName,
    nameShort: item.productName,
    note: product?.variantNote ?? '',
    image: product?.image ?? PRODUCT_IMAGE_FALLBACK,
    priceEgp: toEgp(item.currentPriceMinor),
    wasEgp: was,
    href: routes.product(item.productSlug),
    kind: !item.purchasable ? 'out' : several ? 'options' : 'add',
  };
}

/* ------------------------------------------------------------------ *
 * Checkout blockers and orders, in customer words
 * ------------------------------------------------------------------ */

export function blockerMessage(blocker: ApiCheckoutBlocker): string {
  const sku = blocker.sku !== undefined ? ` (SKU ${blocker.sku})` : '';
  switch (blocker.code) {
    case 'CART_EMPTY':
      return 'Your cart is empty.';
    case 'PRODUCT_UNAVAILABLE':
      return `An item in your cart is no longer available${sku}. Remove it to continue.`;
    case 'QUANTITY_UNSUPPORTED':
      return `That quantity can’t be ordered${sku}. Lower it in your cart.`;
    case 'AMOUNT_UNSUPPORTED':
      return 'This order total can’t be processed. Remove some items and try again.';
    case 'INSUFFICIENT_STOCK':
      return blocker.sku !== undefined
        ? `Not enough stock for SKU ${blocker.sku}. Lower the quantity or remove it.`
        : 'There isn’t enough stock for everything in your cart together. Lower some quantities.';
    case 'DESTINATION_NOT_SUPPORTED':
      return 'We don’t deliver to this address’s country yet.';
    case 'SHIPPING_NOT_APPROVED':
      return 'Delivery to this country isn’t available yet.';
    case 'TAX_RULE_MISSING':
      return 'Tax for this destination isn’t set up yet, so this order can’t be placed.';
    case 'TAX_PRICING_MODE_MIXED':
      return 'Some items are priced differently for tax, so they can’t be ordered together.';
    case 'CURRENCY_NOT_SETTLED':
      return `An item is priced in a currency we can’t settle${sku}.`;
  }
}

/** "24 Oct 2026" for an API timestamp. */
export const placedDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** A short, stable order reference for display ("HC-1A2B3C4D"). */
export function orderReference(order: Pick<ApiOrder, 'id'>): string {
  return `HC-${order.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

export function orderItemCount(order: Pick<ApiOrder, 'lines'>): number {
  return order.lines.reduce((sum, line) => sum + line.quantity, 0);
}

/** Customer-cancellable per the contract: only an unpaid, still-pending order. */
export function canCancelOrder(
  order: Pick<ApiOrder, 'status' | 'expiresAt'>,
  now = new Date(),
): boolean {
  return order.status === 'PENDING_PAYMENT' && new Date(order.expiresAt) > now;
}
