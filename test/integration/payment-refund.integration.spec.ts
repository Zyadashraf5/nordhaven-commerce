import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../../apps/api/src/modules/payments/contracts';
import { PaymentRepository } from '../../apps/api/src/modules/payments/persistence/payment.repository';
import { OrderRepository } from '../../apps/api/src/modules/order/persistence/order.repository';
import { createApplication } from '../../apps/api/src/bootstrap/create-application';
import { BrandService } from '../../apps/api/src/modules/catalog/application/brand.service';
import { CategoryService } from '../../apps/api/src/modules/catalog/application/category.service';
import { ProductService } from '../../apps/api/src/modules/catalog/application/product.service';
import { CartService } from '../../apps/api/src/modules/cart/application/cart.service';
import { CheckoutService } from '../../apps/api/src/modules/checkout/application/checkout.service';
import { InventoryService } from '../../apps/api/src/modules/inventory/application/inventory.service';
import { OrderService } from '../../apps/api/src/modules/order/application/order.service';
import { PaymentService } from '../../apps/api/src/modules/payments/application/payment.service';
import { TaxService } from '../../apps/api/src/modules/tax/application/tax.service';
import { DatabaseService } from '../../apps/api/src/platform/database/database.service';
import { resetCartDatabase } from '../helpers/cart-database';
import { resetCatalogDatabase } from '../helpers/catalog-database';
import { resetCheckoutDatabase } from '../helpers/checkout-database';
import { resetIdentityDatabase } from '../helpers/identity-database';
import { resetInventoryDatabase } from '../helpers/inventory-database';
import { resetOrderDatabase } from '../helpers/order-database';
import { resetPaymentDatabase } from '../helpers/payment-database';
import { testConfigurationFor } from '../helpers/test-configuration';

const CUSTOMER_USER_ID = '6f1e0d9c-8b7a-4695-8432-1f0e9d8c7b83';

type Application = Awaited<ReturnType<typeof createApplication>>['app'];

describe('Payments and Refunds integration', () => {
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
  let payments: PaymentService;

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
    payments = app.get(PaymentService);
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

  /** A pending order with its cart, tax, and destination configured. */
  async function pendingOrder(
    quantity = 1,
    onHand = 10,
  ): Promise<{ orderId: string; variantId: string; totalMinor: number }> {
    const { variantId } = await seedPublished('Oak Dining Table');
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
    await inventory.setOnHand(variantId, onHand, null);
    await carts.addItem(
      { userId: CUSTOMER_USER_ID, role: 'CUSTOMER', sessionId: 's', sessionExpiresAt: new Date() },
      variantId,
      quantity,
    );
    const order = await orders.create({
      customerId: CUSTOMER_USER_ID,
      idempotencyKey: 'order-key-payment',
      destinationCountryCode: 'EG',
      expectedFingerprint: null,
    });
    return { orderId: order.id, variantId, totalMinor: order.totalMinor };
  }

  describe('independent financial consistency regressions', () => {
    it('admits one active attempt when different business keys race for one order', async () => {
      const { orderId } = await pendingOrder();
      const results = await Promise.allSettled(
        ['one', 'two'].map((key) =>
          payments.createAttempt({
            customerId: CUSTOMER_USER_ID,
            orderId,
            idempotencyKey: 'different-' + key,
          }),
        ),
      );
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const failure = results.find((r) => r.status === 'rejected');
      expect(failure?.status === 'rejected' ? failure.reason : null).toMatchObject({
        code: 'PAYMENT_NOT_PAYABLE',
      });
      expect(await database.prisma.paymentAttempt.count()).toBe(1);
    });
    it('recovers a payment-provider timeout using the same durable attempt key', async () => {
      const { orderId } = await pendingOrder();
      const spy = jest
        .spyOn(app.get<PaymentProvider>(PAYMENT_PROVIDER), 'createPayment')
        .mockRejectedValueOnce(new Error('Simulated create timeout'));
      try {
        const input = { customerId: CUSTOMER_USER_ID, orderId, idempotencyKey: 'recover-create' };
        await expect(payments.createAttempt(input)).rejects.toThrow('Simulated create timeout');
        const recovered = await payments.createAttempt(input);
        expect(recovered.providerReference).not.toBeNull();
        expect(await database.prisma.paymentAttempt.count()).toBe(1);
        expect(new Set(spy.mock.calls.map(([r]) => r.idempotencyKey)).size).toBe(1);
      } finally {
        spy.mockRestore();
      }
    });
    it('blocks a total outside stored money bounds before creating another order or hold', async () => {
      const { variantId } = await pendingOrder();
      const variant = await database.prisma.productVariant.findUniqueOrThrow({
        where: { id: variantId },
      });
      await database.prisma.product.update({
        where: { id: variant.productId },
        data: { basePriceMinor: 2_000_000_000, effectivePriceMinor: 2_000_000_000 },
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
      const quote = await checkout.quote({
        customerId: CUSTOMER_USER_ID,
        destinationCountryCode: 'EG',
      });
      expect(quote.ready).toBe(false);
      expect(quote.blockers).toContainEqual({ code: 'AMOUNT_UNSUPPORTED' });
      await expect(
        orders.create({
          customerId: CUSTOMER_USER_ID,
          idempotencyKey: 'oversized',
          destinationCountryCode: 'EG',
          expectedFingerprint: null,
        }),
      ).rejects.toMatchObject({ code: 'ORDER_NOT_READY' });
      expect(await database.prisma.order.count()).toBe(1);
      expect(await database.prisma.reservation.count()).toBe(1);
    });
    it.each([
      { amount: 1, currency: 'EGP' },
      { amount: null, currency: 'EGP' },
      { amount: 148086, currency: 'USD' },
    ])(
      'rejects mismatched settlement details %# without allocating stock',
      async ({ amount, currency }) => {
        const { orderId, variantId } = await pendingOrder();
        const attempt = await payments.createAttempt({
          customerId: CUSTOMER_USER_ID,
          orderId,
          idempotencyKey: 'validation',
        });
        const result = await payments.applyProviderEvent({
          providerEventId: 'mismatch',
          type: 'payment.succeeded',
          orderId,
          providerReference: attempt.providerReference,
          amountMinor: amount,
          currency,
          occurredAt: new Date(),
          detail: {},
        });
        expect(result.outcome).toBe('REJECTED');
        expect((await orders.read(orderId))?.status).toBe('PENDING_PAYMENT');
        expect((await payments.attemptOf(attempt.id))?.status).toBe('PENDING');
        expect(
          await database.prisma.inventoryItem.findUnique({
            where: { variantId },
            select: { onHand: true, reserved: true },
          }),
        ).toEqual({ onHand: 10, reserved: 1 });
      },
    );

    it('rolls back order and stock settlement when payment persistence fails, then retries exactly once', async () => {
      const { orderId, variantId, totalMinor } = await pendingOrder();
      const attempt = await payments.createAttempt({
        customerId: CUSTOMER_USER_ID,
        orderId,
        idempotencyKey: 'atomic',
      });
      const event = {
        providerEventId: 'atomic-event',
        type: 'payment.succeeded',
        orderId,
        providerReference: attempt.providerReference,
        amountMinor: totalMinor,
        currency: 'EGP',
        occurredAt: new Date(),
        detail: {},
      };
      const fault = jest
        .spyOn(app.get(PaymentRepository), 'transitionAttempt')
        .mockRejectedValueOnce(new Error('Injected write failure'));
      await expect(payments.applyProviderEvent(event)).rejects.toThrow('Injected write failure');
      fault.mockRestore();
      expect((await orders.read(orderId))?.status).toBe('PENDING_PAYMENT');
      expect((await payments.attemptOf(attempt.id))?.status).toBe('PENDING');
      expect(
        await database.prisma.inventoryItem.findUnique({
          where: { variantId },
          select: { onHand: true, reserved: true },
        }),
      ).toEqual({ onHand: 10, reserved: 1 });
      expect(await database.prisma.providerEvent.count()).toBe(0);
      expect((await payments.applyProviderEvent(event)).outcome).toBe('APPLIED');
      expect((await payments.applyProviderEvent(event)).outcome).toBe('DUPLICATE');
      expect(
        await database.prisma.inventoryItem.findUnique({
          where: { variantId },
          select: { onHand: true, reserved: true },
        }),
      ).toEqual({ onHand: 9, reserved: 0 });
    });

    it('rolls back a newly held reservation when order insertion fails', async () => {
      const { variantId } = await pendingOrder();
      await carts.addItem(
        {
          userId: CUSTOMER_USER_ID,
          role: 'CUSTOMER',
          sessionId: 's',
          sessionExpiresAt: new Date(),
        },
        variantId,
        1,
      );
      const before = await database.prisma.reservation.count();
      const fault = jest
        .spyOn(app.get(OrderRepository), 'create')
        .mockRejectedValueOnce(new Error('Injected order failure'));
      await expect(
        orders.create({
          customerId: CUSTOMER_USER_ID,
          idempotencyKey: 'fault',
          destinationCountryCode: 'EG',
          expectedFingerprint: null,
        }),
      ).rejects.toThrow('Injected order failure');
      fault.mockRestore();
      expect(await database.prisma.reservation.count()).toBe(before);
      expect(
        await database.prisma.inventoryItem.findUnique({
          where: { variantId },
          select: { reserved: true },
        }),
      ).toEqual({ reserved: 1 });
    });

    it('returns one attempt for parallel requests with the same customer key', async () => {
      const { orderId } = await pendingOrder();
      const results = await Promise.all(
        Array.from({ length: 6 }, () =>
          payments.createAttempt({
            customerId: CUSTOMER_USER_ID,
            orderId,
            idempotencyKey: 'parallel-key',
          }),
        ),
      );
      expect(new Set(results.map((r) => r.id)).size).toBe(1);
      expect(await database.prisma.paymentAttempt.count()).toBe(1);
    });

    it('serializes cancellation against payment and conserves stock', async () => {
      const { orderId, variantId, totalMinor } = await pendingOrder();
      const attempt = await payments.createAttempt({
        customerId: CUSTOMER_USER_ID,
        orderId,
        idempotencyKey: 'cancel-race',
      });
      await Promise.allSettled([
        orders.cancel({
          orderId,
          customerId: CUSTOMER_USER_ID,
          actor: 'CUSTOMER',
          actorUserId: CUSTOMER_USER_ID,
        }),
        payments.applyProviderEvent({
          providerEventId: 'cancel-race',
          type: 'payment.succeeded',
          orderId,
          providerReference: attempt.providerReference,
          amountMinor: totalMinor,
          currency: 'EGP',
          occurredAt: new Date(),
          detail: {},
        }),
      ]);
      const order = await orders.read(orderId);
      const stock = await database.prisma.inventoryItem.findUniqueOrThrow({ where: { variantId } });
      expect(['CANCELLED', 'PAID']).toContain(order?.status);
      expect(stock.onHand).toBe(order?.status === 'PAID' ? 9 : 10);
      expect(stock.reserved).toBe(0);
    });
  });

  describe('creating a payment attempt', () => {
    it('records the attempt for the order total', async () => {
      const { orderId, totalMinor } = await pendingOrder();

      const attempt = await payments.createAttempt({
        customerId: CUSTOMER_USER_ID,
        orderId,
        idempotencyKey: 'payment-key-one',
      });

      expect(attempt.status).toBe('PENDING');
      expect(attempt.amountMinor).toBe(totalMinor);
      expect(attempt.currency).toBe('EGP');
      expect(attempt.provider).toBe('LOCAL_TEST');
    });

    it('returns the original attempt for a repeated key', async () => {
      const { orderId } = await pendingOrder();

      const first = await payments.createAttempt({
        customerId: CUSTOMER_USER_ID,
        orderId,
        idempotencyKey: 'payment-key-repeat',
      });
      const second = await payments.createAttempt({
        customerId: CUSTOMER_USER_ID,
        orderId,
        idempotencyKey: 'payment-key-repeat',
      });

      expect(second.id).toBe(first.id);
      expect(await database.prisma.paymentAttempt.count()).toBe(1);
    });

    it('refuses an attempt for an order that is not awaiting payment', async () => {
      const { orderId } = await pendingOrder();
      await orders.cancel({
        orderId,
        customerId: CUSTOMER_USER_ID,
        actor: 'CUSTOMER',
        actorUserId: CUSTOMER_USER_ID,
      });

      await expect(
        payments.createAttempt({
          customerId: CUSTOMER_USER_ID,
          orderId,
          idempotencyKey: 'payment-key-cancelled',
        }),
      ).rejects.toMatchObject({ code: 'PAYMENT_NOT_PAYABLE' });
    });

    it('refuses an attempt for another customer order', async () => {
      const { orderId } = await pendingOrder();

      await expect(
        payments.createAttempt({
          customerId: '6f1e0d9c-8b7a-4695-8432-1f0e9d8c7b84',
          orderId,
          idempotencyKey: 'payment-key-foreign',
        }),
      ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
    });
  });

  describe('applying a provider event', () => {
    it('succeeds the payment and allocates the stock', async () => {
      const { orderId, variantId, totalMinor } = await pendingOrder(2, 5);
      const attempt = await payments.createAttempt({
        customerId: CUSTOMER_USER_ID,
        orderId,
        idempotencyKey: 'payment-key-success',
      });

      const applied = await payments.applyProviderEvent({
        providerEventId: 'event-success',
        type: 'payment.succeeded',
        orderId,
        providerReference: attempt.providerReference,
        amountMinor: totalMinor,
        currency: 'EGP',
        occurredAt: new Date(),
        detail: {},
      });

      expect(applied.outcome).toBe('APPLIED');
      const stored = await payments.attemptOf(attempt.id);
      expect(stored?.status).toBe('SUCCEEDED');
      const order = await orders.read(orderId);
      expect(order?.status).toBe('PAID');
      const item = await database.prisma.inventoryItem.findFirst({
        where: { variantId },
        select: { onHand: true, reserved: true },
      });
      expect(item?.onHand).toBe(3);
      expect(item?.reserved).toBe(0);
    });

    it('applies a repeated event only once', async () => {
      const { orderId, totalMinor } = await pendingOrder();
      const attempt = await payments.createAttempt({
        customerId: CUSTOMER_USER_ID,
        orderId,
        idempotencyKey: 'payment-key-duplicate',
      });
      const event = {
        providerEventId: 'event-duplicate',
        type: 'payment.succeeded',
        orderId,
        providerReference: attempt.providerReference,
        amountMinor: totalMinor,
        currency: 'EGP',
        occurredAt: new Date(),
        detail: {},
      };

      const first = await payments.applyProviderEvent(event);
      const second = await payments.applyProviderEvent(event);

      expect(first.outcome).toBe('APPLIED');
      expect(second.outcome).toBe('DUPLICATE');
      const recorded = await payments.events(orderId, 50);
      expect(
        recorded.filter(
          (entry) => entry.outcome === 'APPLIED' && entry.eventType === 'payment.succeeded',
        ),
      ).toHaveLength(1);
    });

    it('produces one payment when the same event races', async () => {
      const { orderId, totalMinor } = await pendingOrder();
      const attempt = await payments.createAttempt({
        customerId: CUSTOMER_USER_ID,
        orderId,
        idempotencyKey: 'payment-key-race',
      });
      const event = {
        providerEventId: 'event-race',
        type: 'payment.succeeded',
        orderId,
        providerReference: attempt.providerReference,
        amountMinor: totalMinor,
        currency: 'EGP',
        occurredAt: new Date(),
        detail: {},
      };

      const results = await Promise.all(
        Array.from({ length: 5 }, () => payments.applyProviderEvent(event)),
      );

      expect(results.filter((result) => result.outcome === 'APPLIED')).toHaveLength(1);
      expect(await database.prisma.providerEvent.count()).toBe(1);
      const stored = await payments.attemptOf(attempt.id);
      expect(stored?.status).toBe('SUCCEEDED');
    });

    it('records an event for an order with no attempt as unknown', async () => {
      const { orderId } = await pendingOrder();

      const applied = await payments.applyProviderEvent({
        providerEventId: 'event-unknown',
        type: 'payment.succeeded',
        orderId,
        providerReference: 'no-such-reference',
        amountMinor: 100,
        currency: 'EGP',
        occurredAt: new Date(),
        detail: {},
      });

      expect(applied.outcome).toBe('UNKNOWN_ORDER');
      const recorded = await payments.events(orderId, 50);
      expect(recorded.some((entry) => entry.outcome === 'UNKNOWN_ORDER')).toBe(true);
    });

    it('fails the payment and releases the held stock', async () => {
      const { orderId, variantId } = await pendingOrder(2, 5);
      const attempt = await payments.createAttempt({
        customerId: CUSTOMER_USER_ID,
        orderId,
        idempotencyKey: 'payment-key-failed',
      });

      const applied = await payments.applyProviderEvent({
        providerEventId: 'event-failed',
        type: 'payment.failed',
        orderId,
        providerReference: attempt.providerReference,
        amountMinor: 0,
        currency: 'EGP',
        occurredAt: new Date(),
        detail: {},
      });

      expect(applied.outcome).toBe('APPLIED');
      const stored = await payments.attemptOf(attempt.id);
      expect(stored?.status).toBe('FAILED');
      const item = await database.prisma.inventoryItem.findFirst({
        where: { variantId },
        select: { reserved: true },
      });
      expect(item?.reserved).toBe(0);
    });
  });

  describe('independent refund recovery regressions', () => {
    it('rolls back refund completion when the order projection fails and recovers through the same provider key', async () => {
      const attempt = await paidAttempt();
      const fault = jest
        .spyOn(orders, 'recordRefund')
        .mockRejectedValueOnce(new Error('Injected refund projection failure'));
      const input = {
        customerId: CUSTOMER_USER_ID,
        paymentAttemptId: attempt.id,
        idempotencyKey: 'refund-projection-fault',
        amountMinor: attempt.amountMinor,
        reason: null,
      };
      try {
        await expect(payments.refund(input)).rejects.toThrow('Injected refund projection failure');
      } finally {
        fault.mockRestore();
      }
      expect((await database.prisma.refund.findFirstOrThrow()).status).toBe('PENDING');
      expect((await orders.read(attempt.orderId))?.refundedMinor).toBe(0);
      expect((await payments.refund(input)).status).toBe('SUCCEEDED');
      expect(await orders.read(attempt.orderId)).toMatchObject({
        status: 'REFUNDED',
        refundedMinor: attempt.amountMinor,
      });
      expect(await database.prisma.refund.count()).toBe(1);
    });
    it('projects partial and full refunds on the order and keeps stock allocation unchanged', async () => {
      const attempt = await paidAttempt();
      const part = Math.floor(attempt.amountMinor / 2);
      const input = { customerId: CUSTOMER_USER_ID, paymentAttemptId: attempt.id, reason: null };
      await payments.refund({ ...input, idempotencyKey: 'order-partial', amountMinor: part });
      expect(await orders.read(attempt.orderId)).toMatchObject({
        status: 'PAID',
        refundedMinor: part,
      });
      await payments.refund({
        ...input,
        idempotencyKey: 'order-full',
        amountMinor: attempt.amountMinor - part,
      });
      expect(await orders.read(attempt.orderId)).toMatchObject({
        status: 'REFUNDED',
        refundedMinor: attempt.amountMinor,
      });
      expect(await database.prisma.refundEvent.count()).toBe(4);
      expect(
        (await orders.eventsOf(attempt.orderId)).filter(
          (event) => event.eventType === 'REFUND_RECORDED',
        ),
      ).toHaveLength(2);
    });
    async function paidAttempt() {
      const { orderId, totalMinor } = await pendingOrder();
      const attempt = await payments.createAttempt({
        customerId: CUSTOMER_USER_ID,
        orderId,
        idempotencyKey: 'refund-source',
      });
      await payments.applyProviderEvent({
        providerEventId: 'refund-source',
        type: 'payment.succeeded',
        orderId,
        providerReference: attempt.providerReference,
        amountMinor: totalMinor,
        currency: 'EGP',
        occurredAt: new Date(),
        detail: {},
      });
      return attempt;
    }
    it('returns a definitively failed refund budget exactly once', async () => {
      const attempt = await paidAttempt();
      const spy = jest
        .spyOn(app.get<PaymentProvider>(PAYMENT_PROVIDER), 'refundPayment')
        .mockResolvedValueOnce({ status: 'FAILED', providerReference: 'failed' });
      try {
        const input = {
          customerId: CUSTOMER_USER_ID,
          paymentAttemptId: attempt.id,
          idempotencyKey: 'failure',
          amountMinor: 1000,
          reason: null,
        };
        expect((await payments.refund(input)).status).toBe('FAILED');
        expect((await payments.refund(input)).status).toBe('FAILED');
        expect((await payments.attemptOf(attempt.id))?.refundedMinor).toBe(0);
      } finally {
        spy.mockRestore();
      }
    });
    it('preserves pending/unknown budgets and resumes the same provider idempotency key', async () => {
      const attempt = await paidAttempt();
      const spy = jest
        .spyOn(app.get<PaymentProvider>(PAYMENT_PROVIDER), 'refundPayment')
        .mockRejectedValueOnce(new Error('Simulated timeout'))
        .mockResolvedValueOnce({ status: 'PENDING', providerReference: 'pending' })
        .mockResolvedValueOnce({ status: 'SUCCEEDED', providerReference: 'completed' });
      try {
        const input = {
          customerId: CUSTOMER_USER_ID,
          paymentAttemptId: attempt.id,
          idempotencyKey: 'unknown',
          amountMinor: 1000,
          reason: null,
        };
        await expect(payments.refund(input)).rejects.toThrow('Simulated timeout');
        expect((await payments.attemptOf(attempt.id))?.refundedMinor).toBe(0);
        expect((await payments.attemptOf(attempt.id))?.pendingRefundMinor).toBe(1000);
        expect((await payments.refund(input)).status).toBe('PENDING');
        expect((await payments.attemptOf(attempt.id))?.refundedMinor).toBe(0);
        expect((await payments.attemptOf(attempt.id))?.pendingRefundMinor).toBe(1000);
        expect((await payments.refund(input)).status).toBe('SUCCEEDED');
        expect((await payments.attemptOf(attempt.id))?.pendingRefundMinor).toBe(0);
        expect(new Set(spy.mock.calls.map(([r]) => r.idempotencyKey)).size).toBe(1);
        expect(await database.prisma.refund.count()).toBe(1);
        expect((await payments.attemptOf(attempt.id))?.refundedMinor).toBe(1000);
      } finally {
        spy.mockRestore();
      }
    });
    it('recognizes a full refund after concurrent partial completions', async () => {
      const attempt = await paidAttempt();
      const first = Math.floor(attempt.amountMinor / 2);
      await Promise.all(
        [first, attempt.amountMinor - first].map((amountMinor, i) =>
          payments.refund({
            customerId: CUSTOMER_USER_ID,
            paymentAttemptId: attempt.id,
            idempotencyKey: 'part-' + i,
            amountMinor,
            reason: null,
          }),
        ),
      );
      expect((await payments.attemptOf(attempt.id))?.status).toBe('REFUNDED');
      expect((await payments.attemptOf(attempt.id))?.refundedMinor).toBe(attempt.amountMinor);
    });
  });

  describe('refunding', () => {
    async function paidOrder() {
      const { orderId, totalMinor } = await pendingOrder(1, 5);
      const attempt = await payments.createAttempt({
        customerId: CUSTOMER_USER_ID,
        orderId,
        idempotencyKey: 'payment-key-refund',
      });
      await payments.applyProviderEvent({
        providerEventId: 'event-refund',
        type: 'payment.succeeded',
        orderId,
        providerReference: attempt.providerReference,
        amountMinor: totalMinor,
        currency: 'EGP',
        occurredAt: new Date(),
        detail: {},
      });
      return { orderId, attemptId: attempt.id, totalMinor };
    }

    it('refunds the full amount', async () => {
      const { attemptId, totalMinor } = await paidOrder();

      const refund = await payments.refund({
        customerId: CUSTOMER_USER_ID,
        paymentAttemptId: attemptId,
        idempotencyKey: 'refund-key-full',
        amountMinor: totalMinor,
        reason: 'Customer request',
      });

      expect(refund.status).toBe('SUCCEEDED');
      expect(refund.amountMinor).toBe(totalMinor);
      const stored = await payments.attemptOf(attemptId);
      expect(stored?.status).toBe('REFUNDED');
      expect(stored?.refundedMinor).toBe(totalMinor);
    });

    it('refunds a part and reports the cumulative total', async () => {
      const { attemptId, totalMinor } = await paidOrder();

      await payments.refund({
        customerId: CUSTOMER_USER_ID,
        paymentAttemptId: attemptId,
        idempotencyKey: 'refund-key-part-one',
        amountMinor: Math.floor(totalMinor / 2),
        reason: 'Partial',
      });
      const stored = await payments.attemptOf(attemptId);

      expect(stored?.status).toBe('SUCCEEDED');
      expect(stored?.refundedMinor).toBe(Math.floor(totalMinor / 2));
    });

    it('refuses a refund that exceeds the amount that was paid', async () => {
      const { attemptId, totalMinor } = await paidOrder();

      await expect(
        payments.refund({
          customerId: CUSTOMER_USER_ID,
          paymentAttemptId: attemptId,
          idempotencyKey: 'refund-key-too-much',
          amountMinor: totalMinor + 1,
          reason: null,
        }),
      ).rejects.toMatchObject({ code: 'REFUND_EXCEEDS_PAYMENT' });
      expect(await database.prisma.refund.count()).toBe(0);
    });

    it('refuses a second refund that would exceed the amount that was paid', async () => {
      const { attemptId, totalMinor } = await paidOrder();
      const half = Math.floor(totalMinor / 2);

      await payments.refund({
        customerId: CUSTOMER_USER_ID,
        paymentAttemptId: attemptId,
        idempotencyKey: 'refund-key-first',
        amountMinor: half,
        reason: null,
      });
      await expect(
        payments.refund({
          customerId: CUSTOMER_USER_ID,
          paymentAttemptId: attemptId,
          idempotencyKey: 'refund-key-second',
          amountMinor: totalMinor,
          reason: null,
        }),
      ).rejects.toMatchObject({ code: 'REFUND_EXCEEDS_PAYMENT' });
    });

    it('refuses a different refund payload when the same idempotency key races', async () => {
      const { attemptId } = await paidOrder();
      const realLock = database.lock.bind(database);
      let initialReads = 0;
      let release!: () => void;
      const bothRead = new Promise<void>((resolve) => {
        release = resolve;
      });
      const spy = jest.spyOn(database, 'lock').mockImplementation(async (key) => {
        if (key === `refund-key:${CUSTOMER_USER_ID}:refund-racing-payload`) {
          initialReads++;
          if (initialReads === 2) release();
          await bothRead;
        }
        await realLock(key);
      });
      let results;
      try {
        results = await Promise.allSettled(
          [1000, 2000].map((amountMinor) =>
            payments.refund({
              customerId: CUSTOMER_USER_ID,
              paymentAttemptId: attemptId,
              idempotencyKey: 'refund-racing-payload',
              amountMinor,
              reason: null,
            }),
          ),
        );
      } finally {
        spy.mockRestore();
      }
      expect(initialReads).toBe(2);
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      const refused = results.find((result) => result.status === 'rejected');
      expect(refused).toMatchObject({ status: 'rejected', reason: { code: 'REFUND_NOT_ALLOWED' } });
      const refunds = await database.prisma.refund.findMany();
      expect(refunds).toHaveLength(1);
      const attempt = await database.prisma.paymentAttempt.findUniqueOrThrow({
        where: { id: attemptId },
      });
      expect(attempt.pendingRefundMinor).toBe(0);
      expect(attempt.refundedMinor).toBe(refunds[0]?.amountMinor);
    });

    it('returns the original refund for a repeated key', async () => {
      const { attemptId, totalMinor } = await paidOrder();

      const first = await payments.refund({
        customerId: CUSTOMER_USER_ID,
        paymentAttemptId: attemptId,
        idempotencyKey: 'refund-key-repeat',
        amountMinor: totalMinor,
        reason: null,
      });
      const second = await payments.refund({
        customerId: CUSTOMER_USER_ID,
        paymentAttemptId: attemptId,
        idempotencyKey: 'refund-key-repeat',
        amountMinor: totalMinor,
        reason: null,
      });

      expect(second.refundId).toBe(first.refundId);
      expect(await database.prisma.refund.count()).toBe(1);
    });

    it('refuses a refund of a payment that never succeeded', async () => {
      const { orderId } = await pendingOrder();
      const attempt = await payments.createAttempt({
        customerId: CUSTOMER_USER_ID,
        orderId,
        idempotencyKey: 'payment-key-pending',
      });

      await expect(
        payments.refund({
          customerId: CUSTOMER_USER_ID,
          paymentAttemptId: attempt.id,
          idempotencyKey: 'refund-key-pending',
          amountMinor: 100,
          reason: null,
        }),
      ).rejects.toMatchObject({ code: 'REFUND_NOT_ALLOWED' });
    });
  });

  describe('the reconciliation', () => {
    it('checks more than 200 attempts and durably records the whole result', async () => {
      const { orderId } = await pendingOrder();
      await database.prisma.paymentAttempt.createMany({
        data: Array.from({ length: 205 }, (_, i) => ({
          orderId,
          customerId: CUSTOMER_USER_ID,
          amountMinor: 100,
          currency: 'EGP',
          provider: 'LOCAL_TEST',
          providerReference: 'reconciliation-reference-' + i,
          idempotencyKey: 'reconciliation-key-' + i,
          status: 'PENDING' as const,
        })),
      });
      const result = await payments.reconcile();
      expect(result.checked).toBe(205);
      expect(result.differences).toHaveLength(205);
      const fact = await database.prisma.providerEvent.findFirstOrThrow({
        where: { eventType: 'reconciliation.completed' },
      });
      expect(fact.detail).toMatchObject({ checked: 205 });
    });
    it('reports successful money without allocation even when the provider payment state agrees', async () => {
      const { orderId, totalMinor } = await pendingOrder();
      const attempt = await payments.createAttempt({
        customerId: CUSTOMER_USER_ID,
        orderId,
        idempotencyKey: 'late-reconcile',
      });
      const order = await orders.read(orderId);
      if (order?.reservationId === null || order === null) throw new Error('Missing reservation');
      await database.prisma.reservation.update({
        where: { id: order.reservationId },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await payments.applyProviderEvent({
        providerEventId: 'late-reconcile',
        type: 'payment.succeeded',
        orderId,
        providerReference: attempt.providerReference,
        amountMinor: totalMinor,
        currency: 'EGP',
        occurredAt: new Date(),
        detail: {},
      });
      expect((await payments.reconcile()).differences).toContainEqual(
        expect.objectContaining({ attemptId: attempt.id, reason: 'STOCK_NOT_ALLOCATED' }),
      );
    });
    it('reports no difference when the platform and the provider agree', async () => {
      const { orderId, totalMinor } = await pendingOrder();
      const attempt = await payments.createAttempt({
        customerId: CUSTOMER_USER_ID,
        orderId,
        idempotencyKey: 'payment-key-reconcile',
      });
      await payments.applyProviderEvent({
        providerEventId: 'event-reconcile',
        type: 'payment.succeeded',
        orderId,
        providerReference: attempt.providerReference,
        amountMinor: totalMinor,
        currency: 'EGP',
        occurredAt: new Date(),
        detail: {},
      });

      const result = await payments.reconcile();

      expect(result.checked).toBe(1);
      expect(result.differences).toEqual([]);
    });

    it('reports a difference when the platform and the provider disagree', async () => {
      const { orderId } = await pendingOrder();
      await payments.createAttempt({
        customerId: CUSTOMER_USER_ID,
        orderId,
        idempotencyKey: 'payment-key-difference',
      });

      const result = await payments.reconcile();

      expect(result.differences.length).toBeGreaterThan(0);
      expect(result.differences[0]?.reason).toBe('STATUS_MISMATCH');
    });
  });
});
