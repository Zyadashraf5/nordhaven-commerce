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
import { resetCustomerDatabase } from '../helpers/customer-database';
import { resetIdentityDatabase } from '../helpers/identity-database';
import { testConfigurationFor } from '../helpers/test-configuration';

const CONFIGURATION = testConfigurationFor('e2e');
const CORRELATION_ID = '7a1b6c1e-7d3f-4a8b-9c0d-1e2f3a4b5c7e';

const CUSTOMER_PASSWORD = 'Cart-Customer-Passphrase-1';
const ADMIN_PASSWORD = 'Cart-Administrator-Passphrase-2';

const CART_ROUTE = '/api/v1/cart';
const CART_ITEMS_ROUTE = '/api/v1/cart/items';
const CART_ITEM_ROUTE = '/api/v1/cart/items/{itemId}';
const WISHLIST_ROUTE = '/api/v1/customers/me/wishlist';
const WISHLIST_ITEM_ROUTE = '/api/v1/customers/me/wishlist/{itemId}';

const ADMIN_CATEGORIES_ROUTE = '/api/v1/admin/catalog/categories';
const ADMIN_BRANDS_ROUTE = '/api/v1/admin/catalog/brands';
const ADMIN_PRODUCTS_ROUTE = '/api/v1/admin/catalog/products';
const ADMIN_VARIANTS_ROUTE = '/api/v1/admin/catalog/products/{productId}/variants';
const ADMIN_STATUS_ROUTE = '/api/v1/admin/catalog/products/{productId}/status';
const ADMIN_DISCOUNT_ROUTE = '/api/v1/admin/catalog/products/{productId}/discount';

const UNKNOWN_ID = 'cf1e0d9c-8b7a-4695-8432-1f0e9d8c7b99';

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
  variantId: string;
  sku: string;
  productId: string;
  productName: string;
  productSlug: string;
  quantity: number;
  lastKnownUnitPriceMinor: number;
  lastKnownUnitCurrency: string;
  currentUnitPriceMinor: number;
  currentUnitCurrency: string;
  priceChanged: boolean;
  purchasable: boolean;
}

interface CartBody {
  lines: CartLineBody[];
  updatedAt: string;
}

interface WishlistItemBody {
  id: string;
  productId: string;
  productName: string;
  productSlug: string;
  currentPriceMinor: number;
  currentCurrency: string;
  purchasable: boolean;
  savedAt: string;
}

interface WishlistBody {
  items: WishlistItemBody[];
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

describe('cart and wishlist HTTP contract', () => {
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

  /** Publishes one product with a sellable variant and returns its identifiers. */
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
          baseCurrency: 'GBP',
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

  it('refuses every cart and wishlist route from an anonymous caller', async () => {
    const routes: readonly { method: Method; path: string }[] = [
      { method: 'get', path: CART_ROUTE },
      { method: 'post', path: CART_ITEMS_ROUTE },
      { method: 'patch', path: CART_ITEM_ROUTE.replace('{itemId}', UNKNOWN_ID) },
      { method: 'delete', path: CART_ITEM_ROUTE.replace('{itemId}', UNKNOWN_ID) },
      { method: 'get', path: WISHLIST_ROUTE },
      { method: 'post', path: WISHLIST_ROUTE },
      { method: 'delete', path: WISHLIST_ITEM_ROUTE.replace('{itemId}', UNKNOWN_ID) },
    ];

    for (const route of routes) {
      const agent = request(server);
      const builder =
        route.method === 'get'
          ? agent.get(route.path)
          : route.method === 'post'
            ? agent.post(route.path)
            : route.method === 'patch'
              ? agent.patch(route.path)
              : agent.delete(route.path);
      const response = await builder.expect(401);
      expect(bodyOf<ErrorBody>(response)).toMatchObject({
        statusCode: 401,
        code: 'UNAUTHENTICATED',
      });
      assertOperationalHeaders(response);
    }

    // Nothing was created by any refusal.
    expect(await database.prisma.cart.count()).toBe(0);
    expect(await database.prisma.cartItem.count()).toBe(0);
    expect(await database.prisma.customerWishlistItem.count()).toBe(0);
  });

  it('lets a customer keep, change, and remove a cart line', async () => {
    const admin = await createAdministrator('cart.journey.admin');
    const customer = await createCustomer('cart.journey.customer');
    const { variantId } = await seedProduct(admin, 'Oak Dining Table');

    const empty = await request(server).get(CART_ROUTE).set(bearer(customer)).expect(200);
    expect(bodyOf<CartBody>(empty).lines).toEqual([]);
    assertMatchesContract('get', CART_ROUTE, 200, empty.body);

    const added = await request(server)
      .post(CART_ITEMS_ROUTE)
      .set(bearer(customer))
      .send({ variantId, quantity: 2 })
      .expect(201);
    const cart = bodyOf<CartBody>(added);
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0]).toMatchObject({
      variantId,
      quantity: 2,
      lastKnownUnitPriceMinor: 129900,
      currentUnitPriceMinor: 129900,
      priceChanged: false,
      purchasable: true,
    });
    assertMatchesContract('post', CART_ITEMS_ROUTE, 201, added.body);

    // Adding the same SKU again increases the line rather than adding a second one.
    const again = await request(server)
      .post(CART_ITEMS_ROUTE)
      .set(bearer(customer))
      .send({ variantId, quantity: 3 })
      .expect(201);
    expect(bodyOf<CartBody>(again).lines).toHaveLength(1);
    expect(bodyOf<CartBody>(again).lines[0]?.quantity).toBe(5);

    const itemId = cart.lines[0]?.id ?? '';
    const changed = await request(server)
      .patch(CART_ITEM_ROUTE.replace('{itemId}', itemId))
      .set(bearer(customer))
      .send({ quantity: 7 })
      .expect(200);
    expect(bodyOf<CartBody>(changed).lines[0]?.quantity).toBe(7);
    assertMatchesContract('patch', CART_ITEM_ROUTE, 200, changed.body);

    const removed = await request(server)
      .delete(CART_ITEM_ROUTE.replace('{itemId}', itemId))
      .set(bearer(customer))
      .expect(200);
    expect(bodyOf<CartBody>(removed).lines).toEqual([]);
    assertMatchesContract('delete', CART_ITEM_ROUTE, 200, removed.body);
  });

  it('shows a price change and clears the signal when the price returns', async () => {
    const admin = await createAdministrator('cart.price.admin');
    const customer = await createCustomer('cart.price.customer');
    const { productId, variantId } = await seedProduct(admin, 'Reading Lamp');

    await request(server)
      .post(CART_ITEMS_ROUTE)
      .set(bearer(customer))
      .send({ variantId, quantity: 1 })
      .expect(201);

    await request(server)
      .put(ADMIN_DISCOUNT_ROUTE.replace('{productId}', productId))
      .set(bearer(admin))
      .send({ basisPoints: 5000 })
      .expect(200);

    const changed = await request(server).get(CART_ROUTE).set(bearer(customer)).expect(200);
    expect(bodyOf<CartBody>(changed).lines[0]).toMatchObject({
      lastKnownUnitPriceMinor: 129900,
      currentUnitPriceMinor: 64950,
      priceChanged: true,
    });

    await request(server)
      .put(ADMIN_DISCOUNT_ROUTE.replace('{productId}', productId))
      .set(bearer(admin))
      .send({ basisPoints: 0 })
      .expect(200);

    const restored = await request(server).get(CART_ROUTE).set(bearer(customer)).expect(200);
    expect(bodyOf<CartBody>(restored).lines[0]).toMatchObject({
      lastKnownUnitPriceMinor: 129900,
      currentUnitPriceMinor: 129900,
      priceChanged: false,
    });
  });

  it('refuses an invalid cart or wishlist request', async () => {
    const customer = await createCustomer('cart.invalid.customer');

    const noQuantity = await request(server)
      .post(CART_ITEMS_ROUTE)
      .set(bearer(customer))
      .send({ variantId: UNKNOWN_ID })
      .expect(400);
    expect(bodyOf<ErrorBody>(noQuantity).code).toBe('VALIDATION_ERROR');
    assertMatchesContract('post', CART_ITEMS_ROUTE, 400, noQuantity.body);

    const zeroQuantity = await request(server)
      .post(CART_ITEMS_ROUTE)
      .set(bearer(customer))
      .send({ variantId: UNKNOWN_ID, quantity: 0 })
      .expect(400);
    expect(bodyOf<ErrorBody>(zeroQuantity).code).toBe('VALIDATION_ERROR');

    const unknownField = await request(server)
      .post(CART_ITEMS_ROUTE)
      .set(bearer(customer))
      .send({ variantId: UNKNOWN_ID, quantity: 1, reserve: true })
      .expect(400);
    expect(bodyOf<ErrorBody>(unknownField).code).toBe('VALIDATION_ERROR');

    const missingItem = await request(server)
      .patch(CART_ITEM_ROUTE.replace('{itemId}', UNKNOWN_ID))
      .set(bearer(customer))
      .send({ quantity: 1 })
      .expect(404);
    expect(bodyOf<ErrorBody>(missingItem).code).toBe('CART_ITEM_NOT_FOUND');
    assertMatchesContract('patch', CART_ITEM_ROUTE, 404, missingItem.body);
  });

  it('refuses an administrator from using a customer cart or wishlist', async () => {
    const admin = await createAdministrator('cart.role.admin');

    const denied = await request(server).get(CART_ROUTE).set(bearer(admin)).expect(403);
    expect(bodyOf<ErrorBody>(denied)).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    assertMatchesContract('get', CART_ROUTE, 403, denied.body);

    const deniedWishlist = await request(server).get(WISHLIST_ROUTE).set(bearer(admin)).expect(403);
    expect(bodyOf<ErrorBody>(deniedWishlist)).toMatchObject({
      statusCode: 403,
      code: 'FORBIDDEN',
    });
    assertMatchesContract('get', WISHLIST_ROUTE, 403, deniedWishlist.body);
  });

  it('never shows one customer the cart or wishlist of another', async () => {
    const admin = await createAdministrator('cart.isolation.admin');
    const first = await createCustomer('cart.isolation.first');
    const second = await createCustomer('cart.isolation.second');
    const { productId, variantId } = await seedProduct(admin, 'Desk Lamp');

    await request(server)
      .post(CART_ITEMS_ROUTE)
      .set(bearer(first))
      .send({ variantId, quantity: 1 })
      .expect(201);
    await request(server).post(WISHLIST_ROUTE).set(bearer(first)).send({ productId }).expect(201);

    const otherCart = await request(server).get(CART_ROUTE).set(bearer(second)).expect(200);
    expect(bodyOf<CartBody>(otherCart).lines).toEqual([]);

    const otherWishlist = await request(server).get(WISHLIST_ROUTE).set(bearer(second)).expect(200);
    expect(bodyOf<WishlistBody>(otherWishlist).items).toEqual([]);
  });

  it('keeps a wishlist of saved products', async () => {
    const admin = await createAdministrator('wishlist.journey.admin');
    const customer = await createCustomer('wishlist.journey.customer');
    const { productId } = await seedProduct(admin, 'Ceramic Bowl');

    const empty = await request(server).get(WISHLIST_ROUTE).set(bearer(customer)).expect(200);
    expect(bodyOf<WishlistBody>(empty).items).toEqual([]);
    assertMatchesContract('get', WISHLIST_ROUTE, 200, empty.body);

    const saved = await request(server)
      .post(WISHLIST_ROUTE)
      .set(bearer(customer))
      .send({ productId })
      .expect(201);
    expect(bodyOf<WishlistBody>(saved).items).toHaveLength(1);
    expect(bodyOf<WishlistBody>(saved).items[0]).toMatchObject({
      productId,
      productName: 'Ceramic Bowl',
      currentPriceMinor: 129900,
      purchasable: true,
    });
    assertMatchesContract('post', WISHLIST_ROUTE, 201, saved.body);

    // Saving the same product again leaves exactly one entry.
    const again = await request(server)
      .post(WISHLIST_ROUTE)
      .set(bearer(customer))
      .send({ productId })
      .expect(201);
    expect(bodyOf<WishlistBody>(again).items).toHaveLength(1);

    const itemId = bodyOf<WishlistBody>(saved).items[0]?.id ?? '';
    const removed = await request(server)
      .delete(WISHLIST_ITEM_ROUTE.replace('{itemId}', itemId))
      .set(bearer(customer))
      .expect(200);
    expect(bodyOf<WishlistBody>(removed).items).toEqual([]);
    assertMatchesContract('delete', WISHLIST_ITEM_ROUTE, 200, removed.body);

    const missing = await request(server)
      .delete(WISHLIST_ITEM_ROUTE.replace('{itemId}', UNKNOWN_ID))
      .set(bearer(customer))
      .expect(404);
    expect(bodyOf<ErrorBody>(missing).code).toBe('WISHLIST_ITEM_NOT_FOUND');
    assertMatchesContract('delete', WISHLIST_ITEM_ROUTE, 404, missing.body);
  });

  it('never reserves or holds stock for a cart', async () => {
    const admin = await createAdministrator('cart.stock.admin');
    const customer = await createCustomer('cart.stock.customer');
    const { variantId } = await seedProduct(admin, 'Stocked Vase');

    await request(server)
      .post(CART_ITEMS_ROUTE)
      .set(bearer(customer))
      .send({ variantId, quantity: 9 })
      .expect(201);

    const inventory = await database.prisma.inventoryItem.findFirst({
      where: { variantId },
    });
    expect(inventory?.onHand ?? 0).toBe(0);
    expect(inventory?.reserved ?? 0).toBe(0);
    expect(await database.prisma.reservation.count()).toBe(0);
  });
});
