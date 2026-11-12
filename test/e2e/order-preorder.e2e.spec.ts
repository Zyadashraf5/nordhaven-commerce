import { resetPaymentDatabase } from '../helpers/payment-database';
import { readFileSync } from 'node:fs';
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
import { testConfigurationFor } from '../helpers/test-configuration';

const CONFIGURATION = testConfigurationFor('e2e');
const CORRELATION_ID = '9c3d8e3f-9f5a-4c0d-9e2f-3a4b5c6d7e8f';

const CUSTOMER_PASSWORD = 'Order-Customer-Passphrase-1';
const ADMIN_PASSWORD = 'Order-Administrator-Passphrase-2';

const CART_ITEMS_ROUTE = '/api/v1/cart/items';
const QUOTE_ROUTE = '/api/v1/checkout/quotes';
const ORDERS_ROUTE = '/api/v1/orders';
const ORDER_ROUTE = '/api/v1/orders/{orderId}';
const PRE_ORDERS_ROUTE = '/api/v1/orders/pre-orders';
const PRE_ORDER_ROUTE = '/api/v1/orders/pre-orders/{preOrderId}';
const ADMIN_ORDERS_ROUTE = '/api/v1/admin/orders';
const ADMIN_ORDER_ROUTE = '/api/v1/admin/orders/{orderId}';
const ADMIN_TAX_RULES_ROUTE = '/api/v1/admin/tax/rules';
const ADMIN_DESTINATIONS_ROUTE = '/api/v1/admin/checkout/destinations';
const ADMIN_CATEGORIES_ROUTE = '/api/v1/admin/catalog/categories';
const ADMIN_BRANDS_ROUTE = '/api/v1/admin/catalog/brands';
const ADMIN_PRODUCTS_ROUTE = '/api/v1/admin/catalog/products';
const ADMIN_VARIANTS_ROUTE = '/api/v1/admin/catalog/products/{productId}/variants';
const ADMIN_STATUS_ROUTE = '/api/v1/admin/catalog/products/{productId}/status';
const ADMIN_STOCK_ROUTE = '/api/v1/admin/inventory/variants/{variantId}';

const UNKNOWN_ID = 'df1e0d9c-8b7a-4695-8432-1f0e9d8c7b99';

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

interface OrderLineBody {
  id: string;
  variantId: string | null;
  bundleId: string | null;
  sku: string;
  quantity: number;
  unitPriceMinor: number;
  unitCurrency: string;
  taxRateBasisPoints: number;
  netMinor: number;
  taxMinor: number;
  totalMinor: number;
  composition: { variantId: string; sku: string; quantity: number }[];
}

interface OrderBody {
  id: string;
  status: string;
  currency: string;
  subtotalMinor: number;
  taxTotalMinor: number;
  totalMinor: number;
  destinationCountryCode: string;
  taxJurisdiction: string;
  quoteFingerprint: string;
  reservationId: string | null;
  statusReason: string | null;
  expiresAt: string;
  createdAt: string;
  paidAt: string | null;
  cancelledAt: string | null;
  lines: OrderLineBody[];
}

interface OrdersBody {
  orders: OrderBody[];
}

interface PreOrderBody {
  id: string;
  status: string;
  totalMinor: number;
  currency: string;
  orderId: string | null;
  reservationId: string | null;
  statusReason: string | null;
  createdAt: string;
  cancelledAt: string | null;
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

describe('order and pre-order HTTP contract', () => {
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

  /** Publishes one product with a sellable variant priced in the settlement currency. */
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

  /** A cart with one published SKU, priced and tax-configured, ready to be ordered. */
  async function readyCart(
    admin: string,
    customer: string,
    name = 'Oak Dining Table',
    quantity = 1,
    onHand = 10,
  ): Promise<{ variantId: string }> {
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
      .send({ variantId, quantity })
      .expect(201);
    return { variantId };
  }

  it('refuses every order route from an anonymous caller', async () => {
    const routes: readonly { method: Method; path: string }[] = [
      { method: 'get', path: ORDERS_ROUTE },
      { method: 'post', path: ORDERS_ROUTE },
      { method: 'get', path: ORDER_ROUTE.replace('{orderId}', UNKNOWN_ID) },
      { method: 'delete', path: ORDER_ROUTE.replace('{orderId}', UNKNOWN_ID) },
      { method: 'get', path: PRE_ORDERS_ROUTE },
      { method: 'post', path: PRE_ORDERS_ROUTE },
    ];

    for (const route of routes) {
      const agent = request(server);
      const builder =
        route.method === 'get'
          ? agent.get(route.path)
          : route.method === 'post'
            ? agent.post(route.path)
            : agent.delete(route.path);
      const response = await builder.expect(401);
      expect(bodyOf<ErrorBody>(response)).toMatchObject({
        statusCode: 401,
        code: 'UNAUTHENTICATED',
      });
      assertOperationalHeaders(response);
    }
  });

  it('refuses the order administration routes from a customer', async () => {
    const customer = await createCustomer('order-customer');

    const response = await request(server)
      .get(ADMIN_ORDERS_ROUTE)
      .set(bearer(customer))
      .expect(403);
    expect(bodyOf<ErrorBody>(response)).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('places an order with the exact figures the customer confirmed', async () => {
    const admin = await createAdministrator('order-admin');
    const customer = await createCustomer('order-customer');
    await readyCart(admin, customer, 'Oak Dining Table', 2);

    const quote = bodyOf<{ fingerprint: string }>(
      await request(server)
        .post(QUOTE_ROUTE)
        .set(bearer(customer))
        .send({ destinationCountryCode: 'EG' })
        .expect(201),
    );

    const response = await request(server)
      .post(ORDERS_ROUTE)
      .set(bearer(customer))
      .set('Idempotency-Key', 'e2e-order-key-one')
      .send({ destinationCountryCode: 'EG', expectedFingerprint: quote.fingerprint })
      .expect(201);

    const order = bodyOf<OrderBody>(response);
    assertMatchesContract('post', ORDERS_ROUTE, 201, order);
    assertOperationalHeaders(response);

    expect(order.status).toBe('PENDING_PAYMENT');
    expect(order.currency).toBe('EGP');
    expect(order.subtotalMinor).toBe(259800);
    expect(order.taxTotalMinor).toBe(36372);
    expect(order.totalMinor).toBe(296172);
    expect(order.subtotalMinor + order.taxTotalMinor).toBe(order.totalMinor);
    expect(order.quoteFingerprint).toBe(quote.fingerprint);
    expect(order.lines).toHaveLength(1);
    expect(order.lines[0]).toMatchObject({
      quantity: 2,
      unitPriceMinor: 129900,
      taxRateBasisPoints: 1400,
      netMinor: 259800,
      taxMinor: 36372,
      totalMinor: 296172,
    });
  });

  it('places the same order only once for a repeated idempotency key', async () => {
    const admin = await createAdministrator('order-admin');
    const customer = await createCustomer('order-customer');
    await readyCart(admin, customer);

    const first = bodyOf<OrderBody>(
      await request(server)
        .post(ORDERS_ROUTE)
        .set(bearer(customer))
        .set('Idempotency-Key', 'e2e-order-key-repeat')
        .send({ destinationCountryCode: 'EG', expectedFingerprint: null })
        .expect(201),
    );
    const second = bodyOf<OrderBody>(
      await request(server)
        .post(ORDERS_ROUTE)
        .set(bearer(customer))
        .set('Idempotency-Key', 'e2e-order-key-repeat')
        .send({ destinationCountryCode: 'EG', expectedFingerprint: null })
        .expect(201),
    );

    expect(second.id).toBe(first.id);
    expect(await database.prisma.order.count()).toBe(1);
    expect(await database.prisma.reservation.count()).toBe(1);
  });

  it('refuses an order without an idempotency key', async () => {
    const admin = await createAdministrator('order-admin');
    const customer = await createCustomer('order-customer');
    await readyCart(admin, customer);

    const response = await request(server)
      .post(ORDERS_ROUTE)
      .set(bearer(customer))
      .send({ destinationCountryCode: 'EG', expectedFingerprint: null })
      .expect(400);

    expect(bodyOf<ErrorBody>(response)).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(await database.prisma.order.count()).toBe(0);
  });

  it('refuses a client-supplied price or total', async () => {
    const admin = await createAdministrator('order-admin');
    const customer = await createCustomer('order-customer');
    await readyCart(admin, customer);

    const response = await request(server)
      .post(ORDERS_ROUTE)
      .set(bearer(customer))
      .set('Idempotency-Key', 'e2e-order-key-price')
      .send({ destinationCountryCode: 'EG', expectedFingerprint: null, totalMinor: 1 })
      .expect(400);

    expect(bodyOf<ErrorBody>(response)).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('refuses an order when the price changed after the confirmation', async () => {
    const admin = await createAdministrator('order-admin');
    const customer = await createCustomer('order-customer');
    await readyCart(admin, customer);

    const response = await request(server)
      .post(ORDERS_ROUTE)
      .set(bearer(customer))
      .set('Idempotency-Key', 'e2e-order-key-stale')
      .send({ destinationCountryCode: 'EG', expectedFingerprint: '0'.repeat(64) })
      .expect(409);

    expect(bodyOf<ErrorBody>(response)).toMatchObject({
      statusCode: 409,
      code: 'ORDER_QUOTE_CHANGED',
    });
    expect(await database.prisma.order.count()).toBe(0);
  });

  it('cancels an order and releases the held stock', async () => {
    const admin = await createAdministrator('order-admin');
    const customer = await createCustomer('order-customer');
    const { variantId } = await readyCart(admin, customer, 'Oak Dining Table', 2, 5);

    const order = bodyOf<OrderBody>(
      await request(server)
        .post(ORDERS_ROUTE)
        .set(bearer(customer))
        .set('Idempotency-Key', 'e2e-order-key-cancel')
        .send({ destinationCountryCode: 'EG', expectedFingerprint: null })
        .expect(201),
    );
    expect(order.reservationId).not.toBeNull();

    const cancelled = bodyOf<OrderBody>(
      await request(server)
        .delete(ORDER_ROUTE.replace('{orderId}', order.id))
        .set(bearer(customer))
        .expect(200),
    );
    assertMatchesContract('delete', ORDER_ROUTE, 200, cancelled);

    expect(cancelled.status).toBe('CANCELLED');
    const item = await database.prisma.inventoryItem.findFirst({
      where: { variantId },
      select: { onHand: true, reserved: true },
    });
    expect(item?.onHand).toBe(5);
    expect(item?.reserved).toBe(0);
  });

  it('never shows a customer another customer order', async () => {
    const admin = await createAdministrator('order-admin');
    const first = await createCustomer('order-customer-one');
    const second = await createCustomer('order-customer-two');
    await readyCart(admin, first);

    const order = bodyOf<OrderBody>(
      await request(server)
        .post(ORDERS_ROUTE)
        .set(bearer(first))
        .set('Idempotency-Key', 'e2e-order-key-boundary')
        .send({ destinationCountryCode: 'EG', expectedFingerprint: null })
        .expect(201),
    );

    const theirs = bodyOf<OrdersBody>(
      await request(server).get(ORDERS_ROUTE).set(bearer(second)).expect(200),
    );
    expect(theirs.orders).toEqual([]);

    const mine = bodyOf<OrdersBody>(
      await request(server).get(ORDERS_ROUTE).set(bearer(first)).expect(200),
    );
    expect(mine.orders.map((entry) => entry.id)).toEqual([order.id]);

    // Another customer's order is answered exactly like one that never existed.
    const foreign = await request(server)
      .get(ORDER_ROUTE.replace('{orderId}', order.id))
      .set(bearer(second))
      .expect(404);
    expect(bodyOf<ErrorBody>(foreign)).toMatchObject({
      statusCode: 404,
      code: 'ORDER_NOT_FOUND',
    });
  });

  it('records a pre-order without charging and without holding stock', async () => {
    const admin = await createAdministrator('order-admin');
    const customer = await createCustomer('order-customer');
    await readyCart(admin, customer);

    const response = await request(server)
      .post(PRE_ORDERS_ROUTE)
      .set(bearer(customer))
      .send({ destinationCountryCode: 'EG' })
      .expect(201);

    const preOrder = bodyOf<PreOrderBody>(response);
    assertMatchesContract('post', PRE_ORDERS_ROUTE, 201, preOrder);
    assertOperationalHeaders(response);

    expect(preOrder.status).toBe('AWAITING_STOCK');
    expect(preOrder.totalMinor).toBe(148086);
    expect(preOrder.reservationId).toBeNull();
    expect(await database.prisma.reservation.count()).toBe(0);
  });

  it('cancels a pre-order', async () => {
    const admin = await createAdministrator('order-admin');
    const customer = await createCustomer('order-customer');
    await readyCart(admin, customer);

    const preOrder = bodyOf<PreOrderBody>(
      await request(server)
        .post(PRE_ORDERS_ROUTE)
        .set(bearer(customer))
        .send({ destinationCountryCode: 'EG' })
        .expect(201),
    );
    const cancelled = bodyOf<PreOrderBody>(
      await request(server)
        .delete(PRE_ORDER_ROUTE.replace('{preOrderId}', preOrder.id))
        .set(bearer(customer))
        .expect(200),
    );

    expect(cancelled.status).toBe('CANCELLED');
  });

  it('shows the order to an administrator', async () => {
    const admin = await createAdministrator('order-admin');
    const customer = await createCustomer('order-customer');
    await readyCart(admin, customer);

    const order = bodyOf<OrderBody>(
      await request(server)
        .post(ORDERS_ROUTE)
        .set(bearer(customer))
        .set('Idempotency-Key', 'e2e-order-key-admin')
        .send({ destinationCountryCode: 'EG', expectedFingerprint: null })
        .expect(201),
    );

    const listed = bodyOf<OrdersBody>(
      await request(server).get(ADMIN_ORDERS_ROUTE).set(bearer(admin)).expect(200),
    );
    expect(listed.orders.map((entry) => entry.id)).toContain(order.id);

    const read = bodyOf<OrderBody>(
      await request(server)
        .get(ADMIN_ORDER_ROUTE.replace('{orderId}', order.id))
        .set(bearer(admin))
        .expect(200),
    );
    expect(read.id).toBe(order.id);
  });
  it('authorizes pre-order conversion before creating one payable order with the existing hold', async () => {
    const admin = await createAdministrator('conversion-admin');
    const customer = await createCustomer('conversion-customer');
    const other = await createCustomer('conversion-other');
    await readyCart(admin, customer);
    const intent = bodyOf<PreOrderBody>(
      await request(server)
        .post(PRE_ORDERS_ROUTE)
        .set(bearer(customer))
        .send({ destinationCountryCode: 'EG' })
        .expect(201),
    );
    const template = '/api/v1/orders/pre-orders/{preOrderId}/convert';
    const route = template.replace('{preOrderId}', intent.id);
    await request(server).post(route).send({ expectedFingerprint: null }).expect(401);
    await request(server)
      .post(route)
      .set(bearer(admin))
      .send({ expectedFingerprint: null })
      .expect(403);
    await request(server)
      .post(route)
      .set(bearer(other))
      .send({ expectedFingerprint: null })
      .expect(404);
    expect(await database.prisma.reservation.count()).toBe(0);
    const response = await request(server)
      .post(route)
      .set(bearer(customer))
      .send({ expectedFingerprint: null })
      .expect(201);
    const order = bodyOf<OrderBody>(response);
    assertMatchesContract('post', template, 201, order);
    assertOperationalHeaders(response);
    expect(order.status).toBe('PENDING_PAYMENT');
    expect(order.reservationId).not.toBeNull();
    const retried = bodyOf<OrderBody>(
      await request(server)
        .post(route)
        .set(bearer(customer))
        .send({ expectedFingerprint: null })
        .expect(201),
    );
    expect(retried.id).toBe(order.id);
    expect(await database.prisma.order.count()).toBe(1);
    expect(await database.prisma.reservation.count()).toBe(1);
    expect(await database.prisma.paymentAttempt.count()).toBe(0);
  });
});
