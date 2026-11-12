import { readFileSync } from 'node:fs';
import path from 'node:path';
import OpenAPIResponseValidator from 'openapi-response-validator';
import type { OpenAPIResponseValidatorArgs } from 'openapi-response-validator';
import request from 'supertest';
import { createApplication } from '../../apps/api/src/bootstrap/create-application';
import { AdministratorProvisioningService } from '../../apps/api/src/modules/identity/application/administrator-provisioning.service';
import { generateTotpCode, timeStepFor } from '../../apps/api/src/modules/identity/crypto/totp';
import { DatabaseService } from '../../apps/api/src/platform/database/database.service';
import { resetIdentityDatabase } from '../helpers/identity-database';
import { resetInventoryDatabase } from '../helpers/inventory-database';
import { testConfigurationFor } from '../helpers/test-configuration';

const CONFIGURATION = testConfigurationFor('e2e');
const CORRELATION_ID = '5a2b6c1e-7d3f-4a8b-9c0d-1e2f3a4b5c6d';

const ADMIN_PASSWORD = 'Inventory-Administrator-Passphrase-1';
const CUSTOMER_PASSWORD = 'Inventory-Customer-Passphrase-2';

const INVENTORY_ROUTE = '/api/v1/admin/inventory';
const INVENTORY_BY_VARIANT_ROUTE = '/api/v1/admin/inventory/variants/{variantId}';
const INVENTORY_ITEM_ROUTE = '/api/v1/admin/inventory/{inventoryId}';
const MOVEMENTS_ROUTE = '/api/v1/admin/inventory/{inventoryId}/movements';
const BUNDLES_ROUTE = '/api/v1/admin/bundles';
const BUNDLE_ROUTE = '/api/v1/admin/bundles/{bundleId}';
const RESERVATIONS_ROUTE = '/api/v1/admin/reservations';
const RESERVATION_ROUTE = '/api/v1/admin/reservations/{reservationId}';
const CONFIRMATION_ROUTE = '/api/v1/admin/reservations/{reservationId}/confirmation';
const RELEASE_ROUTE = '/api/v1/admin/reservations/{reservationId}/release';

const CATEGORIES_ROUTE = '/api/v1/admin/catalog/categories';
const BRANDS_ROUTE = '/api/v1/admin/catalog/brands';
const PRODUCTS_ROUTE = '/api/v1/admin/catalog/products';

/** A well-formed identifier that never exists, so "unknown" and "foreign" are comparable. */
const UNKNOWN_ID = '9f1e0d9c-8b7a-4695-8432-1f0e9d8c7b99';

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

interface InventoryBody {
  id: string;
  variantId: string;
  sku: string;
  productId: string;
  productName: string;
  onHand: number;
  reserved: number;
  available: number;
  createdAt: string;
  updatedAt: string;
}

interface InventoriesBody {
  items: InventoryBody[];
  nextCursor: string | null;
}

interface MovementBody {
  id: string;
  reason: string;
  onHandDelta: number;
  reservedDelta: number;
  onHandAfter: number;
  reservedAfter: number;
  reservationId: string | null;
  createdAt: string;
}

interface MovementsBody {
  items: MovementBody[];
  nextCursor: string | null;
}

interface BundleComponentBody {
  id: string;
  variantId: string;
  sku: string;
  quantity: number | null;
  minQuantity: number | null;
  maxQuantity: number | null;
  position: number;
}

interface BundleBody {
  id: string;
  productId: string;
  kind: string;
  name: string;
  description: string | null;
  components: BundleComponentBody[];
  available: number;
  createdAt: string;
  updatedAt: string;
}

interface BundlesBody {
  bundles: BundleBody[];
}

interface ReservationBody {
  id: string;
  status: string;
  idempotencyKey: string;
  expiresAt: string;
  lines: { id: string; sku: string; quantity: number }[];
  createdAt: string;
  updatedAt: string;
}

interface ReservationsBody {
  items: ReservationBody[];
  nextCursor: string | null;
}

interface SessionBody {
  status: string;
  session?: { token: string; tokenType: string };
  challenge?: { token: string; purpose: string };
  user?: { email: string; role: string };
}

interface CompletedSessionBody {
  status: string;
  token: string;
  tokenType: string;
  expiresAt: string;
  user: { email: string; role: string };
}

// ---------------------------------------------------------------------------------------------
// Committed contract
// ---------------------------------------------------------------------------------------------

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

/** Validates one observed response body against the committed, published OpenAPI document. */
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

  const validationError = validator.validateResponse(String(status), body);
  expect(validationError ?? null).toBeNull();
}

function bodyOf<T>(response: { readonly body: unknown }): T {
  return response.body as T;
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Asserts the operational metadata every response must carry. */
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

// ---------------------------------------------------------------------------------------------
// Inventory HTTP contract
// ---------------------------------------------------------------------------------------------

describe('inventory HTTP contract', () => {
  let app: Application;
  let server: Server;
  let database: DatabaseService;
  let provisioning: AdministratorProvisioningService;

  // Each independent HTTP scenario owns its client rate-limit budget, exactly as the catalog,
  // identity and customer journeys do: the limiter is process-local, so a shared application
  // instance would let one scenario spend the next scenario's sign-in budget.
  beforeEach(async () => {
    const created = await createApplication({ configuration: CONFIGURATION });
    app = created.app;
    server = app.getHttpServer() as Server;
    database = app.get(DatabaseService);
    provisioning = app.get(AdministratorProvisioningService);
    await resetInventoryDatabase(database);
    await resetIdentityDatabase(database);
  }, 30_000);

  afterEach(async () => {
    await app.close();
  });

  function call(method: Method, route: string, token?: string) {
    const agent = request(server);
    const builder =
      method === 'get'
        ? agent.get(route)
        : method === 'post'
          ? agent.post(route)
          : method === 'patch'
            ? agent.patch(route)
            : method === 'put'
              ? agent.put(route)
              : agent.delete(route);
    return token === undefined ? builder : builder.set(bearer(token));
  }

  /** Provisions an administrator and completes the mandatory second factor, returning its session. */
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
    const verified = bodyOf<CompletedSessionBody>(
      await request(server)
        .post('/api/v1/auth/login/mfa')
        .send({ challengeToken: verificationToken, recoveryCode })
        .expect(201),
    );
    return verified.token;
  }

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

  async function createCategory(token: string, name: string): Promise<string> {
    const response = await request(server)
      .post(CATEGORIES_ROUTE)
      .set(bearer(token))
      .send({ name })
      .expect(201);
    return bodyOf<{ id: string }>(response).id;
  }

  async function createBrand(token: string, name: string): Promise<string> {
    const response = await request(server)
      .post(BRANDS_ROUTE)
      .set(bearer(token))
      .send({ name })
      .expect(201);
    return bodyOf<{ id: string }>(response).id;
  }

  async function createProduct(
    token: string,
    categoryId: string,
    brandId: string,
    name: string,
  ): Promise<string> {
    const response = await request(server)
      .post(PRODUCTS_ROUTE)
      .set(bearer(token))
      .send({
        name,
        description: 'Solid oak.',
        categoryId,
        brandId,
        basePriceMinor: 129900,
        baseCurrency: 'GBP',
      })
      .expect(201);
    return bodyOf<{ id: string }>(response).id;
  }

  async function createVariant(token: string, productId: string, sku: string): Promise<string> {
    const response = await request(server)
      .post(`/api/v1/admin/catalog/products/${productId}/variants`)
      .set(bearer(token))
      .send({ sku })
      .expect(201);
    return bodyOf<{ id: string }>(response).id;
  }

  /** Seeds one sellable SKU and returns its identifiers. */
  async function seedSku(
    token: string,
    sku: string,
    name = 'Oak Dining Table',
  ): Promise<{ productId: string; variantId: string }> {
    const categoryId = await createCategory(token, `Furniture ${sku}`);
    const brandId = await createBrand(token, `Northwind ${sku}`);
    const productId = await createProduct(token, categoryId, brandId, name);
    const variantId = await createVariant(token, productId, sku);
    return { productId, variantId };
  }

  /** Seeds a distinct product to carry a bundle (its components are other products' SKUs). */
  async function seedBundleProduct(token: string, name: string): Promise<string> {
    const categoryId = await createCategory(token, `Bundles ${name}`);
    const brandId = await createBrand(token, `Northwind bundles ${name}`);
    return createProduct(token, categoryId, brandId, name);
  }

  async function setStock(
    token: string,
    variantId: string,
    onHand: number,
  ): Promise<InventoryBody> {
    const response = await request(server)
      .put(`/api/v1/admin/inventory/variants/${variantId}`)
      .set(bearer(token))
      .send({ onHand, reason: 'Goods received' })
      .expect(200);
    return bodyOf<InventoryBody>(response);
  }

  it('protects every administrative inventory, bundle, and reservation route from an anonymous caller', async () => {
    const routes: readonly { method: Method; path: string }[] = [
      { method: 'get', path: INVENTORY_ROUTE },
      { method: 'get', path: `/api/v1/admin/inventory/variants/${UNKNOWN_ID}` },
      { method: 'put', path: `/api/v1/admin/inventory/variants/${UNKNOWN_ID}` },
      { method: 'get', path: `/api/v1/admin/inventory/${UNKNOWN_ID}` },
      { method: 'get', path: `/api/v1/admin/inventory/${UNKNOWN_ID}/movements` },
      { method: 'post', path: BUNDLES_ROUTE },
      { method: 'get', path: BUNDLES_ROUTE },
      { method: 'get', path: `/api/v1/admin/bundles/${UNKNOWN_ID}` },
      { method: 'patch', path: `/api/v1/admin/bundles/${UNKNOWN_ID}` },
      { method: 'delete', path: `/api/v1/admin/bundles/${UNKNOWN_ID}` },
      { method: 'post', path: `/api/v1/admin/bundles/${UNKNOWN_ID}/assemble` },
      { method: 'post', path: `/api/v1/admin/bundles/${UNKNOWN_ID}/disassemble` },
      { method: 'post', path: RESERVATIONS_ROUTE },
      { method: 'get', path: RESERVATIONS_ROUTE },
      { method: 'get', path: `/api/v1/admin/reservations/${UNKNOWN_ID}` },
      { method: 'patch', path: `/api/v1/admin/reservations/${UNKNOWN_ID}` },
      { method: 'post', path: `/api/v1/admin/reservations/${UNKNOWN_ID}/confirmation` },
      { method: 'post', path: `/api/v1/admin/reservations/${UNKNOWN_ID}/release` },
    ];

    for (const route of routes) {
      const response = await call(route.method, route.path).expect(401);
      expect(bodyOf<ErrorBody>(response)).toMatchObject({
        statusCode: 401,
        code: 'UNAUTHENTICATED',
      });
      assertOperationalHeaders(response);
    }
  });

  it('refuses a customer and audits the denial', async () => {
    const customerToken = await createCustomer('inventory.denied.customer');

    const denied = await request(server)
      .get(INVENTORY_ROUTE)
      .set(bearer(customerToken))
      .expect(403);
    expect(bodyOf<ErrorBody>(denied)).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    assertMatchesContract('get', INVENTORY_ROUTE, 403, denied.body);

    const audited = await database.prisma.securityEvent.findMany({
      where: { eventType: 'ADMIN_ACCESS_DENIED' },
    });
    expect(audited.length).toBeGreaterThan(0);
  });

  it('lets an administrator run the whole stock, bundle, and reservation journey', async () => {
    const admin = await createAdministrator('inventory.admin');
    const chair = await seedSku(admin, 'OAK-CHAIR-01', 'Oak Chair');
    const table = await seedSku(admin, 'OAK-TABLE-01', 'Oak Dining Table');

    // Setting stock is an idempotent upsert that derives `available`.
    const stocked = await setStock(admin, table.variantId, 10);
    expect(stocked).toMatchObject({
      variantId: table.variantId,
      sku: 'OAK-TABLE-01',
      onHand: 10,
      reserved: 0,
      available: 10,
    });
    expect(stocked.id).toMatch(UUID_PATTERN);
    assertMatchesContract('put', INVENTORY_BY_VARIANT_ROUTE, 200, stocked);

    await setStock(admin, chair.variantId, 10);
    const restocked = await setStock(admin, table.variantId, 12);
    expect(restocked.onHand).toBe(12);

    // The movement audit is append-only and newest first.
    const movements = await request(server)
      .get(`/api/v1/admin/inventory/${stocked.id}/movements`)
      .set(bearer(admin))
      .expect(200);
    const audited = bodyOf<MovementsBody>(movements);
    expect(audited.items.length).toBeGreaterThanOrEqual(2);
    expect(audited.items[0]).toMatchObject({
      reason: 'ADJUSTMENT',
      note: 'Goods received',
      onHandDelta: 2,
      onHandAfter: 12,
    });
    assertMatchesContract('get', MOVEMENTS_ROUTE, 200, movements.body);

    // A SKU can be read by identifier and by variant, and the installation pages deterministically.
    const byVariant = await request(server)
      .get(`/api/v1/admin/inventory/variants/${table.variantId}`)
      .set(bearer(admin))
      .expect(200);
    expect(bodyOf<InventoryBody>(byVariant).sku).toBe('OAK-TABLE-01');
    assertMatchesContract('get', INVENTORY_BY_VARIANT_ROUTE, 200, byVariant.body);

    const byId = await request(server)
      .get(`/api/v1/admin/inventory/${stocked.id}`)
      .set(bearer(admin))
      .expect(200);
    expect(bodyOf<InventoryBody>(byId).id).toBe(stocked.id);
    assertMatchesContract('get', INVENTORY_ITEM_ROUTE, 200, byId.body);

    const listed = await request(server)
      .get(`${INVENTORY_ROUTE}?limit=10`)
      .set(bearer(admin))
      .expect(200);
    const page = bodyOf<InventoriesBody>(listed);
    expect(page.items.length).toBe(2);
    expect(page.nextCursor).toBeNull();
    assertOperationalHeaders(listed);
    assertMatchesContract('get', INVENTORY_ROUTE, 200, listed.body);

    const filtered = await request(server)
      .get(`${INVENTORY_ROUTE}?limit=10&productId=${table.productId}`)
      .set(bearer(admin))
      .expect(200);
    expect(bodyOf<InventoriesBody>(filtered).items.map((item) => item.sku)).toEqual([
      'OAK-TABLE-01',
    ]);

    // FIXED goods start empty; assembly consumes components once.
    const bundleProductId = await seedBundleProduct(admin, 'Table and chairs set');
    const createdBundle = await request(server)
      .post(BUNDLES_ROUTE)
      .set(bearer(admin))
      .send({
        productId: bundleProductId,
        kind: 'FIXED',
        name: 'Table and two chairs',
        components: [
          { variantId: table.variantId, quantity: 1 },
          { variantId: chair.variantId, quantity: 2 },
        ],
      })
      .expect(201);
    const bundle = bodyOf<BundleBody>(createdBundle);
    expect(bundle.available).toBe(0);
    const assembly = await request(server)
      .post(`/api/v1/admin/bundles/${bundle.id}/assemble`)
      .set(bearer(admin))
      .send({ quantity: 5 })
      .expect(200);
    expect(bodyOf<BundleBody>(assembly).available).toBe(5);
    assertMatchesContract('post', BUNDLE_ROUTE + '/assemble', 200, assembly.body);
    const insufficientAssembly = await request(server)
      .post(`/api/v1/admin/bundles/${bundle.id}/assemble`)
      .set(bearer(admin))
      .send({ quantity: 1 })
      .expect(409);
    assertMatchesContract('post', BUNDLE_ROUTE + '/assemble', 409, insufficientAssembly.body);
    await request(server)
      .post(`/api/v1/admin/bundles/${bundle.id}/assemble`)
      .set(bearer(admin))
      .send({ quantity: 0 })
      .expect(400);
    expect(bundle.components.map((component) => component.sku).sort()).toEqual([
      'OAK-CHAIR-01',
      'OAK-TABLE-01',
    ]);
    assertMatchesContract('post', BUNDLES_ROUTE, 201, createdBundle.body);

    const fetchedBundle = await request(server)
      .get(`/api/v1/admin/bundles/${bundle.id}`)
      .set(bearer(admin))
      .expect(200);
    expect(bodyOf<BundleBody>(fetchedBundle).available).toBe(5);
    assertMatchesContract('get', BUNDLE_ROUTE, 200, fetchedBundle.body);

    const listedBundles = await request(server).get(BUNDLES_ROUTE).set(bearer(admin)).expect(200);
    expect(bodyOf<BundlesBody>(listedBundles).bundles.map((entry) => entry.id)).toEqual([
      bundle.id,
    ]);
    assertMatchesContract('get', BUNDLES_ROUTE, 200, listedBundles.body);

    // Reserving finished goods does not reserve their consumed components again.
    const createdReservation = await request(server)
      .post(RESERVATIONS_ROUTE)
      .set(bearer(admin))
      .send({ idempotencyKey: 'journey-1', bundleId: bundle.id, quantity: 2 })
      .expect(201);
    const reservation = bodyOf<ReservationBody>(createdReservation);
    expect(reservation.status).toBe('ACTIVE');
    expect(reservation.lines).toHaveLength(1);
    assertMatchesContract('post', RESERVATIONS_ROUTE, 201, createdReservation.body);

    const tableAfterHold = await request(server)
      .get(`/api/v1/admin/inventory/variants/${table.variantId}`)
      .set(bearer(admin))
      .expect(200);
    const chairAfterHold = await request(server)
      .get(`/api/v1/admin/inventory/variants/${chair.variantId}`)
      .set(bearer(admin))
      .expect(200);
    expect(bodyOf<InventoryBody>(tableAfterHold)).toMatchObject({
      onHand: 7,
      reserved: 0,
      available: 7,
    });
    expect(bodyOf<InventoryBody>(chairAfterHold)).toMatchObject({
      onHand: 0,
      reserved: 0,
      available: 0,
    });

    await request(server)
      .post(`/api/v1/admin/bundles/${bundle.id}/disassemble`)
      .set(bearer(admin))
      .send({ quantity: 4 })
      .expect(409);
    // Creation is idempotent on the supplied key.
    const repeated = await request(server)
      .post(RESERVATIONS_ROUTE)
      .set(bearer(admin))
      .send({ idempotencyKey: 'journey-1', bundleId: bundle.id, quantity: 2 })
      .expect(201);
    expect(bodyOf<ReservationBody>(repeated).id).toBe(reservation.id);

    const readReservation = await request(server)
      .get(`/api/v1/admin/reservations/${reservation.id}`)
      .set(bearer(admin))
      .expect(200);
    expect(bodyOf<ReservationBody>(readReservation).idempotencyKey).toBe('journey-1');
    assertMatchesContract('get', RESERVATION_ROUTE, 200, readReservation.body);

    const listedReservations = await request(server)
      .get(`${RESERVATIONS_ROUTE}?status=ACTIVE`)
      .set(bearer(admin))
      .expect(200);
    expect(bodyOf<ReservationsBody>(listedReservations).items.map((entry) => entry.id)).toEqual([
      reservation.id,
    ]);
    assertMatchesContract('get', RESERVATIONS_ROUTE, 200, listedReservations.body);

    // Confirmation permanently deducts the held stock.
    const confirmed = await request(server)
      .post(`/api/v1/admin/reservations/${reservation.id}/confirmation`)
      .set(bearer(admin))
      .expect(200);
    expect(bodyOf<ReservationBody>(confirmed).status).toBe('CONFIRMED');
    assertMatchesContract('post', CONFIRMATION_ROUTE, 200, confirmed.body);

    const tableAfterConfirm = await request(server)
      .get(`/api/v1/admin/inventory/variants/${table.variantId}`)
      .set(bearer(admin))
      .expect(200);
    expect(bodyOf<InventoryBody>(tableAfterConfirm)).toMatchObject({
      onHand: 7,
      reserved: 0,
      available: 7,
    });

    // Confirming again is an idempotent no-op.
    const reconfirmed = await request(server)
      .post(`/api/v1/admin/reservations/${reservation.id}/confirmation`)
      .set(bearer(admin))
      .expect(200);
    expect(bodyOf<ReservationBody>(reconfirmed).status).toBe('CONFIRMED');

    const disassembly = await request(server)
      .post(`/api/v1/admin/bundles/${bundle.id}/disassemble`)
      .set(bearer(admin))
      .send({ quantity: 3 })
      .expect(200);
    expect(bodyOf<BundleBody>(disassembly).available).toBe(0);
    assertMatchesContract('post', BUNDLE_ROUTE + '/disassemble', 200, disassembly.body);
    // A second reservation is released, which returns the hold untouched.
    const secondReservation = bodyOf<ReservationBody>(
      await request(server)
        .post(RESERVATIONS_ROUTE)
        .set(bearer(admin))
        .send({ idempotencyKey: 'journey-2', lines: [{ sku: 'OAK-CHAIR-01', quantity: 3 }] })
        .expect(201),
    );
    const released = await request(server)
      .post(`/api/v1/admin/reservations/${secondReservation.id}/release`)
      .set(bearer(admin))
      .expect(200);
    expect(bodyOf<ReservationBody>(released).status).toBe('RELEASED');
    assertMatchesContract('post', RELEASE_ROUTE, 200, released.body);

    const chairAfterRelease = await request(server)
      .get(`/api/v1/admin/inventory/variants/${chair.variantId}`)
      .set(bearer(admin))
      .expect(200);
    // The bundle confirmation permanently deducted 4 chairs, so 6 remain and none are held.
    expect(bodyOf<InventoryBody>(chairAfterRelease)).toMatchObject({
      onHand: 6,
      reserved: 0,
      available: 6,
    });

    // A reservation can be extended while it is active, then deleted along with its bundle.
    const thirdReservation = bodyOf<ReservationBody>(
      await request(server)
        .post(RESERVATIONS_ROUTE)
        .set(bearer(admin))
        .send({ idempotencyKey: 'journey-3', lines: [{ sku: 'OAK-CHAIR-01', quantity: 1 }] })
        .expect(201),
    );
    const extended = await request(server)
      .patch(`/api/v1/admin/reservations/${thirdReservation.id}`)
      .set(bearer(admin))
      .send({ extendBySeconds: 120 })
      .expect(200);
    expect(new Date(bodyOf<ReservationBody>(extended).expiresAt).getTime()).toBeGreaterThan(
      new Date(thirdReservation.expiresAt).getTime(),
    );
    assertMatchesContract('patch', RESERVATION_ROUTE, 200, extended.body);
    await request(server)
      .post(`/api/v1/admin/reservations/${thirdReservation.id}/release`)
      .set(bearer(admin))
      .expect(200);

    // A bundle's composition and its name are replaced atomically.
    const updatedBundle = await request(server)
      .patch(`/api/v1/admin/bundles/${bundle.id}`)
      .set(bearer(admin))
      .send({
        name: 'Table and one chair',
        components: [{ variantId: chair.variantId, quantity: 1 }],
      })
      .expect(200);
    const reprojected = bodyOf<BundleBody>(updatedBundle);
    expect(reprojected.name).toBe('Table and one chair');
    expect(reprojected.components.map((component) => component.sku)).toEqual(['OAK-CHAIR-01']);
    expect(reprojected.available).toBe(0);
    assertMatchesContract('patch', BUNDLE_ROUTE, 200, updatedBundle.body);

    await request(server)
      .delete(`/api/v1/admin/bundles/${bundle.id}`)
      .set(bearer(admin))
      .expect(409);
    const unused = bodyOf<BundleBody>(
      await request(server)
        .post(BUNDLES_ROUTE)
        .set(bearer(admin))
        .send({
          productId: await seedBundleProduct(admin, 'Unused'),
          kind: 'FIXED',
          name: 'Unused',
          components: [{ variantId: chair.variantId, quantity: 1 }],
        })
        .expect(201),
    );
    await request(server)
      .delete(`/api/v1/admin/bundles/${unused.id}`)
      .set(bearer(admin))
      .expect(204);
  });

  it('enforces the inventory and bundle invariants at the boundary', async () => {
    const admin = await createAdministrator('inventory.invariants.admin');
    const chair = await seedSku(admin, 'OAK-CHAIR-01', 'Oak Chair');
    const table = await seedSku(admin, 'OAK-TABLE-01', 'Oak Dining Table');
    await setStock(admin, chair.variantId, 10);
    const tableStock = await setStock(admin, table.variantId, 5);

    // A hold cannot exceed availability: all-or-nothing, with no partial hold.
    const insufficient = await request(server)
      .post(RESERVATIONS_ROUTE)
      .set(bearer(admin))
      .send({ idempotencyKey: 'over-1', lines: [{ sku: 'OAK-TABLE-01', quantity: 6 }] })
      .expect(409);
    expect(bodyOf<ErrorBody>(insufficient).code).toBe('INVENTORY_CONFLICT');
    assertMatchesContract('post', RESERVATIONS_ROUTE, 409, insufficient.body);

    const held = await request(server)
      .post(RESERVATIONS_ROUTE)
      .set(bearer(admin))
      .send({ idempotencyKey: 'hold-1', lines: [{ sku: 'OAK-TABLE-01', quantity: 4 }] })
      .expect(201);
    expect(bodyOf<ReservationBody>(held).lines).toHaveLength(1);

    // Reducing on-hand below the reserved quantity is refused.
    const belowReserved = await request(server)
      .put(`/api/v1/admin/inventory/variants/${table.variantId}`)
      .set(bearer(admin))
      .send({ onHand: 3 })
      .expect(409);
    expect(bodyOf<ErrorBody>(belowReserved).code).toBe('INVENTORY_CONFLICT');
    assertMatchesContract('put', INVENTORY_BY_VARIANT_ROUTE, 409, belowReserved.body);

    // Confirming a released reservation is a conflict.
    const toRelease = bodyOf<ReservationBody>(
      await request(server)
        .post(RESERVATIONS_ROUTE)
        .set(bearer(admin))
        .send({ idempotencyKey: 'hold-2', lines: [{ sku: 'OAK-TABLE-01', quantity: 1 }] })
        .expect(201),
    );
    await request(server)
      .post(`/api/v1/admin/reservations/${toRelease.id}/release`)
      .set(bearer(admin))
      .expect(200);
    const conflicting = await request(server)
      .post(`/api/v1/admin/reservations/${toRelease.id}/confirmation`)
      .set(bearer(admin))
      .expect(409);
    expect(bodyOf<ErrorBody>(conflicting).code).toBe('INVENTORY_CONFLICT');

    // One bundle per product; a second is a conflict.
    const bundleProductId = await seedBundleProduct(admin, 'Set');
    const body = {
      productId: bundleProductId,
      kind: 'FIXED',
      name: 'Set',
      components: [{ variantId: chair.variantId, quantity: 1 }],
    };
    await request(server).post(BUNDLES_ROUTE).set(bearer(admin)).send(body).expect(201);
    const duplicateBundle = await request(server)
      .post(BUNDLES_ROUTE)
      .set(bearer(admin))
      .send({ ...body, name: 'Another set' })
      .expect(409);
    expect(bodyOf<ErrorBody>(duplicateBundle).code).toBe('INVENTORY_CONFLICT');
    assertMatchesContract('post', BUNDLES_ROUTE, 409, duplicateBundle.body);

    // A component SKU that does not exist is a not-found, not a conflict.
    const unknownComponent = await request(server)
      .post(BUNDLES_ROUTE)
      .set(bearer(admin))
      .send({
        productId: await seedBundleProduct(admin, 'Ghost set'),
        kind: 'FIXED',
        name: 'Ghost set',
        components: [{ variantId: UNKNOWN_ID, quantity: 1 }],
      })
      .expect(404);
    expect(bodyOf<ErrorBody>(unknownComponent).code).toBe('VARIANT_NOT_FOUND');

    // A DYNAMIC bundle's composition cannot be reserved as whole bundles.
    const dynamicBundle = bodyOf<BundleBody>(
      await request(server)
        .post(BUNDLES_ROUTE)
        .set(bearer(admin))
        .send({
          productId: await seedBundleProduct(admin, 'Pick your set'),
          kind: 'DYNAMIC',
          name: 'Pick your set',
          components: [{ variantId: chair.variantId, minQuantity: 2, maxQuantity: 4 }],
        })
        .expect(201),
    );
    const dynamicReservation = await request(server)
      .post(RESERVATIONS_ROUTE)
      .set(bearer(admin))
      .send({ idempotencyKey: 'dyn-1', bundleId: dynamicBundle.id, quantity: 1 })
      .expect(409);
    expect(bodyOf<ErrorBody>(dynamicReservation).code).toBe('INVENTORY_CONFLICT');

    // The stock snapshot stays internally consistent after every operation.
    expect(tableStock.onHand - tableStock.reserved).toBe(tableStock.available);
  });

  it('rejects malformed bodies and identifiers without echoing them', async () => {
    const admin = await createAdministrator('inventory.validation.admin');
    const table = await seedSku(admin, 'OAK-TABLE-01');
    const canary = 'canary-reason-6e7f';

    const negative = await request(server)
      .put(`/api/v1/admin/inventory/variants/${table.variantId}`)
      .set(bearer(admin))
      .send({ onHand: -1 })
      .expect(400);
    expect(bodyOf<ErrorBody>(negative).code).toBe('VALIDATION_ERROR');
    assertMatchesContract('put', INVENTORY_BY_VARIANT_ROUTE, 400, negative.body);

    const unknownField = await request(server)
      .put(`/api/v1/admin/inventory/variants/${table.variantId}`)
      .set(bearer(admin))
      .send({ onHand: 1, reserved: 3, reason: canary })
      .expect(400);
    expect(bodyOf<ErrorBody>(unknownField).code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(unknownField.body)).not.toContain(canary);

    // A reservation must supply exactly one form and a positive quantity.
    const bothForms = await request(server)
      .post(RESERVATIONS_ROUTE)
      .set(bearer(admin))
      .send({
        idempotencyKey: 'x',
        lines: [{ sku: 'OAK-TABLE-01', quantity: 1 }],
        bundleId: UNKNOWN_ID,
        quantity: 1,
      })
      .expect(400);
    expect(bodyOf<ErrorBody>(bothForms).code).toBe('VALIDATION_ERROR');

    const emptyLines = await request(server)
      .post(RESERVATIONS_ROUTE)
      .set(bearer(admin))
      .send({ idempotencyKey: 'x', lines: [] })
      .expect(400);
    expect(bodyOf<ErrorBody>(emptyLines).code).toBe('VALIDATION_ERROR');

    // A FIXED component needs a quantity; a duplicated SKU is refused.
    const fixedWithoutQuantity = await request(server)
      .post(BUNDLES_ROUTE)
      .set(bearer(admin))
      .send({
        productId: await seedBundleProduct(admin, 'Bad set'),
        kind: 'FIXED',
        name: 'Bad set',
        components: [{ variantId: table.variantId }],
      })
      .expect(400);
    expect(bodyOf<ErrorBody>(fixedWithoutQuantity).code).toBe('VALIDATION_ERROR');

    const duplicated = await request(server)
      .post(BUNDLES_ROUTE)
      .set(bearer(admin))
      .send({
        productId: await seedBundleProduct(admin, 'Dup set'),
        kind: 'FIXED',
        name: 'Dup set',
        components: [
          { variantId: table.variantId, quantity: 1 },
          { variantId: table.variantId, quantity: 2 },
        ],
      })
      .expect(400);
    expect(bodyOf<ErrorBody>(duplicated).code).toBe('VALIDATION_ERROR');

    // A malformed identifier is a boundary failure, not a lookup.
    const malformed = await request(server)
      .get('/api/v1/admin/inventory/not-a-uuid')
      .set(bearer(admin))
      .expect(400);
    expect(bodyOf<ErrorBody>(malformed).code).toBe('VALIDATION_ERROR');
  });

  it('rejects malformed keyset cursors with the stable validation contract', async () => {
    const admin = await createAdministrator('inventory.cursor.admin');
    const sku = await seedSku(admin, 'CURSOR-SKU');
    const item = await setStock(admin, sku.variantId, 10);
    const invalidId = '-'.repeat(36);
    const stockCursor = Buffer.from('CURSOR-SKU\u0000' + invalidId).toString('base64url');
    const timeCursor = Buffer.from(new Date().toISOString() + '\u0000' + invalidId).toString(
      'base64url',
    );
    for (const [path, route, cursor] of [
      [INVENTORY_ROUTE, INVENTORY_ROUTE, stockCursor],
      [RESERVATIONS_ROUTE, RESERVATIONS_ROUTE, timeCursor],
      [`/api/v1/admin/inventory/${item.id}/movements`, MOVEMENTS_ROUTE, timeCursor],
      [INVENTORY_ROUTE, INVENTORY_ROUTE, 'unreadable'],
    ]) {
      const response = await request(server)
        .get(path!)
        .query({ cursor })
        .set(bearer(admin))
        .expect(400);
      expect(bodyOf<ErrorBody>(response).code).toBe('VALIDATION_ERROR');
      assertMatchesContract('get', route!, 400, response.body);
    }
  });

  it('answers an unknown inventory, bundle, or reservation resource with the stable not-found contract', async () => {
    const admin = await createAdministrator('inventory.notfound.admin');

    const variantInventory = await request(server)
      .get(`/api/v1/admin/inventory/variants/${UNKNOWN_ID}`)
      .set(bearer(admin))
      .expect(404);
    expect(bodyOf<ErrorBody>(variantInventory).code).toBe('INVENTORY_NOT_FOUND');
    assertMatchesContract('get', INVENTORY_BY_VARIANT_ROUTE, 404, variantInventory.body);

    const item = await request(server)
      .get(`/api/v1/admin/inventory/${UNKNOWN_ID}`)
      .set(bearer(admin))
      .expect(404);
    expect(bodyOf<ErrorBody>(item).code).toBe('INVENTORY_NOT_FOUND');
    assertMatchesContract('get', INVENTORY_ITEM_ROUTE, 404, item.body);

    const missingBundle = await request(server)
      .get(`/api/v1/admin/bundles/${UNKNOWN_ID}`)
      .set(bearer(admin))
      .expect(404);
    expect(bodyOf<ErrorBody>(missingBundle).code).toBe('BUNDLE_NOT_FOUND');
    assertMatchesContract('get', BUNDLE_ROUTE, 404, missingBundle.body);

    const deletedMissingBundle = await request(server)
      .delete(`/api/v1/admin/bundles/${UNKNOWN_ID}`)
      .set(bearer(admin))
      .expect(404);
    expect(bodyOf<ErrorBody>(deletedMissingBundle).code).toBe('BUNDLE_NOT_FOUND');
    assertMatchesContract('delete', BUNDLE_ROUTE, 404, deletedMissingBundle.body);

    const missingReservation = await request(server)
      .get(`/api/v1/admin/reservations/${UNKNOWN_ID}`)
      .set(bearer(admin))
      .expect(404);
    expect(bodyOf<ErrorBody>(missingReservation).code).toBe('RESERVATION_NOT_FOUND');
    assertMatchesContract('get', RESERVATION_ROUTE, 404, missingReservation.body);

    const missingMovementItem = await request(server)
      .get(`/api/v1/admin/inventory/${UNKNOWN_ID}/movements`)
      .set(bearer(admin))
      .expect(404);
    expect(bodyOf<ErrorBody>(missingMovementItem).code).toBe('INVENTORY_NOT_FOUND');
  });
});

// ---------------------------------------------------------------------------------------------
// Rate-limit proof (dedicated instance so the journey suite cannot consume the budget)
// ---------------------------------------------------------------------------------------------

describe('inventory HTTP contract rate limiting', () => {
  let app: Application;
  let server: Server;
  let database: DatabaseService;

  beforeEach(async () => {
    const created = await createApplication({ configuration: CONFIGURATION });
    app = created.app;
    server = app.getHttpServer() as Server;
    database = app.get(DatabaseService);
    await resetInventoryDatabase(database);
    await resetIdentityDatabase(database);
  }, 30_000);

  afterEach(async () => {
    await app.close();
  });

  it('bounds administrative inventory reads per client with a numeric retry hint', async () => {
    // The declared `inventory.read` policy allows 300 reads per window for one client, and the
    // limiter runs before session authentication, so the budget is spent even while unauthenticated.
    for (let attempt = 0; attempt < 300; attempt += 1) {
      await request(server).get('/api/v1/admin/inventory').expect(401);
    }

    const limited = await request(server).get('/api/v1/admin/inventory').expect(429);
    expect(bodyOf<ErrorBody>(limited).code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited.headers['cache-control']).toBe('no-store');
  }, 120_000);
});
