import { BadRequestException, Injectable } from '@nestjs/common';
import { AppError } from '../../../platform/http/app-error';
import type { AuthenticatedPrincipal } from '../../../platform/security/principal';
import { MAX_CART_LINE_QUANTITY, MAX_CART_LINES } from '../api/cart.support';
import {
  type CartReader,
  type CartIntentLine,
  type CartSnapshot,
  type CartSnapshotLine,
  type CartWriter,
} from '../contracts';
import {
  CartRepository,
  CartLimitExceededError,
  type CartItemWithTarget,
  type CartProductView,
} from '../persistence/cart.repository';

/** One cart line as the application presents it. */
export interface CartLineView {
  readonly id: string;
  readonly targetKind: 'VARIANT' | 'BUNDLE';
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
  /** True when the current price differs from the price the customer last agreed to. */
  readonly priceChanged: boolean;
  /** False when the product is no longer published, so the line cannot be bought. */
  readonly purchasable: boolean;
}

/** The customer's cart as the application presents it. */
export interface CartView {
  readonly lines: readonly CartLineView[];
  readonly updatedAt: Date;
}

/**
 * The customer's cart.
 *
 * A cart is an intent record, not a commitment: it never reserves or holds stock, and it creates
 * no order or payment. The cart is scoped to the authenticated principal alone, so no request can
 * name or reach another customer's cart.
 */
@Injectable()
export class CartService implements CartReader, CartWriter {
  public constructor(private readonly carts: CartRepository) {}

  public async readIntent(lines: readonly CartIntentLine[]): Promise<CartSnapshot> {
    const resolved: CartSnapshotLine[] = [];
    for (const line of lines) {
      const target =
        line.bundleId !== null
          ? await this.carts.findBundleForPurchase(line.bundleId)
          : await this.carts.findVariantForPurchase(line.variantId ?? '');
      if (target === null) throw AppError.productNotFound();
      resolved.push({
        ...line,
        targetKind: line.bundleId === null ? 'VARIANT' : 'BUNDLE',
        sku: 'sku' in target ? target.sku : target.name,
        productId: target.productId,
        productName: target.productName,
        productSlug: target.productSlug,
        currentUnitPriceMinor: target.currentUnitPriceMinor,
        currentUnitCurrency: target.currentUnitCurrency,
        discountBasisPoints: target.discountBasisPoints,
        purchasable: target.productPublished,
      });
    }
    return { lines: resolved, maxLineQuantity: MAX_CART_LINE_QUANTITY };
  }

  public async lockForCustomer(userId: string): Promise<void> {
    await this.carts.lockForCustomer(userId);
  }

  /**
   * The customer's cart.
   *
   * A customer who has never had a cart gets an empty one rather than an error, so the read is
   * safe to call on a fresh account.
   */
  public async read(principal: AuthenticatedPrincipal): Promise<CartView> {
    const cart = await this.carts.findOrCreateByUserId(principal.userId);
    const items = await this.carts.listItems(cart.id);
    return {
      lines: items.map((item) => toLineView(item)),
      updatedAt: items.reduce(
        (latest, item) => (item.updatedAt > latest ? item.updatedAt : latest),
        new Date(0),
      ),
    };
  }

  /**
   * The customer's cart, as another capability sees it.
   *
   * The read is scoped to the customer identifier, and no caller can name a different customer.
   */
  public async readForCustomer(userId: string): Promise<CartSnapshot> {
    const cart = await this.carts.findByUserId(userId);
    if (cart === null) return { lines: [], maxLineQuantity: MAX_CART_LINE_QUANTITY };
    const items = await this.carts.listItems(cart.id);
    return {
      lines: items.map((item) => toSnapshotLine(item)),
      maxLineQuantity: MAX_CART_LINE_QUANTITY,
    };
  }

  /**
   * Removes the cart lines an order covers.
   *
   * The removal is scoped to the customer, so a caller can only clear lines the customer actually
   * holds, and a line that is not held is simply absent, so the operation is idempotent. A failure
   * here leaves the cart unchanged, which is harmless: the order's own reservation already holds
   * the stock.
   */
  public async removeLinesForCustomer(userId: string, lineIds: readonly string[]): Promise<void> {
    if (lineIds.length === 0) return;
    const cart = await this.carts.findByUserId(userId);
    if (cart === null) return;
    await this.carts.deleteItems(cart.id, lineIds);
  }

  /**
   * Adds a SKU to the cart.
   *
   * A SKU that is already in the cart has its quantity increased rather than a second line
   * appearing. The stored price is refreshed to the current effective price, because the customer
   * has just made a fresh decision about the item.
   */
  public async addItem(
    principal: AuthenticatedPrincipal,
    variantId: string,
    quantity: number,
  ): Promise<CartView> {
    const cart = await this.carts.findOrCreateByUserId(principal.userId);
    const current = await this.resolvePurchasableVariant(variantId);
    return this.applyAddition(cart.id, { variantId }, current, quantity, principal);
  }

  /**
   * Adds a bundle to the cart.
   *
   * A FIXED bundle is an independently stocked finished good and a DYNAMIC bundle resolves to its
   * approved component composition, so both are sellable as one unit priced by the product that
   * names the bundle.
   */
  public async addBundle(
    principal: AuthenticatedPrincipal,
    bundleId: string,
    quantity: number,
  ): Promise<CartView> {
    const cart = await this.carts.findOrCreateByUserId(principal.userId);
    const current = await this.resolvePurchasableBundle(bundleId);
    return this.applyAddition(cart.id, { bundleId }, current, quantity, principal);
  }

  /**
   * Sets the quantity of a line.
   *
   * The line's last-known price is refreshed to the current effective price, because the customer
   * has just made a fresh decision about it.
   */
  public async setItemQuantity(
    principal: AuthenticatedPrincipal,
    itemId: string,
    quantity: number,
  ): Promise<CartView> {
    const cart = await this.requireCart(principal);
    const item = await this.carts.findItem(cart.id, itemId);
    if (item === null) throw AppError.cartItemNotFound();

    const current = await this.resolvePurchasableTarget(item);
    await this.carts.setItemQuantity(
      cart.id,
      item.id,
      quantity,
      current.currentUnitPriceMinor,
      current.currentUnitCurrency,
    );
    return this.read(principal);
  }

  /** Removes a line from the cart. */
  public async removeItem(principal: AuthenticatedPrincipal, itemId: string): Promise<CartView> {
    const cart = await this.requireCart(principal);
    const item = await this.carts.findItem(cart.id, itemId);
    if (item === null) throw AppError.cartItemNotFound();
    await this.carts.deleteItem(cart.id, item.id);
    return this.read(principal);
  }

  private async applyAddition(
    cartId: string,
    target: { readonly variantId: string } | { readonly bundleId: string },
    current: CartProductView,
    quantity: number,
    principal: AuthenticatedPrincipal,
  ): Promise<CartView> {
    try {
      await this.carts.incrementItem(
        cartId,
        target,
        quantity,
        current.currentUnitPriceMinor,
        current.currentUnitCurrency,
      );
    } catch (error) {
      if (error instanceof CartLimitExceededError) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          details: [
            {
              path: 'quantity',
              message:
                error.limit === 'quantity'
                  ? `The total quantity of one cart line must not exceed ${MAX_CART_LINE_QUANTITY}`
                  : `The cart must not hold more than ${MAX_CART_LINES} lines`,
            },
          ],
        });
      }
      throw error;
    }
    return this.read(principal);
  }

  private async requireCart(principal: AuthenticatedPrincipal): Promise<{ readonly id: string }> {
    const cart = await this.carts.findByUserId(principal.userId);
    if (cart === null) throw AppError.cartItemNotFound();
    return cart;
  }

  /**
   * The catalog facts of a SKU the customer may buy.
   *
   * An unpublished product is invisible to a customer, exactly as it is in the catalog browse, so
   * adding it is refused with the same not-found answer.
   */
  private async resolvePurchasableVariant(variantId: string): Promise<CartProductView> {
    const item = await this.carts.findVariantForPurchase(variantId);
    if (item === null) throw AppError.variantNotFound();
    if (!item.productPublished) throw AppError.variantNotFound();
    return item;
  }

  /** The catalog facts of a bundle the customer may buy, under the same publication rule. */
  private async resolvePurchasableBundle(bundleId: string): Promise<CartProductView> {
    const item = await this.carts.findBundleForPurchase(bundleId);
    if (item === null) throw AppError.bundleNotFound();
    if (!item.productPublished) throw AppError.bundleNotFound();
    return item;
  }

  /** The current catalog facts of whatever an existing line references. */
  private async resolvePurchasableTarget(item: CartItemWithTarget): Promise<CartProductView> {
    if (item.variant !== null) return this.resolvePurchasableVariant(item.variant.id);
    if (item.bundle !== null) return this.resolvePurchasableBundle(item.bundle.id);
    throw AppError.cartItemNotFound();
  }
}

function toLineView(item: CartItemWithTarget): CartLineView {
  const target = item.variant ?? item.bundle;
  if (target === null) throw AppError.cartItemNotFound();
  const product = item.variant === null ? item.bundle : item.variant;
  if (product === null) throw AppError.cartItemNotFound();
  const sku = item.variant === null ? (item.bundle?.name ?? '') : item.variant.sku;
  return {
    id: item.id,
    targetKind: item.variant === null ? 'BUNDLE' : 'VARIANT',
    variantId: item.variantId,
    bundleId: item.bundleId,
    sku,
    productId: product.productId,
    productName: product.productName,
    productSlug: product.productSlug,
    quantity: item.quantity,
    lastKnownUnitPriceMinor: item.unitPriceMinor,
    lastKnownUnitCurrency: item.unitCurrency,
    currentUnitPriceMinor: product.currentUnitPriceMinor,
    currentUnitCurrency: product.currentUnitCurrency,
    discountBasisPoints: product.discountBasisPoints,
    priceChanged:
      item.unitPriceMinor !== product.currentUnitPriceMinor ||
      item.unitCurrency !== product.currentUnitCurrency,
    purchasable: product.productPublished,
  };
}

function toSnapshotLine(item: CartItemWithTarget): CartSnapshotLine {
  const view = toLineView(item);
  return {
    lineId: view.id,
    targetKind: view.targetKind,
    variantId: view.variantId,
    bundleId: view.bundleId,
    sku: view.sku,
    productId: view.productId,
    productName: view.productName,
    productSlug: view.productSlug,
    quantity: view.quantity,
    lastKnownUnitPriceMinor: view.lastKnownUnitPriceMinor,
    lastKnownUnitCurrency: view.lastKnownUnitCurrency,
    currentUnitPriceMinor: view.currentUnitPriceMinor,
    currentUnitCurrency: view.currentUnitCurrency,
    discountBasisPoints: view.discountBasisPoints,
    purchasable: view.purchasable,
  };
}
