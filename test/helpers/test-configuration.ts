import type { EnvironmentConfiguration } from '../../apps/api/src/platform/config/environment';
import { assertSafeTestDatabase } from './database-guard';

/**
 * Test-only key material (32 zero bytes, base64).
 *
 * It is deliberately obvious and value-free so it can never be mistaken for a real key, and it is
 * only ever used by suites that never touch real data.
 */
export const TEST_AUTH_ENCRYPTION_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

/**
 * Builds a complete environment configuration for a test.
 *
 * The Identity guardrails (session lifetimes, lockout, reset lifetime, MFA issuer, notification
 * transport) all have defaults, so a suite only states what it actually depends on.
 */
export function testConfiguration(
  overrides: Partial<EnvironmentConfiguration> = {},
): EnvironmentConfiguration {
  return {
    nodeEnv: 'test',
    port: 3000,
    databaseUrl: 'postgresql://test:test@localhost:5432/nordhaven_unit_e2e',
    logLevel: 'silent',
    databaseStartupTimeoutMs: 5000,
    databaseProbeTimeoutMs: 1000,
    shutdownTimeoutMs: 8000,
    authEncryptionKey: TEST_AUTH_ENCRYPTION_KEY,
    authSessionAbsoluteTtlSeconds: 3600,
    authSessionIdleTtlSeconds: 1800,
    authMaxFailedAttempts: 10,
    authLockoutSeconds: 900,
    authPasswordResetTtlSeconds: 1800,
    authMfaIssuer: 'Nordhaven Commerce',
    authNotificationTransport: 'memory',
    customerNotificationTransport: 'memory',
    ...overrides,
  };
}

/**
 * Builds a configuration whose `databaseUrl` is the allowlisted isolated test database for the
 * given suite. Throws without printing the value when `DATABASE_URL` is missing or unsafe.
 */
export function testConfigurationFor(
  suite: 'integration' | 'e2e',
  overrides: Partial<EnvironmentConfiguration> = {},
): EnvironmentConfiguration {
  const databaseUrl = assertSafeTestDatabase(process.env.DATABASE_URL, suite).toString();
  return testConfiguration({ databaseUrl, ...overrides });
}
