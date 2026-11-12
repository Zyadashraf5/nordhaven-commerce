import { Writable } from 'node:stream';
import pino from 'pino';
import type { EnvironmentConfiguration } from '../config/environment';
import { REDACT_PATHS } from './logging';
import { createStructuredLoggerOptions } from './structured-logger';

const configuration: EnvironmentConfiguration = {
  nodeEnv: 'test',
  port: 3000,
  databaseUrl: 'postgresql://test:test@localhost:5432/nordhaven_e2e',
  logLevel: 'info',
  databaseStartupTimeoutMs: 5000,
  databaseProbeTimeoutMs: 1000,
  shutdownTimeoutMs: 8000,
  authEncryptionKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  authSessionAbsoluteTtlSeconds: 3600,
  authSessionIdleTtlSeconds: 1800,
  authMaxFailedAttempts: 10,
  authLockoutSeconds: 900,
  authPasswordResetTtlSeconds: 1800,
  authMfaIssuer: 'Nordhaven Commerce',
  authNotificationTransport: 'memory',
  customerNotificationTransport: 'memory',
};

describe('logging redaction', () => {
  it('covers credentials, cookies, authorization, and tokens', () => {
    expect(REDACT_PATHS.join('|')).toMatch(/authorization/);
    expect(REDACT_PATHS.join('|')).toMatch(/cookie/);
    expect(REDACT_PATHS.join('|')).toMatch(/password/);
    expect(REDACT_PATHS.join('|')).toMatch(/token/);
    expect(REDACT_PATHS.join('|')).toMatch(/databaseUrl/);
  });

  it('covers the customer profile and saved-address personal attributes', () => {
    const paths = REDACT_PATHS.join('|');
    for (const attribute of [
      'displayName',
      'recipientName',
      'line1',
      'line2',
      'city',
      'region',
      'postalCode',
      'countryCode',
      'phone',
    ]) {
      expect(paths).toContain(attribute);
    }
  });

  it('redacts injected synthetic secrets in captured structured output', () => {
    const chunks: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const logger = pino(createStructuredLoggerOptions(configuration), sink);
    const secret = 'synthetic-do-not-log';

    logger.error(
      {
        password: secret,
        token: secret,
        databaseUrl: `postgresql://user:${secret}@database:5432/nordhaven`,
        req: { headers: { authorization: `Bearer ${secret}`, cookie: `sid=${secret}` } },
      },
      'redaction_test',
    );

    const captured = chunks.join('');
    expect(captured).toContain('[REDACTED]');
    expect(captured).not.toContain(secret);
    expect(captured).not.toContain('postgresql://');
  });
});
