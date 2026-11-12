import { createApplication } from '../../apps/api/src/bootstrap/create-application';
import { AdministratorProvisioningService } from '../../apps/api/src/modules/identity/application/administrator-provisioning.service';
import {
  IdentityService,
  type SignInResult,
} from '../../apps/api/src/modules/identity/application/identity.service';
import { MfaService } from '../../apps/api/src/modules/identity/application/mfa.service';
import type { MemoryNotificationTransport } from '../../apps/api/src/modules/identity/application/notification/memory-notification.transport';
import { NOTIFICATION_PORT } from '../../apps/api/src/modules/identity/application/notification/notification.port';
import { PasswordResetService } from '../../apps/api/src/modules/identity/application/password-reset.service';
import { SessionService } from '../../apps/api/src/modules/identity/application/session.service';
import { generateTotpCode, timeStepFor } from '../../apps/api/src/modules/identity/crypto/totp';
import { DatabaseService } from '../../apps/api/src/platform/database/database.service';
import type { AuthenticatedPrincipal } from '../../apps/api/src/platform/security/principal';
import { resetIdentityDatabase } from '../helpers/identity-database';
import { testConfigurationFor } from '../helpers/test-configuration';

const CORRELATION_ID = '9f6b6a1e-6a5c-4a6c-9a6f-3f2c1d0b8a71';

const CUSTOMER_PASSWORD = 'Customer-Passphrase-1';
const REPLACEMENT_PASSWORD = 'Replacement-Passphrase-2';
const ADMIN_PASSWORD = 'Administrator-Passphrase-3';

type AuthenticatedSignIn = Extract<SignInResult, { status: 'AUTHENTICATED' }>;
type Application = Awaited<ReturnType<typeof createApplication>>['app'];

describe('Identity application integration', () => {
  let app: Application;
  let database: DatabaseService;
  let identity: IdentityService;
  let sessions: SessionService;
  let reset: PasswordResetService;
  let mfa: MfaService;
  let provisioning: AdministratorProvisioningService;
  let notifications: MemoryNotificationTransport;

  beforeAll(async () => {
    // Fewer attempts keeps the durable-lockout scenario fast; it is still a valid policy value.
    const created = await createApplication({
      configuration: testConfigurationFor('integration', { authMaxFailedAttempts: 3 }),
    });
    app = created.app;
    database = app.get(DatabaseService);
    identity = app.get(IdentityService);
    sessions = app.get(SessionService);
    reset = app.get(PasswordResetService);
    mfa = app.get(MfaService);
    provisioning = app.get(AdministratorProvisioningService);
    notifications = app.get<MemoryNotificationTransport>(NOTIFICATION_PORT);
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetIdentityDatabase(database);
    notifications.clear();
  });

  async function register(email: string, password = CUSTOMER_PASSWORD): Promise<void> {
    await identity.register({ email, password, correlationId: CORRELATION_ID });
  }

  async function signInAsCustomer(
    email: string,
    password = CUSTOMER_PASSWORD,
  ): Promise<AuthenticatedSignIn> {
    const result = await identity.signIn({
      email,
      password,
      clientLabel: null,
      correlationId: CORRELATION_ID,
    });
    if (result.status !== 'AUTHENTICATED') throw new Error('Expected an authenticated customer');
    return result;
  }

  async function authenticate(token: string): Promise<AuthenticatedPrincipal | null> {
    return sessions.authenticate(token, { correlationId: CORRELATION_ID });
  }

  it('registers an account, signs in, and revokes the presented session', async () => {
    const registered = await identity.register({
      email: '  Customer@Nordhaven.Test ',
      password: CUSTOMER_PASSWORD,
      correlationId: CORRELATION_ID,
    });
    expect(registered).toMatchObject({ email: 'customer@nordhaven.test', role: 'CUSTOMER' });
    expect(JSON.stringify(registered)).not.toContain(CUSTOMER_PASSWORD);

    await expect(
      identity.register({
        email: 'customer@nordhaven.test',
        password: CUSTOMER_PASSWORD,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toMatchObject({ code: 'REGISTRATION_NOT_ALLOWED' });

    const signedIn = await signInAsCustomer('customer@nordhaven.test');
    const principal = await authenticate(signedIn.sessionToken);
    if (principal === null) throw new Error('Expected the issued credential to authenticate');
    expect(principal).toMatchObject({ userId: registered.id, role: 'CUSTOMER' });

    const listed = await sessions.list(principal.userId, principal.sessionId, new Date());
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: principal.sessionId, current: true });

    await sessions.revokeCurrent(principal, CORRELATION_ID);
    await expect(authenticate(signedIn.sessionToken)).resolves.toBeNull();
  });

  it('revokes one owned session and then every session', async () => {
    await register('sessions@nordhaven.test');
    const first = await signInAsCustomer('sessions@nordhaven.test');
    const second = await signInAsCustomer('sessions@nordhaven.test');

    const principal = await authenticate(first.sessionToken);
    if (principal === null) throw new Error('Expected the first credential to authenticate');
    const listed = await sessions.list(principal.userId, principal.sessionId, new Date());
    expect(listed).toHaveLength(2);
    const other = listed.find((session) => !session.current);
    if (other === undefined) throw new Error('Expected a second session');

    await sessions.revokeOwned(other.id, principal, CORRELATION_ID);
    await expect(authenticate(second.sessionToken)).resolves.toBeNull();

    // A session owned by another account is reported as not found, not as a permission error.
    await register('other.owner@nordhaven.test');
    const foreign = await signInAsCustomer('other.owner@nordhaven.test');
    const foreignPrincipal = await authenticate(foreign.sessionToken);
    if (foreignPrincipal === null)
      throw new Error('Expected the foreign credential to authenticate');

    await expect(
      sessions.revokeOwned(foreignPrincipal.sessionId, principal, CORRELATION_ID),
    ).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
    await expect(authenticate(foreign.sessionToken)).resolves.toMatchObject({
      userId: foreignPrincipal.userId,
    });

    await sessions.revokeAllOwn(principal, CORRELATION_ID);
    await expect(authenticate(first.sessionToken)).resolves.toBeNull();
  });

  it('locks an account after the configured failures and never reveals the lock', async () => {
    await register('locked@nordhaven.test');

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        identity.signIn({
          email: 'locked@nordhaven.test',
          password: 'Wrong-Passphrase-9',
          clientLabel: null,
          correlationId: CORRELATION_ID,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    }

    // Even the correct password is refused, with the same code a wrong password returns.
    await expect(
      identity.signIn({
        email: 'locked@nordhaven.test',
        password: CUSTOMER_PASSWORD,
        clientLabel: null,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('completes a single-use password reset, revokes sessions, and refuses the token twice', async () => {
    await register('reset@nordhaven.test');
    const signedIn = await signInAsCustomer('reset@nordhaven.test');

    await reset.requestReset({ email: 'reset@nordhaven.test', correlationId: CORRELATION_ID });
    const notification = notifications.delivered[0];
    if (notification === undefined) throw new Error('Expected a delivered recovery notification');
    expect(notification.recipient).toBe('reset@nordhaven.test');

    const match = /: ([A-Za-z0-9_-]{43})$/.exec(notification.body);
    const token = match?.[1];
    if (token === undefined) throw new Error('Expected a single-use recovery token');

    await reset.completeReset({
      token,
      newPassword: REPLACEMENT_PASSWORD,
      correlationId: CORRELATION_ID,
    });

    await expect(authenticate(signedIn.sessionToken)).resolves.toBeNull();
    await expect(signInAsCustomer('reset@nordhaven.test')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    await expect(
      signInAsCustomer('reset@nordhaven.test', REPLACEMENT_PASSWORD),
    ).resolves.toMatchObject({
      status: 'AUTHENTICATED',
    });

    await expect(
      reset.completeReset({
        token,
        newPassword: REPLACEMENT_PASSWORD,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_RECOVERY_TOKEN' });
  });

  it('answers a reset request for an unknown address identically and delivers nothing', async () => {
    await expect(
      reset.requestReset({ email: 'missing@nordhaven.test', correlationId: CORRELATION_ID }),
    ).resolves.toBeUndefined();
    expect(notifications.delivered).toHaveLength(0);
  });

  it('enrolls an administrator, then requires a second factor and accepts recovery codes once', async () => {
    const admin = await provisioning.provision({
      email: 'admin@nordhaven.test',
      password: ADMIN_PASSWORD,
      correlationId: CORRELATION_ID,
    });
    expect(admin.role).toBe('ADMIN');

    const enrollmentSignIn = await identity.signIn({
      email: 'admin@nordhaven.test',
      password: ADMIN_PASSWORD,
      clientLabel: null,
      correlationId: CORRELATION_ID,
    });
    expect(enrollmentSignIn.status).toBe('MFA_ENROLLMENT_REQUIRED');
    if (enrollmentSignIn.status !== 'MFA_ENROLLMENT_REQUIRED')
      throw new Error('Expected enrollment');

    const details = await mfa.beginEnrollment(enrollmentSignIn.challenge.token, CORRELATION_ID);
    expect(details).toMatchObject({
      algorithm: 'SHA1',
      digits: 6,
      periodSeconds: 30,
      issuer: 'Nordhaven Commerce',
    });
    expect(details.otpauthUri).toContain(details.secret);
    expect(details.otpauthUri.startsWith('otpauth://totp/')).toBe(true);

    // Encoding the code for the next step keeps the assertion valid across a 30-second boundary;
    // the verifier accepts one adjacent step on either side.
    const code = generateTotpCode(details.secret, timeStepFor(Date.now() + 5_000));
    const confirmation = await mfa.confirmEnrollment(
      enrollmentSignIn.challenge.token,
      code,
      CORRELATION_ID,
    );
    expect(confirmation.recoveryCodes).toHaveLength(10);
    expect(new Set(confirmation.recoveryCodes).size).toBe(10);

    // Enrollment cannot be restarted once it is confirmed.
    const extraChallenge = await mfa.startEnrollment(admin.id, CORRELATION_ID);
    await expect(mfa.beginEnrollment(extraChallenge.token, CORRELATION_ID)).rejects.toMatchObject({
      code: 'MFA_ALREADY_ENROLLED',
    });

    const verification = await identity.signIn({
      email: 'admin@nordhaven.test',
      password: ADMIN_PASSWORD,
      clientLabel: null,
      correlationId: CORRELATION_ID,
    });
    expect(verification.status).toBe('MFA_REQUIRED');
    if (verification.status !== 'MFA_REQUIRED') throw new Error('Expected a second factor');

    // A rejected code does not consume the challenge or the session.
    await expect(
      mfa.completeVerification({
        challengeToken: verification.challenge.token,
        code: '000000',
        clientLabel: null,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_MFA_CODE' });

    const firstRecoveryCode = confirmation.recoveryCodes[0];
    if (firstRecoveryCode === undefined) throw new Error('Expected a recovery code');
    const completed = await mfa.completeVerification({
      challengeToken: verification.challenge.token,
      recoveryCode: firstRecoveryCode,
      clientLabel: null,
      correlationId: CORRELATION_ID,
    });
    expect(completed.user).toMatchObject({ id: admin.id, role: 'ADMIN' });
    await expect(authenticate(completed.session.token)).resolves.toMatchObject({
      userId: admin.id,
      role: 'ADMIN',
    });

    // The same recovery code is single-use; another one still works.
    const secondVerification = await identity.signIn({
      email: 'admin@nordhaven.test',
      password: ADMIN_PASSWORD,
      clientLabel: null,
      correlationId: CORRELATION_ID,
    });
    if (secondVerification.status !== 'MFA_REQUIRED') throw new Error('Expected a second factor');

    await expect(
      mfa.completeVerification({
        challengeToken: secondVerification.challenge.token,
        recoveryCode: firstRecoveryCode,
        clientLabel: null,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_MFA_CODE' });

    const secondRecoveryCode = confirmation.recoveryCodes[1];
    if (secondRecoveryCode === undefined) throw new Error('Expected a second recovery code');
    await expect(
      mfa.completeVerification({
        challengeToken: secondVerification.challenge.token,
        recoveryCode: secondRecoveryCode,
        clientLabel: null,
        correlationId: CORRELATION_ID,
      }),
    ).resolves.toMatchObject({ user: { id: admin.id } });
  });

  it('changes the password with reauthentication and revokes only the other sessions', async () => {
    await register('change@nordhaven.test');
    const current = await signInAsCustomer('change@nordhaven.test');
    const other = await signInAsCustomer('change@nordhaven.test');

    const principal = await authenticate(current.sessionToken);
    if (principal === null) throw new Error('Expected an authenticated principal');

    await expect(
      identity.changePassword(principal, {
        userId: principal.userId,
        currentSessionId: principal.sessionId,
        currentPassword: 'Wrong-Passphrase-9',
        newPassword: REPLACEMENT_PASSWORD,
        correlationId: CORRELATION_ID,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });

    await identity.changePassword(principal, {
      userId: principal.userId,
      currentSessionId: principal.sessionId,
      currentPassword: CUSTOMER_PASSWORD,
      newPassword: REPLACEMENT_PASSWORD,
      correlationId: CORRELATION_ID,
    });

    await expect(authenticate(current.sessionToken)).resolves.toMatchObject({
      userId: principal.userId,
    });
    await expect(authenticate(other.sessionToken)).resolves.toBeNull();
    await expect(signInAsCustomer('change@nordhaven.test')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    await expect(
      signInAsCustomer('change@nordhaven.test', REPLACEMENT_PASSWORD),
    ).resolves.toMatchObject({ status: 'AUTHENTICATED' });
  });

  it('accepts exactly one of two concurrent registrations for the same address', async () => {
    const outcomes = await Promise.allSettled([
      identity.register({
        email: 'race@nordhaven.test',
        password: CUSTOMER_PASSWORD,
        correlationId: CORRELATION_ID,
      }),
      identity.register({
        email: 'race@nordhaven.test',
        password: CUSTOMER_PASSWORD,
        correlationId: CORRELATION_ID,
      }),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1);
    for (const outcome of outcomes) {
      if (outcome.status === 'rejected') {
        expect(outcome.reason).toMatchObject({ code: 'REGISTRATION_NOT_ALLOWED' });
      }
    }

    const stored = await database.prisma.user.findMany({ where: { email: 'race@nordhaven.test' } });
    expect(stored).toHaveLength(1);
  });

  it('persists the failed-attempt counter and the lock so it survives a restart', async () => {
    await register('durable@nordhaven.test');

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await expect(
        identity.signIn({
          email: 'durable@nordhaven.test',
          password: 'Wrong-Passphrase-9',
          clientLabel: null,
          correlationId: CORRELATION_ID,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    }

    const locked = await database.prisma.user.findUnique({
      where: { email: 'durable@nordhaven.test' },
    });
    expect(locked?.failedLoginAttempts).toBe(3);
    const lockedUntil = locked?.lockedUntil;
    if (lockedUntil === null || lockedUntil === undefined)
      throw new Error('Expected a durable lock');
    expect(lockedUntil.getTime()).toBeGreaterThan(Date.now());
  });

  it('rejects and hides a session whose idle window has closed', async () => {
    await register('idle@nordhaven.test');
    const signedIn = await signInAsCustomer('idle@nordhaven.test');
    const principal = await authenticate(signedIn.sessionToken);
    if (principal === null) throw new Error('Expected the issued credential to authenticate');

    await database.prisma.session.updateMany({
      where: { userId: principal.userId },
      data: { lastUsedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
    });

    await expect(authenticate(signedIn.sessionToken)).resolves.toBeNull();
    await expect(
      sessions.list(principal.userId, principal.sessionId, new Date()),
    ).resolves.toHaveLength(0);
  });

  it('stores only encrypted or derived identity material at rest', async () => {
    const admin = await provisioning.provision({
      email: 'atrest.admin@nordhaven.test',
      password: ADMIN_PASSWORD,
      correlationId: CORRELATION_ID,
    });

    const enrollmentSignIn = await identity.signIn({
      email: 'atrest.admin@nordhaven.test',
      password: ADMIN_PASSWORD,
      clientLabel: null,
      correlationId: CORRELATION_ID,
    });
    if (enrollmentSignIn.status !== 'MFA_ENROLLMENT_REQUIRED') {
      throw new Error('Expected enrollment to be required');
    }

    const details = await mfa.beginEnrollment(enrollmentSignIn.challenge.token, CORRELATION_ID);
    const pending = await database.prisma.adminMfaCredential.findUnique({
      where: { userId: admin.id },
    });
    expect(pending?.confirmedAt).toBeNull();
    expect(pending?.secretCiphertext.startsWith('v1:')).toBe(true);
    expect(pending?.secretCiphertext).not.toContain(details.secret);

    const code = generateTotpCode(details.secret, timeStepFor(Date.now() + 5_000));
    const confirmation = await mfa.confirmEnrollment(
      enrollmentSignIn.challenge.token,
      code,
      CORRELATION_ID,
    );

    const confirmed = await database.prisma.adminMfaCredential.findUnique({
      where: { userId: admin.id },
    });
    expect(confirmed?.confirmedAt).not.toBeNull();
    expect(confirmed?.secretCiphertext).not.toContain(details.secret);
    const acceptedStep = confirmed?.lastAcceptedStep;
    if (acceptedStep === null || acceptedStep === undefined) {
      throw new Error('Expected the accepted step to be recorded');
    }
    expect(acceptedStep).toBeGreaterThan(0);

    const storedCodes = await database.prisma.adminMfaRecoveryCode.findMany({
      where: { userId: admin.id },
    });
    expect(storedCodes).toHaveLength(10);
    expect(storedCodes.every((row) => /^[0-9a-f]{64}$/.test(row.codeHash))).toBe(true);
    const firstRecoveryCode = confirmation.recoveryCodes[0];
    if (firstRecoveryCode === undefined) throw new Error('Expected a recovery code');
    expect(JSON.stringify(storedCodes)).not.toContain(firstRecoveryCode);

    const verificationSignIn = await identity.signIn({
      email: 'atrest.admin@nordhaven.test',
      password: ADMIN_PASSWORD,
      clientLabel: null,
      correlationId: CORRELATION_ID,
    });
    if (verificationSignIn.status !== 'MFA_REQUIRED') {
      throw new Error('Expected a second factor');
    }
    const completed = await mfa.completeVerification({
      challengeToken: verificationSignIn.challenge.token,
      recoveryCode: firstRecoveryCode,
      clientLabel: null,
      correlationId: CORRELATION_ID,
    });

    const storedSession = await database.prisma.session.findUnique({
      where: { id: completed.session.sessionId },
    });
    expect(storedSession?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(storedSession?.tokenHash).not.toContain(completed.session.token);
    expect(storedSession?.userId).toBe(admin.id);

    await reset.requestReset({
      email: 'atrest.admin@nordhaven.test',
      correlationId: CORRELATION_ID,
    });
    const storedTokens = await database.prisma.identityToken.findMany({
      where: { userId: admin.id },
    });
    expect(storedTokens.length).toBeGreaterThan(0);
    expect(storedTokens.every((row) => /^[0-9a-f]{64}$/.test(row.tokenHash))).toBe(true);

    const events = JSON.stringify(await database.prisma.securityEvent.findMany());
    expect(events).not.toContain(details.secret);
    expect(events).not.toContain(completed.session.token);
    expect(events).not.toContain(firstRecoveryCode);
    expect(events).not.toContain(ADMIN_PASSWORD);
  });
});
