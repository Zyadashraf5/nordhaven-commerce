import { Injectable } from '@nestjs/common';
import { AppError } from '../../../platform/http/app-error';
import type { AuthenticatedPrincipal } from '../../../platform/security/principal';
import { CustomerProfileRepository } from '../persistence/customer-profile.repository';
import {
  WishlistRepository,
  type WishlistItemWithProduct,
  type WishlistProductView,
} from '../persistence/wishlist.repository';

/** One saved product as the application presents it. */
export interface WishlistItemView {
  readonly id: string;
  readonly productId: string;
  readonly productName: string;
  readonly productSlug: string;
  /** The current effective price, in exact integer minor units of the product's base currency. */
  readonly currentPriceMinor: number;
  readonly currentCurrency: string;
  /** False when the product is no longer published, so the item can no longer be bought. */
  readonly purchasable: boolean;
  readonly savedAt: Date;
}

/** The customer's wishlist as the application presents it. */
export interface WishlistView {
  readonly items: readonly WishlistItemView[];
}

/**
 * The customer's wishlist.
 *
 * The wishlist is scoped to the authenticated principal alone, so no request can reach another
 * customer's wishlist. It holds catalog products, not SKUs, because a wishlist records interest in
 * a product rather than a decision about a specific variant.
 */
@Injectable()
export class WishlistService {
  public constructor(
    private readonly profiles: CustomerProfileRepository,
    private readonly wishlists: WishlistRepository,
  ) {}

  /** The customer's saved products. */
  public async read(principal: AuthenticatedPrincipal): Promise<WishlistView> {
    const profile = await this.profiles.findOrCreateByUserId(principal.userId);
    const items = await this.wishlists.listItems(profile.id);
    return { items: items.map((item) => toItemView(item)) };
  }

  /**
   * Saves a product.
   *
   * Saving a product that is already saved is a no-op, so the wishlist holds it exactly once.
   * An unpublished product is invisible to a customer, exactly as it is in the catalog browse, so
   * saving it is refused with the same not-found answer.
   */
  public async save(principal: AuthenticatedPrincipal, productId: string): Promise<WishlistView> {
    const profile = await this.profiles.findOrCreateByUserId(principal.userId);
    const product = await this.resolvePurchasableProduct(productId);
    await this.wishlists.saveItem(profile.id, product.id);
    return this.read(principal);
  }

  /** Removes a saved product. */
  public async remove(principal: AuthenticatedPrincipal, itemId: string): Promise<WishlistView> {
    const profile = await this.profiles.findOrCreateByUserId(principal.userId);
    const item = await this.wishlists.findItem(profile.id, itemId);
    if (item === null) throw AppError.wishlistItemNotFound();
    await this.wishlists.deleteItem(profile.id, item.id);
    return this.read(principal);
  }

  private async resolvePurchasableProduct(productId: string): Promise<WishlistProductView> {
    const product = await this.wishlists.findProductForPurchase(productId);
    if (product === null) throw AppError.productNotFound();
    if (!product.published) throw AppError.productNotFound();
    return product;
  }
}

function toItemView(item: WishlistItemWithProduct): WishlistItemView {
  return {
    id: item.id,
    productId: item.product.id,
    productName: item.product.name,
    productSlug: item.product.slug,
    currentPriceMinor: item.product.currentPriceMinor,
    currentCurrency: item.product.currentCurrency,
    purchasable: item.product.published,
    savedAt: item.createdAt,
  };
}
