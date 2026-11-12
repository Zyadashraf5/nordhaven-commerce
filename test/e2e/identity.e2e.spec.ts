import request from 'supertest';
import { createApplication } from '../../apps/api/src/bootstrap/create-application';
import { AdministratorProvisioningService } from '../../apps/api/src/modules/identity/application/administrator-provisioning.service';
import type { MemoryNotificationTransport } from '../../apps/api/src/modules/identity/application/notification/memory-notification.transport';
import { NOTIFICATION_PORT } from '../../apps/api/src/modules/identity/application/notification/notification.port';
import { generateTotpCode, timeStepFor } from '../../apps/api/src/modules/identity/crypto/totp';
import { ApplicationAvailabilityService } from '../../apps/api/src/platform/availability/application-availability.service';
import { DatabaseService } from '../../apps/api/src/platform/database/database.service';
import { resetIdentityDatabase } from '../helpers/identity-database';
import { testConfigurationFor } from '../helpers/test-configuration';

const CONFIGURATION = testConfigurationFor('e2e');
const CORRELATION_ID = '3f6b6a1e-6a5c-4a6c-9a6f-3f2c1d0b8a72';

const PASSWORD = 'Customer-Passphrase-1';
const REPLACEMENT_PASSWORD = 'Replacement-Passphrase-2';
const ADMIN_PASSWORD = 'Administrator-Passphrase-3';

interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  correlationId: string;
}

interface UserBody {
  id: string;
  email: string;
  role: 'CUSTOMER' | 'ADMIN';
  createdAt: string;
}

interface SessionCredential {
  token: string;
  tokenType: string;
  expiresAt: string;
}

interface Challenge {
  token: string;
  purpose: 'MFA_VERIFICATION' | 'MFA_ENROLLMENT';
  expiresAt: string;
}

interface SignInBody {
  status: 'AUTHENTICATED' | 'MFA_REQUIRED' | 'MFA_ENROLLMENT_REQUIRED';
  session?: SessionCredential;
  challenge?: Challenge;
  user?: UserBody;
}

interface SessionBody {
  status: 'AUTHENTICATED';
  token: string;
  tokenType: string;
  expiresAt: string;
  user: UserBody;
}

interface EnrollmentBody {
  secret: string;
  otpauthUri: string;
  algorithm: string;
  digits: number;
  period: number;
  issuer: string;
  expiresAt: string;
}

interface ConfirmationBody {
  status: 'MFA_ENROLLED';
  recoveryCodes: string[];
  confirmedAt: string;
}

interface SessionsBody {
  sessions: { id: string; current: boolean }[];
}

interface AccountsBody {
  users: UserBody[];
  nextCursor: string | null;
}

function bodyOf<T>(response: { readonly body: unknown }): T {
  return response.body as T;
}

function sessionTokenOf(body: SignInBody): string {
  const token = body.session?.token;
  if (token === undefined) throw new Error('Expected a session credential');
  return token;
}

function challengeOf(body: SignInBody): Challenge {
  const challenge = body.challenge;
  if (challenge === undefined) throw new Error('Expected an authentication challenge');
  return challenge;
}

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

type Application = Awaited<ReturnType<typeof createApplication>>['app'];

describe('identity HTTP contract', () => {
  let app: Application;
  let server: Parameters<typeof request>[0];
  let database: DatabaseService;
  let notifications: MemoryNotificationTransport;
  let provisioning: AdministratorProvisioningService;

  // Each independent HTTP scenario owns its client rate-limit budget.
  beforeEach(async () => {
    const created = await createApplication({ configuration: CONFIGURATION });
    app = created.app;
    server = app.getHttpServer() as Parameters<typeof request>[0];
    database = app.get(DatabaseService);
    notifications = app.get<MemoryNotificationTransport>(NOTIFICATION_PORT);
    provisioning = app.get(AdministratorProvisioningService);
    await resetIdentityDatabase(database);
  }, 30_000);

  afterEach(async () => {
    await app.close();
  });

  beforeEach(() => {
    notifications.clear();
  });

  function register(email: string, password = PASSWORD) {
    return request(server).post('/api/v1/auth/register').send({ email, password });
  }

  function signIn(email: string, password = PASSWORD) {
    return request(server).post('/api/v1/auth/login').send({ email, password });
  }

  it('emits the shared error envelope with correlation and no-store headers', async () => {
    const response = await request(server)
      .get('/api/v1/auth/principal')
      .set('X-Correlation-ID', CORRELATION_ID)
      .expect(401);

    expect(bodyOf<ErrorBody>(response)).toMatchObject({
      statusCode: 401,
      code: 'UNAUTHENTICATED',
      correlationId: CORRELATION_ID,
    });
    expect(response.headers['x-correlation-id']).toBe(CORRELATION_ID);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['retry-after']).toBeUndefined();
  });

  it('reports an unknown route and a malformed body without echoing request data', async () => {
    const missing = await request(server).get('/api/v1/does-not-exist').expect(404);
    expect(bodyOf<ErrorBody>(missing)).toMatchObject({
      statusCode: 404,
      code: 'ROUTE_NOT_FOUND',
    });

    const canary = 'synthetic-request-canary-41c7';
    const invalid = await request(server)
      .post('/api/v1/auth/register')
      .send({ email: 'not-an-email', password: 'short', note: canary })
      .expect(400);
    expect(bodyOf<ErrorBody>(invalid)).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(JSON.stringify(invalid.body)).not.toContain(canary);
  });

  it('registers a customer and issues an opaque session credential', async () => {
    const email = 'session.customer@nordhaven.test';
    const registration = await register(email).expect(201);
    expect(bodyOf<{ user: UserBody }>(registration).user).toMatchObject({
      email,
      role: 'CUSTOMER',
    });
    expect(JSON.stringify(registration.body)).not.toContain(PASSWORD);
    expect(registration.headers['cache-control']).toBe('no-store');

    const duplicate = await register(email).expect(409);
    expect(bodyOf<ErrorBody>(duplicate).code).toBe('REGISTRATION_NOT_ALLOWED');

    const signInResponse = await signIn(email).expect(200);
    const signedIn = bodyOf<SignInBody>(signInResponse);
    expect(signedIn).toMatchObject({
      status: 'AUTHENTICATED',
      session: { tokenType: 'Bearer' },
      user: { email, role: 'CUSTOMER' },
    });
    const token = sessionTokenOf(signedIn);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const principal = await request(server)
      .get('/api/v1/auth/principal')
      .set(bearer(token))
      .expect(200);
    expect(
      bodyOf<{ role: string; user: UserBody; session: { current: boolean } }>(principal),
    ).toMatchObject({ role: 'CUSTOMER', user: { email }, session: { current: true } });

    const sessions = await request(server)
      .get('/api/v1/auth/sessions')
      .set(bearer(token))
      .expect(200);
    expect(bodyOf<SessionsBody>(sessions).sessions).toHaveLength(1);

    await request(server).delete('/api/v1/auth/sessions/current').set(bearer(token)).expect(204);

    const rejected = await request(server)
      .get('/api/v1/auth/principal')
      .set(bearer(token))
      .expect(401);
    expect(bodyOf<ErrorBody>(rejected).code).toBe('UNAUTHENTICATED');
  });

  it('answers an unknown address and a wrong password identically', async () => {
    const email = 'uniform.customer@nordhaven.test';
    await register(email).expect(201);

    const unknown = await signIn('absent.customer@nordhaven.test').expect(401);
    const wrongPassword = await signIn(email, 'Wrong-Passphrase-9').expect(401);

    const unknownBody = bodyOf<ErrorBody>(unknown);
    const wrongPasswordBody = bodyOf<ErrorBody>(wrongPassword);
    expect(unknownBody).toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
    expect(wrongPasswordBody).toMatchObject({ statusCode: 401, code: 'INVALID_CREDENTIALS' });
    expect(unknownBody.message).toBe(wrongPasswordBody.message);
  });

  it('lists sessions and revokes exactly one owned session', async () => {
    const email = 'sessions.customer@nordhaven.test';
    await register(email).expect(201);

    const first = sessionTokenOf(bodyOf<SignInBody>(await signIn(email).expect(200)));
    const second = sessionTokenOf(bodyOf<SignInBody>(await signIn(email).expect(200)));

    const listed = bodyOf<SessionsBody>(
      await request(server).get('/api/v1/auth/sessions').set(bearer(first)).expect(200),
    );
    expect(listed.sessions).toHaveLength(2);
    const other = listed.sessions.find((session) => !session.current);
    if (other === undefined) throw new Error('Expected a second session');

    const malformed = await request(server)
      .delete('/api/v1/auth/sessions/not-a-uuid')
      .set(bearer(first))
      .expect(400);
    expect(bodyOf<ErrorBody>(malformed).code).toBe('VALIDATION_ERROR');

    const unknown = await request(server)
      .delete('/api/v1/auth/sessions/11111111-1111-4111-8111-111111111111')
      .set(bearer(first))
      .expect(404);
    expect(bodyOf<ErrorBody>(unknown).code).toBe('SESSION_NOT_FOUND');

    await request(server)
      .delete(`/api/v1/auth/sessions/${other.id}`)
      .set(bearer(first))
      .expect(204);
    await request(server).get('/api/v1/auth/principal').set(bearer(second)).expect(401);
    await request(server).get('/api/v1/auth/principal').set(bearer(first)).expect(200);
  });

  it('requires the current password and revokes the other sessions on change', async () => {
    const email = 'password.customer@nordhaven.test';
    await register(email).expect(201);

    const current = sessionTokenOf(bodyOf<SignInBody>(await signIn(email).expect(200)));
    const other = sessionTokenOf(bodyOf<SignInBody>(await signIn(email).expect(200)));

    const rejected = await request(server)
      .post('/api/v1/auth/password')
      .set(bearer(current))
      .send({ currentPassword: 'Wrong-Passphrase-9', newPassword: REPLACEMENT_PASSWORD })
      .expect(401);
    expect(bodyOf<ErrorBody>(rejected).code).toBe('INVALID_CREDENTIALS');

    await request(server)
      .post('/api/v1/auth/password')
      .set(bearer(current))
      .send({ currentPassword: PASSWORD, newPassword: REPLACEMENT_PASSWORD })
      .expect(204);

    await request(server).get('/api/v1/auth/principal').set(bearer(current)).expect(200);
    await request(server).get('/api/v1/auth/principal').set(bearer(other)).expect(401);

    await signIn(email, PASSWORD).expect(401);
    await signIn(email, REPLACEMENT_PASSWORD).expect(200);
  });

  it('completes a single-use password reset over HTTP and refuses a replay', async () => {
    const email = 'reset.customer@nordhaven.test';
    await register(email).expect(201);
    const presented = sessionTokenOf(bodyOf<SignInBody>(await signIn(email).expect(200)));

    const accepted = await request(server)
      .post('/api/v1/auth/password-reset/requests')
      .send({ email })
      .expect(202);
    expect(bodyOf<{ status: string }>(accepted).status).toBe('ACCEPTED');

    const notification = notifications.delivered[0];
    if (notification === undefined) throw new Error('Expected a delivered notification');
    const match = /: ([A-Za-z0-9_-]{43})$/.exec(notification.body);
    const recoveryToken = match?.[1];
    if (recoveryToken === undefined) throw new Error('Expected a single-use recovery token');

    await request(server)
      .post('/api/v1/auth/password-reset/confirmations')
      .send({ token: recoveryToken, newPassword: REPLACEMENT_PASSWORD })
      .expect(204);

    await request(server).get('/api/v1/auth/principal').set(bearer(presented)).expect(401);
    await signIn(email, PASSWORD).expect(401);
    await signIn(email, REPLACEMENT_PASSWORD).expect(200);

    const replay = await request(server)
      .post('/api/v1/auth/password-reset/confirmations')
      .send({ token: recoveryToken, newPassword: PASSWORD })
      .expect(400);
    expect(bodyOf<ErrorBody>(replay).code).toBe('INVALID_RECOVERY_TOKEN');
  });

  it('requires enrollment and a second factor for an administrator, and audits a denial', async () => {
    const adminEmail = 'mfa.admin@nordhaven.test';
    await provisioning.provision({
      email: adminEmail,
      password: ADMIN_PASSWORD,
      correlationId: CORRELATION_ID,
    });

    const enrollmentSignIn = bodyOf<SignInBody>(
      await signIn(adminEmail, ADMIN_PASSWORD).expect(200),
    );
    expect(enrollmentSignIn.status).toBe('MFA_ENROLLMENT_REQUIRED');
    const enrollmentChallenge = challengeOf(enrollmentSignIn);
    expect(enrollmentChallenge.purpose).toBe('MFA_ENROLLMENT');

    const enrollment = bodyOf<EnrollmentBody>(
      await request(server)
        .post('/api/v1/auth/login/mfa/enrollment')
        .send({ challengeToken: enrollmentChallenge.token })
        .expect(200),
    );
    expect(enrollment).toMatchObject({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      issuer: 'Nordhaven Commerce',
    });
    expect(enrollment.otpauthUri).toContain(`secret=${enrollment.secret}`);

    const code = generateTotpCode(enrollment.secret, timeStepFor(Date.now() + 5_000));
    const confirmation = bodyOf<ConfirmationBody>(
      await request(server)
        .post('/api/v1/auth/login/mfa/enrollment/confirmation')
        .send({ challengeToken: enrollmentChallenge.token, code })
        .expect(201),
    );
    expect(confirmation.status).toBe('MFA_ENROLLED');
    expect(confirmation.recoveryCodes).toHaveLength(10);

    const verificationSignIn = bodyOf<SignInBody>(
      await signIn(adminEmail, ADMIN_PASSWORD).expect(200),
    );
    expect(verificationSignIn.status).toBe('MFA_REQUIRED');
    const verificationChallenge = challengeOf(verificationSignIn);
    expect(verificationChallenge.purpose).toBe('MFA_VERIFICATION');

    const wrongCode = await request(server)
      .post('/api/v1/auth/login/mfa')
      .send({ challengeToken: verificationChallenge.token, code: '000000' })
      .expect(401);
    expect(bodyOf<ErrorBody>(wrongCode).code).toBe('INVALID_MFA_CODE');

    const recoveryCode = confirmation.recoveryCodes[0];
    if (recoveryCode === undefined) throw new Error('Expected a recovery code');
    const verified = bodyOf<SessionBody>(
      await request(server)
        .post('/api/v1/auth/login/mfa')
        .send({ challengeToken: verificationChallenge.token, recoveryCode })
        .expect(201),
    );
    expect(verified.status).toBe('AUTHENTICATED');
    expect(verified.user).toMatchObject({ email: adminEmail, role: 'ADMIN' });
    expect(verified.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const accounts = await request(server)
      .get('/api/v1/admin/users')
      .set(bearer(verified.token))
      .expect(200);
    const page = bodyOf<AccountsBody>(accounts);
    expect(page.users.map((user) => user.email)).toContain(adminEmail);
    expect(page.nextCursor === null || typeof page.nextCursor === 'string').toBe(true);

    const customerEmail = 'denied.customer@nordhaven.test';
    await register(customerEmail).expect(201);
    const customerToken = sessionTokenOf(
      bodyOf<SignInBody>(await signIn(customerEmail).expect(200)),
    );

    const denied = await request(server)
      .get('/api/v1/admin/users')
      .set(bearer(customerToken))
      .expect(403);
    expect(bodyOf<ErrorBody>(denied).code).toBe('FORBIDDEN');

    const audit = await database.prisma.securityEvent.findMany({
      where: { eventType: 'ADMIN_ACCESS_DENIED' },
    });
    expect(audit.length).toBeGreaterThan(0);
  });

  it('rejects an unknown challenge without issuing a session', async () => {
    const unknownChallenge = 'a'.repeat(43);

    const enrollment = await request(server)
      .post('/api/v1/auth/login/mfa/enrollment')
      .send({ challengeToken: unknownChallenge })
      .expect(401);
    expect(bodyOf<ErrorBody>(enrollment).code).toBe('INVALID_CHALLENGE');

    const verification = await request(server)
      .post('/api/v1/auth/login/mfa')
      .send({ challengeToken: unknownChallenge, code: '123456' })
      .expect(401);
    expect(bodyOf<ErrorBody>(verification).code).toBe('INVALID_CHALLENGE');
  });

  it('rate limits repeated registration attempts with a numeric retry hint', async () => {
    const email = 'rate.limited@nordhaven.test';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await register(email, 'short').expect(400);
    }

    const limited = await register(email, 'short').expect(429);
    expect(bodyOf<ErrorBody>(limited).code).toBe('RATE_LIMITED');
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    expect(limited.headers['cache-control']).toBe('no-store');
  });
});

describe('identity HTTP contract before the instance is ready', () => {
  it('reports an outage rather than an unauthenticated caller', async () => {
    const { app } = await createApplication({
      configuration: CONFIGURATION,
      initializeDatabase: false,
    });
    const server = app.getHttpServer() as Parameters<typeof request>[0];

    try {
      await request(server).get('/api/v1/health/live').expect(200);

      const unavailable = await request(server).get('/api/v1/auth/principal').expect(503);
      expect(bodyOf<ErrorBody>(unavailable)).toMatchObject({
        statusCode: 503,
        code: 'SERVICE_UNAVAILABLE',
      });
      expect(unavailable.headers['retry-after']).toBe('5');

      app.get(ApplicationAvailabilityService).markReady();
      const rejected = await request(server).get('/api/v1/auth/principal').expect(401);
      expect(bodyOf<ErrorBody>(rejected).code).toBe('UNAUTHENTICATED');
    } finally {
      await app.close();
    }
  });
});

describe('aggregate client rate-limit regression', () => {
  it('H05: changing account identifiers cannot exceed the client registration budget', async () => {
    const { app } = await createApplication({ configuration: CONFIGURATION });
    try {
      const server = app.getHttpServer() as Parameters<typeof request>[0];
      for (let index = 0; index < 5; index += 1) {
        await request(server)
          .post('/api/v1/auth/register')
          .send({ email: 'rate-fixture-' + index + '@example.test', password: 'short' })
          .expect(400);
      }
      const limited = await request(server)
        .post('/api/v1/auth/register')
        .send({ email: 'rate-fixture-next@example.test', password: 'short' })
        .expect(429);
      expect(bodyOf<ErrorBody>(limited).code).toBe('RATE_LIMITED');
      expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });
});
