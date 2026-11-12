import { readFileSync } from 'node:fs';
import path from 'node:path';
import OpenAPIResponseValidator from 'openapi-response-validator';
import type { OpenAPIResponseValidatorArgs } from 'openapi-response-validator';
import request from 'supertest';
import { createApplication } from '../../apps/api/src/bootstrap/create-application';
import { AdministratorProvisioningService } from '../../apps/api/src/modules/identity/application/administrator-provisioning.service';
import { generateTotpCode, timeStepFor } from '../../apps/api/src/modules/identity/crypto/totp';
import { PaymentService } from '../../apps/api/src/modules/payments/application/payment.service';
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

const CONFIGURATION = testConfigurationFor('e2e');
const CORRELATION_ID = '9c3d8e3f-9f5a-4c0d-9e2f-3a4b5c6d7e8f';

const CUSTOMER_PASSWORD = 'Review-Customer-Passphrase-1';
const ADMIN_PASSWORD = 'Review-Administrator-Passphrase-2';

const PUBLIC_REVIEWS_ROUTE = '/api/v1/products/reviews';
const REVIEWS_ROUTE = '/api/v1/reviews';
const REVIEW_ROUTE = '/api/v1/reviews/{reviewId}';
const ADMIN_REVIEWS_ROUTE = '/api/v1/admin/reviews';
const ADMIN_REVIEW_DECISION_ROUTE = '/api/v1/admin/reviews/{reviewId}/decision';
const NOTIFICATIONS_ROUTE = '/api/v1/notifications';
const CART_ITEMS_ROUTE = '/api/v1/cart/items';
const ORDERS_ROUTE = '/api/v1/orders';
const PAYMENT_ATTEMPTS_ROUTE = '/api/v1/payments/attempts';
const ADMIN_TAX_RULES_ROUTE = '/api/v1/admin/tax/rules';
const ADMIN_CHECKOUT_DESTINATIONS_ROUTE = '/api/v1/admin/checkout/destinations';
const ADMIN_CATEGORIES_ROUTE = '/api/v1/admin/catalog/categories';
const ADMIN_BRANDS_ROUTE = '/api/v1/admin/catalog/brands';
const ADMIN_PRODUCTS_ROUTE = '/api/v1/admin/catalog/products';
const ADMIN_VARIANTS_ROUTE = '/api/v1/admin/catalog/products/{productId}/variants';
const ADMIN_STATUS_ROUTE = '/api/v1/admin/catalog/products/{productId}/status';
const ADMIN_STOCK_ROUTE = '/api/v1/admin/inventory/variants/{variantId}';

type Application = Awaited<ReturnType<typeof createApplication>>['app'];
type Server = Parameters<typeof request>[0];

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  correlationId: string;
}

interface SessionBody {
  status: string;
  session?: { token: string; tokenType: string };
  challenge?: { token: string; purpose: string };
}

interface ReviewBody {
  id: string;
  productId: string;
  status: string;
  rating: number;
  title: string;
  body: string;
  verifiedPurchase: boolean;
}

interface NotificationBody {
  id: string;
  kind: string;
  subject: string;
  status: string;
}

interface OpenApiOperation {
  readonly responses?: Record<
    string,
    { readonly content?: Record<string, { readonly schema?: unknown }> }
  >;
}

interface OpenApiDocument {
  readonly paths: Record<string, Record<string, OpenApiOperation>>;
  readonly components?: unknown;
}

const CONTRACT: OpenApiDocument = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'openapi', 'openapi.json'), 'utf8'),
) as OpenApiDocument;

function assertMatchesContract(
  method: 'get' | 'post' | 'patch' | 'put' | 'delete',
  route: string,
  status: number,
  body: unknown,
): void {
  const schema =
    CONTRACT.paths[route]?.[method]?.responses?.[String(status)]?.content?.['application/json']
      ?.schema;
  if (schema === undefined) {
    throw new Error(`No documented JSON schema for ${method.toUpperCase()} ${route} ${status}`);
  }
  const validator = new OpenAPIResponseValidator({
    responses: { [String(status)]: { schema } },
    components: CONTRACT.components,
  } as unknown as OpenAPIResponseValidatorArgs);
  expect(validator.validateResponse(String(status), body) ?? null).toBeNull();
}

function bodyOf<T>(response: { readonly body: unknown }): T {
  return response.body as T;
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

describe('review and notification HTTP contract', () => {
  let app: Application;
  let server: Server;
  let database: DatabaseService;
  let provisioning: AdministratorProvisioningService;

  beforeEach(async () => {
    const created = await createApplication({ configuration: CONFIGURATION });
    app = created.app;
    server = app.getHttpServer() as Server;
    database = app.get(DatabaseService);
    provisioning = app.get(AdministratorProvisioningService);
    await resetIdentityDatabase(database);
    await resetReviewDatabase(database);
    await resetPaymentDatabase(database);
    await resetOrderDatabase(database);
    await resetCheckoutDatabase(database);
    await resetInventoryDatabase(database);
    await resetCartDatabase(database);
    await resetCatalogDatabase(database);
  }, 30_000);

  afterEach(async () => {
    await app.close();
  });

  async function createCustomer(prefix: string): Promise<string> {
    const email = `${prefix}@nordhaven.test`;
    await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password: CUSTOMER_PASSWORD })
      .expect(201);
    const signedIn = bodyOf<SessionBody>(
      await request(server)
        .post('/api/v1/auth/login')
        .send({ email, password: CUSTOMER_PASSWORD })
        .expect(200),
    );
    const token = signedIn.session?.token;
    if (token === undefined) throw new Error('Expected a session credential');
    return token;
  }

  async function createAdministrator(prefix: string): Promise<string> {
    const email = `${prefix}@nordhaven.test`;
    await provisioning.provision({
      email,
      password: ADMIN_PASSWORD,
      correlationId: CORRELATION_ID,
    });

    const enrollmentSignIn = bodyOf<SessionBody>(
      await request(server)
        .post('/api/v1/auth/login')
        .send({ email, password: ADMIN_PASSWORD })
        .expect(200),
    );
    const challengeToken = enrollmentSignIn.challenge?.token;
    if (challengeToken === undefined) throw new Error('Expected an enrollment challenge');

    const enrollment = bodyOf<{ secret: string }>(
      await request(server)
        .post('/api/v1/auth/login/mfa/enrollment')
        .send({ challengeToken })
        .expect(200),
    );

    const code = generateTotpCode(enrollment.secret, timeStepFor(Date.now() + 5_000));
    const confirmation = bodyOf<{ recoveryCodes: string[] }>(
      await request(server)
        .post('/api/v1/auth/login/mfa/enrollment/confirmation')
        .send({ challengeToken, code })
        .expect(201),
    );

    const verificationSignIn = bodyOf<SessionBody>(
      await request(server)
        .post('/api/v1/auth/login')
        .send({ email, password: ADMIN_PASSWORD })
        .expect(200),
    );
    const verificationToken = verificationSignIn.challenge?.token;
    if (verificationToken === undefined) throw new Error('Expected a verification challenge');

    const recoveryCode = confirmation.recoveryCodes[0];
    if (recoveryCode === undefined) throw new Error('Expected a recovery code');
    const verified = bodyOf<{ token: string }>(
      await request(server)
        .post('/api/v1/auth/login/mfa')
        .send({ challengeToken: verificationToken, recoveryCode })
        .expect(201),
    );
    return verified.token;
  }

  /** A published product the customer bought and paid for. */
  async function purchasedProduct(admin: string, customer: string): Promise<{ productId: string }> {
    const category = bodyOf<{ id: string }>(
      await request(server)
        .post(ADMIN_CATEGORIES_ROUTE)
        .set(bearer(admin))
        .send({ name: 'Category Review' })
        .expect(201),
    );
    const brand = bodyOf<{ id: string }>(
      await request(server)
        .post(ADMIN_BRANDS_ROUTE)
        .set(bearer(admin))
        .send({ name: 'Brand Review' })
        .expect(201),
    );
    const product = bodyOf<{ id: string }>(
      await request(server)
        .post(ADMIN_PRODUCTS_ROUTE)
        .set(bearer(admin))
        .send({
          name: 'Review Table',
          description: 'A table that is reviewed.',
          categoryId: category.id,
          brandId: brand.id,
          basePriceMinor: 129900,
          baseCurrency: 'EGP',
        })
        .expect(201),
    );
    const variant = bodyOf<{ id: string }>(
      await request(server)
        .post(ADMIN_VARIANTS_ROUTE.replace('{productId}', product.id))
        .set(bearer(admin))
        .send({ sku: 'SKU-Review-Table' })
        .expect(201),
    );
    await request(server)
      .put(ADMIN_STATUS_ROUTE.replace('{productId}', product.id))
      .set(bearer(admin))
      .send({ status: 'PUBLISHED' })
      .expect(200);
    await request(server)
      .put(`${ADMIN_CHECKOUT_DESTINATIONS_ROUTE}/EG`)
      .set(bearer(admin))
      .send({ enabled: true, taxJurisdiction: 'EG', shippingApproved: true, label: 'Egypt' })
      .expect(200);
    await request(server)
      .post(ADMIN_TAX_RULES_ROUTE)
      .set(bearer(admin))
      .send({
        jurisdiction: 'EG',
        classification: 'STANDARD',
        rateBasisPoints: 1400,
        taxInclusive: false,
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        effectiveTo: null,
        priority: 0,
      })
      .expect(201);
    await request(server)
      .put(ADMIN_STOCK_ROUTE.replace('{variantId}', variant.id))
      .set(bearer(admin))
      .send({ onHand: 10, reason: 'E2E fixture' })
      .expect(200);
    await request(server)
      .post(CART_ITEMS_ROUTE)
      .set(bearer(customer))
      .send({ variantId: variant.id, quantity: 1 })
      .expect(201);
    const order = bodyOf<{ id: string; totalMinor: number }>(
      await request(server)
        .post(ORDERS_ROUTE)
        .set(bearer(customer))
        .set('Idempotency-Key', 'e2e-review-order-key')
        .send({ destinationCountryCode: 'EG', expectedFingerprint: null })
        .expect(201),
    );
    const attempt = bodyOf<{ providerReference: string | null }>(
      await request(server)
        .post(PAYMENT_ATTEMPTS_ROUTE)
        .set(bearer(customer))
        .set('Idempotency-Key', 'e2e-review-attempt-key')
        .send({ orderId: order.id })
        .expect(201),
    );
    void attempt;
    // The payment is completed through the Payments capability so the review is a verified purchase.
    const payments = app.get(PaymentService);
    await payments.applyProviderEvent({
      providerEventId: 'e2e-review-payment-event',
      type: 'payment.succeeded',
      orderId: order.id,
      providerReference: attempt.providerReference ?? '',
      amountMinor: order.totalMinor,
      currency: 'EGP',
      occurredAt: new Date(),
      detail: {},
    });
    return { productId: product.id };
  }

  it('refuses the review routes from an anonymous caller', async () => {
    for (const route of [REVIEWS_ROUTE, NOTIFICATIONS_ROUTE]) {
      const response = await request(server).get(route).expect(401);
      expect(bodyOf<ErrorBody>(response)).toMatchObject({
        statusCode: 401,
        code: 'UNAUTHENTICATED',
      });
    }
  });

  it('refuses the review administration from a customer', async () => {
    const customer = await createCustomer('review-admin-customer');
    const response = await request(server)
      .get(ADMIN_REVIEWS_ROUTE)
      .set(bearer(customer))
      .expect(403);
    expect(bodyOf<ErrorBody>(response)).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('refuses the customer review route from an administrator', async () => {
    const admin = await createAdministrator('review-role-admin');
    const response = await request(server).get(REVIEWS_ROUTE).set(bearer(admin)).expect(403);
    expect(bodyOf<ErrorBody>(response)).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('holds a review for moderation and publishes it only after the decision', async () => {
    const admin = await createAdministrator('review-flow-admin');
    const customer = await createCustomer('review-flow-customer');
    const { productId } = await purchasedProduct(admin, customer);

    const created = bodyOf<ReviewBody>(
      await request(server)
        .post(REVIEWS_ROUTE)
        .set(bearer(customer))
        .send({
          productId,
          rating: 5,
          title: 'Wonderful',
          body: 'It is a wonderful table.',
        })
        .expect(201),
    );
    assertMatchesContract('post', REVIEWS_ROUTE, 201, created);
    expect(created.status).toBe('PENDING');
    expect(created.verifiedPurchase).toBe(true);

    const before = bodyOf<{ reviews: unknown[] }>(
      await request(server).get(`${PUBLIC_REVIEWS_ROUTE}?productId=${productId}`).expect(200),
    );
    expect(before.reviews).toHaveLength(0);

    const approved = bodyOf<ReviewBody>(
      await request(server)
        .post(ADMIN_REVIEW_DECISION_ROUTE.replace('{reviewId}', created.id))
        .set(bearer(admin))
        .send({ decision: 'APPROVED', reason: null })
        .expect(200),
    );
    expect(approved.status).toBe('APPROVED');

    const after = bodyOf<{ reviews: unknown[] }>(
      await request(server).get(`${PUBLIC_REVIEWS_ROUTE}?productId=${productId}`).expect(200),
    );
    expect(after.reviews).toHaveLength(1);

    const messages = bodyOf<{ notifications: NotificationBody[] }>(
      await request(server).get(NOTIFICATIONS_ROUTE).set(bearer(customer)).expect(200),
    );
    expect(messages.notifications.map((item) => item.kind)).toContain('REVIEW_APPROVED');
  });

  it('refuses a review of a product the customer never bought', async () => {
    const admin = await createAdministrator('review-ineligible-admin');
    const customer = await createCustomer('review-ineligible-customer');
    const category = bodyOf<{ id: string }>(
      await request(server)
        .post(ADMIN_CATEGORIES_ROUTE)
        .set(bearer(admin))
        .send({ name: 'Category Unbought' })
        .expect(201),
    );
    const brand = bodyOf<{ id: string }>(
      await request(server)
        .post(ADMIN_BRANDS_ROUTE)
        .set(bearer(admin))
        .send({ name: 'Brand Unbought' })
        .expect(201),
    );
    const product = bodyOf<{ id: string }>(
      await request(server)
        .post(ADMIN_PRODUCTS_ROUTE)
        .set(bearer(admin))
        .send({
          name: 'Unbought Chair',
          description: 'A chair nobody bought.',
          categoryId: category.id,
          brandId: brand.id,
          basePriceMinor: 9900,
          baseCurrency: 'EGP',
        })
        .expect(201),
    );

    const response = await request(server)
      .post(REVIEWS_ROUTE)
      .set(bearer(customer))
      .send({
        productId: product.id,
        rating: 5,
        title: 'Wonderful',
        body: 'It is a wonderful chair.',
      })
      .expect(409);
    expect(bodyOf<ErrorBody>(response)).toMatchObject({
      statusCode: 409,
      code: 'REVIEW_NOT_ELIGIBLE',
    });
  });

  it('hides another customer review', async () => {
    const admin = await createAdministrator('review-boundary-admin');
    const owner = await createCustomer('review-boundary-owner');
    const stranger = await createCustomer('review-boundary-stranger');
    const { productId } = await purchasedProduct(admin, owner);
    const created = bodyOf<ReviewBody>(
      await request(server)
        .post(REVIEWS_ROUTE)
        .set(bearer(owner))
        .send({
          productId,
          rating: 5,
          title: 'Wonderful',
          body: 'It is a wonderful table.',
        })
        .expect(201),
    );
    await request(server)
      .get(REVIEW_ROUTE.replace('{reviewId}', created.id))
      .set(bearer(stranger))
      .expect(404);
  });
  it('permits only an MFA-authenticated administrator to retry a persisted local notice and records its actor', async () => {
    const admin = await createAdministrator('retry-admin');
    const customer = await createCustomer('retry-customer');
    const user = await database.prisma.user.findFirstOrThrow({
      where: { email: 'retry-customer@nordhaven.test' },
    });
    const actor = await database.prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' } });
    const message = await database.prisma.notification.create({
      data: {
        kind: 'REVIEW_APPROVED',
        recipientUserId: user.id,
        subject: 'Local retry',
        body: 'Safe local test only',
        status: 'PENDING',
        idempotencyKey: 'http-local-retry',
      },
    });
    const url = '/api/v1/admin/notifications/' + message.id + '/retry';
    await request(server).post(url).expect(401);
    await request(server).post(url).set(bearer(customer)).expect(403);
    const response = await request(server).post(url).set(bearer(admin)).expect(200);
    expect(response.body).toMatchObject({
      id: message.id,
      status: 'DELIVERED',
      provider: 'memory',
    });
    await request(server).post(url).set(bearer(admin)).expect(200);
    expect(
      await database.prisma.notificationDelivery.findMany({
        where: { notificationId: message.id },
      }),
    ).toEqual([expect.objectContaining({ actorUserId: actor.id, delivered: true })]);
  });
});
