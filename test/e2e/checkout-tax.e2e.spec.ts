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
import { resetCustomerDatabase } from '../helpers/customer-database';
import { resetIdentityDatabase } from '../helpers/identity-database';
import { resetInventoryDatabase } from '../helpers/inventory-database';
import { testConfigurationFor } from '../helpers/test-configuration';

const CONFIGURATION = testConfigurationFor('e2e');
const CORRELATION_ID = '8b2c7d2e-8e4f-4b9c-9d1e-2f3a4b5c6d8e';

const CUSTOMER_PASSWORD = 'Checkout-Customer-Passphrase-1';
const ADMIN_PASSWORD = 'Checkout-Administrator-Passphrase-2';

const CART_ITEMS_ROUTE = '/api/v1/cart/items';
const QUOTE_ROUTE = '/api/v1/checkout/quotes';
const ADMIN_TAX_RULES_ROUTE = '/api/v1/admin/tax/rules';
const ADMIN_TAX_CLASSIFICATION_ROUTE = '/api/v1/admin/tax/products/{productId}/classification';
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

interface CartLineBody {
  id: string;
  targetKind: string;
  variantId: string | null;
  bundleId: string | null;
  sku: string;
  productId: string;
  quantity: number;
  currentUnitPriceMinor: number;
  currentUnitCurrency: string;
  priceChanged: boolean;
  purchasable: boolean;
}

interface CartBody {
  lines: CartLineBody[];
  updatedAt: string;
}

interface QuoteBlockerBody {
  code: string;
  lineId?: string;
  sku?: string;
}

interface QuoteLineBody {
  lineId: string;
  targetKind: string;
  variantId: string | null;
  bundleId: string | null;
  sku: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPriceMinor: number;
  unitCurrency: string;
  priceChanged: boolean;
  taxClassification: string;
  taxRuleId: string | null;
  taxRateBasisPoints: number;
  taxInclusive: boolean;
  netMinor: number;
  taxMinor: number;
  totalMinor: number;
}

interface QuoteBody {
  currency: string;
  destinationCountryCode: string;
  taxJurisdiction: string;
  ready: boolean;
  blockers: QuoteBlockerBody[];
  lines: QuoteLineBody[];
  netSubtotalMinor: number;
  taxTotalMinor: number;
  totalMinor: number;
  roundingRule: string;
  fingerprint: string;
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

describe('checkout and tax HTTP contract', () => {
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
    await resetCustomerDatabase(database);
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
    baseCurrency = 'EGP',
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
          baseCurrency,
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

  async function approveEgypt(admin: string): Promise<void> {
    await request(server)
      .put(`${ADMIN_DESTINATIONS_ROUTE}/EG`)
      .set(bearer(admin))
      .send({
        enabled: true,
        taxJurisdiction: 'EG',
        shippingApproved: true,
        label: 'Egypt',
      })
      .expect(200);
  }

  async function configureStandardTax(admin: string, rateBasisPoints = 1400): Promise<void> {
    await request(server)
      .post(ADMIN_TAX_RULES_ROUTE)
      .set(bearer(admin))
      .send({
        jurisdiction: 'EG',
        classification: 'STANDARD',
        rateBasisPoints,
        taxInclusive: false,
        effectiveFrom: '2026-01-01T00:00:00.000Z',
        effectiveTo: null,
        priority: 0,
      })
      .expect(201);
  }

  it('refuses the quote route from an anonymous caller', async () => {
    const response = await request(server).post(QUOTE_ROUTE).send({ destinationCountryCode: 'EG' });

    expect(response.status).toBe(401);
    expect(bodyOf<ErrorBody>(response)).toMatchObject({
      statusCode: 401,
      code: 'UNAUTHENTICATED',
    });
    assertOperationalHeaders(response);
  });

  it('refuses the tax and destination administration routes from a customer', async () => {
    const customer = await createCustomer('checkout-customer');

    const taxRules = await request(server)
      .get(ADMIN_TAX_RULES_ROUTE)
      .set(bearer(customer))
      .expect(403);
    expect(bodyOf<ErrorBody>(taxRules)).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });

    const destinations = await request(server)
      .get(ADMIN_DESTINATIONS_ROUTE)
      .set(bearer(customer))
      .expect(403);
    expect(bodyOf<ErrorBody>(destinations)).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
  });

  it('refuses a malformed destination', async () => {
    const customer = await createCustomer('checkout-customer');

    const response = await request(server)
      .post(QUOTE_ROUTE)
      .set(bearer(customer))
      .send({ destinationCountryCode: 'EGYPT' })
      .expect(400);

    expect(bodyOf<ErrorBody>(response)).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
  });

  it('quotes a cart with an exact subtotal, tax, and total', async () => {
    const admin = await createAdministrator('checkout-admin');
    const customer = await createCustomer('checkout-customer');
    const { variantId } = await seedProduct(admin, 'Oak Dining Table');
    await approveEgypt(admin);
    await configureStandardTax(admin, 1400);
    await request(server)
      .put(ADMIN_STOCK_ROUTE.replace('{variantId}', variantId))
      .set(bearer(admin))
      .send({ onHand: 10, reason: 'E2E fixture' })
      .expect(200);
    await request(server)
      .post(CART_ITEMS_ROUTE)
      .set(bearer(customer))
      .send({ variantId, quantity: 2 })
      .expect(201);

    const response = await request(server)
      .post(QUOTE_ROUTE)
      .set(bearer(customer))
      .send({ destinationCountryCode: 'EG' })
      .expect(201);

    const quote = bodyOf<QuoteBody>(response);
    assertMatchesContract('post', QUOTE_ROUTE, 201, quote);
    assertOperationalHeaders(response);

    expect(quote.ready).toBe(true);
    expect(quote.blockers).toEqual([]);
    expect(quote.currency).toBe('EGP');
    expect(quote.netSubtotalMinor).toBe(259800);
    expect(quote.taxTotalMinor).toBe(36372);
    expect(quote.totalMinor).toBe(296172);
    expect(quote.netSubtotalMinor + quote.taxTotalMinor).toBe(quote.totalMinor);
    expect(quote.roundingRule).toBe('half-up-per-line');
    expect(quote.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(quote.lines[0]).toMatchObject({
      variantId,
      quantity: 2,
      unitPriceMinor: 129900,
      taxRateBasisPoints: 1400,
      taxInclusive: false,
      netMinor: 259800,
      taxMinor: 36372,
      totalMinor: 296172,
    });
  });

  it('quotes the same cart identically twice', async () => {
    const admin = await createAdministrator('checkout-admin');
    const customer = await createCustomer('checkout-customer');
    const { variantId } = await seedProduct(admin, 'Oak Dining Table');
    await approveEgypt(admin);
    await configureStandardTax(admin, 1400);
    await request(server)
      .put(ADMIN_STOCK_ROUTE.replace('{variantId}', variantId))
      .set(bearer(admin))
      .send({ onHand: 10, reason: 'E2E fixture' })
      .expect(200);
    await request(server)
      .post(CART_ITEMS_ROUTE)
      .set(bearer(customer))
      .send({ variantId, quantity: 1 })
      .expect(201);

    const first = bodyOf<QuoteBody>(
      await request(server)
        .post(QUOTE_ROUTE)
        .set(bearer(customer))
        .send({ destinationCountryCode: 'EG' })
        .expect(201),
    );
    const second = bodyOf<QuoteBody>(
      await request(server)
        .post(QUOTE_ROUTE)
        .set(bearer(customer))
        .send({ destinationCountryCode: 'EG' })
        .expect(201),
    );

    expect(second.totalMinor).toBe(first.totalMinor);
    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it('reports an empty cart as not ready', async () => {
    const admin = await createAdministrator('checkout-admin');
    const customer = await createCustomer('checkout-customer');
    await approveEgypt(admin);
    await configureStandardTax(admin, 1400);

    const quote = bodyOf<QuoteBody>(
      await request(server)
        .post(QUOTE_ROUTE)
        .set(bearer(customer))
        .send({ destinationCountryCode: 'EG' })
        .expect(201),
    );

    expect(quote.ready).toBe(false);
    expect(quote.blockers.map((blocker) => blocker.code)).toContain('CART_EMPTY');
  });

  it('reports an unsupported destination as not ready', async () => {
    const admin = await createAdministrator('checkout-admin');
    const customer = await createCustomer('checkout-customer');
    const { variantId } = await seedProduct(admin, 'Oak Dining Table');
    await configureStandardTax(admin, 1400);
    await request(server)
      .put(ADMIN_STOCK_ROUTE.replace('{variantId}', variantId))
      .set(bearer(admin))
      .send({ onHand: 10, reason: 'E2E fixture' })
      .expect(200);
    await request(server)
      .post(CART_ITEMS_ROUTE)
      .set(bearer(customer))
      .send({ variantId, quantity: 1 })
      .expect(201);

    const quote = bodyOf<QuoteBody>(
      await request(server)
        .post(QUOTE_ROUTE)
        .set(bearer(customer))
        .send({ destinationCountryCode: 'US' })
        .expect(201),
    );

    expect(quote.ready).toBe(false);
    expect(quote.blockers.map((blocker) => blocker.code)).toContain('DESTINATION_NOT_SUPPORTED');
  });

  it('reports a missing tax rule as not ready and never assumes a zero rate', async () => {
    const admin = await createAdministrator('checkout-admin');
    const customer = await createCustomer('checkout-customer');
    const { variantId } = await seedProduct(admin, 'Oak Dining Table');
    await approveEgypt(admin);
    await request(server)
      .put(ADMIN_STOCK_ROUTE.replace('{variantId}', variantId))
      .set(bearer(admin))
      .send({ onHand: 10, reason: 'E2E fixture' })
      .expect(200);
    await request(server)
      .post(CART_ITEMS_ROUTE)
      .set(bearer(customer))
      .send({ variantId, quantity: 1 })
      .expect(201);

    const quote = bodyOf<QuoteBody>(
      await request(server)
        .post(QUOTE_ROUTE)
        .set(bearer(customer))
        .send({ destinationCountryCode: 'EG' })
        .expect(201),
    );

    expect(quote.ready).toBe(false);
    expect(quote.blockers.map((blocker) => blocker.code)).toContain('TAX_RULE_MISSING');
  });

  it('reports insufficient stock as not ready', async () => {
    const admin = await createAdministrator('checkout-admin');
    const customer = await createCustomer('checkout-customer');
    const { variantId } = await seedProduct(admin, 'Oak Dining Table');
    await approveEgypt(admin);
    await configureStandardTax(admin, 1400);
    await request(server)
      .put(ADMIN_STOCK_ROUTE.replace('{variantId}', variantId))
      .set(bearer(admin))
      .send({ onHand: 1, reason: 'E2E fixture' })
      .expect(200);
    await request(server)
      .post(CART_ITEMS_ROUTE)
      .set(bearer(customer))
      .send({ variantId, quantity: 5 })
      .expect(201);

    const quote = bodyOf<QuoteBody>(
      await request(server)
        .post(QUOTE_ROUTE)
        .set(bearer(customer))
        .send({ destinationCountryCode: 'EG' })
        .expect(201),
    );

    expect(quote.ready).toBe(false);
    expect(quote.blockers.map((blocker) => blocker.code)).toContain('INSUFFICIENT_STOCK');
  });

  it('ignores a price the customer submitted and prices at the current price', async () => {
    const admin = await createAdministrator('checkout-admin');
    const customer = await createCustomer('checkout-customer');
    const { variantId } = await seedProduct(admin, 'Oak Dining Table');
    await approveEgypt(admin);
    await configureStandardTax(admin, 1400);
    await request(server)
      .put(ADMIN_STOCK_ROUTE.replace('{variantId}', variantId))
      .set(bearer(admin))
      .send({ onHand: 10, reason: 'E2E fixture' })
      .expect(200);
    await request(server)
      .post(CART_ITEMS_ROUTE)
      .set(bearer(customer))
      .send({ variantId, quantity: 1 })
      .expect(201);

    // The request carries a total and a unit price; both are refused by the strict schema, and the
    // quote's own figures are the only ones that count.
    const rejected = await request(server)
      .post(QUOTE_ROUTE)
      .set(bearer(customer))
      .send({ destinationCountryCode: 'EG', totalMinor: 1, unitPriceMinor: 1 })
      .expect(400);
    expect(bodyOf<ErrorBody>(rejected)).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });

    const quote = bodyOf<QuoteBody>(
      await request(server)
        .post(QUOTE_ROUTE)
        .set(bearer(customer))
        .send({ destinationCountryCode: 'EG' })
        .expect(201),
    );
    expect(quote.totalMinor).toBe(148086);
  });

  it('never quotes another customer cart', async () => {
    const admin = await createAdministrator('checkout-admin');
    const first = await createCustomer('checkout-customer-one');
    const second = await createCustomer('checkout-customer-two');
    const { variantId } = await seedProduct(admin, 'Oak Dining Table');
    await approveEgypt(admin);
    await configureStandardTax(admin, 1400);
    await request(server)
      .put(ADMIN_STOCK_ROUTE.replace('{variantId}', variantId))
      .set(bearer(admin))
      .send({ onHand: 10, reason: 'E2E fixture' })
      .expect(200);
    await request(server)
      .post(CART_ITEMS_ROUTE)
      .set(bearer(first))
      .send({ variantId, quantity: 1 })
      .expect(201);

    const quote = bodyOf<QuoteBody>(
      await request(server)
        .post(QUOTE_ROUTE)
        .set(bearer(second))
        .send({ destinationCountryCode: 'EG' })
        .expect(201),
    );

    expect(quote.lines).toEqual([]);
    expect(quote.blockers.map((blocker) => blocker.code)).toContain('CART_EMPTY');
  });

  it('manages the tax configuration and the checkout destinations', async () => {
    const admin = await createAdministrator('checkout-admin');

    const created = await request(server)
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
    assertMatchesContract('post', ADMIN_TAX_RULES_ROUTE, 201, created.body);
    const taxActor = await database.prisma.user.findFirstOrThrow({ where: { role: 'ADMIN' } });
    const attributedRule = await database.prisma.taxRule.findFirstOrThrow();
    expect(attributedRule.createdByUserId).toBe(taxActor.id);
    expect(attributedRule.updatedByUserId).toBe(taxActor.id);
    expect(attributedRule.environment).toBe('TEST');

    const duplicate = await request(server)
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
      .expect(409);
    expect(bodyOf<ErrorBody>(duplicate)).toMatchObject({
      statusCode: 409,
      code: 'TAX_RULE_CONFLICT',
    });

    const { productId } = await seedProduct(admin, 'Oak Dining Table');
    const classified = await request(server)
      .put(ADMIN_TAX_CLASSIFICATION_ROUTE.replace('{productId}', productId))
      .set(bearer(admin))
      .send({ classification: 'REDUCED' })
      .expect(204);
    // A no-content response carries no body, so there is no JSON schema to validate against.
    expect(classified.body).toEqual({});
    assertOperationalHeaders(classified);

    const destination = await request(server)
      .put(`${ADMIN_DESTINATIONS_ROUTE}/EG`)
      .set(bearer(admin))
      .send({
        enabled: true,
        taxJurisdiction: 'EG',
        shippingApproved: true,
        label: 'Egypt',
      })
      .expect(200);
    assertMatchesContract(
      'put',
      `${ADMIN_DESTINATIONS_ROUTE}/{countryCode}`,
      200,
      destination.body,
    );

    const destinations = bodyOf<{ destinations: { countryCode: string }[] }>(
      await request(server).get(ADMIN_DESTINATIONS_ROUTE).set(bearer(admin)).expect(200),
    );
    expect(destinations.destinations.map((entry) => entry.countryCode)).toEqual(['EG']);
    await request(server)
      .delete(ADMIN_TAX_CLASSIFICATION_ROUTE.replace('{productId}', productId))
      .set(bearer(admin))
      .expect(204);
    await request(server)
      .delete(ADMIN_TAX_RULES_ROUTE + '/' + attributedRule.id)
      .set(bearer(admin))
      .expect(204);
    const taxFacts = await database.prisma.taxConfigurationEvent.findMany();
    expect(taxFacts).toHaveLength(4);
    expect(taxFacts.every((fact) => fact.actorUserId === taxActor.id)).toBe(true);
    expect(taxFacts.find((fact) => fact.action === 'DELETE')).toMatchObject({
      before: { id: attributedRule.id },
      after: null,
    });
    const destinationFacts = await database.prisma.checkoutConfigurationEvent.findMany();
    expect(destinationFacts).toHaveLength(1);
    expect(destinationFacts[0]).toMatchObject({
      actorUserId: taxActor.id,
      action: 'CREATE',
      before: null,
      after: { countryCode: 'EG', environment: 'TEST' },
    });
  });

  it('reserves no stock and creates no order when it quotes', async () => {
    const admin = await createAdministrator('checkout-admin');
    const customer = await createCustomer('checkout-customer');
    const { variantId } = await seedProduct(admin, 'Oak Dining Table');
    await approveEgypt(admin);
    await configureStandardTax(admin, 1400);
    await request(server)
      .put(ADMIN_STOCK_ROUTE.replace('{variantId}', variantId))
      .set(bearer(admin))
      .send({ onHand: 10, reason: 'E2E fixture' })
      .expect(200);
    await request(server)
      .post(CART_ITEMS_ROUTE)
      .set(bearer(customer))
      .send({ variantId, quantity: 3 })
      .expect(201);

    await request(server)
      .post(QUOTE_ROUTE)
      .set(bearer(customer))
      .send({ destinationCountryCode: 'EG' })
      .expect(201);

    // A quote is a calculation: it holds no stock and creates no reservation.
    expect(await database.prisma.reservation.count()).toBe(0);
    const item = await database.prisma.inventoryItem.findFirst({
      where: { variantId },
      select: { onHand: true, reserved: true },
    });
    expect(item?.onHand).toBe(10);
    expect(item?.reserved).toBe(0);
  });

  it('adds a bundle to the cart as one sellable line', async () => {
    const admin = await createAdministrator('checkout-admin');
    const customer = await createCustomer('checkout-customer');
    const { variantId } = await seedProduct(admin, 'Oak Dining Table');
    // A bundle is its own product, and its components must belong to another product.
    const { productId: bundleProductId } = await seedProduct(admin, 'Dining Set');
    await approveEgypt(admin);
    await configureStandardTax(admin, 1400);
    await request(server)
      .put(ADMIN_STOCK_ROUTE.replace('{variantId}', variantId))
      .set(bearer(admin))
      .send({ onHand: 10, reason: 'E2E fixture' })
      .expect(200);

    const bundle = bodyOf<{ id: string; productId: string }>(
      await request(server)
        .post('/api/v1/admin/bundles')
        .set(bearer(admin))
        .send({
          productId: bundleProductId,
          kind: 'FIXED',
          name: 'Dining Set',
          components: [{ variantId, quantity: 2 }],
        })
        .expect(201),
    );

    const response = await request(server)
      .post('/api/v1/cart/bundle-items')
      .set(bearer(customer))
      .send({ bundleId: bundle.id, quantity: 1 })
      .expect(201);
    assertMatchesContract('post', '/api/v1/cart/bundle-items', 201, response.body);

    const cart = bodyOf<CartBody>(response);
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]).toMatchObject({
      targetKind: 'BUNDLE',
      bundleId: bundle.id,
      variantId: null,
      quantity: 1,
      purchasable: true,
    });
  });
});
