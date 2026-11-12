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
import { resetReviewDatabase } from '../helpers/review-database';
import { testConfigurationFor } from '../helpers/test-configuration';

const CONFIGURATION = testConfigurationFor('e2e');
const CORRELATION_ID = '9c3d8e3f-9f5a-4c0d-9e2f-3a4b5c6d7e8f';

const CUSTOMER_PASSWORD = 'Admin-Customer-Passphrase-1';
const ADMIN_PASSWORD = 'Admin-Administrator-Passphrase-2';

const OVERVIEW_ROUTE = '/api/v1/admin/overview';
const CUSTOMERS_ROUTE = '/api/v1/admin/customers';
const CUSTOMER_ROUTE = '/api/v1/admin/customers/{customerId}';
const AUDIT_ROUTE = '/api/v1/admin/audit';
const UNKNOWN_CUSTOMER_ID = '11111111-1111-4111-8111-111111111111';

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

describe('administration HTTP contract', () => {
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

  it('refuses every administrative route from an anonymous caller', async () => {
    for (const route of [OVERVIEW_ROUTE, CUSTOMERS_ROUTE, AUDIT_ROUTE]) {
      const response = await request(server).get(route).expect(401);
      expect(bodyOf<ErrorBody>(response)).toMatchObject({
        statusCode: 401,
        code: 'UNAUTHENTICATED',
      });
    }
  });

  it('refuses every administrative route from a customer', async () => {
    const customer = await createCustomer('admin-boundary-customer');
    for (const route of [OVERVIEW_ROUTE, CUSTOMERS_ROUTE, AUDIT_ROUTE]) {
      const response = await request(server).get(route).set(bearer(customer)).expect(403);
      expect(bodyOf<ErrorBody>(response)).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    }
  });

  it('reads the operational picture for an administrator', async () => {
    const admin = await createAdministrator('admin-overview-admin');
    const response = await request(server).get(OVERVIEW_ROUTE).set(bearer(admin)).expect(200);
    const body = bodyOf<{ orders: unknown[]; currency: string }>(response);
    assertMatchesContract('get', OVERVIEW_ROUTE, 200, body);
    expect(body.currency).toBe('EGP');
    expect(Array.isArray(body.orders)).toBe(true);
  });

  it('lists the customers and refuses an unknown one', async () => {
    const admin = await createAdministrator('admin-customers-admin');
    const customer = await createCustomer('admin-customers-customer');
    const listed = bodyOf<{ customers: { customerId: string; email: string | null }[] }>(
      await request(server).get(CUSTOMERS_ROUTE).set(bearer(admin)).expect(200),
    );
    assertMatchesContract('get', CUSTOMERS_ROUTE, 200, listed);
    expect(listed.customers.some((entry) => entry.email !== null)).toBe(true);

    const missing = await request(server)
      .get(CUSTOMER_ROUTE.replace('{customerId}', UNKNOWN_CUSTOMER_ID))
      .set(bearer(admin))
      .expect(404);
    expect(bodyOf<ErrorBody>(missing)).toMatchObject({
      statusCode: 404,
      code: 'CUSTOMER_NOT_FOUND',
    });
    void customer;
  });

  it('reads the security trail for an administrator', async () => {
    const admin = await createAdministrator('admin-audit-admin');
    const response = await request(server).get(AUDIT_ROUTE).set(bearer(admin)).expect(200);
    const body = bodyOf<{ events: unknown[] }>(response);
    assertMatchesContract('get', AUDIT_ROUTE, 200, body);
    expect(Array.isArray(body.events)).toBe(true);
  });
  it('documents stable customer pages and exact account details behind the administrator boundary', async () => {
    const admin = await createAdministrator('customer-pages-admin');
    const customer = await createCustomer('customer-pages-customer');
    await database.prisma.user.create({
      data: {
        email: 'customer-page-extra@nordhaven.test',
        passwordHash: 'local-test-only-not-a-login-credential',
      },
    });
    const firstResponse = await request(server)
      .get(CUSTOMERS_ROUTE)
      .query({ limit: 1 })
      .set(bearer(admin))
      .expect(200);
    const first = bodyOf<{ customers: { customerId: string }[]; nextCursor: string | null }>(
      firstResponse,
    );
    assertMatchesContract('get', CUSTOMERS_ROUTE, 200, first);
    expect(first.customers).toHaveLength(1);
    expect(first.nextCursor).not.toBeNull();
    const second = bodyOf<{ customers: { customerId: string }[]; nextCursor: string | null }>(
      await request(server)
        .get(CUSTOMERS_ROUTE)
        .query({ limit: 1, cursor: first.nextCursor })
        .set(bearer(admin))
        .expect(200),
    );
    expect(second.customers[0]?.customerId).not.toBe(first.customers[0]?.customerId);
    await request(server).get(CUSTOMERS_ROUTE).query({ limit: 201 }).set(bearer(admin)).expect(400);
    await request(server)
      .get(CUSTOMERS_ROUTE)
      .query({ cursor: 'not-a-cursor' })
      .set(bearer(admin))
      .expect(400);
    await request(server)
      .get(CUSTOMERS_ROUTE)
      .query({ limit: 1 })
      .set(bearer(customer))
      .expect(403);
    const user = await database.prisma.user.findFirstOrThrow({
      where: { email: 'customer-pages-customer@nordhaven.test' },
    });
    const response = await request(server)
      .get(CUSTOMER_ROUTE.replace('{customerId}', user.id))
      .set(bearer(admin))
      .expect(200);
    assertMatchesContract('get', CUSTOMER_ROUTE, 200, response.body);
    expect(response.body).toMatchObject({
      customerId: user.id,
      orderCount: 0,
      recordsTruncated: false,
    });
    expect(response.body).not.toHaveProperty('passwordHash');
  });
});
