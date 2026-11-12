import { WishlistService } from '../../apps/api/src/modules/customers/application/wishlist.service';
import { randomUUID } from 'node:crypto';
import { createApplication } from '../../apps/api/src/bootstrap/create-application';
import { DatabaseService } from '../../apps/api/src/platform/database/database.service';
import { CartService } from '../../apps/api/src/modules/cart/application/cart.service';
import { resetCartDatabase } from '../helpers/cart-database';
import { resetCatalogDatabase } from '../helpers/catalog-database';
import { resetInventoryDatabase } from '../helpers/inventory-database';
import { resetOrderDatabase } from '../helpers/order-database';
import { resetPaymentDatabase } from '../helpers/payment-database';
import { resetCheckoutDatabase } from '../helpers/checkout-database';
import { testConfigurationFor } from '../helpers/test-configuration';

type Application = Awaited<ReturnType<typeof createApplication>>['app'];
describe('M07 independent cart concurrency regressions', () => {
  let app: Application;
  let db: DatabaseService;
  let carts: CartService;
  beforeAll(async () => {
    ({ app } = await createApplication({ configuration: testConfigurationFor('integration') }));
    db = app.get(DatabaseService);
    carts = app.get(CartService);
  }, 30_000);
  async function cleanup() {
    await resetPaymentDatabase(db);
    await resetOrderDatabase(db);
    await resetCheckoutDatabase(db);
    await resetCartDatabase(db);
    await resetInventoryDatabase(db);
    await resetCatalogDatabase(db);
  }
  beforeEach(cleanup);
  afterEach(cleanup);
  afterAll(async () => {
    await app.close();
  });
  async function fixture() {
    const id = randomUUID();
    const category = await db.prisma.category.create({ data: { name: id, slug: id } });
    const brand = await db.prisma.brand.create({ data: { name: id, slug: id } });
    const product = await db.prisma.product.create({
      data: {
        name: id,
        slug: id,
        description: 'Isolated audit fixture',
        categoryId: category.id,
        brandId: brand.id,
        basePriceMinor: 1000,
        effectivePriceMinor: 1000,
        baseCurrency: 'EGP',
        status: 'PUBLISHED',
      },
    });
    const variant = await db.prisma.productVariant.create({
      data: { productId: product.id, sku: id },
    });
    const principal = {
      userId: randomUUID(),
      role: 'CUSTOMER' as const,
      sessionId: randomUUID(),
      sessionExpiresAt: new Date(Date.now() + 60_000),
    };
    return { principal, variantId: variant.id, productId: product.id };
  }
  it('merges all successful parallel additions without losing quantity or reserving stock', async () => {
    const { principal, variantId } = await fixture();
    await carts.addItem(principal, variantId, 1);
    await Promise.all(Array.from({ length: 8 }, () => carts.addItem(principal, variantId, 1)));
    const view = await carts.read(principal);
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0]?.quantity).toBe(9);
    expect(await db.prisma.inventoryItem.count()).toBe(0);
    expect(await db.prisma.reservation.count()).toBe(0);
  });
  it('admits only the quantity increments that fit the line limit under contention', async () => {
    const { principal, variantId } = await fixture();
    await carts.addItem(principal, variantId, 997);
    const results = await Promise.allSettled([
      carts.addItem(principal, variantId, 2),
      carts.addItem(principal, variantId, 2),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((r) => r.status === 'rejected');
    expect(failed?.status === 'rejected' ? failed.reason : null).toMatchObject({ status: 400 });
    expect((await carts.read(principal)).lines[0]?.quantity).toBe(999);
  });
  it('keeps the cart line-count bound under concurrent insertions and isolates customers', async () => {
    const { principal, variantId, productId } = await fixture();
    await carts.addItem(principal, variantId, 1);
    const owned = await db.prisma.cart.findUniqueOrThrow({ where: { userId: principal.userId } });
    const extra = await Promise.all(
      Array.from({ length: 200 }, () =>
        db.prisma.productVariant.create({ data: { productId, sku: randomUUID() } }),
      ),
    );
    await db.prisma.cartItem.createMany({
      data: extra.slice(0, 198).map((v) => ({
        cartId: owned.id,
        variantId: v.id,
        quantity: 1,
        unitPriceMinor: 1000,
        unitCurrency: 'EGP',
      })),
    });
    const results = await Promise.allSettled(
      extra.slice(198).map((v) => carts.addItem(principal, v.id, 1)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await db.prisma.cartItem.count({ where: { cartId: owned.id } })).toBe(200);
    const other = { ...principal, userId: randomUUID() };
    expect((await carts.read(other)).lines).toHaveLength(0);
    expect(await db.prisma.cart.count({ where: { userId: principal.userId } })).toBe(1);
  });
  it('rolls back nested repository transactions and keeps unrelated async work outside the transaction', async () => {
    const userId = randomUUID();
    await expect(
      db.transaction(async () => {
        await db.prisma.cart.create({ data: { userId } });
        await db.prisma.$transaction(async (tx) => {
          await tx.cartItem.count();
        });
        throw new Error('Rollback nested work');
      }),
    ).rejects.toThrow('Rollback nested work');
    expect(await db.prisma.cart.count({ where: { userId } })).toBe(0);
    const committedId = randomUUID(),
      rolledBackId = randomUUID();
    await Promise.allSettled([
      db.transaction(async () => {
        await db.prisma.cart.create({ data: { userId: rolledBackId } });
        await new Promise((resolve) => setTimeout(resolve, 25));
        throw new Error('Isolated rollback');
      }),
      db.transaction(async () => {
        await db.prisma.cart.create({ data: { userId: committedId } });
      }),
    ]);
    expect(await db.prisma.cart.count({ where: { userId: committedId } })).toBe(1);
    expect(await db.prisma.cart.count({ where: { userId: rolledBackId } })).toBe(0);
  });
  it('maps competing removals to one success and one stable not-found response', async () => {
    const { principal, variantId } = await fixture();
    const line = (await carts.addItem(principal, variantId, 1)).lines[0];
    if (line === undefined) throw new Error('Missing fixture line');
    const results = await Promise.allSettled([
      carts.removeItem(principal, line.id),
      carts.removeItem(principal, line.id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find((r) => r.status === 'rejected');
    expect(failure?.status === 'rejected' ? failure.reason : null).toMatchObject({
      code: 'CART_ITEM_NOT_FOUND',
    });
  });

  it('keeps wishlist ownership and a stable not-found result during concurrent deletion', async () => {
    const { principal, productId } = await fixture();
    const wishlist = app.get(WishlistService);
    const saved = (await wishlist.save(principal, productId)).items[0];
    if (saved === undefined) throw new Error('Missing saved item');
    await expect(
      wishlist.remove({ ...principal, userId: randomUUID() }, saved.id),
    ).rejects.toMatchObject({ code: 'WISHLIST_ITEM_NOT_FOUND' });
    const results = await Promise.allSettled([
      wishlist.remove(principal, saved.id),
      wishlist.remove(principal, saved.id),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const failure = results.find((r) => r.status === 'rejected');
    expect(failure?.status === 'rejected' ? failure.reason : null).toMatchObject({
      code: 'WISHLIST_ITEM_NOT_FOUND',
    });
  });
  it('claims one first cart safely from concurrent business transactions', async () => {
    const { principal } = await fixture();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => db.transaction(() => carts.read(principal))),
    );
    expect(results).toHaveLength(6);
    expect(await db.prisma.cart.count({ where: { userId: principal.userId } })).toBe(1);
  });
});
