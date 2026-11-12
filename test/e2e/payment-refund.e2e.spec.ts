import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import path from 'node:path';
import OpenAPIResponseValidator from 'openapi-response-validator';
import type { OpenAPIResponseValidatorArgs } from 'openapi-response-validator';
import request from 'supertest';
import { createApplication } from '../../apps/api/src/bootstrap/create-application';
import { AdministratorProvisioningService } from '../../apps/api/src/modules/identity/application/administrator-provisioning.service';
import { generateTotpCode, timeStepFor } from '../../apps/api/src/modules/identity/crypto/totp';
import { DatabaseService } from '../../apps/api/src/platform/database/database.service';
import { resetCartDatabase } from '../helpers/cart-database';
import { resetCatalogDatabase } from '../helpers/catalog-database';
import { resetCheckoutDatabase } from '../helpers/checkout-database';
import { resetIdentityDatabase } from '../helpers/identity-database';
import { resetInventoryDatabase } from '../helpers/inventory-database';
import { resetOrderDatabase } from '../helpers/order-database';
import { resetPaymentDatabase } from '../helpers/payment-database';
import { testConfigurationFor } from '../helpers/test-configuration';

const CONFIGURATION = testConfigurationFor('e2e');
const CORRELATION_ID = 'ad4e9f4a-af6b-4d1e-af3a-4b5c6d7e8f90';

const CUSTOMER_PASSWORD = 'Payment-Customer-Passphrase-1';
const ADMIN_PASSWORD = 'Payment-Administrator-Passphrase-2';

const CART_ITEMS_ROUTE = '/api/v1/cart/items';
const ORDERS_ROUTE = '/api/v1/orders';
const PAYMENTS_ROUTE = '/api/v1/payments';
const PAYMENT_ATTEMPTS_ROUTE = '/api/v1/payments/attempts';
const WEBHOOK_ROUTE = '/api/v1/payments/webhooks/LOCAL_TEST';
const ADMIN_PAYMENTS_ROUTE = '/api/v1/admin/payments';
const ADMIN_REFUNDS_ROUTE = '/api/v1/admin/payments/refunds';
const ADMIN_RECONCILIATION_ROUTE = '/api/v1/admin/payments/reconciliation';
const ADMIN_TAX_RULES_ROUTE = '/api/v1/admin/tax/rules';
const ADMIN_DESTINATIONS_ROUTE = '/api/v1/admin/checkout/destinations';
const ADMIN_CATEGORIES_ROUTE = '/api/v1/admin/catalog/categories';
const ADMIN_BRANDS_ROUTE = '/api/v1/admin/catalog/brands';
const ADMIN_PRODUCTS_ROUTE = '/api/v1/admin/catalog/products';
const ADMIN_VARIANTS_ROUTE = '/api/v1/admin/catalog/products/{productId}/variants';
const ADMIN_STATUS_ROUTE = '/api/v1/admin/catalog/products/{productId}/status';
const ADMIN_STOCK_ROUTE = '/api/v1/admin/inventory/variants/{variantId}';

type Application = Awaited<ReturnType<typeof createApplication>>['app'];
type Server = Parameters<typeof request>[0];
type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  correlationId: string;
  details?: unknown;
}

interface OrderBody {
  refundedMinor: number;
  id: string;
  status: string;
  currency: string;
  subtotalMinor: number;
  taxTotalMinor: number;
  totalMinor: number;
  reservationId: string | null;
  paidAt: string | null;
  cancelledAt: string | null;
}

interface PaymentAttemptBody {
  id: string;
  orderId: string;
  status: string;
  amountMinor: number;
  currency: string;
  provider: string;
  providerReference: string | null;
  refundedMinor: number;
  statusReason: string | null;
  createdAt: string;
  succeededAt: string | null;
  failedAt: string | null;
}

interface PaymentAttemptsBody {
  attempts: PaymentAttemptBody[];
}

interface RefundBody {
  refundId: string;
  status: string;
  amountMinor: number;
}

interface SessionBody {
  status: string;
  session?: { token: string; tokenType: string };
  challenge?: { token: string; purpose: string };
  user?: { email: string; role: string };
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

/**
 * Validates one observed response body against the committed OpenAPI document, so a controller
 * change that is not reflected in the published artifact fails here rather than drifting.
 */
function assertMatchesContract(method: Method, route: string, status: number, body: unknown): void {
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertOperationalHeaders(response: {
  readonly headers: Record<string, string | undefined>;
  readonly body: unknown;
}): void {
  expect(response.headers['cache-control']).toBe('no-store');
  const correlationId = response.headers['x-correlation-id'];
  expect(typeof correlationId === 'string' && UUID_PATTERN.test(correlationId)).toBe(true);
  const body = response.body as { correlationId?: unknown };
  if (typeof body?.correlationId === 'string') {
    expect(body.correlationId).toBe(correlationId);
  }
}

/** The signature the local test provider expects over the raw body. */
function localTestSignature(
  body: string,
  headers: Readonly<Record<string, string | undefined>>,
): string {
  const metadata = [
    'x-local-test-event-id',
    'x-local-test-event-type',
    'x-local-test-order-id',
    'x-local-test-provider-reference',
    'x-local-test-amount-minor',
    'x-local-test-currency',
    'x-local-test-occurred-at',
  ].map((name) => headers[name] ?? null);
  return createHmac('sha256', 'nordhaven-local-test-provider-secret')
    .update(JSON.stringify([body, ...metadata]), 'utf8')
    .digest('hex');
}

describe('payment and refund HTTP contract', () => {
  let app: Application;
  let server: Server;
  let database: DatabaseService;
  let provisioning: AdministratorProvisioningService;

  // Each independent HTTP scenario owns its client rate-limit budget.
  beforeEach(async () => {
    const created = await createApplication({ configuration: CONFIGURATION });
    app = created.app;
    server = app.getHttpServer() as Server;
    database = app.get(DatabaseService);
    provisioning = app.get(AdministratorProvisioningService);
    await resetIdentityDatabase(database);
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

    // The enrollment consumed its time step, so the second factor is proven with a recovery code.
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

  async function seedProduct(
    admin: string,
    name: string,
    basePriceMinor = 129900,
  ): Promise<{ productId: string; variantId: string }> {
    const category = bodyOf<{ id: string }>(
      await request(server)
        .post(ADMIN_CATEGORIES_ROUTE)
        .set(bearer(admin))
        .send({ name: `Category ${name}` })
        .expect(201),
    );
    const brand = bodyOf<{ id: string }>(
      await request(server)
        .post(ADMIN_BRANDS_ROUTE)
        .set(bearer(admin))
        .send({ name: `Brand ${name}` })
        .expect(201),
    );
    const product = bodyOf<{ id: string }>(
      await request(server)
        .post(ADMIN_PRODUCTS_ROUTE)
        .set(bearer(admin))
        .send({
          name,
          description: `${name} description.`,
          categoryId: category.id,
          brandId: brand.id,
          basePriceMinor,
          baseCurrency: 'EGP',
        })
        .expect(201),
    );
    const variant = bodyOf<{ id: string }>(
      await request(server)
        .post(ADMIN_VARIANTS_ROUTE.replace('{productId}', product.id))
        .set(bearer(admin))
        .send({ sku: `SKU-${name.replace(/\s+/g, '-')}` })
        .expect(201),
    );
    await request(server)
      .put(ADMIN_STATUS_ROUTE.replace('{productId}', product.id))
      .set(bearer(admin))
      .send({ status: 'PUBLISHED' })
      .expect(200);
    return { productId: product.id, variantId: variant.id };
  }

  /** A pending order with its cart, tax, and destination configured. */
  async function pendingOrder(
    admin: string,
    customer: string,
    name = 'Oak Dining Table',
    onHand = 10,
  ): Promise<{ orderId: string; variantId: string; totalMinor: number }> {
    const { variantId } = await seedProduct(admin, name);
    await request(server)
      .put(`${ADMIN_DESTINATIONS_ROUTE}/EG`)
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
      .put(ADMIN_STOCK_ROUTE.replace('{variantId}', variantId))
      .set(bearer(admin))
      .send({ onHand, reason: 'E2E fixture' })
      .expect(200);
    await request(server)
      .post(CART_ITEMS_ROUTE)
      .set(bearer(customer))
      .send({ variantId, quantity: 1 })
      .expect(201);
    const order = bodyOf<OrderBody>(
      await request(server)
        .post(ORDERS_ROUTE)
        .set(bearer(customer))
        .set('Idempotency-Key', 'e2e-order-key-payment')
        .send({ destinationCountryCode: 'EG', expectedFingerprint: null })
        .expect(201),
    );
    return { orderId: order.id, variantId, totalMinor: order.totalMinor };
  }

  /** Delivers a signed provider event. */
  async function deliverEvent(
    eventId: string,
    headers: Record<string, string>,
    body: unknown = { reference: 'local' },
  ) {
    headers = { ...headers, 'x-local-test-occurred-at': new Date().toISOString() };
    const raw = JSON.stringify(body);
    return request(server)
      .post(WEBHOOK_ROUTE)
      .set(headers)
      .set('x-local-test-signature', localTestSignature(raw, headers))
      .set('Content-Type', 'application/json')
      .send(raw);
  }

  it('refuses every payment route from an anonymous caller', async () => {
    const routes: readonly { method: Method; path: string }[] = [
      { method: 'get', path: PAYMENTS_ROUTE },
      { method: 'post', path: PAYMENT_ATTEMPTS_ROUTE },
    ];

    for (const route of routes) {
      const agent = request(server);
      const builder = route.method === 'get' ? agent.get(route.path) : agent.post(route.path);
      const response = await builder.expect(401);
      expect(bodyOf<ErrorBody>(response)).toMatchObject({
        statusCode: 401,
        code: 'UNAUTHENTICATED',
      });
      assertOperationalHeaders(response);
    }
  });

  it('refuses the payment administration routes from a customer', async () => {
    const customer = await createCustomer('payment-customer');

    const response = await request(server)
      .get(ADMIN_PAYMENTS_ROUTE)
      .set(bearer(customer))
      .expect(403);
    expect(bodyOf<ErrorBody>(response)).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('creates a payment attempt for the order total', async () => {
    const admin = await createAdministrator('payment-admin');
    const customer = await createCustomer('payment-customer');
    const { orderId, totalMinor } = await pendingOrder(admin, customer);

    const response = await request(server)
      .post(PAYMENT_ATTEMPTS_ROUTE)
      .set(bearer(customer))
      .set('Idempotency-Key', 'e2e-payment-key-one')
      .send({ orderId })
      .expect(201);

    const attempt = bodyOf<PaymentAttemptBody>(response);
    assertMatchesContract('post', PAYMENT_ATTEMPTS_ROUTE, 201, attempt);
    assertOperationalHeaders(response);

    expect(attempt.status).toBe('PENDING');
    expect(attempt.amountMinor).toBe(totalMinor);
    expect(attempt.currency).toBe('EGP');
  });

  it('returns the original attempt for a repeated key', async () => {
    const admin = await createAdministrator('payment-admin');
    const customer = await createCustomer('payment-customer');
    const { orderId } = await pendingOrder(admin, customer);

    const first = bodyOf<PaymentAttemptBody>(
      await request(server)
        .post(PAYMENT_ATTEMPTS_ROUTE)
        .set(bearer(customer))
        .set('Idempotency-Key', 'e2e-payment-key-repeat')
        .send({ orderId })
        .expect(201),
    );
    const second = bodyOf<PaymentAttemptBody>(
      await request(server)
        .post(PAYMENT_ATTEMPTS_ROUTE)
        .set(bearer(customer))
        .set('Idempotency-Key', 'e2e-payment-key-repeat')
        .send({ orderId })
        .expect(201),
    );

    expect(second.id).toBe(first.id);
    expect(await database.prisma.paymentAttempt.count()).toBe(1);
  });

  it('refuses a payment attempt without an idempotency key', async () => {
    const admin = await createAdministrator('payment-admin');
    const customer = await createCustomer('payment-customer');
    const { orderId } = await pendingOrder(admin, customer);

    const response = await request(server)
      .post(PAYMENT_ATTEMPTS_ROUTE)
      .set(bearer(customer))
      .send({ orderId })
      .expect(400);

    expect(bodyOf<ErrorBody>(response)).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('refuses a forged provider event and changes nothing', async () => {
    const admin = await createAdministrator('payment-admin');
    const customer = await createCustomer('payment-customer');
    const { orderId } = await pendingOrder(admin, customer);
    const attempt = bodyOf<PaymentAttemptBody>(
      await request(server)
        .post(PAYMENT_ATTEMPTS_ROUTE)
        .set(bearer(customer))
        .set('Idempotency-Key', 'e2e-payment-key-forged')
        .send({ orderId })
        .expect(201),
    );

    const response = await request(server)
      .post(WEBHOOK_ROUTE)
      .set('x-local-test-event-id', 'forged-event')
      .set('x-local-test-order-id', orderId)
      .set('x-local-test-signature', '0'.repeat(64))
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ reference: 'forged' }))
      .expect(401);

    expect(bodyOf<ErrorBody>(response)).toMatchObject({
      statusCode: 401,
      code: 'PAYMENT_EVENT_UNVERIFIED',
    });
    const stored = await database.prisma.paymentAttempt.findUnique({
      where: { id: attempt.id },
      select: { status: true },
    });
    expect(stored?.status).toBe('PENDING');
  });

  it('refuses an unsigned provider event', async () => {
    const response = await request(server)
      .post(WEBHOOK_ROUTE)
      .set('x-local-test-event-id', 'unsigned-event')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ reference: 'unsigned' }))
      .expect(401);

    expect(bodyOf<ErrorBody>(response)).toMatchObject({
      statusCode: 401,
      code: 'PAYMENT_EVENT_UNVERIFIED',
    });
  });

  it('applies a verified provider event and pays the order', async () => {
    const admin = await createAdministrator('payment-admin');
    const customer = await createCustomer('payment-customer');
    const { orderId, totalMinor } = await pendingOrder(admin, customer);
    const attempt = bodyOf<PaymentAttemptBody>(
      await request(server)
        .post(PAYMENT_ATTEMPTS_ROUTE)
        .set(bearer(customer))
        .set('Idempotency-Key', 'e2e-payment-key-success')
        .send({ orderId })
        .expect(201),
    );

    const delivered = await deliverEvent('e2e-event-success', {
      'x-local-test-event-id': 'e2e-event-success',
      'x-local-test-event-type': 'payment.succeeded',
      'x-local-test-order-id': orderId,
      'x-local-test-provider-reference': attempt.providerReference ?? '',
      'x-local-test-amount-minor': String(totalMinor),
      'x-local-test-currency': 'EGP',
    });
    expect(delivered.status).toBe(200);

    const stored = await database.prisma.paymentAttempt.findUnique({
      where: { id: attempt.id },
      select: { status: true },
    });
    expect(stored?.status).toBe('SUCCEEDED');
    const order = bodyOf<OrderBody>(
      await request(server).get(`${ORDERS_ROUTE}/${orderId}`).set(bearer(customer)).expect(200),
    );
    expect(order.status).toBe('PAID');
    expect(order.paidAt).not.toBeNull();
  });

  it('applies a repeated provider event only once', async () => {
    const admin = await createAdministrator('payment-admin');
    const customer = await createCustomer('payment-customer');
    const { orderId, totalMinor } = await pendingOrder(admin, customer);
    const attempt = bodyOf<PaymentAttemptBody>(
      await request(server)
        .post(PAYMENT_ATTEMPTS_ROUTE)
        .set(bearer(customer))
        .set('Idempotency-Key', 'e2e-payment-key-duplicate')
        .send({ orderId })
        .expect(201),
    );

    const headers = {
      'x-local-test-event-id': 'e2e-event-duplicate',
      'x-local-test-event-type': 'payment.succeeded',
      'x-local-test-order-id': orderId,
      'x-local-test-provider-reference': attempt.providerReference ?? '',
      'x-local-test-amount-minor': String(totalMinor),
      'x-local-test-currency': 'EGP',
    };
    await deliverEvent('e2e-event-duplicate', headers);
    await deliverEvent('e2e-event-duplicate', headers);

    expect(await database.prisma.providerEvent.count()).toBe(1);
    const stored = await database.prisma.paymentAttempt.findUnique({
      where: { id: attempt.id },
      select: { status: true },
    });
    expect(stored?.status).toBe('SUCCEEDED');
  });

  it('refunds a payment in full and marks the attempt refunded', async () => {
    const admin = await createAdministrator('payment-admin');
    const customer = await createCustomer('payment-customer');
    const { orderId, totalMinor } = await pendingOrder(admin, customer);
    const attempt = bodyOf<PaymentAttemptBody>(
      await request(server)
        .post(PAYMENT_ATTEMPTS_ROUTE)
        .set(bearer(customer))
        .set('Idempotency-Key', 'e2e-payment-key-refund')
        .send({ orderId })
        .expect(201),
    );
    await deliverEvent('e2e-event-refund', {
      'x-local-test-event-id': 'e2e-event-refund',
      'x-local-test-event-type': 'payment.succeeded',
      'x-local-test-order-id': orderId,
      'x-local-test-provider-reference': attempt.providerReference ?? '',
      'x-local-test-amount-minor': String(totalMinor),
      'x-local-test-currency': 'EGP',
    });

    const response = await request(server)
      .post(ADMIN_REFUNDS_ROUTE)
      .set(bearer(admin))
      .set('Idempotency-Key', 'e2e-refund-key-full')
      .send({ paymentAttemptId: attempt.id, amountMinor: totalMinor, reason: 'Customer request' })
      .expect(201);

    const refund = bodyOf<RefundBody>(response);
    assertMatchesContract('post', ADMIN_REFUNDS_ROUTE, 201, refund);
    expect(refund.status).toBe('SUCCEEDED');
    expect(refund.amountMinor).toBe(totalMinor);
  });

  it('refuses a refund that exceeds the amount that was paid', async () => {
    const admin = await createAdministrator('payment-admin');
    const customer = await createCustomer('payment-customer');
    const { orderId, totalMinor } = await pendingOrder(admin, customer);
    const attempt = bodyOf<PaymentAttemptBody>(
      await request(server)
        .post(PAYMENT_ATTEMPTS_ROUTE)
        .set(bearer(customer))
        .set('Idempotency-Key', 'e2e-payment-key-over-refund')
        .send({ orderId })
        .expect(201),
    );
    await deliverEvent('e2e-event-over-refund', {
      'x-local-test-event-id': 'e2e-event-over-refund',
      'x-local-test-event-type': 'payment.succeeded',
      'x-local-test-order-id': orderId,
      'x-local-test-provider-reference': attempt.providerReference ?? '',
      'x-local-test-amount-minor': String(totalMinor),
      'x-local-test-currency': 'EGP',
    });

    const response = await request(server)
      .post(ADMIN_REFUNDS_ROUTE)
      .set(bearer(admin))
      .set('Idempotency-Key', 'e2e-refund-key-too-much')
      .send({ paymentAttemptId: attempt.id, amountMinor: totalMinor + 1, reason: null })
      .expect(409);

    expect(bodyOf<ErrorBody>(response)).toMatchObject({
      statusCode: 409,
      code: 'REFUND_EXCEEDS_PAYMENT',
    });
    expect(await database.prisma.refund.count()).toBe(0);
  });

  it('reports the reconciliation result to an administrator', async () => {
    const admin = await createAdministrator('payment-admin');
    const customer = await createCustomer('payment-customer');
    const { orderId } = await pendingOrder(admin, customer);
    await request(server)
      .post(PAYMENT_ATTEMPTS_ROUTE)
      .set(bearer(customer))
      .set('Idempotency-Key', 'e2e-payment-key-reconcile')
      .send({ orderId })
      .expect(201);

    const response = await request(server)
      .get(ADMIN_RECONCILIATION_ROUTE)
      .set(bearer(admin))
      .expect(200);

    const reconciliation = bodyOf<{ checked: number; differences: unknown[] }>(response);
    assertMatchesContract('get', ADMIN_RECONCILIATION_ROUTE, 200, reconciliation);
    expect(reconciliation.checked).toBe(1);
    // The platform has the attempt pending while the provider has it succeeded, so the difference is
    // reported rather than silently resolved in the platform's favour.
    expect(reconciliation.differences).toHaveLength(1);
  });

  it('never shows a customer another customer payment', async () => {
    const admin = await createAdministrator('payment-admin');
    const first = await createCustomer('payment-customer-one');
    const second = await createCustomer('payment-customer-two');
    const { orderId } = await pendingOrder(admin, first);
    await request(server)
      .post(PAYMENT_ATTEMPTS_ROUTE)
      .set(bearer(first))
      .set('Idempotency-Key', 'e2e-payment-key-boundary')
      .send({ orderId })
      .expect(201);

    const theirs = bodyOf<PaymentAttemptsBody>(
      await request(server).get(PAYMENTS_ROUTE).set(bearer(second)).expect(200),
    );
    expect(theirs.attempts).toEqual([]);

    const mine = bodyOf<PaymentAttemptsBody>(
      await request(server).get(PAYMENTS_ROUTE).set(bearer(first)).expect(200),
    );
    expect(mine.attempts).toHaveLength(1);
  });
  it('verifies exact raw bytes and rejects changed signed metadata before applying payment', async () => {
    const admin = await createAdministrator('raw-webhook-admin');
    const customer = await createCustomer('raw-webhook-customer');
    const { orderId, totalMinor } = await pendingOrder(admin, customer);
    const attempt = bodyOf<PaymentAttemptBody>(
      await request(server)
        .post(PAYMENT_ATTEMPTS_ROUTE)
        .set(bearer(customer))
        .set('Idempotency-Key', 'raw-webhook-attempt')
        .send({ orderId })
        .expect(201),
    );
    const raw = ' { "reference": "raw bytes retained" } ';
    const metadata = {
      'x-local-test-event-id': 'raw-webhook-event',
      'x-local-test-event-type': 'payment.succeeded',
      'x-local-test-order-id': orderId,
      'x-local-test-provider-reference': attempt.providerReference ?? '',
      'x-local-test-amount-minor': String(totalMinor),
      'x-local-test-currency': 'EGP',
      'x-local-test-occurred-at': new Date().toISOString(),
    };
    const signature = localTestSignature(raw, metadata);
    await request(server)
      .post(WEBHOOK_ROUTE)
      .set({ ...metadata, 'x-local-test-currency': 'USD', 'x-local-test-signature': signature })
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(401);
    expect((await database.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe(
      'PENDING_PAYMENT',
    );
    const response = await request(server)
      .post(WEBHOOK_ROUTE)
      .set({ ...metadata, 'x-local-test-signature': signature })
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(200);
    assertMatchesContract(
      'post',
      '/api/v1/payments/webhooks/{provider}',
      200,
      response.body as unknown,
    );
    expect((await database.prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe(
      'PAID',
    );
    await request(server)
      .post(ADMIN_REFUNDS_ROUTE)
      .set(bearer(admin))
      .set('Idempotency-Key', 'raw-webhook-full-refund')
      .send({ paymentAttemptId: attempt.id, amountMinor: totalMinor, reason: null })
      .expect(201);
    const orderResponse = await request(server)
      .get(ORDERS_ROUTE + '/' + orderId)
      .set(bearer(customer))
      .expect(200);
    expect(bodyOf<OrderBody>(orderResponse)).toMatchObject({
      status: 'REFUNDED',
      refundedMinor: totalMinor,
    });
    const actor = await database.prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' } });
    expect(
      (await database.prisma.refundEvent.findFirstOrThrow({ where: { previousStatus: null } }))
        .actorUserId,
    ).toBe(actor.id);
  });
});
