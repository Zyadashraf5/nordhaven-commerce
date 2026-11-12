import { CATALOG_PURCHASE_READER, type CatalogPurchaseReader } from '../../catalog';
import { INVENTORY_BUNDLES, type InventoryBundles } from '../../inventory';
import { AppError } from '../../../platform/http/app-error';
import { MAX_CART_LINES, MAX_CART_LINE_QUANTITY } from '../api/cart.support';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { DatabaseService } from '../../../platform/database/database.service';

/** The catalog facts a cart line reports about the product it references. */
export interface CartProductView {
  readonly productId: string;
  readonly productName: string;
  readonly productSlug: string;
  /** The catalog's publication state; an unpublished product is no longer purchasable. */
  readonly productPublished: boolean;
  /** The current effective price, in exact integer minor units of the product's base currency. */
  readonly currentUnitPriceMinor: number;
  readonly currentUnitCurrency: string;
  readonly discountBasisPoints: number;
}

/** The catalog facts of a SKU a cart line may reference. */
export interface CartVariantView extends CartProductView {
  readonly id: string;
  readonly sku: string;
}

/** The catalog facts of a bundle a cart line may reference. */
export interface CartBundleView extends CartProductView {
  readonly id: string;
  readonly name: string;
}

/** One line of a cart, as the Cart module persists it. */
export interface CartItemRecord {
  readonly id: string;
  readonly cartId: string;
  readonly variantId: string | null;
  readonly bundleId: string | null;
  readonly quantity: number;
  readonly unitPriceMinor: number;
  readonly unitCurrency: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** A line of a cart together with the catalog facts it references. */
export interface CartItemWithTarget extends CartItemRecord {
  /** The SKU the line references, when it references one. */
  readonly variant: CartVariantView | null;
  /** The bundle the line references, when it references one. */
  readonly bundle: CartBundleView | null;
}

const CART_ITEM_SELECT = {
  id: true,
  cartId: true,
  variantId: true,
  bundleId: true,
  quantity: true,
  unitPriceMinor: true,
  unitCurrency: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.CartItemSelect;

const PRODUCT_FACTS_SELECT = {
  id: true,
  name: true,
  slug: true,
  status: true,
  effectivePriceMinor: true,
  discountBasisPoints: true,
  baseCurrency: true,
} satisfies Prisma.ProductSelect;

const CART_ITEM_WITH_TARGET_SELECT = {
  ...CART_ITEM_SELECT,
  variant: {
    select: {
      id: true,
      sku: true,
      product: { select: PRODUCT_FACTS_SELECT },
    },
  },
  bundle: {
    select: {
      id: true,
      name: true,
      product: { select: PRODUCT_FACTS_SELECT },
    },
  },
} satisfies Prisma.CartItemSelect;

type CartItemWithTargetRow = Prisma.CartItemGetPayload<{
  select: typeof CART_ITEM_WITH_TARGET_SELECT;
}>;

function toProductFacts(product: {
  id: string;
  name: string;
  slug: string;
  status: string;
  effectivePriceMinor: number;
  discountBasisPoints: number;
  baseCurrency: string;
}): CartProductView {
  return {
    productId: product.id,
    productName: product.name,
    productSlug: product.slug,
    productPublished: product.status === 'PUBLISHED',
    currentUnitPriceMinor: product.effectivePriceMinor,
    currentUnitCurrency: product.baseCurrency,
    discountBasisPoints: product.discountBasisPoints,
  };
}

function toItemWithTarget(row: CartItemWithTargetRow): CartItemWithTarget {
  return {
    id: row.id,
    cartId: row.cartId,
    variantId: row.variantId,
    bundleId: row.bundleId,
    quantity: row.quantity,
    unitPriceMinor: row.unitPriceMinor,
    unitCurrency: row.unitCurrency,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    variant:
      row.variant === null
        ? null
        : {
            id: row.variant.id,
            sku: row.variant.sku,
            ...toProductFacts(row.variant.product),
          },
    bundle:
      row.bundle === null
        ? null
        : {
            id: row.bundle.id,
            name: row.bundle.name,
            ...toProductFacts(row.bundle.product),
          },
  };
}

/**
 * Persistence for the customer's cart.
 *
 * The cart references the catalog's SKUs and the inventory's bundles through declared foreign keys
 * (research R2) and reads declared reference projections. Root lookups use the owners' published
 * purchase-fact contracts and import no owner internals.
 *
 * `user_id` is the Identity-owned customer as a stable foreign identifier only. There is
 * deliberately no foreign key to the Identity `users` table, for the same reason the Customers
 * module has none: HC-DEC-003 leaves account deletion and retention unresolved.
 */
@Injectable()
export class CartRepository {
  public constructor(
    private readonly database: DatabaseService,
    @Inject(CATALOG_PURCHASE_READER) private readonly catalog: CatalogPurchaseReader,
    @Inject(INVENTORY_BUNDLES) private readonly bundles: InventoryBundles,
  ) {}

  /**
   * The customer's cart, or null when they have never had one.
   *
   * The unique constraint on `user_id` makes the "one cart per customer" rule structural, so two
   * concurrent first requests resolve to a single cart rather than two.
   */
  public async findByUserId(userId: string): Promise<{ readonly id: string } | null> {
    return this.database.prisma.cart.findUnique({
      where: { userId },
      select: { id: true },
    });
  }

  /** The customer's cart, created on first use. */
  public async findOrCreateByUserId(userId: string): Promise<{ readonly id: string }> {
    const existing = await this.findByUserId(userId);
    if (existing !== null) return existing;
    return this.database.prisma.cart.upsert({
      where: { userId },
      create: { userId },
      update: { userId },
      select: { id: true },
    });
  }

  /** The caller's explicit transaction retains this cart lock through order creation. */
  public async lockForCustomer(userId: string): Promise<void> {
    const cart = await this.findOrCreateByUserId(userId);
    await this.database.prisma
      .$queryRaw`SELECT id FROM carts WHERE id = ${cart.id}::uuid FOR UPDATE`;
  }

  /** Every line of a cart, with the catalog facts each line references. */
  public async listItems(cartId: string): Promise<CartItemWithTarget[]> {
    const rows = await this.database.prisma.cartItem.findMany({
      where: { cartId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: CART_ITEM_WITH_TARGET_SELECT,
    });
    return rows.map(toItemWithTarget);
  }

  /** One line of a cart, or null when the cart does not hold it. */
  public async findItem(cartId: string, itemId: string): Promise<CartItemWithTarget | null> {
    const row = await this.database.prisma.cartItem.findFirst({
      where: { id: itemId, cartId },
      select: CART_ITEM_WITH_TARGET_SELECT,
    });
    return row === null ? null : toItemWithTarget(row);
  }

  /** The line a cart holds for a SKU, or null when the cart holds none. */
  public async findItemByVariant(
    cartId: string,
    variantId: string,
  ): Promise<CartItemRecord | null> {
    return this.database.prisma.cartItem.findFirst({
      where: { cartId, variantId },
      select: CART_ITEM_SELECT,
    });
  }

  /** The line a cart holds for a bundle, or null when the cart holds none. */
  public async findItemByBundle(cartId: string, bundleId: string): Promise<CartItemRecord | null> {
    return this.database.prisma.cartItem.findFirst({
      where: { cartId, bundleId },
      select: CART_ITEM_SELECT,
    });
  }

  /**
   * SKU facts resolved by the Catalog owner through its published reader.
   */
  public async findVariantForPurchase(variantId: string): Promise<CartVariantView | null> {
    const row = await this.catalog.variantFactsOf(variantId);
    if (row === null) return null;
    return { id: row.id, sku: row.sku, ...toProductFacts(row.product) };
  }

  /**
   * Bundle identity comes from Inventory; its product facts come from the Catalog reader.
   *
   * A bundle is sold as one unit, so its price is the effective price of the product that names it.
   */
  public async findBundleForPurchase(bundleId: string): Promise<CartBundleView | null> {
    const bundle = await this.bundles.purchaseReferenceOf(bundleId);
    if (bundle === null) return null;
    const product = await this.catalog.productFactsOf(bundle.productId);
    return product === null
      ? null
      : { id: bundle.id, name: bundle.name, ...toProductFacts(product) };
  }

  /**
   * Creates or replaces a line.
   *
   * The quantity is the total the customer now wants, and the stored price is the price at the
   * moment of this decision (research R5), so the last-known price always means "the price at the
   * customer's most recent decision about this line".
   */
  public async upsertItem(
    cartId: string,
    target: { readonly variantId: string } | { readonly bundleId: string },
    quantity: number,
    unitPriceMinor: number,
    unitCurrency: string,
  ): Promise<CartItemRecord> {
    if ('variantId' in target) {
      return this.database.prisma.cartItem.upsert({
        where: { cartId_variantId: { cartId, variantId: target.variantId } },
        create: { cartId, variantId: target.variantId, quantity, unitPriceMinor, unitCurrency },
        update: { quantity, unitPriceMinor, unitCurrency },
        select: CART_ITEM_SELECT,
      });
    }
    return this.database.prisma.cartItem.upsert({
      where: { cartId_bundleId: { cartId, bundleId: target.bundleId } },
      create: { cartId, bundleId: target.bundleId, quantity, unitPriceMinor, unitCurrency },
      update: { quantity, unitPriceMinor, unitCurrency },
      select: CART_ITEM_SELECT,
    });
  }

  /** Adds quantity and checks cart limits while holding the cart parent lock. */
  public async incrementItem(
    cartId: string,
    target: { readonly variantId: string } | { readonly bundleId: string },
    increment: number,
    unitPriceMinor: number,
    unitCurrency: string,
  ): Promise<CartItemRecord> {
    return this.database.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM carts WHERE id = ${cartId}::uuid FOR UPDATE`;
      const existing = await tx.cartItem.findFirst({
        where: { cartId, ...target },
        select: CART_ITEM_SELECT,
      });
      const quantity = (existing?.quantity ?? 0) + increment;
      if (quantity > MAX_CART_LINE_QUANTITY) throw new CartLimitExceededError('quantity');
      if (existing === null && (await tx.cartItem.count({ where: { cartId } })) >= MAX_CART_LINES) {
        throw new CartLimitExceededError('lines');
      }
      if ('variantId' in target) {
        return tx.cartItem.upsert({
          where: { cartId_variantId: { cartId, variantId: target.variantId } },
          create: { cartId, variantId: target.variantId, quantity, unitPriceMinor, unitCurrency },
          update: { quantity, unitPriceMinor, unitCurrency },
          select: CART_ITEM_SELECT,
        });
      }
      return tx.cartItem.upsert({
        where: { cartId_bundleId: { cartId, bundleId: target.bundleId } },
        create: { cartId, bundleId: target.bundleId, quantity, unitPriceMinor, unitCurrency },
        update: { quantity, unitPriceMinor, unitCurrency },
        select: CART_ITEM_SELECT,
      });
    });
  }

  /** Serializes all mutations on the same cart, including replacement and removal. */
  public async setItemQuantity(
    cartId: string,
    itemId: string,
    quantity: number,
    unitPriceMinor: number,
    unitCurrency: string,
  ): Promise<CartItemRecord> {
    return this.database.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM carts WHERE id = ${cartId}::uuid FOR UPDATE`;
      const item = await tx.cartItem.findFirst({ where: { id: itemId, cartId } });
      if (item === null) throw AppError.cartItemNotFound();
      return tx.cartItem.update({
        where: { id: itemId, cartId },
        data: { quantity, unitPriceMinor, unitCurrency },
        select: CART_ITEM_SELECT,
      });
    });
  }

  /** Removes an owned line, with a stable not-found result under concurrent removal. */
  public async deleteItem(cartId: string, itemId: string): Promise<void> {
    await this.database.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM carts WHERE id = ${cartId}::uuid FOR UPDATE`;
      const removed = await tx.cartItem.deleteMany({ where: { id: itemId, cartId } });
      if (removed.count === 0) throw AppError.cartItemNotFound();
    });
  }

  /** Idempotent, customer-scoped removal of the lines covered by an order. */
  public async deleteItems(cartId: string, itemIds: readonly string[]): Promise<void> {
    if (itemIds.length === 0) return;
    await this.database.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM carts WHERE id = ${cartId}::uuid FOR UPDATE`;
      await tx.cartItem.deleteMany({ where: { cartId, id: { in: [...itemIds] } } });
    });
  }

  /** How many lines a cart holds. */
  public async countItems(cartId: string): Promise<number> {
    return this.database.prisma.cartItem.count({ where: { cartId } });
  }
}

export class CartLimitExceededError extends Error {
  public constructor(public readonly limit: 'quantity' | 'lines') {
    super('Cart limit exceeded');
  }
}
