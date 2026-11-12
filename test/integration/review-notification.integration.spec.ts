import { randomUUID } from 'node:crypto';
import {
  NOTIFICATION_PROVIDER,
  type NotificationProvider,
} from '../../apps/api/src/modules/notification/contracts';
import { NotificationRepository } from '../../apps/api/src/modules/notification/persistence/notification.repository';
import { createApplication } from '../../apps/api/src/bootstrap/create-application';
import { BrandService } from '../../apps/api/src/modules/catalog/application/brand.service';
import { CategoryService } from '../../apps/api/src/modules/catalog/application/category.service';
import { ProductService } from '../../apps/api/src/modules/catalog/application/product.service';
import { CartService } from '../../apps/api/src/modules/cart/application/cart.service';
import { CheckoutService } from '../../apps/api/src/modules/checkout/application/checkout.service';
import { InventoryService } from '../../apps/api/src/modules/inventory/application/inventory.service';
import { NotificationService } from '../../apps/api/src/modules/notification/application/notification.service';
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
const OTHER_CUSTOMER_USER_ID = '9b2d1c8e-7a6b-4d5c-8e4f-3a2b1c0d9e8f';

type Application = Awaited<ReturnType<typeof createApplication>>['app'];

describe('Reviews and Notifications integration', () => {
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
  let reviews: ReviewService;
  let notifications: NotificationService;

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
    reviews = app.get(ReviewService);
    notifications = app.get(NotificationService);
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

  /** A paid order of the customer that contains the product. */
  async function paidOrder(
    productId: string,
    variantId: string,
    quantity = 1,
  ): Promise<{ orderId: string }> {
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
      { userId: CUSTOMER_USER_ID, role: 'CUSTOMER', sessionId: 's', sessionExpiresAt: new Date() },
      variantId,
      quantity,
    );
    const order = await orders.create({
      customerId: CUSTOMER_USER_ID,
      idempotencyKey: `order-key-review-${productId}`,
      destinationCountryCode: 'EG',
      expectedFingerprint: null,
    });
    const attempt = await payments.createAttempt({
      customerId: CUSTOMER_USER_ID,
      orderId: order.id,
      idempotencyKey: `attempt-key-review-${productId}`,
    });
    await payments.applyProviderEvent({
      providerEventId: `review-payment-${productId}`,
      type: 'payment.succeeded',
      orderId: order.id,
      providerReference: attempt.providerReference,
      amountMinor: order.totalMinor,
      currency: 'EGP',
      occurredAt: new Date(),
      detail: {},
    });
    return { orderId: order.id };
  }

  describe('the review eligibility', () => {
    it('refuses a review of a product the customer never bought', async () => {
      const { productId } = await seedPublished('Unbought Table');
      await expect(
        reviews.create({
          productId,
          customerId: CUSTOMER_USER_ID,
          rating: 5,
          title: 'Wonderful',
          body: 'It is a wonderful table.',
        }),
      ).rejects.toMatchObject({ code: 'REVIEW_NOT_ELIGIBLE' });
      expect(await database.prisma.review.count()).toBe(0);
    });

    it('refuses a review of an order that was never paid', async () => {
      const { productId, variantId } = await seedPublished('Unpaid Table');
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
      await orders.create({
        customerId: CUSTOMER_USER_ID,
        idempotencyKey: 'order-key-unpaid-review',
        destinationCountryCode: 'EG',
        expectedFingerprint: null,
      });
      await expect(
        reviews.create({
          productId,
          customerId: CUSTOMER_USER_ID,
          rating: 5,
          title: 'Wonderful',
          body: 'It is a wonderful table.',
        }),
      ).rejects.toMatchObject({ code: 'REVIEW_NOT_ELIGIBLE' });
    });

    it('records a review of a product the customer bought and holds it for moderation', async () => {
      const { productId, variantId } = await seedPublished('Oak Dining Table');
      const { orderId } = await paidOrder(productId, variantId);
      const created = await reviews.create({
        productId,
        customerId: CUSTOMER_USER_ID,
        rating: 5,
        title: 'Wonderful',
        body: 'It is a wonderful table.',
      });
      expect(created.status).toBe('PENDING');
      expect(created.verifiedPurchase).toBe(true);
      expect(created.orderId).toBe(orderId);
      expect(await reviews.approvedReviewsOf(productId, 50)).toHaveLength(0);
    });

    it('refuses a second review of the same product by the same customer', async () => {
      const { productId, variantId } = await seedPublished('Oak Dining Table');
      await paidOrder(productId, variantId);
      await reviews.create({
        productId,
        customerId: CUSTOMER_USER_ID,
        rating: 5,
        title: 'Wonderful',
        body: 'It is a wonderful table.',
      });
      await expect(
        reviews.create({
          productId,
          customerId: CUSTOMER_USER_ID,
          rating: 1,
          title: 'Changed my mind',
          body: 'It is not a wonderful table after all.',
        }),
      ).rejects.toMatchObject({ code: 'REVIEW_ALREADY_EXISTS' });
      expect(await database.prisma.review.count()).toBe(1);
    });

    it('refuses a rating outside the one to five range', async () => {
      const { productId, variantId } = await seedPublished('Oak Dining Table');
      await paidOrder(productId, variantId);
      await expect(
        reviews.create({
          productId,
          customerId: CUSTOMER_USER_ID,
          rating: 9,
          title: 'Wonderful',
          body: 'It is a wonderful table.',
        }),
      ).rejects.toThrow();
      expect(await database.prisma.review.count()).toBe(0);
    });
  });

  describe('the moderation', () => {
    it('publishes an approved review and notifies the author', async () => {
      const { productId, variantId } = await seedPublished('Oak Dining Table');
      await paidOrder(productId, variantId);
      const created = await reviews.create({
        productId,
        customerId: CUSTOMER_USER_ID,
        rating: 5,
        title: 'Wonderful',
        body: 'It is a wonderful table.',
      });
      const approved = await reviews.moderate({
        reviewId: created.id,
        decision: 'APPROVED',
        actorUserId: null,
        reason: null,
      });
      expect(approved.status).toBe('APPROVED');
      expect(approved.moderatedAt).not.toBeNull();
      expect(await reviews.approvedReviewsOf(productId, 50)).toHaveLength(1);
      const messages = await notifications.listForRecipient(CUSTOMER_USER_ID, 50);
      expect(messages).toHaveLength(1);
      expect(messages[0]?.kind).toBe('REVIEW_APPROVED');
    });

    it('refuses a second decision and records the refusal', async () => {
      const { productId, variantId } = await seedPublished('Oak Dining Table');
      await paidOrder(productId, variantId);
      const created = await reviews.create({
        productId,
        customerId: CUSTOMER_USER_ID,
        rating: 5,
        title: 'Wonderful',
        body: 'It is a wonderful table.',
      });
      await reviews.moderate({
        reviewId: created.id,
        decision: 'APPROVED',
        actorUserId: null,
        reason: null,
      });
      await expect(
        reviews.moderate({
          reviewId: created.id,
          decision: 'REJECTED',
          actorUserId: null,
          reason: 'LATE_DECISION',
        }),
      ).rejects.toMatchObject({ code: 'REVIEW_NOT_MODERATABLE' });
      const events = await reviews.eventsOf(created.id);
      expect(events.at(-1)?.eventType).toBe('REVIEW_DECISION_REFUSED');
      expect((await reviews.reviewOf(created.id))?.status).toBe('APPROVED');
    });

    it('keeps a rejected review unpublished and notifies the author', async () => {
      const { productId, variantId } = await seedPublished('Oak Dining Table');
      await paidOrder(productId, variantId);
      const created = await reviews.create({
        productId,
        customerId: CUSTOMER_USER_ID,
        rating: 1,
        title: 'Spam',
        body: 'Visit my shop for a discount.',
      });
      const rejected = await reviews.moderate({
        reviewId: created.id,
        decision: 'REJECTED',
        actorUserId: null,
        reason: 'SPAM',
      });
      expect(rejected.status).toBe('REJECTED');
      expect(rejected.moderationReason).toBe('SPAM');
      expect(await reviews.approvedReviewsOf(productId, 50)).toHaveLength(0);
      const messages = await notifications.listForRecipient(CUSTOMER_USER_ID, 50);
      expect(messages[0]?.kind).toBe('REVIEW_REJECTED');
    });
  });

  describe('the ownership', () => {
    it('lets the author edit a held review and refuses the edit after it is published', async () => {
      const { productId, variantId } = await seedPublished('Oak Dining Table');
      await paidOrder(productId, variantId);
      const created = await reviews.create({
        productId,
        customerId: CUSTOMER_USER_ID,
        rating: 3,
        title: 'It is fine',
        body: 'It is an ordinary table.',
      });
      const edited = await reviews.edit({
        reviewId: created.id,
        customerId: CUSTOMER_USER_ID,
        rating: 4,
        title: 'It is good',
        body: 'It is a very good table.',
      });
      expect(edited.rating).toBe(4);
      expect(edited.title).toBe('It is good');
      await reviews.moderate({
        reviewId: created.id,
        decision: 'APPROVED',
        actorUserId: null,
        reason: null,
      });
      await expect(
        reviews.edit({
          reviewId: created.id,
          customerId: CUSTOMER_USER_ID,
          rating: 1,
          title: 'Changed my mind',
          body: 'It is not a very good table.',
        }),
      ).rejects.toMatchObject({ code: 'REVIEW_NOT_EDITABLE' });
    });

    it('refuses the edit of another customer review as an unknown review', async () => {
      const { productId, variantId } = await seedPublished('Oak Dining Table');
      await paidOrder(productId, variantId);
      const created = await reviews.create({
        productId,
        customerId: CUSTOMER_USER_ID,
        rating: 5,
        title: 'Wonderful',
        body: 'It is a wonderful table.',
      });
      await expect(
        reviews.edit({
          reviewId: created.id,
          customerId: OTHER_CUSTOMER_USER_ID,
          rating: 1,
          title: 'Changed my mind',
          body: 'It is not a wonderful table.',
        }),
      ).rejects.toMatchObject({ code: 'REVIEW_NOT_FOUND' });
    });
  });

  describe('the notification delivery', () => {
    it('delivers a message exactly once for a repeated business key', async () => {
      const first = await notifications.notify({
        kind: 'REVIEW_APPROVED',
        recipientUserId: CUSTOMER_USER_ID,
        subject: 'Your review has been published',
        body: 'Your review of the product is now public.',
        idempotencyKey: 'review:repeat:approved',
      });
      const second = await notifications.notify({
        kind: 'REVIEW_APPROVED',
        recipientUserId: CUSTOMER_USER_ID,
        subject: 'Your review has been published',
        body: 'Your review of the product is now public.',
        idempotencyKey: 'review:repeat:approved',
      });
      expect(second.notificationId).toBe(first.notificationId);
      expect(await database.prisma.notification.count()).toBe(1);
      expect(await database.prisma.notificationDelivery.count()).toBe(1);
    });

    it('records the message even when the channel sends nothing', async () => {
      const outcome = await notifications.notify({
        kind: 'REVIEW_REJECTED',
        recipientUserId: CUSTOMER_USER_ID,
        subject: 'Your review was not published',
        body: 'Your review of the product was not published.',
        idempotencyKey: 'review:skipped:rejected',
      });
      expect(outcome.notificationId).not.toBeNull();
      const recorded = await notifications.findById(outcome.notificationId);
      expect(recorded?.kind).toBe('REVIEW_REJECTED');
      expect(recorded?.provider).not.toBeNull();
    });
  });
  describe('independent review and notification regressions', () => {
    const message = () => ({
      kind: 'REVIEW_APPROVED' as const,
      recipientUserId: CUSTOMER_USER_ID,
      subject: 'Local test notice',
      body: 'Local test workflow only.',
      idempotencyKey: 'local-notification-regression',
    });

    it('returns a stable domain conflict when duplicate reviews race', async () => {
      const { productId, variantId } = await seedPublished('Regression test product');
      await paidOrder(productId, variantId);
      const input = {
        productId,
        customerId: CUSTOMER_USER_ID,
        rating: 5,
        title: 'test',
        body: 'test body',
      };
      const results = await Promise.allSettled([reviews.create(input), reviews.create(input)]);
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.find((r) => r.status === 'rejected')).toMatchObject({
        reason: { code: 'REVIEW_ALREADY_EXISTS' },
      });
      expect(await database.prisma.review.count()).toBe(1);
    });

    it('uses the full verified purchase history rather than only the latest100 orders', async () => {
      const { productId, variantId } = await seedPublished('Regression test product');
      await paidOrder(productId, variantId);
      const original = await database.prisma.order.findFirstOrThrow();
      await database.prisma.order.createMany({
        data: Array.from({ length: 101 }, (_, i) => ({
          ...original,
          id: randomUUID(),
          idempotencyKey: 'newer-cancelled-' + i,
          status: 'CANCELLED' as const,
          paidAt: null,
          reservationId: null,
          createdAt: new Date(original.createdAt.getTime() + i + 1),
        })),
      });
      const created = await reviews.create({
        productId,
        customerId: CUSTOMER_USER_ID,
        rating: 5,
        title: 'test',
        body: 'test body',
      });
      expect(created.verifiedPurchase).toBe(true);
      expect(created.orderId).toBe(original.id);
    });

    it('concurrent identical notification keys persist and deliver one message', async () => {
      const results = await Promise.allSettled(
        Array.from({ length: 8 }, () => notifications.notify(message())),
      );
      expect(results.filter((r) => r.status === 'rejected')).toHaveLength(0);
      const ids = results.flatMap((r) =>
        r.status === 'fulfilled' ? [r.value.notificationId] : [],
      );
      expect(new Set(ids).size).toBe(1);
      expect(await database.prisma.notification.count()).toBe(1);
      expect(await database.prisma.notificationDelivery.count()).toBe(1);
    });

    it('does not return another recipient message for a reused notification key', async () => {
      await notifications.notify(message());
      await expect(
        notifications.notify({ ...message(), recipientUserId: OTHER_CUSTOMER_USER_ID }),
      ).rejects.toThrow();
      expect(await database.prisma.notification.count()).toBe(1);
      expect(await notifications.listForRecipient(OTHER_CUSTOMER_USER_ID, 50)).toEqual([]);
    });

    it('resumes a durably recorded pending local notification', async () => {
      await app.get(NotificationRepository).create(message());
      const outcome = await notifications.notify(message());
      expect(outcome.status).toBe('DELIVERED');
      expect(await database.prisma.notification.count()).toBe(1);
      expect(await database.prisma.notificationDelivery.count()).toBe(1);
    });

    it('retries a failed local delivery through the same durable message', async () => {
      const provider = app.get<NotificationProvider>(NOTIFICATION_PROVIDER);
      const real = provider.deliver.bind(provider);
      const spy = jest
        .spyOn(provider, 'deliver')
        .mockRejectedValueOnce(new Error('controlled provider interruption'))
        .mockImplementation(real);
      try {
        await expect(notifications.notify(message())).rejects.toMatchObject({
          code: 'NOTIFICATION_FAILED',
        });
        const outcome = await notifications.notify(message());
        expect(outcome.status).toBe('DELIVERED');
        expect(await database.prisma.notification.count()).toBe(1);
        expect(await database.prisma.notificationDelivery.count()).toBe(2);
      } finally {
        spy.mockRestore();
      }
    });

    it('rolls a moderation decision back if its durable notification cannot be recorded', async () => {
      const { productId, variantId } = await seedPublished('Regression test product');
      await paidOrder(productId, variantId);
      const review = await reviews.create({
        productId,
        customerId: CUSTOMER_USER_ID,
        rating: 5,
        title: 'test',
        body: 'test body',
      });
      const spy = jest
        .spyOn(app.get(NotificationRepository), 'create')
        .mockRejectedValueOnce(new Error('controlled persistence interruption'));
      try {
        await expect(
          reviews.moderate({
            reviewId: review.id,
            decision: 'APPROVED',
            actorUserId: null,
            reason: null,
          }),
        ).rejects.toThrow();
      } finally {
        spy.mockRestore();
      }
      expect((await reviews.reviewOf(review.id))?.status).toBe('PENDING');
      expect(await database.prisma.notification.count()).toBe(0);
    });

    it('keeps an approved decision and a retryable failed notice after transport failure', async () => {
      const { productId, variantId } = await seedPublished('Regression test product');
      await paidOrder(productId, variantId);
      const review = await reviews.create({
        productId,
        customerId: CUSTOMER_USER_ID,
        rating: 5,
        title: 'test',
        body: 'test body',
      });
      const provider = app.get<NotificationProvider>(NOTIFICATION_PROVIDER);
      const spy = jest
        .spyOn(provider, 'deliver')
        .mockRejectedValueOnce(new Error('controlled provider interruption'));
      try {
        await expect(
          reviews.moderate({
            reviewId: review.id,
            decision: 'APPROVED',
            actorUserId: null,
            reason: null,
          }),
        ).resolves.toMatchObject({ status: 'APPROVED' });
      } finally {
        spy.mockRestore();
      }
      expect((await reviews.reviewOf(review.id))?.status).toBe('APPROVED');
      expect(await database.prisma.notification.findFirst()).toMatchObject({
        status: 'FAILED',
        failureReason: 'PROVIDER_FAILED',
      });
    });

    it('binds a transport that sends nothing for production even with an in-memory override', async () => {
      const created = await createApplication({
        configuration: {
          ...testConfigurationFor('integration'),
          nodeEnv: 'production',
          customerNotificationTransport: 'memory',
        },
      });
      try {
        const provider = created.app.get<NotificationProvider>(NOTIFICATION_PROVIDER);
        expect(provider.name).toBe('none');
        const outcome = await created.app.get(NotificationService).notify(message());
        expect(outcome.delivered).toBe(false);
      } finally {
        await created.app.close();
      }
    });
  });

  it('runs delivery after the owning transaction commits and discards it on rollback', async () => {
    const provider = app.get<NotificationProvider>(NOTIFICATION_PROVIDER),
      real = provider.deliver.bind(provider);
    const spy = jest.spyOn(provider, 'deliver').mockImplementation(async (request) => {
      expect(database.inTransaction).toBe(false);
      return real(request);
    });
    const input = {
      kind: 'REVIEW_APPROVED' as const,
      recipientUserId: CUSTOMER_USER_ID,
      subject: 'local',
      body: 'local',
      idempotencyKey: 'commit-effect-test',
    };
    try {
      await expect(
        database.transaction(async () => {
          await notifications.notify(input);
          throw new Error('controlled rollback');
        }),
      ).rejects.toThrow('controlled rollback');
      expect(spy).not.toHaveBeenCalled();
      expect(await database.prisma.notification.count()).toBe(0);
      await database.transaction(async () => {
        await notifications.notify(input);
        expect(spy).not.toHaveBeenCalled();
      });
      expect(spy).toHaveBeenCalledTimes(1);
      expect(await database.prisma.notificationDelivery.count()).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });

  it('retains a lease after an unknown persistence outcome and recovers without a second local delivery', async () => {
    const input = {
      kind: 'REVIEW_APPROVED' as const,
      recipientUserId: CUSTOMER_USER_ID,
      subject: 'local',
      body: 'local',
      idempotencyKey: 'lease-recovery-test',
      metadata: { test: 'retained' },
    };
    const provider = app.get<NotificationProvider>(NOTIFICATION_PROVIDER),
      spy = jest.spyOn(provider, 'deliver');
    const repository = app.get(NotificationRepository),
      persist = jest
        .spyOn(repository, 'recordDelivery')
        .mockRejectedValueOnce(new Error('controlled persistence interruption'));
    try {
      await expect(notifications.notify(input)).rejects.toThrow(
        'controlled persistence interruption',
      );
      const pending = await database.prisma.notification.findFirstOrThrow();
      expect(pending.status).toBe('PENDING');
      expect(pending.deliveryClaimToken).not.toBeNull();
      expect(pending.metadata).toEqual(input.metadata);
      expect((await notifications.notify(input)).status).toBe('PENDING');
      expect(spy).toHaveBeenCalledTimes(1);
      await database.prisma.notification.update({
        where: { id: pending.id },
        data: { deliveryClaimedAt: new Date(Date.now() - 301000) },
      });
      expect((await notifications.notify(input)).status).toBe('DELIVERED');
      // Two provider calls use one durable delivery identity; the memory adapter captures one message.
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy.mock.calls[0]?.[0].deliveryKey).toBe(spy.mock.calls[1]?.[0].deliveryKey);
      const captured = provider as NotificationProvider & { delivered: readonly unknown[] };
      expect(
        captured.delivered.filter(
          (value) =>
            typeof value === 'object' &&
            value !== null &&
            'deliveryKey' in value &&
            value.deliveryKey === pending.id,
        ),
      ).toHaveLength(1);
      expect(await database.prisma.notificationDelivery.count()).toBe(1);
    } finally {
      persist.mockRestore();
      spy.mockRestore();
    }
  });
});
