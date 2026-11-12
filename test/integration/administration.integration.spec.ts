import { randomUUID } from 'node:crypto';
import { createApplication } from '../../apps/api/src/bootstrap/create-application';
import { AdministrationService } from '../../apps/api/src/modules/administration/application/administration.service';
import { BrandService } from '../../apps/api/src/modules/catalog/application/brand.service';
import { CategoryService } from '../../apps/api/src/modules/catalog/application/category.service';
import { ProductService } from '../../apps/api/src/modules/catalog/application/product.service';
import { CartService } from '../../apps/api/src/modules/cart/application/cart.service';
import { CheckoutService } from '../../apps/api/src/modules/checkout/application/checkout.service';
import { InventoryService } from '../../apps/api/src/modules/inventory/application/inventory.service';
import { OrderService } from '../../apps/api/src/modules/order/application/order.service';
import { PaymentService } from '../../apps/api/src/modules/payments/application/payment.service';
import { ReviewService } from '../../apps/api/src/modules/review/application/review.service';
import { TaxService } from '../../apps/api/src/modules/tax/application/tax.service';
import { DatabaseService } from '../../apps/api/src/platform/database/database.service';
import { resetCartDatabase } from '../helpers/cart-database';
import { resetCatalogDatabase } from '../helpers/catalog-database';
import { resetCheckoutDatabase } from '../helpers/checkout-database';
import { resetIdentityDatabase } from '../helpers/identity-database';
import { resetInventoryDatabase } from '../helpers/inventory-database';
import { resetOrderDatabase } from '../helpers/order-database';
import { resetPaymentDatabase } from '../helpers/payment-database';
import { resetReviewDatabase } from '../helpers/review-database';
import { testConfigurationFor } from '../helpers/test-configuration';

const CUSTOMER_USER_ID = '6f1e0d9c-8b7a-4695-8432-1f0e9d8c7b83';

type Application = Awaited<ReturnType<typeof createApplication>>['app'];

describe('Administration integration', () => {
  let app: Application;
  let database: DatabaseService;
  let administration: AdministrationService;
  let categories: CategoryService;
  let brands: BrandService;
  let products: ProductService;
  let carts: CartService;
  let inventory: InventoryService;
  let taxes: TaxService;
  let checkout: CheckoutService;
  let orders: OrderService;
  let payments: PaymentService;
  let reviews: ReviewService;

  beforeAll(async () => {
    const created = await createApplication({ configuration: testConfigurationFor('integration') });
    app = created.app;
    database = app.get(DatabaseService);
    administration = app.get(AdministrationService);
    categories = app.get(CategoryService);
    brands = app.get(BrandService);
    products = app.get(ProductService);
    carts = app.get(CartService);
    inventory = app.get(InventoryService);
    taxes = app.get(TaxService);
    checkout = app.get(CheckoutService);
    orders = app.get(OrderService);
    payments = app.get(PaymentService);
    reviews = app.get(ReviewService);
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetIdentityDatabase(database);
    await resetReviewDatabase(database);
    await resetPaymentDatabase(database);
    await resetOrderDatabase(database);
    await resetCheckoutDatabase(database);
    await resetInventoryDatabase(database);
    await resetCartDatabase(database);
    await resetCatalogDatabase(database);
  });

  afterEach(async () => {
    await resetIdentityDatabase(database);
    await resetReviewDatabase(database);
    await resetPaymentDatabase(database);
    await resetOrderDatabase(database);
    await resetCheckoutDatabase(database);
    await resetInventoryDatabase(database);
    await resetCartDatabase(database);
    await resetCatalogDatabase(database);
  });

  /** A paid order of the customer that contains the product. */
  async function paidOrder(name: string): Promise<{ productId: string; orderId: string }> {
    const category = await categories.create({ name: `Category ${name}` });
    const brand = await brands.create({ name: `Brand ${name}` });
    const product = await products.create({
      name,
      description: `${name} description.`,
      categoryId: category.id,
      brandId: brand.id,
      basePriceMinor: 129900,
      baseCurrency: 'EGP',
    });
    const variant = await products.createVariant(product.id, {
      sku: `SKU-${name.replace(/\s+/g, '-')}`,
    });
    await products.setStatus(product.id, 'PUBLISHED');
    await checkout.configureDestination({
      countryCode: 'EG',
      enabled: true,
      taxJurisdiction: 'EG',
      shippingApproved: true,
      label: 'Egypt',
      updatedByUserId: null,
    });
    await taxes.createRule({
      environment: 'TEST',
      jurisdiction: 'EG',
      classification: 'STANDARD',
      rateBasisPoints: 1400,
      taxInclusive: false,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveTo: null,
      priority: 0,
      updatedByUserId: null,
    });
    await inventory.setOnHand(variant.id, 10, null);
    await carts.addItem(
      { userId: CUSTOMER_USER_ID, role: 'CUSTOMER', sessionId: 's', sessionExpiresAt: new Date() },
      variant.id,
      1,
    );
    const order = await orders.create({
      customerId: CUSTOMER_USER_ID,
      idempotencyKey: `order-key-admin-${name}`,
      destinationCountryCode: 'EG',
      expectedFingerprint: null,
    });
    const attempt = await payments.createAttempt({
      customerId: CUSTOMER_USER_ID,
      orderId: order.id,
      idempotencyKey: `attempt-key-admin-${name}`,
    });
    await payments.applyProviderEvent({
      providerEventId: `admin-payment-${name}`,
      type: 'payment.succeeded',
      orderId: order.id,
      providerReference: attempt.providerReference,
      amountMinor: order.totalMinor,
      currency: 'EGP',
      occurredAt: new Date(),
      detail: {},
    });
    return { productId: product.id, orderId: order.id };
  }

  it('reports the platform picture from the capabilities that own the records', async () => {
    const { productId } = await paidOrder('Oak Dining Table');
    await reviews.create({
      productId,
      customerId: CUSTOMER_USER_ID,
      rating: 5,
      title: 'Wonderful',
      body: 'It is a wonderful table.',
    });

    const overview = await administration.overview();
    expect(overview.orders).toContainEqual({ state: 'PAID', count: 1 });
    expect(overview.reviews).toContainEqual({ state: 'PENDING', count: 1 });
    expect(overview.collectedMinor).toBeGreaterThan(0);
    expect(overview.refundedMinor).toBe(0);
    expect(overview.currency).toBe('EGP');

    const customers = await administration.customers(200);
    const customer = customers.find((entry) => entry.customerId === CUSTOMER_USER_ID);
    expect(customer?.orderCount).toBe(1);
    expect(customer?.reviewCount).toBe(1);
    expect(customer?.shipmentCount).toBe(0);
  });

  it('reads one customer with their records and refuses an unknown one', async () => {
    const { orderId } = await paidOrder('Oak Dining Table');
    const detail = await administration.customer(CUSTOMER_USER_ID);
    expect(detail?.orderIds).toContain(orderId);
    expect(detail?.orderCount).toBe(1);
    expect(await administration.customer('11111111-1111-4111-8111-111111111111')).toBeNull();
  });

  it('reports the money the platform holds', async () => {
    const { orderId } = await paidOrder('Oak Dining Table');
    const order = await orders.read(orderId);
    const summary = await administration.overview();
    expect(summary.collectedMinor).toBe(order?.totalMinor ?? 0);
    expect(summary.pendingRefundMinor).toBe(0);
  });
  it('reads the platform security trail', async () => {
    const events = await administration.securityEvents(50);
    expect(Array.isArray(events)).toBe(true);
  });
  async function createOrderHistory(): Promise<string> {
    const { orderId } = await paidOrder('Administrative history fixture');
    const original = await database.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    await database.prisma.order.createMany({
      data: Array.from({ length: 500 }, (_, i) => ({
        ...original,
        id: randomUUID(),
        idempotencyKey: 'admin-history-' + i,
        status: 'CANCELLED' as const,
        paidAt: null,
        reservationId: null,
        cancelledAt: new Date(),
        createdAt: new Date(original.createdAt.getTime() + i + 1),
        updatedAt: new Date(original.createdAt.getTime() + i + 1),
      })),
    });
    return original.customerId;
  }

  it('reports all persisted operational states beyond the recent500-record page', async () => {
    await createOrderHistory();
    const overview = await administration.overview();
    expect(overview.orders.reduce((n, state) => n + state.count, 0)).toBe(501);
    expect(overview.orders.find((state) => state.state === 'PAID')?.count).toBe(1);
  });

  it('resolves an existing account beyond the first500 identity records', async () => {
    const id = 'ffffffff-ffff-4fff-bfff-ffffffffffff';
    await database.prisma.user.createMany({
      data: [
        ...Array.from({ length: 501 }, (_, i) => ({
          id: randomUUID(),
          email: 'admin-page-' + i + '@nordhaven.test',
          passwordHash: 'local-test-only-not-a-login-credential',
        })),
        {
          id,
          email: 'older-customer@nordhaven.test',
          passwordHash: 'local-test-only-not-a-login-credential',
        },
      ],
    });
    const detail = await administration.customer(id);
    expect(detail).toMatchObject({
      customerId: id,
      email: 'older-customer@nordhaven.test',
      orderCount: 0,
    });
    expect((await administration.overview()).accounts).toBe(502);
  });

  it('reports exact customer activity counts even when the record-ID sample is bounded', async () => {
    const id = await createOrderHistory();
    const detail = await administration.customer(id);
    expect(detail?.orderCount).toBe(501);
    expect(detail?.orderIds).toHaveLength(500);
    expect(detail?.recordsTruncated).toBe(true);
    expect(
      (await administration.customers(200)).find((customer) => customer.customerId === id)
        ?.orderCount,
    ).toBe(501);
  });
  it('pages all account and unlinked commerce identities without duplicates or silent omissions', async () => {
    await paidOrder('Unlinked identity fixture');
    await database.prisma.user.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        id: '00000000-0000-4000-8000-' + String(i + 1).padStart(12, '0'),
        email: 'page-fixture-' + i + '@nordhaven.test',
        passwordHash: 'local-test-only-not-a-login-credential',
      })),
    });
    const ids: string[] = [];
    let cursor: string | null = null;
    let finished = false;
    for (let i = 0; i < 10; i++) {
      const page = await administration.customersPage(2, cursor);
      ids.push(...page.customers.map((row) => row.customerId));
      if (page.nextCursor === null) {
        finished = true;
        break;
      }
      expect(page.nextCursor).not.toBe(cursor);
      cursor = page.nextCursor;
    }
    expect(finished).toBe(true);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect(ids).toContain(CUSTOMER_USER_ID);
    expect((await administration.customer(CUSTOMER_USER_ID))?.recordsTruncated).toBe(false);
  });
});
