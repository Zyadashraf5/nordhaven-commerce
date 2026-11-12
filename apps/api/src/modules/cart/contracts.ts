/**
 * The Cart capability's published contract.
 *
 * Another capability that needs to know what a customer intends to buy reads it through this
 * contract and never through the Cart's tables. The contract is deliberately narrow: the lines, the
 * quantities, and the two prices.
 */

/** What a cart line names: a catalog SKU, or a bundle. */
export type CartLineTargetKind = 'VARIANT' | 'BUNDLE';

/** A saved purchase intent. Current catalog facts are always resolved server-side. */
export interface CartIntentLine {
  readonly lineId: string;
  readonly variantId: string | null;
  readonly bundleId: string | null;
  readonly quantity: number;
  readonly lastKnownUnitPriceMinor: number;
  readonly lastKnownUnitCurrency: string;
}

/** One line of a customer's cart, as another capability sees it. */
export interface CartSnapshotLine {
  readonly lineId: string;
  readonly targetKind: CartLineTargetKind;
  /** The catalog SKU, when the line names one. */
  readonly variantId: string | null;
  /** The bundle, when the line names one. */
  readonly bundleId: string | null;
  /** The reference a customer sees: the SKU for a SKU line, the bundle name for a bundle line. */
  readonly sku: string;
  readonly productId: string;
  readonly productName: string;
  readonly productSlug: string;
  readonly quantity: number;
  /** The price the customer last agreed to, in exact integer minor units. */
  readonly lastKnownUnitPriceMinor: number;
  readonly lastKnownUnitCurrency: string;
  /** The price the customer would pay now, in exact integer minor units. */
  readonly currentUnitPriceMinor: number;
  readonly currentUnitCurrency: string;
  readonly discountBasisPoints: number;
  /** False when the product is no longer published, so the line cannot be bought. */
  readonly purchasable: boolean;
}

/** A customer's cart, as another capability sees it. */
export interface CartSnapshot {
  readonly lines: readonly CartSnapshotLine[];
  /** The largest quantity one line may hold, which the Cart enforces on write. */
  readonly maxLineQuantity: number;
}

/**
 * Reads a customer's cart.
 *
 * The reader is scoped to the customer identifier, so no caller can name another customer's cart.
 */
export interface CartReader {
  readIntent(lines: readonly CartIntentLine[]): Promise<CartSnapshot>;
  lockForCustomer(userId: string): Promise<void>;
  readForCustomer(userId: string): Promise<CartSnapshot>;
}

/**
 * Removes the cart lines an order covers.
 *
 * The removal is scoped to the customer, so a caller can only clear lines the customer actually
 * holds. A line that is not held is simply absent, so the operation is idempotent.
 */
export interface CartWriter {
  removeLinesForCustomer(userId: string, lineIds: readonly string[]): Promise<void>;
}

/** The injection token the Cart module publishes its reader under. */
export const CART_READER = Symbol('CART_READER');

/** The injection token the Cart module publishes its writer under. */
export const CART_WRITER = Symbol('CART_WRITER');
