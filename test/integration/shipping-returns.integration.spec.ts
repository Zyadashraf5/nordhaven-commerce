import { resetNotificationDatabase } from '../helpers/notification-database';
import { ShippingRepository } from '../../apps/api/src/modules/shipping/persistence/shipping.repository';
import { InventoryRestockService } from '../../apps/api/src/modules/inventory/application/inventory-restock.service';
import {
  PAYMENT_REFUNDS,
  type PaymentRefunds,
} from '../../apps/api/src/modules/payments/contracts';
import { createApplication } from '../../apps/api/src/bootstrap/create-application';
import { BrandService } from '../../apps/api/src/modules/catalog/application/brand.service';
import { CategoryService } from '../../apps/api/src/modules/catalog/application/category.service';
import { ProductService } from '../../apps/api/src/modules/catalog/application/product.service';
import { CartService } from '../../apps/api/src/modules/cart/application/cart.service';
import { CheckoutService } from '../../apps/api/src/modules/checkout/application/checkout.service';
import { InventoryService } from '../../apps/api/src/modules/inventory/application/inventory.service';
import { OrderService } from '../../apps/api/src/modules/order/application/order.service';
import { PaymentService } from '../../apps/api/src/modules/payments/application/payment.service';
import { ShippingService } from '../../apps/api/src/modules/shipping/application/shipping.service';
import { TaxService } from '../../apps/api/src/modules/tax/application/tax.service';
import { DatabaseService } from '../../apps/api/src/platform/database/database.service';
import { resetCartDatabase } from '../helpers/cart-database';
import { resetCatalogDatabase } from '../helpers/catalog-database';
import { resetCheckoutDatabase } from '../helpers/checkout-database';
import { resetIdentityDatabase } from '../helpers/identity-database';
import { resetInventoryDatabase } from '../helpers/inventory-database';
import { resetOrderDatabase } from '../helpers/order-database';
import { resetPaymentDatabase } from '../helpers/payment-database';
import { resetShippingDatabase } from '../helpers/shipping-database';
import { testConfigurationFor } from '../helpers/test-configuration';

const CUSTOMER_USER_ID = '6f1e0d9c-8b7a-4695-8432-1f0e9d8c7b83';
const OTHER_CUSTOMER_USER_ID = '9b2d1c8e-7a6b-4d5c-8e4f-3a2b1c0d9e8f';

type Application = Awaited<ReturnType<typeof createApplication>>['app'];

describe('Shipping and Returns integration', () => {
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
  let shipping: ShippingService;

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
    shipping = app.get(ShippingService);
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetIdentityDatabase(database);
    await resetNotificationDatabase(database);
    await resetShippingDatabase(database);
    await resetPaymentDatabase(database);
    await resetOrderDatabase(database);
    await resetCheckoutDatabase(database);
    await resetInventoryDatabase(database);
    await resetCartDatabase(database);
    await resetCatalogDatabase(database);
  });

  afterEach(async () => {
    await resetIdentityDatabase(database);
    await resetNotificationDatabase(database);
    await resetShippingDatabase(database);
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

  /** Configures the shipping destination and one method with an administrator's own amount. */
  async function configureShipping(): Promise<void> {
    await shipping.configureDestination({
      countryCode: 'EG',
      enabled: true,
      label: 'Egypt',
      carrierCode: null,
      updatedByUserId: null,
    });
    await shipping.configureMethod({
      code: 'STANDARD',
      label: 'Standard delivery',
      destinationCountryCode: 'EG',
      amountMinor: 5000,
      currency: 'EGP',
      active: true,
      updatedByUserId: null,
    });
  }

  /** A paid order with one line, its destination, its tax rule, and its stock. */
  async function paidOrder(
    quantity = 2,
    onHand = 10,
    unitPriceMinor = 129900,
  ): Promise<{
    orderId: string;
    variantId: string;
    totalMinor: number;
    orderLineId: string;
  }> {
    const { variantId } = await seedPublished('Oak Dining Table', unitPriceMinor);
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
      idempotencyKey: 'order-key-shipping',
      destinationCountryCode: 'EG',
      expectedFingerprint: null,
    });
    const attempt = await payments.createAttempt({
      customerId: CUSTOMER_USER_ID,
      orderId: order.id,
      idempotencyKey: 'attempt-key-shipping',
    });
    await payments.applyProviderEvent({
      providerEventId: 'shipping-payment-succeeded',
      type: 'payment.succeeded',
      orderId: order.id,
      providerReference: attempt.providerReference,
      amountMinor: order.totalMinor,
      currency: 'EGP',
      occurredAt: new Date(),
      detail: {},
    });
    const snapshot = await orders.read(order.id);
    const line = snapshot?.lines[0];
    if (line === undefined) throw new Error('The order has no line');
    return { orderId: order.id, variantId, totalMinor: order.totalMinor, orderLineId: line.id };
  }

  describe('the shipping configuration', () => {
    it('lists only the configured methods of an approved destination', async () => {
      await configureShipping();
      const options = await shipping.optionsFor('EG');
      expect(options).toEqual([
        {
          code: 'STANDARD',
          label: 'Standard delivery',
          amountMinor: 5000,
          currency: 'EGP',
          destinationCountryCode: 'EG',
        },
      ]);
    });

    it('invents no option for a destination that was never approved', async () => {
      await configureShipping();
      expect(await shipping.optionsFor('US')).toEqual([]);
    });

    it('offers no option when the destination was withdrawn', async () => {
      await configureShipping();
      await shipping.configureDestination({
        countryCode: 'EG',
        enabled: false,
        label: 'Egypt',
        carrierCode: null,
        updatedByUserId: null,
      });
      expect(await shipping.optionsFor('EG')).toEqual([]);
    });

    it('never computes a rate and stores no delivery estimate', async () => {
      await configureShipping();
      const method = (await shipping.listMethods())[0];
      expect(method?.amountMinor).toBe(5000);
      const shipment = await shipping.createShipment({
        orderId: (await paidOrder()).orderId,
        methodCode: 'STANDARD',
        actorUserId: null,
      });
      expect(Object.keys(shipment)).not.toContain('estimatedDelivery');
      expect(Object.keys(shipment)).not.toContain('estimatedDeliveryDays');
      expect(Object.keys(shipment)).not.toContain('carrierServiceLevel');
    });
  });

  describe('the shipment lifecycle', () => {
    it('creates a shipment for a paid order and refuses a second one', async () => {
      await configureShipping();
      const { orderId } = await paidOrder();
      const shipment = await shipping.createShipment({
        orderId,
        methodCode: 'STANDARD',
        actorUserId: null,
      });
      expect(shipment.status).toBe('PREPARED');
      expect(shipment.methodCode).toBe('STANDARD');
      expect(shipment.amountMinor).toBe(5000);
      expect(shipment.destinationCountryCode).toBe('EG');
      await expect(
        shipping.createShipment({ orderId, methodCode: 'STANDARD', actorUserId: null }),
      ).rejects.toMatchObject({ code: 'SHIPMENT_ALREADY_EXISTS' });
      expect(await database.prisma.shipment.count()).toBe(1);
    });

    it('refuses a shipment for an order that was never paid', async () => {
      await configureShipping();
      const { variantId } = await seedPublished('Unpaid Table');
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
      await inventory.setOnHand(variantId, 10, null);
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
      const order = await orders.create({
        customerId: CUSTOMER_USER_ID,
        idempotencyKey: 'order-key-unpaid',
        destinationCountryCode: 'EG',
        expectedFingerprint: null,
      });
      await expect(
        shipping.createShipment({ orderId: order.id, methodCode: 'STANDARD', actorUserId: null }),
      ).rejects.toThrow();
      expect(await database.prisma.shipment.count()).toBe(0);
    });

    it('refuses a method that is configured for another destination', async () => {
      await configureShipping();
      await shipping.configureMethod({
        code: 'OTHER',
        label: 'Other delivery',
        destinationCountryCode: 'US',
        amountMinor: 7000,
        currency: 'EGP',
        active: true,
        updatedByUserId: null,
      });
      const { orderId } = await paidOrder();
      await expect(
        shipping.createShipment({ orderId, methodCode: 'OTHER', actorUserId: null }),
      ).rejects.toMatchObject({ code: 'SHIPPING_METHOD_NOT_FOUND' });
    });

    it('walks the shipment through its lifecycle and records every transition', async () => {
      await configureShipping();
      const { orderId } = await paidOrder();
      const created = await shipping.createShipment({
        orderId,
        methodCode: 'STANDARD',
        actorUserId: null,
      });
      const packed = await shipping.transitionShipment({
        shipmentId: created.id,
        to: 'PACKED',
        actorUserId: null,
        reason: null,
      });
      expect(packed.status).toBe('PACKED');
      const handed = await shipping.transitionShipment({
        shipmentId: created.id,
        to: 'HANDED_OVER',
        actorUserId: null,
        reason: null,
      });
      expect(handed.status).toBe('HANDED_OVER');
      expect(handed.dispatchedAt).not.toBeNull();
      const delivered = await shipping.transitionShipment({
        shipmentId: created.id,
        to: 'DELIVERED',
        actorUserId: null,
        reason: null,
      });
      expect(delivered.status).toBe('DELIVERED');
      expect(delivered.deliveredAt).not.toBeNull();
      const events = await shipping.shipmentEvents(created.id);
      expect(events.map((event) => event.eventType)).toEqual([
        'SHIPMENT_CREATED',
        'SHIPMENT_PACKED',
        'SHIPMENT_HANDED_OVER',
        'SHIPMENT_DELIVERED',
      ]);
    });

    it('refuses an impermissible transition, leaves the shipment unchanged, and records the refusal', async () => {
      await configureShipping();
      const { orderId } = await paidOrder();
      const created = await shipping.createShipment({
        orderId,
        methodCode: 'STANDARD',
        actorUserId: null,
      });
      await expect(
        shipping.transitionShipment({
          shipmentId: created.id,
          to: 'DELIVERED',
          actorUserId: null,
          reason: null,
        }),
      ).rejects.toMatchObject({ code: 'SHIPMENT_NOT_TRANSITIONABLE' });
      expect((await shipping.shipmentOf(created.id))?.status).toBe('PREPARED');
      const events = await shipping.shipmentEvents(created.id);
      expect(events.at(-1)?.eventType).toBe('SHIPMENT_TRANSITION_REFUSED');
      expect(events.at(-1)?.reason).toBe('TRANSITION_NOT_PERMITTED');
    });

    it('stores the administrator tracking reference and refuses an empty one', async () => {
      await configureShipping();
      const { orderId } = await paidOrder();
      const created = await shipping.createShipment({
        orderId,
        methodCode: 'STANDARD',
        actorUserId: null,
      });
      const tracked = await shipping.setTracking({
        shipmentId: created.id,
        trackingReference: 'TRACK-42',
        actorUserId: null,
      });
      expect(tracked.trackingReference).toBe('TRACK-42');
      await expect(
        shipping.setTracking({
          shipmentId: created.id,
          trackingReference: '   ',
          actorUserId: null,
        }),
      ).rejects.toThrow();
    });
  });

  describe('the returns', () => {
    it('records a request against the customer own paid order and refunds nothing yet', async () => {
      await configureShipping();
      const { orderId, orderLineId, totalMinor } = await paidOrder();
      const requested = await shipping.requestReturn({
        orderId,
        customerId: CUSTOMER_USER_ID,
        reasonCode: 'DAMAGED',
        lines: [{ orderLineId, quantity: 1 }],
      });
      expect(requested.status).toBe('REQUESTED');
      expect(requested.totalMinor).toBe(Math.floor(totalMinor / 2));
      expect(requested.refundId).toBeNull();
      expect(await database.prisma.refund.count()).toBe(0);
    });

    it('refuses a request for more units than the order holds', async () => {
      await configureShipping();
      const { orderId, orderLineId } = await paidOrder(2);
      await expect(
        shipping.requestReturn({
          orderId,
          customerId: CUSTOMER_USER_ID,
          reasonCode: 'DAMAGED',
          lines: [{ orderLineId, quantity: 3 }],
        }),
      ).rejects.toThrow();
      expect(await database.prisma.returnRequest.count()).toBe(0);
    });

    it('refuses a request against another customer order as an unknown order', async () => {
      await configureShipping();
      const { orderId, orderLineId } = await paidOrder();
      await expect(
        shipping.requestReturn({
          orderId,
          customerId: OTHER_CUSTOMER_USER_ID,
          reasonCode: 'DAMAGED',
          lines: [{ orderLineId, quantity: 1 }],
        }),
      ).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
      expect(await database.prisma.returnRequest.count()).toBe(0);
    });

    it('restocks the returned goods and returns the money when the goods arrive', async () => {
      await configureShipping();
      const { orderId, orderLineId, variantId } = await paidOrder(2);
      const requested = await shipping.requestReturn({
        orderId,
        customerId: CUSTOMER_USER_ID,
        reasonCode: 'DAMAGED',
        lines: [{ orderLineId, quantity: 1 }],
      });
      const approved = await shipping.decideReturn({
        returnId: requested.id,
        decision: 'APPROVED',
        actorUserId: null,
        reason: null,
      });
      expect(approved.status).toBe('APPROVED');
      const lineId = approved.lines[0]?.id;
      expect(lineId).toBeDefined();

      const received = await shipping.receiveReturn({
        returnId: requested.id,
        actorUserId: null,
        restockLineIds: lineId === undefined ? [] : [lineId],
        refund: true,
      });
      expect(received.status).toBe('REFUNDED');
      expect(received.refundStatus).toBe('COMPLETED');
      expect(received.refundId).not.toBeNull();
      expect(received.lines[0]?.restocked).toBe(true);

      const stock = await database.prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId },
        select: { onHand: true, reserved: true },
      });
      expect(stock.onHand).toBe(9);
      expect(stock.reserved).toBe(0);
      const refunds = await database.prisma.refund.findMany();
      expect(refunds).toHaveLength(1);
      expect(refunds[0]?.amountMinor).toBe(requested.totalMinor);
    });

    it('restocks nothing and refunds nothing when the return is rejected', async () => {
      await configureShipping();
      const { orderId, orderLineId, variantId } = await paidOrder(2);
      const requested = await shipping.requestReturn({
        orderId,
        customerId: CUSTOMER_USER_ID,
        reasonCode: 'DAMAGED',
        lines: [{ orderLineId, quantity: 1 }],
      });
      const rejected = await shipping.decideReturn({
        returnId: requested.id,
        decision: 'REJECTED',
        actorUserId: null,
        reason: 'OUTSIDE_THE_WINDOW',
      });
      expect(rejected.status).toBe('REJECTED');
      await expect(
        shipping.receiveReturn({
          returnId: requested.id,
          actorUserId: null,
          restockLineIds: [],
          refund: true,
        }),
      ).rejects.toMatchObject({ code: 'RETURN_NOT_TRANSITIONABLE' });
      const stock = await database.prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId },
        select: { onHand: true },
      });
      expect(stock.onHand).toBe(8);
      expect(await database.prisma.refund.count()).toBe(0);
    });

    it('restocks once and refunds once when the receipt is repeated', async () => {
      await configureShipping();
      const { orderId, orderLineId, variantId } = await paidOrder(2);
      const requested = await shipping.requestReturn({
        orderId,
        customerId: CUSTOMER_USER_ID,
        reasonCode: 'DAMAGED',
        lines: [{ orderLineId, quantity: 1 }],
      });
      await shipping.decideReturn({
        returnId: requested.id,
        decision: 'APPROVED',
        actorUserId: null,
        reason: null,
      });
      const lineId = requested.lines[0]?.id;
      const first = await shipping.receiveReturn({
        returnId: requested.id,
        actorUserId: null,
        restockLineIds: lineId === undefined ? [] : [lineId],
        refund: true,
      });
      expect(first.status).toBe('REFUNDED');
      const second = await shipping.receiveReturn({
        returnId: requested.id,
        actorUserId: null,
        restockLineIds: lineId === undefined ? [] : [lineId],
        refund: true,
      });
      expect(second.status).toBe('REFUNDED');
      const stock = await database.prisma.inventoryItem.findUniqueOrThrow({
        where: { variantId },
        select: { onHand: true },
      });
      expect(stock.onHand).toBe(9);
      expect(await database.prisma.refund.count()).toBe(1);
    });

    it('records every transition of a return', async () => {
      await configureShipping();
      const { orderId, orderLineId } = await paidOrder(2);
      const requested = await shipping.requestReturn({
        orderId,
        customerId: CUSTOMER_USER_ID,
        reasonCode: 'DAMAGED',
        lines: [{ orderLineId, quantity: 1 }],
      });
      await shipping.decideReturn({
        returnId: requested.id,
        decision: 'APPROVED',
        actorUserId: null,
        reason: null,
      });
      const events = await shipping.returnEvents(requested.id);
      expect(events.map((event) => event.eventType)).toEqual([
        'RETURN_REQUESTED',
        'RETURN_APPROVED',
      ]);
    });

    it('cancels a return that has not been received and refuses one that has', async () => {
      await configureShipping();
      const { orderId, orderLineId } = await paidOrder(2);
      const requested = await shipping.requestReturn({
        orderId,
        customerId: CUSTOMER_USER_ID,
        reasonCode: 'DAMAGED',
        lines: [{ orderLineId, quantity: 1 }],
      });
      const cancelled = await shipping.cancelReturn({
        returnId: requested.id,
        customerId: CUSTOMER_USER_ID,
        actor: 'CUSTOMER',
        actorUserId: CUSTOMER_USER_ID,
        reason: null,
      });
      expect(cancelled.status).toBe('CANCELLED');
      await expect(
        shipping.decideReturn({
          returnId: requested.id,
          decision: 'APPROVED',
          actorUserId: null,
          reason: null,
        }),
      ).rejects.toMatchObject({ code: 'RETURN_NOT_TRANSITIONABLE' });
    });
  });
  describe('independent return consistency regressions', () => {
    it('admits only purchased cumulative units when separate returns race', async () => {
      const { orderId, orderLineId } = await paidOrder(1);
      const input = {
        orderId,
        customerId: CUSTOMER_USER_ID,
        reasonCode: 'TEST',
        lines: [{ orderLineId, quantity: 1 }],
      };
      const results = await Promise.allSettled([
        shipping.requestReturn(input),
        shipping.requestReturn(input),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        await database.prisma.returnLine.aggregate({ _sum: { quantity: true } }),
      ).toMatchObject({ _sum: { quantity: 1 } });
    });

    it('releases a cancelled quantity claim without losing cumulative minor units', async () => {
      const { orderId, orderLineId, totalMinor } = await paidOrder(3, 10, 3);
      expect(totalMinor).toBe(10);
      const input = {
        orderId,
        customerId: CUSTOMER_USER_ID,
        reasonCode: 'TEST',
        lines: [{ orderLineId, quantity: 1 }],
      };
      const first = await shipping.requestReturn(input);
      const second = await shipping.requestReturn(input);
      const third = await shipping.requestReturn(input);
      expect(first.totalMinor + second.totalMinor + third.totalMinor).toBe(totalMinor);
      await shipping.cancelReturn({
        returnId: second.id,
        customerId: CUSTOMER_USER_ID,
        actor: 'CUSTOMER',
        actorUserId: CUSTOMER_USER_ID,
        reason: null,
      });
      const replacement = await shipping.requestReturn(input);
      expect(first.totalMinor + replacement.totalMinor + third.totalMinor).toBe(totalMinor);
      await expect(shipping.requestReturn(input)).rejects.toThrow();
    });

    it.each(['PENDING', 'FAILED'] as const)(
      'does not claim successful money for a %s refund outcome',
      async (status) => {
        const { orderId, orderLineId } = await paidOrder();
        const requested = await shipping.requestReturn({
          orderId,
          customerId: CUSTOMER_USER_ID,
          reasonCode: 'TEST',
          lines: [{ orderLineId, quantity: 1 }],
        });
        await shipping.decideReturn({
          returnId: requested.id,
          decision: 'APPROVED',
          actorUserId: null,
          reason: null,
        });
        const contract = app.get<PaymentRefunds>(PAYMENT_REFUNDS);
        const spy = jest.spyOn(contract, 'refundOrder').mockResolvedValue({
          refundId: '753c0a57-ce63-4d8f-a0dd-7d85061a3410',
          status,
          amountMinor: requested.totalMinor,
          currency: 'EGP',
        });
        try {
          const current = await shipping.receiveReturn({
            returnId: requested.id,
            actorUserId: null,
            restockLineIds: [],
            refund: true,
          });
          expect(current.status).toBe('RECEIVED');
          expect(current.refundStatus).toBe(status);
          expect(
            (await shipping.returnEvents(requested.id)).some(
              (e) => e.eventType === 'RETURN_REFUNDED',
            ),
          ).toBe(false);
        } finally {
          spy.mockRestore();
        }
      },
    );

    it('rejects unknown restock line identifiers before receiving any goods', async () => {
      const { orderId, orderLineId } = await paidOrder();
      const requested = await shipping.requestReturn({
        orderId,
        customerId: CUSTOMER_USER_ID,
        reasonCode: 'TEST',
        lines: [{ orderLineId, quantity: 1 }],
      });
      await shipping.decideReturn({
        returnId: requested.id,
        decision: 'APPROVED',
        actorUserId: null,
        reason: null,
      });
      await expect(
        shipping.receiveReturn({
          returnId: requested.id,
          actorUserId: null,
          restockLineIds: ['753c0a57-ce63-4d8f-a0dd-7d85061a3410'],
          refund: false,
        }),
      ).rejects.toThrow();
      expect((await shipping.returnOf(requested.id))?.status).toBe('APPROVED');
    });

    it('restores the snapshotted components of a dynamic bundle instead of creating finished goods', async () => {
      // Persist a historical bundle snapshot over an order that consumed exactly two component units.
      const { orderId, orderLineId, variantId } = await paidOrder(2);
      const original = await orders.read(orderId);
      const productId = original?.lines[0]?.productId;
      if (!productId) throw Error('Missing fixture product');
      const bundle = await database.prisma.bundle.create({
        data: {
          productId,
          kind: 'DYNAMIC',
          name: 'Test dynamic pair',
          components: { create: { variantId, minQuantity: 2, maxQuantity: 2 } },
        },
      });
      await database.prisma.orderLine.update({
        where: { id: orderLineId },
        data: {
          variantId: null,
          bundleId: bundle.id,
          quantity: 1,
          unitPriceMinor: 259800,
          composition: {
            bundleId: bundle.id,
            kind: 'DYNAMIC',
            lines: [{ variantId, sku: 'test-component', quantity: 2 }],
          },
        },
      });
      const requested = await shipping.requestReturn({
        orderId,
        customerId: CUSTOMER_USER_ID,
        reasonCode: 'TEST',
        lines: [{ orderLineId, quantity: 1 }],
      });
      await shipping.decideReturn({
        returnId: requested.id,
        decision: 'APPROVED',
        actorUserId: null,
        reason: null,
      });
      const line = requested.lines[0];
      if (!line) throw Error('Missing return line');
      await shipping.receiveReturn({
        returnId: requested.id,
        actorUserId: null,
        restockLineIds: [line.id],
        refund: false,
      });
      await shipping.receiveReturn({
        returnId: requested.id,
        actorUserId: null,
        restockLineIds: [line.id],
        refund: false,
      });
      expect(
        (await database.prisma.inventoryItem.findUniqueOrThrow({ where: { variantId } })).onHand,
      ).toBe(10);
      expect(
        await database.prisma.inventoryItem.findUnique({ where: { bundleId: bundle.id } }),
      ).toBeNull();
      expect(await database.prisma.stockMovement.count({ where: { reason: 'RESTOCK' } })).toBe(1);
    });
  });

  it('retains every attributed shipping configuration replacement', async () => {
    await configureShipping();
    await shipping.configureMethod({
      code: 'STANDARD',
      label: 'replacement test value',
      destinationCountryCode: 'EG',
      amountMinor: 6000,
      currency: 'EGP',
      active: true,
      updatedByUserId: CUSTOMER_USER_ID,
    });
    const events = await database.prisma.shippingConfigurationEvent.findMany();
    expect(events).toHaveLength(3);
    const changed = events.find((e) => e.actorUserId === CUSTOMER_USER_ID);
    expect(changed).toMatchObject({
      target: 'method:TEST:STANDARD',
      before: { amountMinor: 5000 },
      after: { amountMinor: 6000 },
    });
  });

  it('refuses production shipping activation and offers no production test rates', async () => {
    const created = await createApplication({
      configuration: { ...testConfigurationFor('integration'), nodeEnv: 'production' },
    });
    try {
      const service = created.app.get(ShippingService);
      await expect(
        service.configureDestination({
          countryCode: 'EG',
          enabled: true,
          label: 'test',
          carrierCode: null,
          updatedByUserId: null,
        }),
      ).rejects.toMatchObject({ status: 503 });
      await expect(
        service.configureMethod({
          code: 'TEST',
          label: 'test',
          destinationCountryCode: 'EG',
          amountMinor: 1,
          currency: 'EGP',
          active: true,
          updatedByUserId: null,
        }),
      ).rejects.toMatchObject({ status: 503 });
      expect(await service.optionsFor('EG')).toEqual([]);
      expect(await database.prisma.shippingDestination.count()).toBe(0);
    } finally {
      await created.app.close();
    }
  });

  it('rolls receipt, inventory movement and restock flag back together on persistence failure', async () => {
    const { orderId, orderLineId, variantId } = await paidOrder(1);
    const requested = await shipping.requestReturn({
      orderId,
      customerId: CUSTOMER_USER_ID,
      reasonCode: 'TEST',
      lines: [{ orderLineId, quantity: 1 }],
    });
    await shipping.decideReturn({
      returnId: requested.id,
      decision: 'APPROVED',
      actorUserId: null,
      reason: null,
    });
    const spy = jest
      .spyOn(app.get(ShippingRepository), 'markReturnLineRestocked')
      .mockRejectedValueOnce(new Error('controlled persistence interruption'));
    try {
      await expect(
        shipping.receiveReturn({
          returnId: requested.id,
          actorUserId: null,
          restockLineIds: requested.lines.map((l) => l.id),
          refund: false,
        }),
      ).rejects.toThrow('controlled persistence interruption');
    } finally {
      spy.mockRestore();
    }
    expect((await shipping.returnOf(requested.id))?.status).toBe('APPROVED');
    expect(
      (await database.prisma.inventoryItem.findUniqueOrThrow({ where: { variantId } })).onHand,
    ).toBe(9);
    expect(await database.prisma.stockMovement.count({ where: { reason: 'RESTOCK' } })).toBe(0);
    expect((await shipping.returnOf(requested.id))?.lines[0]?.restocked).toBe(false);
  });

  it('concurrent receipt repeats one physical restock and one financial refund', async () => {
    const { orderId, orderLineId, variantId } = await paidOrder(1);
    const requested = await shipping.requestReturn({
      orderId,
      customerId: CUSTOMER_USER_ID,
      reasonCode: 'TEST',
      lines: [{ orderLineId, quantity: 1 }],
    });
    await shipping.decideReturn({
      returnId: requested.id,
      decision: 'APPROVED',
      actorUserId: null,
      reason: null,
    });
    const input = {
      returnId: requested.id,
      actorUserId: null,
      restockLineIds: requested.lines.map((l) => l.id),
      refund: true,
    };
    const results = await Promise.all([
      shipping.receiveReturn(input),
      shipping.receiveReturn(input),
    ]);
    expect(results.every((r) => r.status === 'REFUNDED')).toBe(true);
    expect(
      (await database.prisma.inventoryItem.findUniqueOrThrow({ where: { variantId } })).onHand,
    ).toBe(10);
    expect(await database.prisma.stockMovement.count({ where: { reason: 'RESTOCK' } })).toBe(1);
    expect(await database.prisma.refund.count({ where: { status: 'SUCCEEDED' } })).toBe(1);
  });

  it('rejects a different restock payload reusing a physical movement key', async () => {
    const { variantId } = await seedPublished('restock reference');
    const service = app.get(InventoryRestockService);
    const line = {
      target: { kind: 'VARIANT' as const, variantId },
      quantity: 1,
      reference: 'test-restock-key',
    };
    await service.restock({ lines: [line], reason: 'test' });
    await expect(
      service.restock({ lines: [{ ...line, quantity: 2 }], reason: 'test' }),
    ).rejects.toMatchObject({ code: 'INVENTORY_CONFLICT' });
    expect(
      (await database.prisma.inventoryItem.findUniqueOrThrow({ where: { variantId } })).onHand,
    ).toBe(1);
  });
  it('retains the administrative refusal fact when shipment transitions race', async () => {
    await configureShipping();
    const { orderId } = await paidOrder(1);
    const shipment = await shipping.createShipment({
      orderId,
      methodCode: 'STANDARD',
      actorUserId: null,
    });
    const repository = app.get(ShippingRepository),
      read = repository.findShipmentById.bind(repository);
    let reads = 0;
    let release!: () => void;
    const bothRead = new Promise<void>((resolve) => {
      release = resolve;
    });
    const spy = jest.spyOn(repository, 'findShipmentById').mockImplementation(async (id) => {
      const row = await read(id);
      if (reads < 2) {
        reads++;
        if (reads === 2) release();
        await bothRead;
      }
      return row;
    });
    try {
      const result = await Promise.allSettled(
        [0, 1].map(() =>
          shipping.transitionShipment({
            shipmentId: shipment.id,
            to: 'PACKED',
            actorUserId: CUSTOMER_USER_ID,
            reason: null,
          }),
        ),
      );
      expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    } finally {
      spy.mockRestore();
    }
    expect(
      (await shipping.shipmentEvents(shipment.id)).filter(
        (e) => e.eventType === 'SHIPMENT_TRANSITION_REFUSED',
      ),
    ).toHaveLength(1);
  });
});
