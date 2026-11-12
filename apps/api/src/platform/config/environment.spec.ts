import { EnvironmentValidationError, loadEnvironment } from './environment';

const valid = {
  NODE_ENV: 'development',
  PORT: '3000',
  DATABASE_URL: 'postgresql://user:secret@localhost:5432/nordhaven_unit_dev',
  LOG_LEVEL: 'info',
  DATABASE_STARTUP_TIMEOUT_MS: '5000',
  DATABASE_PROBE_TIMEOUT_MS: '1000',
  SHUTDOWN_TIMEOUT_MS: '8000',
  AUTH_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
};

describe('loadEnvironment', () => {
  it('normalizes valid configuration', () => {
    expect(loadEnvironment(valid)).toMatchObject({ port: 3000, nodeEnv: 'development' });
  });

  it('reports keys without rejected secret values', () => {
    const secret = 'do-not-print-this-secret';
    expect(() => loadEnvironment({ ...valid, DATABASE_URL: secret })).toThrow(
      EnvironmentValidationError,
    );
    try {
      loadEnvironment({ ...valid, DATABASE_URL: secret });
    } catch (error: unknown) {
      expect(String(error)).toContain('DATABASE_URL');
      expect(String(error)).not.toContain(secret);
    }
  });

  it('requires an isolated test database suffix', () => {
    expect(() => loadEnvironment({ ...valid, NODE_ENV: 'test' })).toThrow(
      EnvironmentValidationError,
    );
  });

  it.each([
    ['PORT', '70000'],
    ['DATABASE_PROBE_TIMEOUT_MS', '2000'],
    ['DATABASE_URL', 'mysql://user:secret@localhost:3306/nordhaven_unit_dev'],
  ])('rejects malformed %s without printing its value', (key, value) => {
    expect(() => loadEnvironment({ ...valid, [key]: value })).toThrow(EnvironmentValidationError);
    try {
      loadEnvironment({ ...valid, [key]: value });
    } catch (error: unknown) {
      expect(String(error)).toContain(key);
      expect(String(error)).not.toContain(value);
    }
  });

  it('requires the MFA encryption key and never prints it', () => {
    const withoutKey: Record<string, string | undefined> = { ...valid };
    delete withoutKey.AUTH_ENCRYPTION_KEY;

    expect(() => loadEnvironment(withoutKey)).toThrow(EnvironmentValidationError);
    try {
      loadEnvironment(withoutKey);
    } catch (error: unknown) {
      expect((error as EnvironmentValidationError).invalidKeys).toContain('AUTH_ENCRYPTION_KEY');
      expect(String(error)).not.toContain(valid.AUTH_ENCRYPTION_KEY);
    }
  });

  it.each([
    ['a value that decodes to fewer than 32 bytes', 'c2hvcnQ='],
    ['a value that is not base64', 'not base64!!'],
  ])('rejects %s as encryption key material', (_label, encryptionKey) => {
    expect(() => loadEnvironment({ ...valid, AUTH_ENCRYPTION_KEY: encryptionKey })).toThrow(
      EnvironmentValidationError,
    );
  });

  it('applies the documented identity defaults', () => {
    expect(loadEnvironment(valid)).toMatchObject({
      authSessionAbsoluteTtlSeconds: 2_592_000,
      authSessionIdleTtlSeconds: 604_800,
      authMaxFailedAttempts: 10,
      authLockoutSeconds: 900,
      authPasswordResetTtlSeconds: 1_800,
      authMfaIssuer: 'Nordhaven Commerce',
      authNotificationTransport: 'none',
    });
  });

  it('refuses an idle session lifetime longer than the absolute lifetime', () => {
    expect(() =>
      loadEnvironment({
        ...valid,
        AUTH_SESSION_ABSOLUTE_TTL_SECONDS: '600',
        AUTH_SESSION_IDLE_TTL_SECONDS: '1200',
      }),
    ).toThrow(EnvironmentValidationError);
  });

  it('refuses the file notification transport in production', () => {
    expect(() =>
      loadEnvironment({ ...valid, NODE_ENV: 'production', AUTH_NOTIFICATION_TRANSPORT: 'file' }),
    ).toThrow(EnvironmentValidationError);
  });

  it('rejects an unknown notification transport', () => {
    expect(() => loadEnvironment({ ...valid, AUTH_NOTIFICATION_TRANSPORT: 'smtp' })).toThrow(
      EnvironmentValidationError,
    );
  });
});

describe('the configurable order hold window', () => {
  it('defaults to fifteen minutes and accepts a bounded explicit override', () => {
    expect(loadEnvironment(valid).orderReservationTtlSeconds).toBe(900);
    expect(
      loadEnvironment({ ...valid, ORDER_RESERVATION_TTL_SECONDS: '1200' })
        .orderReservationTtlSeconds,
    ).toBe(1200);
  });
  it.each(['0', '-1', '86401', '1.5'])('refuses an invalid hold duration %s', (value) => {
    expect(() => loadEnvironment({ ...valid, ORDER_RESERVATION_TTL_SECONDS: value })).toThrow(
      EnvironmentValidationError,
    );
  });
});
