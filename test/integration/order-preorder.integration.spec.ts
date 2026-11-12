import { resetPaymentDatabase } from '../helpers/payment-database';
import { BundleService } from '../../apps/api/src/modules/inventory/application/bundle.service';
import { createApplication } from '../../apps/api/src/bootstrap/create-application';
import { BrandService } from '../../apps/api/src/modules/catalog/application/brand.service';
import { CategoryService } from '../../apps/api/src/modules/catalog/application/category.service';
import { ProductService } from '../../apps/api/src/modules/catalog/application/product.service';
import { CartService } from '../../apps/api/src/modules/cart/application/cart.service';
import { CheckoutService } from '../../apps/api/src/modules/checkout/application/checkout.service';
import { InventoryService } from '../../apps/api/src/modules/inventory/application/inventory.service';
import { OrderService } from '../../apps/api/src/modules/order/application/order.service';
import { PreOrderService } from '../../apps/api/src/modules/order/application/pre-order.service';
import { TaxService } from '../../apps/api/src/modules/tax/application/tax.service';
import { DatabaseService } from '../../apps/api/src/platform/database/database.service';
import { resetCartDatabase } from '../helpers/cart-database';
import { resetCatalogDatabase } from '../helpers/catalog-database';
import { resetCheckoutDatabase } from '../helpers/checkout-database';
import { resetIdentityDatabase } from '../helpers/identity-database';
import { resetInventoryDatabase } from '../helpers/inventory-database';
import { resetOrderDatabase } from '../helpers/order-database';
import { testConfigurationFor } from '../helpers/test-configuration';

const CUSTOMER_USER_ID = '6f1e0d9c-8b7a-4695-8432-1f0e9d8c7b81';
const OTHER_USER_ID = '6f1e0d9c-8b7a-4695-8432-1f0e9d8c7b82';

type Application = Awaited<ReturnType<typeof createApplication>>['app'];

describe('Orders and Pre-orders integration', () => {
  let app: Application;
  let database: DatabaseService;
  let categories: CategoryService;
  let brands: BrandService;
  let products: ProductService;
  let carts: CartService;
  let inventory: InventoryService;
  let taxes: TaxService;
  let checkout: CheckoutService;
  let orders: OrderService;
  let preOrders: PreOrderService;

  beforeAll(async () => {
    const created = await createApplication({ configuration: testConfigurationFor('integration') });
    app = created.app;
    database = app.get(DatabaseService);
    categories = app.get(CategoryService);
    brands = app.get(BrandService);
    products = app.get(ProductService);
    carts = app.get(CartService);
    inventory = app.get(InventoryService);
    taxes = app.get(TaxService);
    checkout = app.get(CheckoutService);
    orders = app.get(OrderService);
    preOrders = app.get(PreOrderService);
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetIdentityDatabase(database);
    await resetPaymentDatabase(database);
    await resetOrderDatabase(database);
    await resetCheckoutDatabase(database);
    await resetInventoryDatabase(database);
    await resetCartDatabase(database);
    await resetCatalogDatabase(database);
  });

  afterEach(async () => {
    await resetIdentityDatabase(database);
    await resetPaymentDatabase(database);
    await resetOrderDatabase(database);
    await resetCheckoutDatabase(database);
    await resetInventoryDatabase(database);
    await resetCartDatabase(database);
    await resetCatalogDatabase(database);
  });

  async function seedPublished(
    name: string,
    basePriceMinor = 129900,
  ): Promise<{ productId: string; variantId: string }> {
    const category = await categories.create({ name: `Category ${name}` });
    const brand = await brands.create({ name: `Brand ${name}` });
    const product = await products.create({
      name,
      description: `${name} description.`,
      categoryId: category.id,
      brandId: brand.id,
      basePriceMinor,
      baseCurrency: 'EGP',
    });
    const variant = await products.createVariant(product.id, {
      sku: `SKU-${name.replace(/\s+/g, '-')}`,
    });
    await products.setStatus(product.id, 'PUBLISHED');
    return { productId: product.id, variantId: variant.id };
  }

  async function approveDestination(): Promise<void> {
    await checkout.configureDestination({
      countryCode: 'EG',
      enabled: true,
      taxJurisdiction: 'EG',
      shippingApproved: true,
      label: 'Egypt',
      updatedByUserId: null,
    });
  }

  async function configureStandardTax(rateBasisPoints = 1400): Promise<void> {
    await taxes.createRule({
      environment: 'TEST',
      jurisdiction: 'EG',
      classification: 'STANDARD',
      rateBasisPoints,
      taxInclusive: false,
      effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
      effectiveTo: null,
      priority: 0,
      updatedByUserId: null,
    });
  }

  /** A cart with one published SKU, priced and tax-configured, ready to be ordered. */
  async function readyCart(quantity = 1, onHand = 10) {
    const { productId, variantId } = await seedPublished('Oak Dining Table');
    await approveDestination();
    await configureStandardTax(1400);
    await inventory.setOnHand(variantId, onHand, null);
    await carts.addItem(
      { userId: CUSTOMER_USER_ID, role: 'CUSTOMER', sessionId: 's', sessionExpiresAt: new Date() },
      variantId,
      quantity,
    );
    return { productId, variantId };
  }

  describe('creating an order', () => {
    it('blocks combined SKU and dynamic-bundle demand that individually appears available', async () => {
      const { variantId } = await readyCart(2, 3);
      const target = await seedPublished('Shared component bundle');
      const bundle = await app.get(BundleService).create({
        productId: target.productId,
        kind: 'DYNAMIC',
        name: 'Shared bundle',
        components: [{ variantId, minQuantity: 2, maxQuantity: 2 }],
      });
      await carts.addBundle(
        {
          userId: CUSTOMER_USER_ID,
          role: 'CUSTOMER',
          sessionId: 's',
          sessionExpiresAt: new Date(),
        },
        bundle.record.id,
        1,
      );
      const quote = await checkout.quote({
        customerId: CUSTOMER_USER_ID,
        destinationCountryCode: 'EG',
      });
      expect(quote.ready).toBe(false);
      expect(quote.blockers).toContainEqual({ code: 'INSUFFICIENT_STOCK' });
      expect(await database.prisma.reservation.count()).toBe(0);
      expect(
        (await database.prisma.inventoryItem.findUniqueOrThrow({ where: { variantId } })).reserved,
      ).toBe(0);
    });
    it('snapshots the price, the tax, and the total exactly', async () => {
      await readyCart(2);

      const order = await orders.create({
        customerId: CUSTOMER_USER_ID,
        idempotencyKey: 'order-key-one',
        destinationCountryCode: 'EG',
        expectedFingerprint: null,
      });

      expect(order.status).toBe('PENDING_PAYMENT');
      expect(order.currency).toBe('EGP');
      expect(order.subtotalMinor).toBe(259800);
      expect(order.taxTotalMinor).toBe(36372);
      expect(order.totalMinor).toBe(296172);
      expect(order.subtotalMinor + order.taxTotalMinor).toBe(order.totalMinor);
    });

    it('snapshots every line, including the tax rate and the classification', async () => {
      await readyCart(1);

      const order = await orders.create({
        customerId: CUSTOMER_USER_ID,
        idempotencyKey: 'order-key-lines',
        destinationCountryCode: 'EG',
        expectedFingerprint: null,
      });
      const lines = await orders.read(order.id);

      expect(lines?.lines).toHaveLength(1);
      expect(lines?.lines[0]).toMatchObject({
        quantity: 1,
        unitPriceMinor: 129900,
        unitCurrency: 'EGP',
        taxRateBasisPoints: 1400,
        taxInclusive: false,
        taxClassification: 'STANDARD',
        netMinor: 129900,
        taxMinor: 18186,
        totalMinor: 148086,
      });
    });

    it('keeps the snapshot immutable when the catalog price later changes', async () => {
      const { productId } = await readyCart(1);

      const order = await orders.create({
        customerId: CUSTOMER_USER_ID,
        idempotencyKey: 'order-key-immutable',
        destinationCountryCode: 'EG',
        expectedFingerprint: null,
      });
      await products.setDiscount(productId, 5000);

      const lines = await orders.read(order.id);
      expect(lines?.lines[0]?.unitPriceMinor).toBe(129900);
      expect(lines?.lines[0]?.totalMinor).toBe(148086);
    });

    it('holds the ordered stock with a reservation', async () => {
      const { variantId } = await readyCart(2, 5);

      const order = await orders.create({
        customerId: CUSTOMER_USER_ID,
        idempotencyKey: 'order-key-hold',
        destinationCountryCode: 'EG',
        expectedFingerprint: null,
      });

      expect(order.reservationId).not.toBeNull();
      const item = await database.prisma.inventoryItem.findFirst({
        where: { variantId },
        select: { onHand: true, reserved: true },
      });
      expect(item?.onHand).toBe(5);
      expect(item?.reserved).toBe(2);
    });

    it('removes the ordered lines from the cart', async () => {
      await readyCart(1);

      await orders.create({
        customerId: CUSTOMER_USER_ID,
        idempotencyKey: 'order-key-cart',
        destinationCountryCode: 'EG',
        expectedFingerprint: null,
      });

      const cart = await carts.read({
        userId: CUSTOMER_USER_ID,
        role: 'CUSTOMER',
        sessionId: 's',
        sessionExpiresAt: new Date(),
      });
      expect(cart.lines).toEqual([]);
    });

    it('records the creation as an event', async () => {
      await readyCart(1);

      const order = await orders.create({
        customerId: CUSTOMER_USER_ID,
        idempotencyKey: 'order-key-event',
        destinationCountryCode: 'EG',
        expectedFingerprint: null,
      });
      const events = await orders.eventsOf(order.id);

      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        eventType: 'ORDER_CREATED',
        previousStatus: null,
        nextStatus: 'PENDING_PAYMENT',
        actor: 'CUSTOMER',
      });
    });

    it('refuses an order for a cart that is not ready', async () => {
      await approveDestination();
      await configureStandardTax(1400);

      await expect(
        orders.create({
          customerId: CUSTOMER_USER_ID,
          idempotencyKey: 'order-key-empty',
          destinationCountryCode: 'EG',
          expectedFingerprint: null,
        }),
      ).rejects.toMatchObject({ code: 'ORDER_NOT_READY' });
      expect(await database.prisma.order.count()).toBe(0);
    });

    it('refuses an order when the price changed after the confirmation', async () => {
      await readyCart(1);
      const quote = await checkout.quote({
        customerId: CUSTOMER_USER_ID,
        destinationCountryCode: 'EG',
      });

      await expect(
        orders.create({
          customerId: CUSTOMER_USER_ID,
          idempotencyKey: 'order-key-stale',
          destinationCountryCode: 'EG',
          expectedFingerprint: '0'.repeat(64),
        }),
      ).rejects.toMatchObject({ code: 'ORDER_QUOTE_CHANGED' });
      expect(await database.prisma.order.count()).toBe(0);
      expect(quote.ready).toBe(true);
    });

    it('accepts an order when the fingerprint still matches', async () => {
      await readyCart(1);
      const quote = await checkout.quote({
        customerId: CUSTOMER_USER_ID,
        destinationCountryCode: 'EG',
      });

      const order = await orders.create({
        customerId: CUSTOMER_USER_ID,
        idempotencyKey: 'order-key-fingerprint',
        destinationCountryCode: 'EG',
        expectedFingerprint: quote.fingerprint,
      });

      expect(order.quoteFingerprint).toBe(quote.fingerprint);
    });
  });

  describe('the idempotency of order creation', () => {
    it('returns the original order for a repeated key', async () => {
      await readyCart(1);

      const first = await orders.create({
        customerId: CUSTOMER_USER_ID,
        idempotencyKey: 'order-key-repeat',
        destinationCountryCode: 'EG',
        expectedFingerprint: null,
      });
      const second = await orders.create({
        customerId: CUSTOMER_USER_ID,
        idempotencyKey: 'order-key-repeat',
        destinationCountryCode: 'EG',
        expectedFingerprint: null,
      });

      expect(second.id).toBe(first.id);
      expect(await database.prisma.order.count()).toBe(1);
      expect(await database.prisma.reservation.count()).toBe(1);
    });

    it('produces exactly one order when the same key races', async () => {
      await readyCart(1);

      const results = await Promise.allSettled(
        Array.from({ length: 5 }, () =>
          orders.create({
            customerId: CUSTOMER_USER_ID,
            idempotencyKey: 'order-key-race',
            destinationCountryCode: 'EG',
            expectedFingerprint: null,
          }),
        ),
      );

      const created = results
        .filter((result) => result.status === 'fulfilled')
        .map((result) => result.value);
      expect(created).toHaveLength(5);
      expect(new Set(created.map((order) => order.id)).size).toBe(1);
      expect(await database.prisma.order.count()).toBe(1);
      expect(await database.prisma.reservation.count()).toBe(1);
    });

    it('scopes the key to the customer', async () => {
      const { variantId } = await readyCart(1);

      const first = await orders.create({
        customerId: CUSTOMER_USER_ID,
        idempotencyKey: 'order-key-shared',
        destinationCountryCode: 'EG',
        expectedFingerprint: null,
      });

      // The other customer has their own cart, so their order is a separate order rather than a
      // repeated one.
      await carts.addItem(
        { userId: OTHER_USER_ID, role: 'CUSTOMER', sessionId: 's', sessionExpiresAt: new Date() },
        variantId,
        1,
      );
      const second = await orders.create({
        customerId: OTHER_USER_ID,
        idempotencyKey: 'order-key-shared',
        destinationCountryCode: 'EG',
        expectedFingerprint: null,
      });

      expect(second.id).not.toBe(first.id);
      expect(await database.prisma.order.count()).toBe(2);
    });
  });

  describe('cancelling an order', () => {
    it('cancels the order and releases the held stock', async () => {
      const { variantId } = await readyCart(2, 5);
      const order = await orders.create({
        customerId: CUSTOMER_USER_ID,
        idempotencyKey: 'order-key-cancel',
        destinationCountryCode: 'EG',
        expectedFingerprint: null,
      });

      const cancelled = await orders.cancel({
        orderId: order.id,
        customerId: CUSTOMER_USER_ID,
        actor: 'CUSTOMER',
        actorUserId: CUSTOMER_USER_ID,
      });

      expect(cancelled.status).toBe('CANCELLED');
      const item = await database.prisma.inventoryItem.findFirst({
        where: { variantId },
        select: { onHand: true, reserved: true },
      });
      expect(item?.reserved).toBe(0);
    });

    it('is idempotent for an order that is already cancelled', async () => {
      await readyCart(1);
      const order = await orders.create({
        customerId: CUSTOMER_USER_ID,
        idempotencyKey: 'order-key-cancel-twice',
        destinationCountryCode: 'EG',
        expectedFingerprint: null,
      });
      await orders.cancel({
        orderId: order.id,
        customerId: CUSTOMER_USER_ID,
        actor: 'CUSTOMER',
        actorUserId: CUSTOMER_USER_ID,
      });

      const again = await orders.cancel({
        orderId: order.id,
        customerId: CUSTOMER_USER_ID,
        actor: 'CUSTOMER',
        actorUserId: CUSTOMER_USER_ID,
      });

      expect(again.status).toBe('CANCELLED');
    });

    it('refuses a cancellation by another customer', async () => {
      await readyCart(1);
      const order = await orders.create({
        customerId: CUSTOMER_USER_ID,
        idempotencyKey: 'order-key-foreign',
        destinationCountryCode: 'EG',
        expectedFingerprint: null,
      });

      await expect(
        orders.cancel({
          orderId: order.id,
          customerId: OTHER_USER_ID,
          actor: 'CUSTOMER',
          actorUserId: OTHER_USER_ID,
        }),
      ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
    });
  });

  describe('the payment settlement', () => {
    it('confirms the stock and records the payment exactly once', async () => {
      const { variantId } = await readyCart(2, 5);
      const order = await orders.create({
        customerId: CUSTOMER_USER_ID,
        idempotencyKey: 'order-key-paid',
        destinationCountryCode: 'EG',
        expectedFingerprint: null,
      });

      const result = await orders.settlePayment({
        currency: 'EGP',
        orderId: order.id,
        paymentReference: 'pay-1',
        amountMinor: order.totalMinor,
        eventId: 'event-1',
      });

      expect(result.status).toBe('PAID');
      expect(result.stockAllocated).toBe(true);
      const item = await database.prisma.inventoryItem.findFirst({
        where: { variantId },
        select: { onHand: true, reserved: true },
      });
      expect(item?.onHand).toBe(3);
      expect(item?.reserved).toBe(0);
    });

    it('applies a repeated payment event only once', async () => {
      await readyCart(1, 5);
      const order = await orders.create({
        customerId: CUSTOMER_USER_ID,
        idempotencyKey: 'order-key-repeat-pay',
        destinationCountryCode: 'EG',
        expectedFingerprint: null,
      });

      const first = await orders.settlePayment({
        currency: 'EGP',
        orderId: order.id,
        paymentReference: 'pay-2',
        amountMinor: order.totalMinor,
        eventId: 'event-2',
      });
      const second = await orders.settlePayment({
        currency: 'EGP',
        orderId: order.id,
        paymentReference: 'pay-2',
        amountMinor: order.totalMinor,
        eventId: 'event-2',
      });

      expect(first.status).toBe('PAID');
      expect(second.status).toBe('PAID');
      const events = await orders.eventsOf(order.id);
      expect(events.filter((event) => event.eventType === 'PAYMENT_RECORDED')).toHaveLength(1);
    });

    it('does not allocate stock when the reservation has lapsed', async () => {
      await readyCart(2, 5);
      const order = await orders.create({
        customerId: CUSTOMER_USER_ID,
        idempotencyKey: 'order-key-late',
        destinationCountryCode: 'EG',
        expectedFingerprint: null,
      });

      // The hold is released, so the stock is on sale again before the payment arrives.
      await database.prisma.reservation.update({
        where: { id: order.reservationId as string },
        data: { status: 'RELEASED' },
      });

      const result = await orders.settlePayment({
        currency: 'EGP',
        orderId: order.id,
        paymentReference: 'pay-late',
        amountMinor: order.totalMinor,
        eventId: 'event-late',
      });

      expect(result.status).toBe('PAID_PENDING_ALLOCATION');
      expect(result.stockAllocated).toBe(false);
      const item = await database.prisma.inventoryItem.findFirst({
        select: { onHand: true, reserved: true },
      });
      expect(item?.onHand).toBe(5);
    });

    it('records the discrepancy as an event', async () => {
      await readyCart(1, 5);
      const order = await orders.create({
        customerId: CUSTOMER_USER_ID,
        idempotencyKey: 'order-key-late-event',
        destinationCountryCode: 'EG',
        expectedFingerprint: null,
      });
      await database.prisma.reservation.update({
        where: { id: order.reservationId as string },
        data: { status: 'RELEASED' },
      });

      await orders.settlePayment({
        currency: 'EGP',
        orderId: order.id,
        paymentReference: 'pay-late-event',
        amountMinor: order.totalMinor,
        eventId: 'event-late-record',
      });
      const events = await orders.eventsOf(order.id);

      const recorded = events.find((event) => event.eventType === 'PAYMENT_RECORDED');
      expect(recorded?.reason).toBe('RESERVATION_UNAVAILABLE');
      expect(recorded?.nextStatus).toBe('PAID_PENDING_ALLOCATION');
    });
  });

  describe('expiry and immutable evidence regressions', () => {
    it('rolls back order creation and keeps the cart when clearing ordered lines fails', async () => {
      const { variantId } = await readyCart(1, 5);
      const fault = jest
        .spyOn(carts, 'removeLinesForCustomer')
        .mockRejectedValueOnce(new Error('Injected cart persistence failure'));
      try {
        await expect(
          orders.create({
            customerId: CUSTOMER_USER_ID,
            idempotencyKey: 'cart-write-fault',
            destinationCountryCode: 'EG',
            expectedFingerprint: null,
          }),
        ).rejects.toThrow('Injected cart persistence failure');
      } finally {
        fault.mockRestore();
      }
      expect(await database.prisma.order.count()).toBe(0);
      expect(await database.prisma.reservation.count()).toBe(0);
      expect(
        (await database.prisma.inventoryItem.findUniqueOrThrow({ where: { variantId } })).reserved,
      ).toBe(0);
      expect(
        (
          await carts.read({
            userId: CUSTOMER_USER_ID,
            role: 'CUSTOMER',
            sessionId: 's',
            sessionExpiresAt: new Date(),
          })
        ).lines,
      ).toHaveLength(1);
    });
    it('keeps a refused paid-order cancellation auditable after its unit of work rolls back', async () => {
      await readyCart(1, 5);
      const order = await orders.create({
        customerId: CUSTOMER_USER_ID,
        idempotencyKey: 'refusal-audit',
        destinationCountryCode: 'EG',
        expectedFingerprint: null,
      });
      await orders.settlePayment({
        orderId: order.id,
        paymentReference: 'paid-audit',
        eventId: 'paid-audit',
        amountMinor: order.totalMinor,
        currency: 'EGP',
      });
      await expect(
        orders.cancel({
          orderId: order.id,
          customerId: CUSTOMER_USER_ID,
          actor: 'CUSTOMER',
          actorUserId: CUSTOMER_USER_ID,
        }),
      ).rejects.toMatchObject({ code: 'ORDER_NOT_CANCELLABLE' });
      expect(
        (await orders.eventsOf(order.id)).filter(
          (event) => event.eventType === 'TRANSITION_REFUSED',
        ),
      ).toHaveLength(1);
      expect((await orders.read(order.id))?.status).toBe('PAID');
    });
    it('expires a lapsed order, releases stock once, and records a late payment without allocating', async () => {
      const { variantId } = await readyCart(1, 5);
      const order = await orders.create({
        customerId: CUSTOMER_USER_ID,
        idempotencyKey: 'expire-read',
        destinationCountryCode: 'EG',
        expectedFingerprint: null,
      });
      const past = new Date(Date.now() - 60_000);
      await database.prisma.order.update({
        where: { id: order.id },
        data: { createdAt: new Date(past.getTime() - 60_000), expiresAt: past },
      });
      if (order.reservationId === null) throw new Error('Missing hold');
      await database.prisma.reservation.update({
        where: { id: order.reservationId },
        data: { createdAt: new Date(past.getTime() - 60_000), expiresAt: past },
      });
      expect(await orders.read(order.id, OTHER_USER_ID)).toBeNull();
      expect(
        (await database.prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status,
      ).toBe('PENDING_PAYMENT');
      expect(
        (await orders.listForCustomer(CUSTOMER_USER_ID, 50)).find(
          (candidate) => candidate.id === order.id,
        )?.status,
      ).toBe('EXPIRED');
      expect((await orders.read(order.id, CUSTOMER_USER_ID))?.status).toBe('EXPIRED');
      const result = await orders.settlePayment({
        orderId: order.id,
        paymentReference: 'late',
        eventId: 'after-expiry',
        amountMinor: order.totalMinor,
        currency: 'EGP',
      });
      expect(result).toMatchObject({ status: 'PAID_PENDING_ALLOCATION', stockAllocated: false });
      expect(
        (await database.prisma.inventoryItem.findUniqueOrThrow({ where: { variantId } })).onHand,
      ).toBe(5);
      expect(
        (await database.prisma.inventoryItem.findUniqueOrThrow({ where: { variantId } })).reserved,
      ).toBe(0);
    });
    it('records the actual discount and tax-rule provenance rather than zero discount', async () => {
      const { variantId } = await readyCart(1, 5);
      const variant = await database.prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
      });
      await products.setDiscount(variant.productId, 1000);
      const order = await orders.create({
        customerId: CUSTOMER_USER_ID,
        idempotencyKey: 'discount-evidence',
        destinationCountryCode: 'EG',
        expectedFingerprint: null,
      });
      expect((await orders.read(order.id))?.lines[0]?.discountBasisPoints).toBe(1000);
      const created = (await orders.eventsOf(order.id)).find(
        (event) => event.eventType === 'ORDER_CREATED',
      );
      expect(created?.detail).toHaveProperty('quoteSnapshot.lines.0.discountBasisPoints', 1000);
      expect(created?.detail).toHaveProperty('quoteSnapshot.lines.0.taxRuleId');
      const proof = created?.detail as { quoteSnapshot?: { lines?: { taxRuleId?: unknown }[] } };
      expect(typeof proof.quoteSnapshot?.lines?.[0]?.taxRuleId).toBe('string');
    });
    it('keeps additions made after the ordered snapshot instead of silently clearing them', async () => {
      const { variantId } = await readyCart(1, 5);
      let quoted!: () => void, release!: () => void;
      const reached = new Promise<void>((resolve) => {
        quoted = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const original = checkout.quote.bind(checkout);
      const spy = jest.spyOn(checkout, 'quote').mockImplementationOnce(async (input) => {
        const result = await original(input);
        quoted();
        await gate;
        return result;
      });
      const placing = orders.create({
        customerId: CUSTOMER_USER_ID,
        idempotencyKey: 'cart-race',
        destinationCountryCode: 'EG',
        expectedFingerprint: null,
      });
      try {
        await reached;
        let added = false;
        const adding = carts
          .addItem(
            {
              userId: CUSTOMER_USER_ID,
              role: 'CUSTOMER',
              sessionId: 's',
              sessionExpiresAt: new Date(),
            },
            variantId,
            1,
          )
          .then((result) => {
            added = true;
            return result;
          });
        await new Promise((resolve) => setTimeout(resolve, 25));
        expect(added).toBe(false);
        release();
        await placing;
        await adding;
        expect(
          (
            await carts.read({
              userId: CUSTOMER_USER_ID,
              role: 'CUSTOMER',
              sessionId: 's',
              sessionExpiresAt: new Date(),
            })
          ).lines[0]?.quantity,
        ).toBe(1);
      } finally {
        release();
        spy.mockRestore();
      }
    });
  });

  describe('pre-order to payable-order regressions', () => {
    it('converts the saved intent once, preserving the current cart and reusing its real hold', async () => {
      const { variantId } = await readyCart(1, 5);
      const intent = await preOrders.create({
        customerId: CUSTOMER_USER_ID,
        destinationCountryCode: 'EG',
      });
      await carts.addItem(
        {
          userId: CUSTOMER_USER_ID,
          role: 'CUSTOMER',
          sessionId: 's',
          sessionExpiresAt: new Date(),
        },
        variantId,
        2,
      );
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          preOrders.convert({
            preOrderId: intent.id,
            customerId: CUSTOMER_USER_ID,
            expectedFingerprint: null,
          }),
        ),
      );
      expect(new Set(results.map((order) => order.id)).size).toBe(1);
      const order = results[0];
      if (order === undefined) throw new Error('Missing converted order');
      expect((await orders.read(order.id))?.lines[0]?.quantity).toBe(1);
      expect(await database.prisma.order.count()).toBe(1);
      expect(await database.prisma.reservation.count()).toBe(1);
      expect(await database.prisma.paymentAttempt.count()).toBe(0);
      expect(
        (await database.prisma.inventoryItem.findUniqueOrThrow({ where: { variantId } })).reserved,
      ).toBe(1);
      expect(
        (
          await carts.read({
            userId: CUSTOMER_USER_ID,
            role: 'CUSTOMER',
            sessionId: 's',
            sessionExpiresAt: new Date(),
          })
        ).lines[0]?.quantity,
      ).toBe(3);
      expect(
        (await database.prisma.preOrder.findUniqueOrThrow({ where: { id: intent.id } })).status,
      ).toBe('AWAITING_PAYMENT');
      await orders.settlePayment({
        orderId: order.id,
        paymentReference: 'preorder-paid',
        eventId: 'preorder-paid',
        amountMinor: order.totalMinor,
        currency: order.currency,
      });
      expect(
        (await database.prisma.preOrder.findUniqueOrThrow({ where: { id: intent.id } })).status,
      ).toBe('CONVERTED');
      expect(
        (await database.prisma.inventoryItem.findUniqueOrThrow({ where: { variantId } })).onHand,
      ).toBe(4);
    });
    it('recomputes current server prices for conversion and records them immutably', async () => {
      const { variantId } = await readyCart(1, 5);
      const intent = await preOrders.create({
        customerId: CUSTOMER_USER_ID,
        destinationCountryCode: 'EG',
      });
      const variant = await database.prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
      });
      await products.setDiscount(variant.productId, 1000);
      const order = await preOrders.convert({
        preOrderId: intent.id,
        customerId: CUSTOMER_USER_ID,
        expectedFingerprint: null,
      });
      expect(order.totalMinor).toBeLessThan(intent.totalMinor);
      expect((await orders.read(order.id))?.lines[0]?.discountBasisPoints).toBe(1000);
    });
    it('checks ownership and stock readiness before creating a payable order', async () => {
      await readyCart(2, 1);
      const intent = await preOrders.create({
        customerId: CUSTOMER_USER_ID,
        destinationCountryCode: 'EG',
      });
      await expect(
        preOrders.convert({
          preOrderId: intent.id,
          customerId: OTHER_USER_ID,
          expectedFingerprint: null,
        }),
      ).rejects.toMatchObject({ code: 'PRE_ORDER_NOT_FOUND' });
      await expect(
        preOrders.convert({
          preOrderId: intent.id,
          customerId: CUSTOMER_USER_ID,
          expectedFingerprint: null,
        }),
      ).rejects.toMatchObject({ code: 'ORDER_NOT_READY' });
      expect(await database.prisma.order.count()).toBe(0);
      expect(await database.prisma.reservation.count()).toBe(0);
      expect(await database.prisma.paymentAttempt.count()).toBe(0);
    });
    it('releases a converted pending order through its order cancellation and records both lifecycles', async () => {
      const { variantId } = await readyCart(1, 5);
      const intent = await preOrders.create({
        customerId: CUSTOMER_USER_ID,
        destinationCountryCode: 'EG',
      });
      const order = await preOrders.convert({
        preOrderId: intent.id,
        customerId: CUSTOMER_USER_ID,
        expectedFingerprint: null,
      });
      const cancelled = await preOrders.cancel({
        preOrderId: intent.id,
        customerId: CUSTOMER_USER_ID,
        actor: 'CUSTOMER',
        actorUserId: CUSTOMER_USER_ID,
      });
      expect(cancelled.status).toBe('CANCELLED');
      expect((await orders.read(order.id))?.status).toBe('CANCELLED');
      expect(
        (await database.prisma.inventoryItem.findUniqueOrThrow({ where: { variantId } })).reserved,
      ).toBe(0);
    });
    it('fails closed for a historical intent lacking destination metadata without inventing tax facts', async () => {
      await readyCart(1, 5);
      const intent = await preOrders.create({
        customerId: CUSTOMER_USER_ID,
        destinationCountryCode: 'EG',
      });
      const stored = intent.lines as { lines: never[] };
      await database.prisma.preOrder.update({
        where: { id: intent.id },
        data: { lines: { lines: stored.lines } },
      });
      await expect(
        preOrders.convert({
          preOrderId: intent.id,
          customerId: CUSTOMER_USER_ID,
          expectedFingerprint: null,
        }),
      ).rejects.toMatchObject({ code: 'ORDER_NOT_READY' });
      expect(await database.prisma.order.count()).toBe(0);
      expect(await database.prisma.reservation.count()).toBe(0);
    });
  });

  describe('the pre-order', () => {
    it('resolves current SKU identity and refuses archived stock before holding a saved intent', async () => {
      const { variantId } = await readyCart(1, 5);
      const intent = await preOrders.create({
        customerId: CUSTOMER_USER_ID,
        destinationCountryCode: 'EG',
      });
      const variant = await database.prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
      });
      await products.updateVariant(variantId, { sku: 'RENAMED-PREORDER-SKU' });
      await products.setStatus(variant.productId, 'ARCHIVED');
      expect((await preOrders.evaluateReadiness(intent.id)).status).toBe('AWAITING_STOCK');
      expect(await database.prisma.reservation.count()).toBe(0);
      await products.setStatus(variant.productId, 'PUBLISHED');
      expect((await preOrders.evaluateReadiness(intent.id)).status).toBe('STOCK_RESERVED');
      expect(
        (await database.prisma.inventoryItem.findUniqueOrThrow({ where: { variantId } })).reserved,
      ).toBe(1);
    });
    it('replaces an expired pre-order hold without double reservation and appends lifecycle evidence', async () => {
      const { variantId } = await readyCart(1, 5);
      const intent = await preOrders.create({
        customerId: CUSTOMER_USER_ID,
        destinationCountryCode: 'EG',
      });
      const first = await preOrders.evaluateReadiness(intent.id);
      if (first.reservationId === null) throw new Error('Missing pre-order hold');
      await database.prisma.reservation.update({
        where: { id: first.reservationId },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
      const second = await preOrders.evaluateReadiness(intent.id);
      expect(second.status).toBe('STOCK_RESERVED');
      expect(second.reservationId).not.toBe(first.reservationId);
      expect(
        (await database.prisma.inventoryItem.findUniqueOrThrow({ where: { variantId } })).reserved,
      ).toBe(1);
      expect(await database.prisma.preOrderEvent.count({ where: { preOrderId: intent.id } })).toBe(
        4,
      );
    });
    it('checks customer ownership before readiness changes state or holds inventory', async () => {
      const { variantId } = await readyCart(2, 5);
      const preOrder = await preOrders.create({
        customerId: CUSTOMER_USER_ID,
        destinationCountryCode: 'EG',
      });
      await expect(preOrders.evaluateReadiness(preOrder.id, OTHER_USER_ID)).rejects.toMatchObject({
        code: 'PRE_ORDER_NOT_FOUND',
      });
      expect(
        (await database.prisma.preOrder.findUniqueOrThrow({ where: { id: preOrder.id } })).status,
      ).toBe('AWAITING_STOCK');
      expect(
        (await database.prisma.inventoryItem.findUniqueOrThrow({ where: { variantId } })).reserved,
      ).toBe(0);
      expect(await database.prisma.reservation.count()).toBe(0);
    });
    it('reserves actual stock under concurrent readiness checks and releases it on cancellation', async () => {
      const { variantId } = await readyCart(2, 5);
      const preOrder = await preOrders.create({
        customerId: CUSTOMER_USER_ID,
        destinationCountryCode: 'EG',
      });
      const results = await Promise.all(
        Array.from({ length: 5 }, () => preOrders.evaluateReadiness(preOrder.id)),
      );
      expect(results.every((r) => r.status === 'STOCK_RESERVED' && r.reservationId !== null)).toBe(
        true,
      );
      expect(new Set(results.map((r) => r.reservationId)).size).toBe(1);
      expect(
        (await database.prisma.inventoryItem.findUniqueOrThrow({ where: { variantId } })).reserved,
      ).toBe(2);
      await preOrders.cancel({
        preOrderId: preOrder.id,
        customerId: CUSTOMER_USER_ID,
        actor: 'CUSTOMER',
        actorUserId: CUSTOMER_USER_ID,
      });
      expect(
        (await database.prisma.inventoryItem.findUniqueOrThrow({ where: { variantId } })).reserved,
      ).toBe(0);
    });
    it('refuses an intent with missing tax configuration instead of storing a misleading total', async () => {
      await readyCart(1, 5);
      await resetCheckoutDatabase(database);
      await expect(
        preOrders.create({ customerId: CUSTOMER_USER_ID, destinationCountryCode: 'EG' }),
      ).rejects.toMatchObject({ code: 'ORDER_NOT_READY' });
      expect(await database.prisma.preOrder.count()).toBe(0);
    });
    it('records an intent without charging and without holding stock', async () => {
      const { variantId } = await readyCart(1, 5);

      const preOrder = await preOrders.create({
        customerId: CUSTOMER_USER_ID,
        destinationCountryCode: 'EG',
      });

      expect(preOrder.status).toBe('AWAITING_STOCK');
      expect(preOrder.totalMinor).toBe(148086);
      expect(preOrder.reservationId).toBeNull();
      // A pre-order holds nothing: it is an intent, and the stock is reserved only once the
      // pre-order becomes payable.
      expect(await database.prisma.reservation.count()).toBe(0);
      const item = await database.prisma.inventoryItem.findFirst({
        where: { variantId },
        select: { reserved: true },
      });
      expect(item?.reserved).toBe(0);
    });

    it('stays awaiting stock while the stock is unavailable', async () => {
      await approveDestination();
      await configureStandardTax(1400);
      const { variantId } = await seedPublished('Unavailable Vase');
      await carts.addItem(
        {
          userId: CUSTOMER_USER_ID,
          role: 'CUSTOMER',
          sessionId: 's',
          sessionExpiresAt: new Date(),
        },
        variantId,
        3,
      );
      const preOrder = await preOrders.create({
        customerId: CUSTOMER_USER_ID,
        destinationCountryCode: 'EG',
      });

      const evaluated = await preOrders.evaluateReadiness(preOrder.id);

      expect(evaluated.status).toBe('AWAITING_STOCK');
      expect(evaluated.reservationId).toBeNull();
    });

    it('cancels idempotently', async () => {
      await readyCart(1);
      const preOrder = await preOrders.create({
        customerId: CUSTOMER_USER_ID,
        destinationCountryCode: 'EG',
      });

      const cancelled = await preOrders.cancel({
        preOrderId: preOrder.id,
        customerId: CUSTOMER_USER_ID,
        actor: 'CUSTOMER',
        actorUserId: CUSTOMER_USER_ID,
      });
      const again = await preOrders.cancel({
        preOrderId: preOrder.id,
        customerId: CUSTOMER_USER_ID,
        actor: 'CUSTOMER',
        actorUserId: CUSTOMER_USER_ID,
      });

      expect(cancelled.status).toBe('CANCELLED');
      expect(again.status).toBe('CANCELLED');
    });

    it('refuses a cancellation by another customer', async () => {
      await readyCart(1);
      const preOrder = await preOrders.create({
        customerId: CUSTOMER_USER_ID,
        destinationCountryCode: 'EG',
      });

      await expect(
        preOrders.cancel({
          preOrderId: preOrder.id,
          customerId: OTHER_USER_ID,
          actor: 'CUSTOMER',
          actorUserId: OTHER_USER_ID,
        }),
      ).rejects.toMatchObject({ code: 'PRE_ORDER_NOT_FOUND' });
    });
  });

  describe('the customer boundary', () => {
    it('never returns another customer order', async () => {
      await readyCart(1);
      const order = await orders.create({
        customerId: CUSTOMER_USER_ID,
        idempotencyKey: 'order-key-boundary',
        destinationCountryCode: 'EG',
        expectedFingerprint: null,
      });

      const mine = await orders.listForCustomer(CUSTOMER_USER_ID, 50);
      const theirs = await orders.listForCustomer(OTHER_USER_ID, 50);

      expect(mine.map((entry) => entry.id)).toEqual([order.id]);
      expect(theirs).toEqual([]);
    });
  });
});
