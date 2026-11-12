import { resetNotificationDatabase } from '../helpers/notification-database';
import { createHmac } from 'node:crypto';
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
import { resetPaymentDatabase } from '../helpers/payment-database';
import { resetShippingDatabase } from '../helpers/shipping-database';
import { testConfigurationFor } from '../helpers/test-configuration';

const CONFIGURATION = testConfigurationFor('e2e');
const CORRELATION_ID = '9c3d8e3f-9f5a-4c0d-9e2f-3a4b5c6d7e8f';

const CUSTOMER_PASSWORD = 'Shipping-Customer-Passphrase-1';
const ADMIN_PASSWORD = 'Shipping-Administrator-Passphrase-2';

const OPTIONS_ROUTE = '/api/v1/shipping/options';
const SHIPMENTS_ROUTE = '/api/v1/shipments';
const SHIPMENT_ROUTE = '/api/v1/shipments/{shipmentId}';
const RETURNS_ROUTE = '/api/v1/returns';
const RETURN_ROUTE = '/api/v1/returns/{returnId}';
const ADMIN_DESTINATIONS_ROUTE = '/api/v1/admin/shipping/destinations';
const ADMIN_DESTINATION_ROUTE = '/api/v1/admin/shipping/destinations/{countryCode}';
const ADMIN_METHODS_ROUTE = '/api/v1/admin/shipping/methods';
const ADMIN_METHOD_ROUTE = '/api/v1/admin/shipping/methods/{code}';
const ADMIN_SHIPMENTS_ROUTE = '/api/v1/admin/shipments';
const ADMIN_SHIPMENT_ROUTE = '/api/v1/admin/shipments/{shipmentId}';
const ADMIN_SHIPMENT_TRACKING_ROUTE = '/api/v1/admin/shipments/{shipmentId}/tracking';
const ADMIN_RETURNS_ROUTE = '/api/v1/admin/returns';
const ADMIN_RETURN_ROUTE = '/api/v1/admin/returns/{returnId}';
const ADMIN_RETURN_DECISION_ROUTE = '/api/v1/admin/returns/{returnId}/decision';
const ADMIN_RETURN_RECEIPT_ROUTE = '/api/v1/admin/returns/{returnId}/receipt';
const CART_ITEMS_ROUTE = '/api/v1/cart/items';
const ORDERS_ROUTE = '/api/v1/orders';
const PAYMENT_ATTEMPTS_ROUTE = '/api/v1/payments/attempts';
const WEBHOOK_ROUTE = '/api/v1/payments/webhooks/LOCAL_TEST';
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
type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

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

interface ShippingOptionBody {
  code: string;
  label: string;
  amountMinor: number;
  currency: string;
  destinationCountryCode: string | null;
}

interface ShipmentBody {
  id: string;
  orderId: string;
  status: string;
  methodCode: string;
  amountMinor: number;
  currency: string;
  trackingReference: string | null;
  carrierCode: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  lines: { orderLineId: string; quantity: number }[];
}

interface ReturnBody {
  id: string;
  orderId: string;
  status: string;
  reasonCode: string;
  totalMinor: number;
  currency: string;
  refundId: string | null;
  refundStatus: string | null;
  lines: { id: string; orderLineId: string; quantity: number; restocked: boolean }[];
}

interface OrderBody {
  id: string;
  status: string;
  totalMinor: number;
  currency: string;
  lines: { id: string; quantity: number }[];
}

interface PaymentAttemptBody {
  id: string;
  orderId: string;
  amountMinor: number;
  currency: string;
  providerReference: string | null;
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

describe('shipping and returns HTTP contract', () => {
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
    await resetNotificationDatabase(database);
    await resetShippingDatabase(database);
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

  /** Configures the shipping destination and one method with an administrator's own amount. */
  async function configureShipping(admin: string): Promise<void> {
    await request(server)
      .put(ADMIN_DESTINATION_ROUTE.replace('{countryCode}', 'EG'))
      .set(bearer(admin))
      .send({ enabled: true, label: 'Egypt', carrierCode: null })
      .expect(200);
    await request(server)
      .put(ADMIN_METHOD_ROUTE.replace('{code}', 'STANDARD'))
      .set(bearer(admin))
      .send({
        label: 'Standard delivery',
        destinationCountryCode: 'EG',
        amountMinor: 5000,
        currency: 'EGP',
        active: true,
      })
      .expect(200);
  }

  /** A paid order with one line. */
  async function paidOrder(
    admin: string,
    customer: string,
  ): Promise<{ orderId: string; orderLineId: string; totalMinor: number }> {
    const category = bodyOf<{ id: string }>(
      await request(server)
        .post(ADMIN_CATEGORIES_ROUTE)
        .set(bearer(admin))
        .send({ name: 'Category Shipping' })
        .expect(201),
    );
    const brand = bodyOf<{ id: string }>(
      await request(server)
        .post(ADMIN_BRANDS_ROUTE)
        .set(bearer(admin))
        .send({ name: 'Brand Shipping' })
        .expect(201),
    );
    const product = bodyOf<{ id: string }>(
      await request(server)
        .post(ADMIN_PRODUCTS_ROUTE)
        .set(bearer(admin))
        .send({
          name: 'Shipping Table',
          description: 'A table that ships.',
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
        .send({ sku: 'SKU-Shipping-Table' })
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
      .send({ variantId: variant.id, quantity: 2 })
      .expect(201);
    const order = bodyOf<OrderBody>(
      await request(server)
        .post(ORDERS_ROUTE)
        .set(bearer(customer))
        .set('Idempotency-Key', 'e2e-shipping-order-key')
        .send({ destinationCountryCode: 'EG', expectedFingerprint: null })
        .expect(201),
    );
    const attempt = bodyOf<PaymentAttemptBody>(
      await request(server)
        .post(PAYMENT_ATTEMPTS_ROUTE)
        .set(bearer(customer))
        .set('Idempotency-Key', 'e2e-shipping-attempt-key')
        .send({ orderId: order.id })
        .expect(201),
    );

    const headers: Record<string, string> = {
      'x-local-test-event-id': 'e2e-shipping-payment-event',
      'x-local-test-event-type': 'payment.succeeded',
      'x-local-test-order-id': order.id,
      'x-local-test-provider-reference': attempt.providerReference ?? '',
      'x-local-test-amount-minor': String(order.totalMinor),
      'x-local-test-currency': 'EGP',
      'x-local-test-occurred-at': new Date().toISOString(),
    };
    const raw = JSON.stringify({ reference: 'shipping' });
    await request(server)
      .post(WEBHOOK_ROUTE)
      .set(headers)
      .set('x-local-test-signature', localTestSignature(raw, headers))
      .set('Content-Type', 'application/json')
      .send(raw)
      .expect(200);

    const line = order.lines[0];
    if (line === undefined) throw new Error('The order has no line');
    return { orderId: order.id, orderLineId: line.id, totalMinor: order.totalMinor };
  }

  it('lists the configured shipping options without a credential', async () => {
    const admin = await createAdministrator('shipping-options-admin');
    await configureShipping(admin);

    const response = await request(server)
      .get(`${OPTIONS_ROUTE}?destinationCountryCode=EG`)
      .expect(200);
    const body = bodyOf<{ options: ShippingOptionBody[] }>(response);
    assertMatchesContract('get', OPTIONS_ROUTE, 200, body);
    assertOperationalHeaders(response);
    expect(body).toMatchObject({ environment: 'TEST', chargeCollected: false });
    expect(body.options).toEqual([
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
    const response = await request(server)
      .get(`${OPTIONS_ROUTE}?destinationCountryCode=US`)
      .expect(200);
    expect(bodyOf<{ options: ShippingOptionBody[] }>(response).options).toEqual([]);
  });

  it('refuses the shipping administration routes from a customer', async () => {
    const customer = await createCustomer('shipping-customer');
    const response = await request(server)
      .get(ADMIN_SHIPMENTS_ROUTE)
      .set(bearer(customer))
      .expect(403);
    expect(bodyOf<ErrorBody>(response)).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('refuses the customer shipment and return routes from an administrator', async () => {
    const admin = await createAdministrator('shipping-admin-role');
    const response = await request(server).get(SHIPMENTS_ROUTE).set(bearer(admin)).expect(403);
    expect(bodyOf<ErrorBody>(response)).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('refuses the customer shipment and return routes from an anonymous caller', async () => {
    for (const route of [SHIPMENTS_ROUTE, RETURNS_ROUTE]) {
      const response = await request(server).get(route).expect(401);
      expect(bodyOf<ErrorBody>(response)).toMatchObject({
        statusCode: 401,
        code: 'UNAUTHENTICATED',
      });
      assertOperationalHeaders(response);
    }
  });

  it('walks a shipment through its lifecycle and returns the goods', async () => {
    const admin = await createAdministrator('shipping-flow-admin');
    const customer = await createCustomer('shipping-flow-customer');
    await configureShipping(admin);
    const { orderId, orderLineId } = await paidOrder(admin, customer);

    const created = bodyOf<ShipmentBody>(
      await request(server)
        .post(ADMIN_SHIPMENTS_ROUTE)
        .set(bearer(admin))
        .send({ orderId, methodCode: 'STANDARD' })
        .expect(201),
    );
    assertMatchesContract('post', ADMIN_SHIPMENTS_ROUTE, 201, created);
    expect(created.status).toBe('PREPARED');
    expect(created.amountMinor).toBe(5000);

    const tracked = bodyOf<ShipmentBody>(
      await request(server)
        .put(ADMIN_SHIPMENT_TRACKING_ROUTE.replace('{shipmentId}', created.id))
        .set(bearer(admin))
        .send({ trackingReference: 'TRACK-42' })
        .expect(200),
    );
    expect(tracked.trackingReference).toBe('TRACK-42');

    const packed = bodyOf<ShipmentBody>(
      await request(server)
        .patch(ADMIN_SHIPMENT_ROUTE.replace('{shipmentId}', created.id))
        .set(bearer(admin))
        .send({ to: 'PACKED', reason: null })
        .expect(200),
    );
    expect(packed.status).toBe('PACKED');

    const refused = await request(server)
      .patch(ADMIN_SHIPMENT_ROUTE.replace('{shipmentId}', created.id))
      .set(bearer(admin))
      .send({ to: 'DELIVERED', reason: null })
      .expect(409);
    expect(bodyOf<ErrorBody>(refused)).toMatchObject({
      statusCode: 409,
      code: 'SHIPMENT_NOT_TRANSITIONABLE',
    });

    const customerView = bodyOf<ShipmentBody>(
      await request(server)
        .get(SHIPMENT_ROUTE.replace('{shipmentId}', created.id))
        .set(bearer(customer))
        .expect(200),
    );
    expect(customerView.status).toBe('PACKED');

    const requested = bodyOf<ReturnBody>(
      await request(server)
        .post(RETURNS_ROUTE)
        .set(bearer(customer))
        .send({ orderId, reasonCode: 'DAMAGED', lines: [{ orderLineId, quantity: 1 }] })
        .expect(201),
    );
    assertMatchesContract('post', RETURNS_ROUTE, 201, requested);
    expect(requested.status).toBe('REQUESTED');
    expect(requested.refundId).toBeNull();

    const approved = bodyOf<ReturnBody>(
      await request(server)
        .post(ADMIN_RETURN_DECISION_ROUTE.replace('{returnId}', requested.id))
        .set(bearer(admin))
        .send({ decision: 'APPROVED', reason: null })
        .expect(200),
    );
    expect(approved.status).toBe('APPROVED');

    const lineId = approved.lines[0]?.id ?? '';
    const received = bodyOf<ReturnBody>(
      await request(server)
        .post(ADMIN_RETURN_RECEIPT_ROUTE.replace('{returnId}', requested.id))
        .set(bearer(admin))
        .send({ restockLineIds: [lineId], refund: true })
        .expect(200),
    );
    expect(received.status).toBe('REFUNDED');
    expect(received.refundStatus).toBe('COMPLETED');
    expect(received.lines[0]?.restocked).toBe(true);

    const repeated = bodyOf<ReturnBody>(
      await request(server)
        .post(ADMIN_RETURN_RECEIPT_ROUTE.replace('{returnId}', requested.id))
        .set(bearer(admin))
        .send({ restockLineIds: [lineId], refund: true })
        .expect(200),
    );
    expect(repeated.status).toBe('REFUNDED');
    expect(await database.prisma.refund.count()).toBe(1);
  });

  it('shows the administrator the configured destinations, methods, and returns', async () => {
    const admin = await createAdministrator('shipping-visibility-admin');
    const customer = await createCustomer('shipping-visibility-customer');
    await configureShipping(admin);

    const destinations = bodyOf<{ destinations: { countryCode: string }[] }>(
      await request(server).get(ADMIN_DESTINATIONS_ROUTE).set(bearer(admin)).expect(200),
    );
    expect(destinations.destinations.map((item) => item.countryCode)).toEqual(['EG']);

    const methods = bodyOf<{ methods: { code: string; amountMinor: number }[] }>(
      await request(server).get(ADMIN_METHODS_ROUTE).set(bearer(admin)).expect(200),
    );
    expect(methods.methods).toEqual([
      expect.objectContaining({ code: 'STANDARD', amountMinor: 5000 }),
    ]);

    const { orderId, orderLineId } = await paidOrder(admin, customer);
    const requested = bodyOf<ReturnBody>(
      await request(server)
        .post(RETURNS_ROUTE)
        .set(bearer(customer))
        .send({ orderId, reasonCode: 'DAMAGED', lines: [{ orderLineId, quantity: 1 }] })
        .expect(201),
    );

    const returns = bodyOf<{ returns: { id: string }[] }>(
      await request(server).get(ADMIN_RETURNS_ROUTE).set(bearer(admin)).expect(200),
    );
    expect(returns.returns.map((item) => item.id)).toContain(requested.id);

    const read = bodyOf<ReturnBody>(
      await request(server)
        .get(ADMIN_RETURN_ROUTE.replace('{returnId}', requested.id))
        .set(bearer(admin))
        .expect(200),
    );
    expect(read.id).toBe(requested.id);
  });

  it('hides another customer shipment and return', async () => {
    const admin = await createAdministrator('shipping-boundary-admin');
    const owner = await createCustomer('shipping-boundary-owner');
    const stranger = await createCustomer('shipping-boundary-stranger');
    await configureShipping(admin);
    const { orderId, orderLineId } = await paidOrder(admin, owner);

    const created = bodyOf<ShipmentBody>(
      await request(server)
        .post(ADMIN_SHIPMENTS_ROUTE)
        .set(bearer(admin))
        .send({ orderId, methodCode: 'STANDARD' })
        .expect(201),
    );
    const requested = bodyOf<ReturnBody>(
      await request(server)
        .post(RETURNS_ROUTE)
        .set(bearer(owner))
        .send({ orderId, reasonCode: 'DAMAGED', lines: [{ orderLineId, quantity: 1 }] })
        .expect(201),
    );

    await request(server)
      .get(SHIPMENT_ROUTE.replace('{shipmentId}', created.id))
      .set(bearer(stranger))
      .expect(404);
    await request(server)
      .get(RETURN_ROUTE.replace('{returnId}', requested.id))
      .set(bearer(stranger))
      .expect(404);
  });
});
