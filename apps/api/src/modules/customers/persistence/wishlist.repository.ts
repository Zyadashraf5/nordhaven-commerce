import { CATALOG_PURCHASE_READER, type CatalogPurchaseReader } from '../../catalog';
import { AppError } from '../../../platform/http/app-error';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { DatabaseService } from '../../../platform/database/database.service';

/** The catalog facts a wishlist item reports about the product it references. */
export interface WishlistProductView {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  /** The catalog's publication state; an unpublished product is no longer purchasable. */
  readonly published: boolean;
  /** The current effective price, in exact integer minor units of the product's base currency. */
  readonly currentPriceMinor: number;
  readonly currentCurrency: string;
}

/** One saved product, as the Customers module persists it. */
export interface WishlistItemRecord {
  readonly id: string;
  readonly customerId: string;
  readonly productId: string;
  readonly createdAt: Date;
}

/** A saved product together with the catalog facts it references. */
export interface WishlistItemWithProduct extends WishlistItemRecord {
  readonly product: WishlistProductView;
}

const WISHLIST_ITEM_SELECT = {
  id: true,
  customerId: true,
  productId: true,
  createdAt: true,
} satisfies Prisma.CustomerWishlistItemSelect;

const WISHLIST_ITEM_WITH_PRODUCT_SELECT = {
  ...WISHLIST_ITEM_SELECT,
  product: {
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      effectivePriceMinor: true,
      baseCurrency: true,
    },
  },
} satisfies Prisma.CustomerWishlistItemSelect;

function toProductView(
  row: Prisma.CustomerWishlistItemGetPayload<{
    select: typeof WISHLIST_ITEM_WITH_PRODUCT_SELECT;
  }>,
): WishlistProductView {
  return {
    id: row.product.id,
    name: row.product.name,
    slug: row.product.slug,
    published: row.product.status === 'PUBLISHED',
    currentPriceMinor: row.product.effectivePriceMinor,
    currentCurrency: row.product.baseCurrency,
  };
}

function toItemWithProduct(
  row: Prisma.CustomerWishlistItemGetPayload<{
    select: typeof WISHLIST_ITEM_WITH_PRODUCT_SELECT;
  }>,
): WishlistItemWithProduct {
  return { ...row, product: toProductView(row) };
}

/**
 * Persistence for the customer's wishlist.
 *
 * The item references the catalog's products through a declared foreign key (research R3) and reads
 * the referenced rows through that projection. Purchase lookup uses the Catalog owner's published
 * reader. The cascade guarantees a wishlist never references a product that
 * no longer exists.
 */
@Injectable()
export class WishlistRepository {
  public constructor(
    private readonly database: DatabaseService,
    @Inject(CATALOG_PURCHASE_READER) private readonly catalog: CatalogPurchaseReader,
  ) {}

  /** Every saved product of a customer, in the order they were saved. */
  public async listItems(customerId: string): Promise<WishlistItemWithProduct[]> {
    const rows = await this.database.prisma.customerWishlistItem.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: WISHLIST_ITEM_WITH_PRODUCT_SELECT,
    });
    return rows.map(toItemWithProduct);
  }

  /** One saved product of a customer, or null when the customer has not saved it. */
  public async findItem(
    customerId: string,
    itemId: string,
  ): Promise<WishlistItemWithProduct | null> {
    const row = await this.database.prisma.customerWishlistItem.findFirst({
      where: { id: itemId, customerId },
      select: WISHLIST_ITEM_WITH_PRODUCT_SELECT,
    });
    return row === null ? null : toItemWithProduct(row);
  }

  /** The saved product a customer holds for a catalog product, or null. */
  public async findItemByProduct(
    customerId: string,
    productId: string,
  ): Promise<WishlistItemRecord | null> {
    return this.database.prisma.customerWishlistItem.findUnique({
      where: { customerId_productId: { customerId, productId } },
      select: WISHLIST_ITEM_SELECT,
    });
  }

  /**
   * Saves a product.
   *
   * The unique constraint on `(customer_id, product_id)` makes "a customer holds a product at most
   * once" structural, so saving the same product again is a no-op rather than a duplicate.
   */
  public async saveItem(customerId: string, productId: string): Promise<WishlistItemRecord> {
    return this.database.prisma.customerWishlistItem.upsert({
      where: { customerId_productId: { customerId, productId } },
      create: { customerId, productId },
      update: {},
      select: WISHLIST_ITEM_SELECT,
    });
  }

  /** Removes a saved product. */
  public async deleteItem(customerId: string, itemId: string): Promise<void> {
    const removed = await this.database.prisma.customerWishlistItem.deleteMany({
      where: { id: itemId, customerId },
    });
    if (removed.count === 0) throw AppError.wishlistItemNotFound();
  }

  /**
   * Current product facts resolved through the Catalog owner's published reader.
   */
  public async findProductForPurchase(productId: string): Promise<WishlistProductView | null> {
    const row = await this.catalog.productFactsOf(productId);
    if (row === null) return null;
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      published: row.status === 'PUBLISHED',
      currentPriceMinor: row.effectivePriceMinor,
      currentCurrency: row.baseCurrency,
    };
  }
}
