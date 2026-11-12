import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Writable } from 'node:stream';
import OpenAPIResponseValidator from 'openapi-response-validator';
import type { OpenAPIResponseValidatorArgs } from 'openapi-response-validator';
import request from 'supertest';
import { createApplication } from '../../apps/api/src/bootstrap/create-application';
import { AdministratorProvisioningService } from '../../apps/api/src/modules/identity/application/administrator-provisioning.service';
import { generateTotpCode, timeStepFor } from '../../apps/api/src/modules/identity/crypto/totp';
import { DatabaseService } from '../../apps/api/src/platform/database/database.service';
import { resetCustomerDatabase } from '../helpers/customer-database';
import { resetIdentityDatabase } from '../helpers/identity-database';
import { testConfigurationFor } from '../helpers/test-configuration';

const CONFIGURATION = testConfigurationFor('e2e');
const CORRELATION_ID = '3f6b6a1e-6a5c-4a6c-9a6f-3f2c1d0b8a72';

const PASSWORD = 'Customer-Passphrase-1';
const ADMIN_PASSWORD = 'Administrator-Passphrase-3';

const PROFILE_ROUTE = '/api/v1/customers/me/profile';
const ADDRESSES_ROUTE = '/api/v1/customers/me/addresses';
const ADDRESS_ROUTE = '/api/v1/customers/me/addresses/{addressId}';
const DEFAULT_ROUTE = '/api/v1/customers/me/addresses/{addressId}/default';

/** A well-formed identifier that never exists, so "unknown" and "someone else's" are comparable. */
const UNKNOWN_ADDRESS_ID = '9f1e0d9c-8b7a-4695-8432-1f0e9d8c7b99';

const ADDRESS_BODY = {
  recipientName: 'Ada Lovelace',
  line1: '1 Analytical Engine Way',
  city: 'London',
  countryCode: 'GB',
};

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

interface ProfileBody {
  displayName: string | null;
  phone: string | null;
  defaultAddressId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AddressBody {
  id: string;
  recipientName: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string | null;
  postalCode: string | null;
  countryCode: string;
  phone: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface AddressesBody {
  addresses: AddressBody[];
}

interface SessionBody {
  status: string;
  session?: { token: string; tokenType: string };
  challenge?: { token: string; purpose: string };
  user?: { email: string; role: string };
}

/** The flat shape returned by the second-factor completion, which is a session response. */
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

/**
 * Validates one observed response body against the committed OpenAPI document.
 *
 * The suite asserts behaviour against the artifact that is published, so a controller change that is
 * not reflected in the document (or a document that overstates a response) fails here rather than
 * silently drifting. `additionalProperties: false` makes an unexpected field a failure too.
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
// Customer HTTP contract
// ---------------------------------------------------------------------------------------------

describe('customer HTTP contract', () => {
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
    await resetCustomerDatabase(database);
    await resetIdentityDatabase(database);
  }, 30_000);

  afterEach(async () => {
    await app.close();
  });

  /** Registers and signs in a fresh customer, returning the session credential. */
  async function createCustomer(prefix: string): Promise<string> {
    const email = `${prefix}@nordhaven.test`;
    await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD })
      .expect(201);
    const signedIn = bodyOf<SessionBody>(
      await request(server)
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200),
    );
    const token = signedIn.session?.token;
    if (token === undefined) throw new Error('Expected a session credential');
    return token;
  }

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

  async function createAddress(token: string, overrides: Partial<AddressBody> = {}) {
    const response = await request(server)
      .post(ADDRESSES_ROUTE)
      .set(bearer(token))
      .send({ ...ADDRESS_BODY, ...overrides })
      .expect(201);
    return bodyOf<AddressBody>(response);
  }

  it('protects every customer route from an anonymous caller', async () => {
    const routes: readonly { method: Method; path: string }[] = [
      { method: 'get', path: PROFILE_ROUTE },
      { method: 'patch', path: PROFILE_ROUTE },
      { method: 'get', path: ADDRESSES_ROUTE },
      { method: 'post', path: ADDRESSES_ROUTE },
      { method: 'get', path: `/api/v1/customers/me/addresses/${UNKNOWN_ADDRESS_ID}` },
      { method: 'patch', path: `/api/v1/customers/me/addresses/${UNKNOWN_ADDRESS_ID}` },
      { method: 'delete', path: `/api/v1/customers/me/addresses/${UNKNOWN_ADDRESS_ID}` },
      { method: 'put', path: `/api/v1/customers/me/addresses/${UNKNOWN_ADDRESS_ID}/default` },
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

  it('creates, reads, updates, and clears the authenticated customer profile', async () => {
    const token = await createCustomer('profile.customer');

    const initial = await request(server).get(PROFILE_ROUTE).set(bearer(token)).expect(200);
    expect(bodyOf<ProfileBody>(initial)).toMatchObject({
      displayName: null,
      phone: null,
      defaultAddressId: null,
    });
    assertOperationalHeaders(initial);
    assertMatchesContract('get', PROFILE_ROUTE, 200, initial.body);

    // The profile is the customer's own storefront data: the account identity is never projected.
    expect(Object.keys(bodyOf<ProfileBody>(initial)).sort()).toEqual([
      'createdAt',
      'defaultAddressId',
      'displayName',
      'phone',
      'updatedAt',
    ]);

    const updated = await request(server)
      .patch(PROFILE_ROUTE)
      .set(bearer(token))
      .send({ displayName: '  Ada Lovelace  ', phone: ' +44 20 7946 0000 ' })
      .expect(200);
    expect(bodyOf<ProfileBody>(updated)).toMatchObject({
      displayName: 'Ada Lovelace',
      phone: '+44 20 7946 0000',
    });
    assertMatchesContract('patch', PROFILE_ROUTE, 200, updated.body);

    const reread = await request(server).get(PROFILE_ROUTE).set(bearer(token)).expect(200);
    expect(bodyOf<ProfileBody>(reread)).toMatchObject({
      displayName: 'Ada Lovelace',
      phone: '+44 20 7946 0000',
    });

    const cleared = await request(server)
      .patch(PROFILE_ROUTE)
      .set(bearer(token))
      .send({ phone: '   ' })
      .expect(200);
    expect(bodyOf<ProfileBody>(cleared).phone).toBeNull();
    expect(bodyOf<ProfileBody>(cleared).displayName).toBe('Ada Lovelace');
  });

  it('refuses a malformed profile update without echoing the submitted value', async () => {
    const token = await createCustomer('invalid.profile.customer');
    const canary = 'canary-display-name-4b71';

    const unknownField = await request(server)
      .patch(PROFILE_ROUTE)
      .set(bearer(token))
      .send({ displayName: canary, role: 'ADMIN' })
      .expect(400);
    expect(bodyOf<ErrorBody>(unknownField).code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(unknownField.body)).not.toContain(canary);
    assertMatchesContract('patch', PROFILE_ROUTE, 400, unknownField.body);

    const empty = await request(server)
      .patch(PROFILE_ROUTE)
      .set(bearer(token))
      .send({})
      .expect(400);
    expect(bodyOf<ErrorBody>(empty).code).toBe('VALIDATION_ERROR');

    const overLong = await request(server)
      .patch(PROFILE_ROUTE)
      .set(bearer(token))
      .send({ displayName: 'a'.repeat(121) })
      .expect(400);
    expect(bodyOf<ErrorBody>(overLong).code).toBe('VALIDATION_ERROR');

    const control = await request(server)
      .patch(PROFILE_ROUTE)
      .set(bearer(token))
      .send({ displayName: `Ada${String.fromCharCode(7)}Lovelace` })
      .expect(400);
    expect(bodyOf<ErrorBody>(control).code).toBe('VALIDATION_ERROR');
  });

  it('manages the saved-address lifecycle and the default selection', async () => {
    const token = await createCustomer('address.customer');

    const first = await createAddress(token);
    expect(first).toMatchObject({ ...ADDRESS_BODY, isDefault: true, line2: null, region: null });
    expect(first.id).toMatch(UUID_PATTERN);
    assertMatchesContract('post', ADDRESSES_ROUTE, 201, first);

    const second = await createAddress(token, { city: 'Paris', countryCode: 'fr' });
    expect(second.isDefault).toBe(false);
    // The country code is normalized to upper case at the boundary.
    expect(second.countryCode).toBe('FR');

    const listed = await request(server).get(ADDRESSES_ROUTE).set(bearer(token)).expect(200);
    const addresses = bodyOf<AddressesBody>(listed).addresses;
    expect(addresses.map((address) => address.id)).toEqual([first.id, second.id]);
    expect(addresses.map((address) => address.isDefault)).toEqual([true, false]);
    assertMatchesContract('get', ADDRESSES_ROUTE, 200, listed.body);

    const one = await request(server)
      .get(`/api/v1/customers/me/addresses/${second.id}`)
      .set(bearer(token))
      .expect(200);
    expect(bodyOf<AddressBody>(one).city).toBe('Paris');
    assertMatchesContract('get', ADDRESS_ROUTE, 200, one.body);

    // A partial update changes only the supplied attribute.
    const patched = await request(server)
      .patch(`/api/v1/customers/me/addresses/${second.id}`)
      .set(bearer(token))
      .send({ postalCode: '75001', region: null, line1: '  2 Rue de Test  ' })
      .expect(200);
    expect(bodyOf<AddressBody>(patched)).toMatchObject({
      line1: '2 Rue de Test',
      postalCode: '75001',
      region: null,
      recipientName: 'Ada Lovelace',
    });
    assertMatchesContract('patch', ADDRESS_ROUTE, 200, patched.body);

    const selected = await request(server)
      .put(`/api/v1/customers/me/addresses/${second.id}/default`)
      .set(bearer(token))
      .expect(200);
    expect(bodyOf<AddressBody>(selected).isDefault).toBe(true);
    assertMatchesContract('put', DEFAULT_ROUTE, 200, selected.body);

    const afterSelection = await request(server)
      .get(ADDRESSES_ROUTE)
      .set(bearer(token))
      .expect(200);
    expect(bodyOf<AddressesBody>(afterSelection).addresses.map((a) => a.isDefault)).toEqual([
      false,
      true,
    ]);

    const profile = await request(server).get(PROFILE_ROUTE).set(bearer(token)).expect(200);
    expect(bodyOf<ProfileBody>(profile).defaultAddressId).toBe(second.id);

    // Deleting the selected default clears the selection instead of promoting another address.
    await request(server)
      .delete(`/api/v1/customers/me/addresses/${second.id}`)
      .set(bearer(token))
      .expect(204);

    const remaining = await request(server).get(ADDRESSES_ROUTE).set(bearer(token)).expect(200);
    expect(bodyOf<AddressesBody>(remaining).addresses.map((a) => [a.id, a.isDefault])).toEqual([
      [first.id, false],
    ]);

    const gone = await request(server)
      .get(`/api/v1/customers/me/addresses/${second.id}`)
      .set(bearer(token))
      .expect(404);
    expect(bodyOf<ErrorBody>(gone)).toMatchObject({
      statusCode: 404,
      code: 'ADDRESS_NOT_FOUND',
    });
    assertMatchesContract('get', ADDRESS_ROUTE, 404, gone.body);
  });

  it("answers another customer's address exactly like an unknown one", async () => {
    const owner = await createCustomer('owner.customer');
    const intruder = await createCustomer('intruder.customer');
    const owned = await createAddress(owner, { city: 'Dublin', countryCode: 'IE' });

    const attempts: readonly {
      method: Method;
      path: string;
      send?: Record<string, unknown>;
    }[] = [
      { method: 'get', path: `/api/v1/customers/me/addresses/${owned.id}` },
      {
        method: 'patch',
        path: `/api/v1/customers/me/addresses/${owned.id}`,
        send: { city: 'Stolen' },
      },
      { method: 'delete', path: `/api/v1/customers/me/addresses/${owned.id}` },
      { method: 'put', path: `/api/v1/customers/me/addresses/${owned.id}/default` },
    ];

    const observed: string[] = [];
    for (const attempt of attempts) {
      const requestBuilder = call(attempt.method, attempt.path, intruder);
      const response = await (
        attempt.send === undefined ? requestBuilder : requestBuilder.send(attempt.send)
      ).expect(404);
      expect(bodyOf<ErrorBody>(response)).toMatchObject({
        statusCode: 404,
        code: 'ADDRESS_NOT_FOUND',
      });
      assertOperationalHeaders(response);
      observed.push(bodyOf<ErrorBody>(response).message);
    }

    // Every foreign access is indistinguishable from the same call on an identifier that never existed.
    const unknown = await request(server)
      .get(`/api/v1/customers/me/addresses/${UNKNOWN_ADDRESS_ID}`)
      .set(bearer(intruder))
      .expect(404);
    observed.push(bodyOf<ErrorBody>(unknown).message);
    expect(new Set(observed).size).toBe(1);

    // Nothing of the owner's resource changed, and the intruder gained nothing.
    const intact = await request(server)
      .get(`/api/v1/customers/me/addresses/${owned.id}`)
      .set(bearer(owner))
      .expect(200);
    expect(bodyOf<AddressBody>(intact)).toMatchObject({ city: 'Dublin', isDefault: true });

    const intruderList = await request(server)
      .get(ADDRESSES_ROUTE)
      .set(bearer(intruder))
      .expect(200);
    expect(bodyOf<AddressesBody>(intruderList).addresses).toEqual([]);

    const intruderProfile = await request(server)
      .get(PROFILE_ROUTE)
      .set(bearer(intruder))
      .expect(200);
    expect(bodyOf<ProfileBody>(intruderProfile).defaultAddressId).toBeNull();
  });

  it('refuses an administrator and audits the denial', async () => {
    const adminEmail = 'customer.denied.admin@nordhaven.test';
    await provisioning.provision({
      email: adminEmail,
      password: ADMIN_PASSWORD,
      correlationId: CORRELATION_ID,
    });

    const enrollmentSignIn = bodyOf<SessionBody>(
      await request(server)
        .post('/api/v1/auth/login')
        .send({ email: adminEmail, password: ADMIN_PASSWORD })
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
        .send({ email: adminEmail, password: ADMIN_PASSWORD })
        .expect(200),
    );
    const verificationToken = verificationSignIn.challenge?.token;
    if (verificationToken === undefined) throw new Error('Expected a verification challenge');

    // The enrollment consumed its time step, so the second factor is proven with a recovery code,
    // exactly as the accepted identity contract suite does.
    const recoveryCode = confirmation.recoveryCodes[0];
    if (recoveryCode === undefined) throw new Error('Expected a recovery code');
    const verified = bodyOf<CompletedSessionBody>(
      await request(server)
        .post('/api/v1/auth/login/mfa')
        .send({ challengeToken: verificationToken, recoveryCode })
        .expect(201),
    );
    const adminToken = verified.token;
    expect(verified.user.role).toBe('ADMIN');

    const denied = await request(server).get(PROFILE_ROUTE).set(bearer(adminToken)).expect(403);
    expect(bodyOf<ErrorBody>(denied)).toMatchObject({ statusCode: 403, code: 'FORBIDDEN' });
    assertMatchesContract('get', PROFILE_ROUTE, 403, denied.body);

    const audited = await database.prisma.securityEvent.findMany({
      where: { eventType: 'ADMIN_ACCESS_DENIED' },
    });
    expect(audited.length).toBeGreaterThan(0);
  });

  it('rejects a malformed identifier and an invalid address body', async () => {
    const token = await createCustomer('validation.customer');
    const canary = 'canary-address-line-9d2f';

    const malformed = await request(server)
      .delete('/api/v1/customers/me/addresses/not-a-uuid')
      .set(bearer(token))
      .expect(400);
    expect(bodyOf<ErrorBody>(malformed).code).toBe('VALIDATION_ERROR');
    assertMatchesContract('delete', ADDRESS_ROUTE, 400, malformed.body);

    const missingRequired = await request(server)
      .post(ADDRESSES_ROUTE)
      .set(bearer(token))
      .send({ ...ADDRESS_BODY, city: undefined, line1: canary })
      .expect(400);
    expect(bodyOf<ErrorBody>(missingRequired).code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(missingRequired.body)).not.toContain(canary);
    assertMatchesContract('post', ADDRESSES_ROUTE, 400, missingRequired.body);

    // A client cannot choose the default by asking for it.
    const massAssignment = await request(server)
      .post(ADDRESSES_ROUTE)
      .set(bearer(token))
      .send({ ...ADDRESS_BODY, isDefault: true })
      .expect(400);
    expect(bodyOf<ErrorBody>(massAssignment).code).toBe('VALIDATION_ERROR');

    const badCountry = await request(server)
      .post(ADDRESSES_ROUTE)
      .set(bearer(token))
      .send({ ...ADDRESS_BODY, countryCode: 'GBR' })
      .expect(400);
    expect(bodyOf<ErrorBody>(badCountry).code).toBe('VALIDATION_ERROR');

    // A required attribute cannot be cleared by an update.
    const created = await createAddress(token);
    const clearedRequired = await request(server)
      .patch(`/api/v1/customers/me/addresses/${created.id}`)
      .set(bearer(token))
      .send({ city: '   ' })
      .expect(400);
    expect(bodyOf<ErrorBody>(clearedRequired).code).toBe('VALIDATION_ERROR');
  });
});

// ---------------------------------------------------------------------------------------------
// Rate-limit proof (dedicated instance so the journey suite cannot consume the budget)
// ---------------------------------------------------------------------------------------------

describe('customer HTTP contract rate limiting', () => {
  let app: Application;
  let server: Server;
  let database: DatabaseService;

  beforeAll(async () => {
    const created = await createApplication({ configuration: CONFIGURATION });
    app = created.app;
    server = app.getHttpServer() as Server;
    database = app.get(DatabaseService);
    await resetCustomerDatabase(database);
    await resetIdentityDatabase(database);
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  it('bounds customer writes per client with a numeric retry hint', async () => {
    const email = 'rate.limited.customer@nordhaven.test';
    await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password: PASSWORD })
      .expect(201);
    const signedIn = bodyOf<SessionBody>(
      await request(server)
        .post('/api/v1/auth/login')
        .send({ email, password: PASSWORD })
        .expect(200),
    );
    const token = signedIn.session?.token;
    if (token === undefined) throw new Error('Expected a session credential');

    // The declared `customers.write` policy allows 60 writes per window for one client.
    for (let attempt = 0; attempt < 60; attempt += 1) {
      await request(server)
        .patch(PROFILE_ROUTE)
        .set(bearer(token))
        .send({ displayName: `Probe ${attempt}` })
        .expect(200);
    }

    const limited = await request(server)
      .patch(PROFILE_ROUTE)
      .set(bearer(token))
      .send({ displayName: 'Probe over budget' })
      .expect(429);
    expect(bodyOf<ErrorBody>(limited).code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited.headers['cache-control']).toBe('no-store');
  }, 60_000);
});

// ---------------------------------------------------------------------------------------------
// Personal-data log canary (dedicated instance with a captured log destination)
// ---------------------------------------------------------------------------------------------

describe('customer HTTP contract personal-data logging', () => {
  it('never writes customer personal attributes or session credentials to the log stream', async () => {
    const chunks: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });

    const canaries = {
      recipientName: 'canary-recipient-1a2b',
      line1: 'canary-line1-3c4d',
      city: 'canary-city-5e6f',
      postalCode: 'canary-postal-7a8b',
      phone: 'canary-phone-9c0d',
      displayName: 'canary-display-e1f2',
    };

    const { app } = await createApplication({
      configuration: testConfigurationFor('e2e', { logLevel: 'info' }),
      logDestination: sink,
    });
    const server = app.getHttpServer() as Server;
    const database = app.get(DatabaseService);

    try {
      await resetCustomerDatabase(database);
      await resetIdentityDatabase(database);

      const email = 'log.canary.customer@nordhaven.test';
      await request(server)
        .post('/api/v1/auth/register')
        .send({ email, password: PASSWORD })
        .expect(201);
      const signedIn = bodyOf<SessionBody>(
        await request(server)
          .post('/api/v1/auth/login')
          .send({ email, password: PASSWORD })
          .expect(200),
      );
      const token = signedIn.session?.token;
      if (token === undefined) throw new Error('Expected a session credential');

      // A successful write carrying personal attributes.
      await request(server)
        .post(ADDRESSES_ROUTE)
        .set(bearer(token))
        .send({
          recipientName: canaries.recipientName,
          line1: canaries.line1,
          city: canaries.city,
          postalCode: canaries.postalCode,
          phone: canaries.phone,
          countryCode: 'GB',
        })
        .expect(201);

      await request(server)
        .patch(PROFILE_ROUTE)
        .set(bearer(token))
        .send({ displayName: canaries.displayName })
        .expect(200);

      // A rejected write carrying personal attributes, plus a route that does not exist.
      await request(server)
        .post(ADDRESSES_ROUTE)
        .set(bearer(token))
        .send({ ...canaries, isDefault: true })
        .expect(400);
      await request(server)
        .get(`/api/v1/customers/me/addresses/${UNKNOWN_ADDRESS_ID}`)
        .set(bearer(token))
        .expect(404);

      await app.close();

      const captured = chunks.join('');
      expect(captured.length).toBeGreaterThan(0);
      for (const canary of Object.values(canaries)) {
        expect(captured).not.toContain(canary);
      }
      expect(captured).not.toContain(token);
      expect(captured).not.toContain(PASSWORD);
    } finally {
      await app.close().catch(() => undefined);
    }
  }, 30_000);
});
