import { createApplication } from '../../apps/api/src/bootstrap/create-application';
import { BrandService } from '../../apps/api/src/modules/catalog/application/brand.service';
import { CategoryService } from '../../apps/api/src/modules/catalog/application/category.service';
import { ProductService } from '../../apps/api/src/modules/catalog/application/product.service';
import { CartService } from '../../apps/api/src/modules/cart/application/cart.service';
import { WishlistService } from '../../apps/api/src/modules/customers/application/wishlist.service';
import { DatabaseService } from '../../apps/api/src/platform/database/database.service';
import type { AuthenticatedPrincipal } from '../../apps/api/src/platform/security/principal';
import { resetCartDatabase } from '../helpers/cart-database';
import { resetCatalogDatabase } from '../helpers/catalog-database';
import { resetCustomerDatabase } from '../helpers/customer-database';
import { resetIdentityDatabase } from '../helpers/identity-database';
import { testConfigurationFor } from '../helpers/test-configuration';

const CUSTOMER_USER_ID = '6f1e0d9c-8b7a-4695-8432-1f0e9d8c7b71';
const OTHER_USER_ID = '6f1e0d9c-8b7a-4695-8432-1f0e9d8c7b72';

type Application = Awaited<ReturnType<typeof createApplication>>['app'];

function principalFor(userId: string): AuthenticatedPrincipal {
  return {
    userId,
    role: 'CUSTOMER',
    sessionId: '7f1e0d9c-8b7a-4695-8432-1f0e9d8c7b73',
    sessionExpiresAt: new Date('2026-10-20T12:00:00.000Z'),
  };
}

describe('Cart and Wishlist persistence integration', () => {
  let app: Application;
  let database: DatabaseService;
  let categories: CategoryService;
  let brands: BrandService;
  let products: ProductService;
  let carts: CartService;
  let wishlists: WishlistService;

  const customer = principalFor(CUSTOMER_USER_ID);
  const other = principalFor(OTHER_USER_ID);

  beforeAll(async () => {
    const created = await createApplication({ configuration: testConfigurationFor('integration') });
    app = created.app;
    database = app.get(DatabaseService);
    categories = app.get(CategoryService);
    brands = app.get(BrandService);
    products = app.get(ProductService);
    carts = app.get(CartService);
    wishlists = app.get(WishlistService);
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetIdentityDatabase(database);
    await resetCustomerDatabase(database);
    await resetCartDatabase(database);
    await resetCatalogDatabase(database);
  });

  afterEach(async () => {
    await resetIdentityDatabase(database);
    await resetCustomerDatabase(database);
    await resetCartDatabase(database);
    await resetCatalogDatabase(database);
  });

  async function seedPublished(
    options: {
      name: string;
      basePriceMinor?: number;
      baseCurrency?: string;
      publish?: boolean;
    } = { name: 'Oak Dining Table' },
  ): Promise<{ productId: string; variantId: string }> {
    const category = await categories.create({ name: `Category ${options.name}` });
    const brand = await brands.create({ name: `Brand ${options.name}` });
    const product = await products.create({
      name: options.name,
      description: `${options.name} description.`,
      categoryId: category.id,
      brandId: brand.id,
      basePriceMinor: options.basePriceMinor ?? 129900,
      baseCurrency: options.baseCurrency ?? 'GBP',
    });
    const variant = await products.createVariant(product.id, {
      sku: `SKU-${options.name.replace(/\s+/g, '-')}`,
    });
    if (options.publish !== false) {
      await products.setStatus(product.id, 'PUBLISHED');
    }
    return { productId: product.id, variantId: variant.id };
  }

  describe('cart', () => {
    it('returns an empty cart for a customer who has never had one', async () => {
      const view = await carts.read(customer);

      expect(view.lines).toEqual([]);
      expect(await database.prisma.cartItem.count()).toBe(0);
    });

    it('creates exactly one cart for concurrent first access', async () => {
      const results = await Promise.all(Array.from({ length: 5 }, () => carts.read(customer)));

      expect(await database.prisma.cart.count()).toBe(1);
      expect(results.every((view) => view.lines.length === 0)).toBe(true);
    });

    it('adds a SKU with a quantity and reports the last-known and current price', async () => {
      const { variantId } = await seedPublished();

      const view = await carts.addItem(customer, variantId, 2);

      expect(view.lines).toHaveLength(1);
      expect(view.lines[0]).toMatchObject({
        variantId,
        quantity: 2,
        lastKnownUnitPriceMinor: 129900,
        lastKnownUnitCurrency: 'GBP',
        currentUnitPriceMinor: 129900,
        currentUnitCurrency: 'GBP',
        priceChanged: false,
        purchasable: true,
      });
    });

    it('increases the quantity instead of creating a second line for the same SKU', async () => {
      const { variantId } = await seedPublished();

      await carts.addItem(customer, variantId, 2);
      const view = await carts.addItem(customer, variantId, 3);

      expect(view.lines).toHaveLength(1);
      expect(view.lines[0]?.quantity).toBe(5);
      expect(await database.prisma.cartItem.count()).toBe(1);
    });

    it('changes the quantity of a line', async () => {
      const { variantId } = await seedPublished();
      const added = await carts.addItem(customer, variantId, 2);
      const itemId = added.lines[0]?.id ?? '';

      const view = await carts.setItemQuantity(customer, itemId, 7);

      expect(view.lines[0]?.quantity).toBe(7);
    });

    it('removes a line', async () => {
      const { variantId } = await seedPublished();
      const added = await carts.addItem(customer, variantId, 1);
      const itemId = added.lines[0]?.id ?? '';

      const view = await carts.removeItem(customer, itemId);

      expect(view.lines).toEqual([]);
      expect(await database.prisma.cartItem.count()).toBe(0);
    });

    it('refuses to change or remove a line that is not in the cart', async () => {
      const { variantId } = await seedPublished();
      await carts.addItem(customer, variantId, 1);
      const missing = '8f1e0d9c-8b7a-4695-8432-1f0e9d8c7b79';

      await expect(carts.setItemQuantity(customer, missing, 2)).rejects.toMatchObject({
        code: 'CART_ITEM_NOT_FOUND',
      });
      await expect(carts.removeItem(customer, missing)).rejects.toMatchObject({
        code: 'CART_ITEM_NOT_FOUND',
      });
    });

    it('refuses a SKU that does not exist', async () => {
      await expect(
        carts.addItem(customer, '9f1e0d9c-8b7a-4695-8432-1f0e9d8c7b99', 1),
      ).rejects.toMatchObject({ code: 'VARIANT_NOT_FOUND' });
    });

    it('refuses a SKU whose product is not published', async () => {
      const { variantId } = await seedPublished({ name: 'Draft Table', publish: false });

      await expect(carts.addItem(customer, variantId, 1)).rejects.toMatchObject({
        code: 'VARIANT_NOT_FOUND',
      });
    });

    it('never shows one customer the lines of another', async () => {
      const { variantId } = await seedPublished();
      await carts.addItem(customer, variantId, 4);

      const otherView = await carts.read(other);

      expect(otherView.lines).toEqual([]);
      expect(await database.prisma.cartItem.count()).toBe(1);
    });

    it('reports a price change and clears the signal when the price returns', async () => {
      const { productId, variantId } = await seedPublished();
      const added = await carts.addItem(customer, variantId, 1);
      const itemId = added.lines[0]?.id ?? '';

      await products.update(productId, { basePriceMinor: 99900 });
      const changed = await carts.read(customer);
      expect(changed.lines[0]).toMatchObject({
        lastKnownUnitPriceMinor: 129900,
        currentUnitPriceMinor: 99900,
        priceChanged: true,
      });

      await products.update(productId, { basePriceMinor: 129900 });
      const restored = await carts.read(customer);
      expect(restored.lines[0]).toMatchObject({
        lastKnownUnitPriceMinor: 129900,
        currentUnitPriceMinor: 129900,
        priceChanged: false,
      });
      expect(itemId).not.toBe('');
    });

    it('reports the effective price of a discounted product', async () => {
      const { productId, variantId } = await seedPublished();
      await products.setDiscount(productId, 5000);

      const view = await carts.addItem(customer, variantId, 1);

      // 129900 * 5000 / 10000 is exactly 64950, so a half-off discount leaves 64950.
      expect(view.lines[0]).toMatchObject({
        lastKnownUnitPriceMinor: 64950,
        currentUnitPriceMinor: 64950,
        priceChanged: false,
      });
    });

    it('refreshes the last-known price when the customer changes the quantity', async () => {
      const { productId, variantId } = await seedPublished();
      const added = await carts.addItem(customer, variantId, 1);
      const itemId = added.lines[0]?.id ?? '';
      await products.update(productId, { basePriceMinor: 99900 });

      const view = await carts.setItemQuantity(customer, itemId, 3);

      expect(view.lines[0]).toMatchObject({
        quantity: 3,
        lastKnownUnitPriceMinor: 99900,
        currentUnitPriceMinor: 99900,
        priceChanged: false,
      });
    });

    it('reports a line whose product is no longer published as not purchasable', async () => {
      const { productId, variantId } = await seedPublished();
      await carts.addItem(customer, variantId, 1);
      await products.setStatus(productId, 'ARCHIVED');

      const view = await carts.read(customer);

      expect(view.lines).toHaveLength(1);
      expect(view.lines[0]?.purchasable).toBe(false);
    });

    it('refuses a quantity beyond the per-line maximum', async () => {
      const { variantId } = await seedPublished();
      await carts.addItem(customer, variantId, 900);

      await expect(carts.addItem(customer, variantId, 200)).rejects.toMatchObject({
        status: 400,
      });
      const view = await carts.read(customer);
      expect(view.lines[0]?.quantity).toBe(900);
    });

    it('refuses a line quantity outside the declared range at the database level', async () => {
      const { variantId } = await seedPublished();
      await carts.addItem(customer, variantId, 1);
      const cart = await database.prisma.cart.findFirstOrThrow();
      const variant = await database.prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
      });

      await expect(
        database.prisma.cartItem.create({
          data: {
            cartId: cart.id,
            variantId: variant.id,
            quantity: 0,
            unitPriceMinor: 100,
            unitCurrency: 'GBP',
          },
        }),
      ).rejects.toThrow();
      await expect(
        database.prisma.cartItem.create({
          data: {
            cartId: cart.id,
            variantId: variant.id,
            quantity: 1,
            unitPriceMinor: -1,
            unitCurrency: 'GBP',
          },
        }),
      ).rejects.toThrow();
    });

    it('refuses to delete a SKU that is in a cart', async () => {
      const { variantId } = await seedPublished();
      await carts.addItem(customer, variantId, 1);

      await expect(products.removeVariant(variantId)).rejects.toMatchObject({
        code: 'CATALOG_CONFLICT',
      });
    });

    it('never reserves or holds stock', async () => {
      const { variantId } = await seedPublished();
      const inventory = await database.prisma.inventoryItem.findFirst({
        where: { variantId },
      });

      await carts.addItem(customer, variantId, 5);

      const after = await database.prisma.inventoryItem.findFirst({
        where: { variantId },
      });
      expect(after?.onHand ?? 0).toBe(inventory?.onHand ?? 0);
      expect(after?.reserved ?? 0).toBe(inventory?.reserved ?? 0);
      expect(await database.prisma.reservation.count()).toBe(0);
    });
  });

  describe('wishlist', () => {
    it('returns an empty wishlist for a customer who has never saved anything', async () => {
      const view = await wishlists.read(customer);

      expect(view.items).toEqual([]);
    });

    it('saves a product exactly once, even when saved twice', async () => {
      const { productId } = await seedPublished();

      await wishlists.save(customer, productId);
      const view = await wishlists.save(customer, productId);

      expect(view.items).toHaveLength(1);
      expect(view.items[0]?.productId).toBe(productId);
      expect(await database.prisma.customerWishlistItem.count()).toBe(1);
    });

    it('removes a saved product', async () => {
      const { productId } = await seedPublished();
      const saved = await wishlists.save(customer, productId);
      const itemId = saved.items[0]?.id ?? '';

      const view = await wishlists.remove(customer, itemId);

      expect(view.items).toEqual([]);
      expect(await database.prisma.customerWishlistItem.count()).toBe(0);
    });

    it('refuses to remove an item that is not in the wishlist', async () => {
      await expect(
        wishlists.remove(customer, 'af1e0d9c-8b7a-4695-8432-1f0e9d8c7b79'),
      ).rejects.toMatchObject({ code: 'WISHLIST_ITEM_NOT_FOUND' });
    });

    it('refuses a product that does not exist', async () => {
      await expect(
        wishlists.save(customer, 'bf1e0d9c-8b7a-4695-8432-1f0e9d8c7b79'),
      ).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
    });

    it('refuses a product that is not published', async () => {
      const { productId } = await seedPublished({ name: 'Draft Product', publish: false });

      await expect(wishlists.save(customer, productId)).rejects.toMatchObject({
        code: 'PRODUCT_NOT_FOUND',
      });
    });

    it('never shows one customer the items of another', async () => {
      const { productId } = await seedPublished();
      await wishlists.save(customer, productId);

      const otherView = await wishlists.read(other);

      expect(otherView.items).toEqual([]);
      expect(await database.prisma.customerWishlistItem.count()).toBe(1);
    });

    it('reports a saved product that is no longer published as not purchasable', async () => {
      const { productId } = await seedPublished();
      await wishlists.save(customer, productId);
      await products.setStatus(productId, 'ARCHIVED');

      const view = await wishlists.read(customer);

      expect(view.items).toHaveLength(1);
      expect(view.items[0]?.purchasable).toBe(false);
    });

    it('removes a saved product when the product is deleted', async () => {
      const { productId } = await seedPublished();
      await wishlists.save(customer, productId);

      await products.remove(productId);

      expect(await database.prisma.customerWishlistItem.count()).toBe(0);
    });
  });
});
