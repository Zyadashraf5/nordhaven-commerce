import { assertSafeDatabaseTarget } from './database-target';
import { z } from 'zod';

/** Base64 for exactly 32 bytes (256-bit key material). */
const encryptionKeySchema = z
  .string()
  .refine(
    (value) => /^[A-Za-z0-9+/]+={0,2}$/.test(value) && Buffer.from(value, 'base64').length === 32,
    { message: 'must be a base64-encoded 32-byte key' },
  );

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z
      .string()
      .url()
      .refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), {
        message: 'must use the PostgreSQL scheme',
      }),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    DATABASE_STARTUP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(10000).default(5000),
    DATABASE_PROBE_TIMEOUT_MS: z.coerce.number().int().min(100).max(1500).default(1000),
    ORDER_RESERVATION_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(1000).max(9000).default(8000),

    // Identity and Access configuration. The encryption key is the only newly required value; it
    // protects administrator MFA secrets at rest and is never logged, echoed, or serialized.
    AUTH_ENCRYPTION_KEY: encryptionKeySchema,
    AUTH_SESSION_ABSOLUTE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(300)
      .max(7776000)
      .default(2592000),
    AUTH_SESSION_IDLE_TTL_SECONDS: z.coerce.number().int().min(300).max(2592000).default(604800),
    AUTH_MAX_FAILED_ATTEMPTS: z.coerce.number().int().min(3).max(100).default(10),
    AUTH_LOCKOUT_SECONDS: z.coerce.number().int().min(30).max(86400).default(900),
    AUTH_PASSWORD_RESET_TTL_SECONDS: z.coerce.number().int().min(300).max(86400).default(1800),
    AUTH_MFA_ISSUER: z
      .string()
      .min(1)
      .max(64)
      .refine((value) => !/\p{C}/u.test(value), {
        message: 'must not contain control characters',
      })
      .default('Nordhaven Commerce'),
    AUTH_NOTIFICATION_TRANSPORT: z.enum(['none', 'file', 'memory']).default('none'),
    // The customer notification channel. HC-DEC-014 leaves the channel open, so the only shipped
    // transports are the local test transports and `none`, which sends nothing at all.
    CUSTOMER_NOTIFICATION_TRANSPORT: z.enum(['none', 'file', 'memory']).default('none'),
  })
  .superRefine((value, ctx) => {
    if (value.AUTH_SESSION_IDLE_TTL_SECONDS > value.AUTH_SESSION_ABSOLUTE_TTL_SECONDS) {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_SESSION_IDLE_TTL_SECONDS'],
        message: 'must not exceed the absolute session lifetime',
      });
    }
    if (value.NODE_ENV === 'production' && value.AUTH_NOTIFICATION_TRANSPORT === 'file') {
      ctx.addIssue({
        code: 'custom',
        path: ['AUTH_NOTIFICATION_TRANSPORT'],
        message: 'the file transport is not permitted in production',
      });
    }
    if (value.NODE_ENV === 'production' && value.CUSTOMER_NOTIFICATION_TRANSPORT === 'file') {
      ctx.addIssue({
        code: 'custom',
        path: ['CUSTOMER_NOTIFICATION_TRANSPORT'],
        message: 'the file transport is not permitted in production',
      });
    }
  });

export type NotificationTransport = 'none' | 'file' | 'memory';
export interface EnvironmentConfiguration {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
  databaseStartupTimeoutMs: number;
  databaseProbeTimeoutMs: number;
  shutdownTimeoutMs: number;
  orderReservationTtlSeconds?: number;
  authEncryptionKey: string;
  authSessionAbsoluteTtlSeconds: number;
  authSessionIdleTtlSeconds: number;
  authMaxFailedAttempts: number;
  authLockoutSeconds: number;
  authPasswordResetTtlSeconds: number;
  authMfaIssuer: string;
  authNotificationTransport: NotificationTransport;
  customerNotificationTransport: NotificationTransport;
}

export const ENVIRONMENT_CONFIGURATION = Symbol('ENVIRONMENT_CONFIGURATION');

/**
 * The currency every checkout is settled in.
 *
 * The approved decision fixes it, so it is a constant rather than a configuration key, and it lives
 * in the platform because more than one capability needs to name it: the Checkout capability prices
 * in it and the Shipping capability records a configured shipping amount in it.
 */
export const SETTLEMENT_CURRENCY = 'EGP';

/**
 * The environment a scoped configuration belongs to.
 *
 * A scoped configuration row - a tax rule, a checkout destination, a shipping destination, a
 * shipping method - belongs to exactly one scope, and a request reads only the rows of its own
 * scope. A `TEST` configuration can therefore never enable a production behaviour, and a production
 * request finds nothing until an administrator configures production after the relevant approval.
 */
export const ENVIRONMENT_SCOPES = ['TEST', 'PRODUCTION'] as const;
export type EnvironmentScopeValue = (typeof ENVIRONMENT_SCOPES)[number];

/**
 * The environment scope a request's configuration is selected under.
 *
 * A production request looks only for production configuration, so a `TEST` row can never apply to
 * it. Every other environment, including development and the test suites, uses the `TEST` scope.
 */
export function environmentScopeFor(nodeEnv: string): EnvironmentScopeValue {
  return nodeEnv === 'production' ? 'PRODUCTION' : 'TEST';
}

export class EnvironmentValidationError extends Error {
  public constructor(public readonly invalidKeys: readonly string[]) {
    super(`Invalid environment configuration: ${invalidKeys.join(', ')}`);
    this.name = 'EnvironmentValidationError';
  }
}

export function loadEnvironment(
  source: Readonly<Record<string, string | undefined>> = process.env,
): EnvironmentConfiguration {
  const result = environmentSchema.safeParse(source);
  if (!result.success) {
    const keys = [
      ...new Set(result.error.issues.map((issue) => String(issue.path[0] ?? 'unknown'))),
    ].sort();
    throw new EnvironmentValidationError(keys);
  }

  try {
    assertSafeDatabaseTarget(result.data.DATABASE_URL);
  } catch {
    throw new EnvironmentValidationError(['DATABASE_URL']);
  }

  if (result.data.NODE_ENV === 'test') {
    const databaseName = new URL(result.data.DATABASE_URL).pathname.replace(/^\//, '');
    if (!databaseName.endsWith('_integration') && !databaseName.endsWith('_e2e')) {
      throw new EnvironmentValidationError(['DATABASE_URL']);
    }
  }

  return {
    nodeEnv: result.data.NODE_ENV,
    port: result.data.PORT,
    databaseUrl: result.data.DATABASE_URL,
    logLevel: result.data.LOG_LEVEL,
    databaseStartupTimeoutMs: result.data.DATABASE_STARTUP_TIMEOUT_MS,
    databaseProbeTimeoutMs: result.data.DATABASE_PROBE_TIMEOUT_MS,
    shutdownTimeoutMs: result.data.SHUTDOWN_TIMEOUT_MS,
    orderReservationTtlSeconds: result.data.ORDER_RESERVATION_TTL_SECONDS,
    authEncryptionKey: result.data.AUTH_ENCRYPTION_KEY,
    authSessionAbsoluteTtlSeconds: result.data.AUTH_SESSION_ABSOLUTE_TTL_SECONDS,
    authSessionIdleTtlSeconds: result.data.AUTH_SESSION_IDLE_TTL_SECONDS,
    authMaxFailedAttempts: result.data.AUTH_MAX_FAILED_ATTEMPTS,
    authLockoutSeconds: result.data.AUTH_LOCKOUT_SECONDS,
    authPasswordResetTtlSeconds: result.data.AUTH_PASSWORD_RESET_TTL_SECONDS,
    authMfaIssuer: result.data.AUTH_MFA_ISSUER,
    authNotificationTransport: result.data.AUTH_NOTIFICATION_TRANSPORT,
    customerNotificationTransport: result.data.CUSTOMER_NOTIFICATION_TRANSPORT,
  };
}
