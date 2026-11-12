import { readFileSync } from 'node:fs';
import path from 'node:path';
import OpenAPIResponseValidator from 'openapi-response-validator';
import type { OpenAPIResponseValidatorArgs } from 'openapi-response-validator';
import request from 'supertest';
import { createApplication } from '../../apps/api/src/bootstrap/create-application';
import { AdministratorProvisioningService } from '../../apps/api/src/modules/identity/application/administrator-provisioning.service';
import { generateTotpCode, timeStepFor } from '../../apps/api/src/modules/identity/crypto/totp';
import { DatabaseService } from '../../apps/api/src/platform/database/database.service';
import { resetCatalogDatabase } from '../helpers/catalog-database';
import { resetIdentityDatabase } from '../helpers/identity-database';
import { testConfigurationFor } from '../helpers/test-configuration';

const CONFIGURATION = testConfigurationFor('e2e');
const CORRELATION_ID = '5a2b6c1e-7d3f-4a8b-9c0d-1e2f3a4b5c6d';

const ADMIN_PASSWORD = 'Catalog-Administrator-Passphrase-1';
const CUSTOMER_PASSWORD = 'Catalog-Customer-Passphrase-2';

const CATEGORIES_ROUTE = '/api/v1/admin/catalog/categories';
const CATEGORY_ROUTE = '/api/v1/admin/catalog/categories/{categoryId}';
const BRANDS_ROUTE = '/api/v1/admin/catalog/brands';
const BRAND_ROUTE = '/api/v1/admin/catalog/brands/{brandId}';
const PRODUCTS_ROUTE = '/api/v1/admin/catalog/products';
const PRODUCT_ROUTE = '/api/v1/admin/catalog/products/{productId}';
const IMAGES_ROUTE = '/api/v1/admin/catalog/products/{productId}/images';
const ATTRIBUTES_ROUTE = '/api/v1/admin/catalog/products/{productId}/attributes';
const STATUS_ROUTE = '/api/v1/admin/catalog/products/{productId}/status';
const DISCOUNT_ROUTE = '/api/v1/admin/catalog/products/{productId}/discount';
const VARIANTS_ROUTE = '/api/v1/admin/catalog/products/{productId}/variants';
const VARIANT_ROUTE = '/api/v1/admin/catalog/variants/{variantId}';

const PUBLIC_CATEGORIES = '/api/v1/catalog/categories';
const PUBLIC_BRANDS = '/api/v1/catalog/brands';
const PUBLIC_PRODUCTS = '/api/v1/catalog/products';
const PUBLIC_PRODUCT = '/api/v1/catalog/products/{slug}';

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

interface CategoryBody {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  position: number;
  children: CategoryBody[];
  createdAt: string;
  updatedAt: string;
}

interface CategoriesBody {
  categories: CategoryBody[];
}

interface BrandBody {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

interface BrandsBody {
  brands: BrandBody[];
}

interface VariantBody {
  id: string;
  sku: string;
  color: string | null;
  size: string | null;
  material: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

interface ProductBody {
  id: string;
  name: string;
  slug: string;
  description: string;
  status: string;
  basePriceMinor: number;
  baseCurrency: string;
  discountBasisPoints: number;
  effectivePriceMinor: number;
  category: { id: string; name: string; slug: string };
  brand: { id: string; name: string; slug: string };
  images: { url: string; altText: string | null; position: number }[];
  attributes: { name: string; value: string; position: number }[];
  variants: VariantBody[];
  createdAt: string;
  updatedAt: string;
}

interface ProductsBody {
  items: ProductBody[];
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
// Catalog HTTP contract
// ---------------------------------------------------------------------------------------------

describe('catalog HTTP contract', () => {
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
    await resetCatalogDatabase(database);
    await resetIdentityDatabase(database);
  }, 30_000);

  afterEach(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetCatalogDatabase(database);
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

  async function createCategory(
    token: string,
    body: Record<string, unknown>,
  ): Promise<CategoryBody> {
    const response = await request(server)
      .post(CATEGORIES_ROUTE)
      .set(bearer(token))
      .send(body)
      .expect(201);
    return bodyOf<CategoryBody>(response);
  }

  async function createBrand(token: string, name: string): Promise<BrandBody> {
    const response = await request(server)
      .post(BRANDS_ROUTE)
      .set(bearer(token))
      .send({ name })
      .expect(201);
    return bodyOf<BrandBody>(response);
  }

  async function createProduct(
    token: string,
    categoryId: string,
    brandId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<ProductBody> {
    const response = await request(server)
      .post(PRODUCTS_ROUTE)
      .set(bearer(token))
      .send({
        name: 'Oak Dining Table',
        description: 'Solid oak dining table.',
        categoryId,
        brandId,
        basePriceMinor: 129900,
        baseCurrency: 'GBP',
        ...overrides,
      })
      .expect(201);
    return bodyOf<ProductBody>(response);
  }

  async function seedCatalog(token: string): Promise<{ categoryId: string; brandId: string }> {
    const category = await createCategory(token, { name: 'Furniture' });
    const brand = await createBrand(token, 'Northwind');
    return { categoryId: category.id, brandId: brand.id };
  }

  it('protects every administrative catalog route from an anonymous caller', async () => {
    const routes: readonly { method: Method; path: string }[] = [
      { method: 'post', path: CATEGORIES_ROUTE },
      { method: 'get', path: CATEGORIES_ROUTE },
      { method: 'patch', path: `/api/v1/admin/catalog/categories/${UNKNOWN_ID}` },
      { method: 'delete', path: `/api/v1/admin/catalog/categories/${UNKNOWN_ID}` },
      { method: 'post', path: BRANDS_ROUTE },
      { method: 'get', path: BRANDS_ROUTE },
      { method: 'patch', path: `/api/v1/admin/catalog/brands/${UNKNOWN_ID}` },
      { method: 'delete', path: `/api/v1/admin/catalog/brands/${UNKNOWN_ID}` },
      { method: 'post', path: PRODUCTS_ROUTE },
      { method: 'get', path: PRODUCTS_ROUTE },
      { method: 'get', path: `/api/v1/admin/catalog/products/${UNKNOWN_ID}` },
      { method: 'patch', path: `/api/v1/admin/catalog/products/${UNKNOWN_ID}` },
      { method: 'delete', path: `/api/v1/admin/catalog/products/${UNKNOWN_ID}` },
      { method: 'put', path: `/api/v1/admin/catalog/products/${UNKNOWN_ID}/images` },
      { method: 'put', path: `/api/v1/admin/catalog/products/${UNKNOWN_ID}/attributes` },
      { method: 'put', path: `/api/v1/admin/catalog/products/${UNKNOWN_ID}/status` },
      { method: 'put', path: `/api/v1/admin/catalog/products/${UNKNOWN_ID}/discount` },
      { method: 'post', path: `/api/v1/admin/catalog/products/${UNKNOWN_ID}/variants` },
      { method: 'patch', path: `/api/v1/admin/catalog/variants/${UNKNOWN_ID}` },
      { method: 'delete', path: `/api/v1/admin/catalog/variants/${UNKNOWN_ID}` },
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
    const customerToken = await createCustomer('catalog.denied.customer');

    const denied = await request(server)
      .get(CATEGORIES_ROUTE)
      .set(bearer(customerToken))
      .expect(403);
    expect(bodyOf<ErrorBody>(denied)).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    assertMatchesContract('get', CATEGORIES_ROUTE, 403, denied.body);

    const audited = await database.prisma.securityEvent.findMany({
      where: { eventType: 'ADMIN_ACCESS_DENIED' },
    });
    expect(audited.length).toBeGreaterThan(0);
  });

  it('lets an administrator build the whole catalog and browse it anonymously', async () => {
    const admin = await createAdministrator('catalog.admin');

    const root = await createCategory(admin, { name: 'Living Room' });
    expect(root).toMatchObject({ name: 'Living Room', slug: 'living-room', parentId: null });
    expect(root.id).toMatch(UUID_PATTERN);
    assertMatchesContract('post', CATEGORIES_ROUTE, 201, root);

    const child = await createCategory(admin, { name: 'Sofas', parentId: root.id });
    expect(child.parentId).toBe(root.id);

    const brand = await createBrand(admin, 'Northwind');
    assertMatchesContract('post', BRANDS_ROUTE, 201, brand);

    const product = await createProduct(admin, root.id, brand.id);
    expect(product).toMatchObject({
      status: 'DRAFT',
      basePriceMinor: 129900,
      baseCurrency: 'GBP',
      images: [],
      attributes: [],
      variants: [],
    });
    expect(product.category).toMatchObject({ id: root.id });
    expect(product.brand).toMatchObject({ id: brand.id });
    assertMatchesContract('post', PRODUCTS_ROUTE, 201, product);

    // Images and attributes are replaced as whole collections.
    const withImages = await request(server)
      .put(`/api/v1/admin/catalog/products/${product.id}/images`)
      .set(bearer(admin))
      .send({
        images: [
          { url: 'https://cdn.example.com/a.jpg', position: 1 },
          { url: 'https://cdn.example.com/b.jpg', altText: 'Side view', position: 0 },
        ],
      })
      .expect(200);
    expect(bodyOf<ProductBody>(withImages).images.map((image) => image.position)).toEqual([0, 1]);
    assertMatchesContract('put', IMAGES_ROUTE, 200, withImages.body);

    const withAttributes = await request(server)
      .put(`/api/v1/admin/catalog/products/${product.id}/attributes`)
      .set(bearer(admin))
      .send({ attributes: [{ name: 'Material', value: 'Oak', position: 0 }] })
      .expect(200);
    expect(bodyOf<ProductBody>(withAttributes).attributes).toEqual([
      { name: 'Material', value: 'Oak', position: 0 },
    ]);
    assertMatchesContract('put', ATTRIBUTES_ROUTE, 200, withAttributes.body);

    // A SKU is normalized to upper case at the boundary.
    const variant = bodyOf<VariantBody>(
      await request(server)
        .post(`/api/v1/admin/catalog/products/${product.id}/variants`)
        .set(bearer(admin))
        .send({ sku: ' oak-table-01 ', color: 'Oak' })
        .expect(201),
    );
    expect(variant.sku).toBe('OAK-TABLE-01');
    assertMatchesContract('post', VARIANTS_ROUTE, 201, variant);

    // Publishing requires a sellable variant; the draft is invisible until then.
    const published = await request(server)
      .put(`/api/v1/admin/catalog/products/${product.id}/status`)
      .set(bearer(admin))
      .send({ status: 'PUBLISHED' })
      .expect(200);
    expect(bodyOf<ProductBody>(published).status).toBe('PUBLISHED');
    assertMatchesContract('put', STATUS_ROUTE, 200, published.body);

    // Anonymous browsing sees exactly the published product.
    const publicList = await request(server).get(PUBLIC_PRODUCTS).expect(200);
    const listed = bodyOf<ProductsBody>(publicList);
    expect(listed.items.map((item) => item.slug)).toEqual(['oak-dining-table']);
    assertMatchesContract('get', PUBLIC_PRODUCTS, 200, publicList.body);

    const publicDetail = await request(server)
      .get('/api/v1/catalog/products/oak-dining-table')
      .expect(200);
    const detail = bodyOf<ProductBody>(publicDetail);
    expect(detail).toMatchObject({ status: 'PUBLISHED', slug: 'oak-dining-table' });
    expect(detail.variants.map((carried) => carried.sku)).toEqual(['OAK-TABLE-01']);
    assertOperationalHeaders(publicDetail);
    assertMatchesContract('get', PUBLIC_PRODUCT, 200, publicDetail.body);

    const tree = await request(server).get(PUBLIC_CATEGORIES).expect(200);
    const categories = bodyOf<CategoriesBody>(tree).categories;
    expect(categories.map((node) => node.slug)).toEqual(['living-room']);
    expect(categories[0]?.children.map((node) => node.slug)).toEqual(['sofas']);
    assertMatchesContract('get', PUBLIC_CATEGORIES, 200, tree.body);

    const brands = await request(server).get(PUBLIC_BRANDS).expect(200);
    expect(bodyOf<BrandsBody>(brands).brands.map((entry) => entry.slug)).toEqual(['northwind']);
    assertMatchesContract('get', PUBLIC_BRANDS, 200, brands.body);

    // The administrative read sees the same product by identifier and pages deterministically.
    const adminList = await request(server)
      .get(`${PRODUCTS_ROUTE}?limit=10`)
      .set(bearer(admin))
      .expect(200);
    expect(bodyOf<ProductsBody>(adminList).items.map((item) => item.id)).toEqual([product.id]);
    assertMatchesContract('get', PRODUCTS_ROUTE, 200, adminList.body);

    const adminDetail = await request(server)
      .get(`/api/v1/admin/catalog/products/${product.id}`)
      .set(bearer(admin))
      .expect(200);
    expect(bodyOf<ProductBody>(adminDetail).status).toBe('PUBLISHED');
    assertMatchesContract('get', PRODUCT_ROUTE, 200, adminDetail.body);
  });

  it('never discloses an unpublished product through the browsing surface', async () => {
    const admin = await createAdministrator('catalog.hidden.admin');
    const { categoryId, brandId } = await seedCatalog(admin);
    const draft = await createProduct(admin, categoryId, brandId, { name: 'Secret Bench' });
    await request(server)
      .post(`/api/v1/admin/catalog/products/${draft.id}/variants`)
      .set(bearer(admin))
      .send({ sku: 'SECRET-BENCH-01' })
      .expect(201);

    // The draft is absent from the listing and answers not-found by slug, exactly like an unknown one.
    const publicList = await request(server).get(PUBLIC_PRODUCTS).expect(200);
    expect(bodyOf<ProductsBody>(publicList).items).toEqual([]);

    const draftSlug = await request(server)
      .get('/api/v1/catalog/products/secret-bench')
      .expect(404);
    const unknownSlug = await request(server)
      .get('/api/v1/catalog/products/no-such-product')
      .expect(404);
    expect(bodyOf<ErrorBody>(draftSlug).code).toBe('PRODUCT_NOT_FOUND');
    expect(bodyOf<ErrorBody>(draftSlug).message).toBe(bodyOf<ErrorBody>(unknownSlug).message);
    assertMatchesContract('get', PUBLIC_PRODUCT, 404, draftSlug.body);
  });

  it('sells a product at a direct discount and shows the effective price', async () => {
    const admin = await createAdministrator('catalog.discount.admin');
    const { categoryId, brandId } = await seedCatalog(admin);
    const product = await createProduct(admin, categoryId, brandId, {
      name: 'Discounted Table',
      basePriceMinor: 1999,
    });
    await request(server)
      .post(`/api/v1/admin/catalog/products/${product.id}/variants`)
      .set(bearer(admin))
      .send({ sku: 'DISCOUNT-01' })
      .expect(201);
    await request(server)
      .put(`/api/v1/admin/catalog/products/${product.id}/status`)
      .set(bearer(admin))
      .send({ status: 'PUBLISHED' })
      .expect(200);

    // A new product has no discount, so its effective price is its base price.
    const listed = bodyOf<ProductsBody>(await request(server).get(PUBLIC_PRODUCTS).expect(200));
    expect(listed.items[0]).toMatchObject({
      discountBasisPoints: 0,
      effectivePriceMinor: 1999,
    });

    // 1999 * 5000 / 10000 is exactly 999.5, which rounds half up to 1000.
    const discounted = await request(server)
      .put(`/api/v1/admin/catalog/products/${product.id}/discount`)
      .set(bearer(admin))
      .send({ basisPoints: 5000 })
      .expect(200);
    expect(bodyOf<ProductBody>(discounted)).toMatchObject({
      basePriceMinor: 1999,
      discountBasisPoints: 5000,
      effectivePriceMinor: 999,
    });
    assertMatchesContract('put', DISCOUNT_ROUTE, 200, discounted.body);

    // The anonymous surface shows the price the customer pays.
    const publicList = await request(server).get(PUBLIC_PRODUCTS).expect(200);
    expect(bodyOf<ProductsBody>(publicList).items[0]).toMatchObject({
      discountBasisPoints: 5000,
      effectivePriceMinor: 999,
    });
    assertMatchesContract('get', PUBLIC_PRODUCTS, 200, publicList.body);

    // The detail projection carries the same values.
    const detail = await request(server)
      .get('/api/v1/catalog/products/discounted-table')
      .expect(200);
    expect(bodyOf<ProductBody>(detail)).toMatchObject({
      discountBasisPoints: 5000,
      effectivePriceMinor: 999,
    });
    assertMatchesContract('get', PUBLIC_PRODUCT, 200, detail.body);

    // Removing the discount restores the base price.
    const removed = await request(server)
      .put(`/api/v1/admin/catalog/products/${product.id}/discount`)
      .set(bearer(admin))
      .send({ basisPoints: 0 })
      .expect(200);
    expect(bodyOf<ProductBody>(removed)).toMatchObject({
      discountBasisPoints: 0,
      effectivePriceMinor: 1999,
    });
  });

  it('refuses an invalid discount and a discount on a product that does not exist', async () => {
    const admin = await createAdministrator('catalog.discount.invalid.admin');
    const { categoryId, brandId } = await seedCatalog(admin);
    const product = await createProduct(admin, categoryId, brandId);

    const negative = await request(server)
      .put(`/api/v1/admin/catalog/products/${product.id}/discount`)
      .set(bearer(admin))
      .send({ basisPoints: -1 })
      .expect(400);
    expect(bodyOf<ErrorBody>(negative).code).toBe('VALIDATION_ERROR');
    assertMatchesContract('put', DISCOUNT_ROUTE, 400, negative.body);

    const fractional = await request(server)
      .put(`/api/v1/admin/catalog/products/${product.id}/discount`)
      .set(bearer(admin))
      .send({ basisPoints: 12.5 })
      .expect(400);
    expect(bodyOf<ErrorBody>(fractional).code).toBe('VALIDATION_ERROR');

    const unknown = await request(server)
      .put(`/api/v1/admin/catalog/products/${UNKNOWN_ID}/discount`)
      .set(bearer(admin))
      .send({ basisPoints: 1000 })
      .expect(404);
    expect(bodyOf<ErrorBody>(unknown).code).toBe('PRODUCT_NOT_FOUND');
    assertMatchesContract('put', DISCOUNT_ROUTE, 404, unknown.body);
  });

  it('refuses an anonymous or a customer caller from changing a discount', async () => {
    const admin = await createAdministrator('catalog.discount.denied.admin');
    const { categoryId, brandId } = await seedCatalog(admin);
    const product = await createProduct(admin, categoryId, brandId);

    const anonymous = await request(server)
      .put(`/api/v1/admin/catalog/products/${product.id}/discount`)
      .send({ basisPoints: 2000 })
      .expect(401);
    expect(bodyOf<ErrorBody>(anonymous)).toMatchObject({
      statusCode: 401,
      code: 'UNAUTHENTICATED',
    });
    assertOperationalHeaders(anonymous);
    assertMatchesContract('put', DISCOUNT_ROUTE, 401, anonymous.body);

    const customerToken = await createCustomer('catalog.discount.customer');
    const denied = await request(server)
      .put(`/api/v1/admin/catalog/products/${product.id}/discount`)
      .set(bearer(customerToken))
      .send({ basisPoints: 2000 })
      .expect(403);
    expect(bodyOf<ErrorBody>(denied)).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    assertMatchesContract('put', DISCOUNT_ROUTE, 403, denied.body);

    // Nothing was persisted by either refusal.
    const stored = await database.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(stored.discountBasisPoints).toBe(0);
    expect(stored.effectivePriceMinor).toBe(stored.basePriceMinor);
  });

  it('searches and filters the published catalog anonymously', async () => {
    const admin = await createAdministrator('catalog.search.admin');
    const root = await createCategory(admin, { name: 'Living Room' });
    const child = await createCategory(admin, { name: 'Sofas', parentId: root.id });
    const brand = await createBrand(admin, 'Northwind');
    const other = await createBrand(admin, 'Southwind');

    const publish = async (
      name: string,
      categoryId: string,
      brandId: string,
      basePriceMinor: number,
      attributes: { name: string; value: string }[] = [],
    ): Promise<void> => {
      const product = await createProduct(admin, categoryId, brandId, {
        name,
        description: `${name} description.`,
        basePriceMinor,
      });
      await request(server)
        .post(`/api/v1/admin/catalog/products/${product.id}/variants`)
        .set(bearer(admin))
        .send({ sku: `SKU-${name.replace(/\s+/g, '-')}` })
        .expect(201);
      if (attributes.length > 0) {
        await request(server)
          .put(`/api/v1/admin/catalog/products/${product.id}/attributes`)
          .set(bearer(admin))
          .send({
            attributes: attributes.map((attribute, index) => ({ ...attribute, position: index })),
          })
          .expect(200);
      }
      await request(server)
        .put(`/api/v1/admin/catalog/products/${product.id}/status`)
        .set(bearer(admin))
        .send({ status: 'PUBLISHED' })
        .expect(200);
    };

    await publish('Oak Sofa', child.id, brand.id, 100000, [
      { name: 'Colour', value: 'Blue' },
      { name: 'Material', value: 'Oak' },
    ]);
    await publish('Oak Table', root.id, brand.id, 50000);
    await publish('Reading Lamp', root.id, other.id, 25000);

    const names = async (query: string): Promise<string[]> => {
      const response = await request(server).get(`${PUBLIC_PRODUCTS}?${query}`).expect(200);
      assertMatchesContract('get', PUBLIC_PRODUCTS, 200, response.body);
      return bodyOf<ProductsBody>(response).items.map((item) => item.name);
    };

    // A free-text term matches the name case-insensitively.
    expect(await names('q=OAK')).toEqual(['Oak Sofa', 'Oak Table']);
    // A category filter matches the category and its direct children.
    expect(await names('category=living-room')).toEqual(['Oak Sofa', 'Oak Table', 'Reading Lamp']);
    // A brand filter matches exactly that brand.
    expect(await names('brand=southwind')).toEqual(['Reading Lamp']);
    // An attribute filter matches the name and the value case-insensitively.
    expect(await names('attribute=colour:blue')).toEqual(['Oak Sofa']);
    // Several attribute filters are combined with AND.
    expect(await names('attribute=material:oak&attribute=colour:blue')).toEqual(['Oak Sofa']);
    expect(await names('attribute=material:oak&attribute=colour:red')).toEqual([]);
    // A price range requires an explicit currency and compares the effective price.
    expect(await names('maxPrice=60000&currency=GBP')).toEqual(['Oak Table', 'Reading Lamp']);
    expect(await names('minPrice=50000&currency=GBP')).toEqual(['Oak Sofa', 'Oak Table']);
    // A price range never matches a product in another currency.
    expect(await names('maxPrice=1000000&currency=USD')).toEqual([]);
    // A name that does not exist matches nothing.
    expect(await names('category=no-such-category')).toEqual([]);
    expect(await names('brand=no-such-brand')).toEqual([]);
    // The filters combine.
    expect(
      await names('q=oak&category=living-room&brand=northwind&maxPrice=60000&currency=GBP'),
    ).toEqual(['Oak Table']);
  });

  it('refuses an invalid search or filter request', async () => {
    // A price range without a currency is refused.
    const noCurrency = await request(server).get(`${PUBLIC_PRODUCTS}?minPrice=100`).expect(400);
    expect(bodyOf<ErrorBody>(noCurrency).code).toBe('VALIDATION_ERROR');
    assertMatchesContract('get', PUBLIC_PRODUCTS, 400, noCurrency.body);

    // An inverted price range is refused.
    const inverted = await request(server)
      .get(`${PUBLIC_PRODUCTS}?minPrice=900&maxPrice=100&currency=GBP`)
      .expect(400);
    expect(bodyOf<ErrorBody>(inverted).code).toBe('VALIDATION_ERROR');

    // An unknown query parameter is refused rather than ignored.
    const unknown = await request(server).get(`${PUBLIC_PRODUCTS}?sort=price`).expect(400);
    expect(bodyOf<ErrorBody>(unknown).code).toBe('VALIDATION_ERROR');

    // A search term with nothing usable in it is refused.
    const emptyTerm = await request(server).get(`${PUBLIC_PRODUCTS}?q=%21%21%21`).expect(400);
    expect(bodyOf<ErrorBody>(emptyTerm).code).toBe('VALIDATION_ERROR');

    // An attribute filter without both parts is refused.
    const badAttribute = await request(server)
      .get(`${PUBLIC_PRODUCTS}?attribute=colour`)
      .expect(400);
    expect(bodyOf<ErrorBody>(badAttribute).code).toBe('VALIDATION_ERROR');
  });

  it('enforces the catalog invariants at the boundary', async () => {
    const admin = await createAdministrator('catalog.invariants.admin');
    const { categoryId, brandId } = await seedCatalog(admin);

    // The two-level category hierarchy.
    const root = await createCategory(admin, { name: 'Bedroom' });
    const child = await createCategory(admin, { name: 'Beds', parentId: root.id });
    const thirdLevel = await request(server)
      .post(CATEGORIES_ROUTE)
      .set(bearer(admin))
      .send({ name: 'Bunk Beds', parentId: child.id })
      .expect(409);
    expect(bodyOf<ErrorBody>(thirdLevel).code).toBe('CATALOG_CONFLICT');
    assertMatchesContract('post', CATEGORIES_ROUTE, 409, thirdLevel.body);

    // A duplicate slug is a conflict, not a silent overwrite.
    const duplicate = await request(server)
      .post(CATEGORIES_ROUTE)
      .set(bearer(admin))
      .send({ name: 'bedroom' })
      .expect(409);
    expect(bodyOf<ErrorBody>(duplicate).code).toBe('CATALOG_CONFLICT');

    // A SKU is unique across the whole catalog regardless of the product.
    const first = await createProduct(admin, categoryId, brandId);
    const second = await createProduct(admin, categoryId, brandId, { name: 'Oak Bench' });
    await request(server)
      .post(`/api/v1/admin/catalog/products/${first.id}/variants`)
      .set(bearer(admin))
      .send({ sku: 'OAK-TABLE-01' })
      .expect(201);
    const duplicateSku = await request(server)
      .post(`/api/v1/admin/catalog/products/${second.id}/variants`)
      .set(bearer(admin))
      .send({ sku: 'oak-table-01' })
      .expect(409);
    expect(bodyOf<ErrorBody>(duplicateSku).code).toBe('CATALOG_CONFLICT');

    // Publishing without a sellable variant is refused.
    const unPublishable = await request(server)
      .put(`/api/v1/admin/catalog/products/${second.id}/status`)
      .set(bearer(admin))
      .send({ status: 'PUBLISHED' })
      .expect(409);
    expect(bodyOf<ErrorBody>(unPublishable).code).toBe('CATALOG_CONFLICT');
    assertMatchesContract('put', STATUS_ROUTE, 409, unPublishable.body);

    // Deleting a category that still holds a product is refused.
    const deleteBlocked = await request(server)
      .delete(`/api/v1/admin/catalog/categories/${categoryId}`)
      .set(bearer(admin))
      .expect(409);
    expect(bodyOf<ErrorBody>(deleteBlocked).code).toBe('CATALOG_CONFLICT');
    assertMatchesContract('delete', CATEGORY_ROUTE, 409, deleteBlocked.body);
  });

  it('rejects malformed catalog bodies and identifiers without echoing them', async () => {
    const admin = await createAdministrator('catalog.validation.admin');
    const { categoryId, brandId } = await seedCatalog(admin);
    const product = await createProduct(admin, categoryId, brandId);
    const canary = 'canary-product-name-6e7f';

    const unknownField = await request(server)
      .post(PRODUCTS_ROUTE)
      .set(bearer(admin))
      .send({
        name: canary,
        description: 'x',
        categoryId,
        brandId,
        basePriceMinor: 100,
        baseCurrency: 'GBP',
        inventory: 5,
      })
      .expect(400);
    expect(bodyOf<ErrorBody>(unknownField).code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(unknownField.body)).not.toContain(canary);
    assertMatchesContract('post', PRODUCTS_ROUTE, 400, unknownField.body);

    // A client cannot choose the lifecycle state or the slug.
    const clientStatus = await request(server)
      .post(PRODUCTS_ROUTE)
      .set(bearer(admin))
      .send({
        name: 'Desk',
        description: 'x',
        categoryId,
        brandId,
        basePriceMinor: 100,
        baseCurrency: 'GBP',
        status: 'PUBLISHED',
      })
      .expect(400);
    expect(bodyOf<ErrorBody>(clientStatus).code).toBe('VALIDATION_ERROR');

    // An exact integer price is mandatory: no fractions, no negative amounts.
    const unknownStatus = await request(server)
      .put(`/api/v1/admin/catalog/products/${product.id}/status`)
      .set(bearer(admin))
      .send({ status: 'DELETED' })
      .expect(400);
    expect(bodyOf<ErrorBody>(unknownStatus).code).toBe('VALIDATION_ERROR');

    const fractionalPrice = await request(server)
      .patch(`/api/v1/admin/catalog/products/${product.id}`)
      .set(bearer(admin))
      .send({ basePriceMinor: 12.5 })
      .expect(400);
    expect(bodyOf<ErrorBody>(fractionalPrice).code).toBe('VALIDATION_ERROR');

    // Duplicate image positions are refused at the boundary.
    const duplicatePositions = await request(server)
      .put(`/api/v1/admin/catalog/products/${product.id}/images`)
      .set(bearer(admin))
      .send({
        images: [
          { url: 'https://cdn.example.com/a.jpg', position: 0 },
          { url: 'https://cdn.example.com/b.jpg', position: 0 },
        ],
      })
      .expect(400);
    expect(bodyOf<ErrorBody>(duplicatePositions).code).toBe('VALIDATION_ERROR');

    // A malformed identifier is a boundary failure, not a lookup.
    const malformedId = await request(server)
      .get('/api/v1/admin/catalog/products/not-a-uuid')
      .set(bearer(admin))
      .expect(400);
    expect(bodyOf<ErrorBody>(malformedId).code).toBe('VALIDATION_ERROR');
  });

  it('answers an unknown catalog resource with the stable not-found contract', async () => {
    const admin = await createAdministrator('catalog.notfound.admin');

    const product = await request(server)
      .get(`/api/v1/admin/catalog/products/${UNKNOWN_ID}`)
      .set(bearer(admin))
      .expect(404);
    expect(bodyOf<ErrorBody>(product).code).toBe('PRODUCT_NOT_FOUND');
    assertMatchesContract('get', PRODUCT_ROUTE, 404, product.body);

    const category = await request(server)
      .patch(`/api/v1/admin/catalog/categories/${UNKNOWN_ID}`)
      .set(bearer(admin))
      .send({ name: 'Ghost' })
      .expect(404);
    expect(bodyOf<ErrorBody>(category).code).toBe('CATEGORY_NOT_FOUND');
    assertMatchesContract('patch', CATEGORY_ROUTE, 404, category.body);

    const brand = await request(server)
      .patch(`/api/v1/admin/catalog/brands/${UNKNOWN_ID}`)
      .set(bearer(admin))
      .send({ name: 'Ghost' })
      .expect(404);
    expect(bodyOf<ErrorBody>(brand).code).toBe('BRAND_NOT_FOUND');
    assertMatchesContract('patch', BRAND_ROUTE, 404, brand.body);

    const variant = await request(server)
      .patch(`/api/v1/admin/catalog/variants/${UNKNOWN_ID}`)
      .set(bearer(admin))
      .send({ color: 'Oak' })
      .expect(404);
    expect(bodyOf<ErrorBody>(variant).code).toBe('VARIANT_NOT_FOUND');
    assertMatchesContract('patch', VARIANT_ROUTE, 404, variant.body);
  });
});

// ---------------------------------------------------------------------------------------------
// Rate-limit proof (dedicated instance so the journey suite cannot consume the budget)
// ---------------------------------------------------------------------------------------------

describe('catalog HTTP contract rate limiting', () => {
  let app: Application;
  let server: Server;
  let database: DatabaseService;

  beforeAll(async () => {
    const created = await createApplication({ configuration: CONFIGURATION });
    app = created.app;
    server = app.getHttpServer() as Server;
    database = app.get(DatabaseService);
    await resetCatalogDatabase(database);
    await resetIdentityDatabase(database);
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  it('bounds anonymous catalog reads per client with a numeric retry hint', async () => {
    // The declared `catalog.read` policy allows 300 reads per window for one client.
    for (let attempt = 0; attempt < 300; attempt += 1) {
      await request(server).get(PUBLIC_BRANDS).expect(200);
    }

    const limited = await request(server).get(PUBLIC_BRANDS).expect(429);
    expect(bodyOf<ErrorBody>(limited).code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited.headers['cache-control']).toBe('no-store');
  }, 120_000);
});
