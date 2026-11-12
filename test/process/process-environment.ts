/**
 * Shared environment for the process suites.
 *
 * `AUTH_ENCRYPTION_KEY` is pinned here so the suites never depend on an inherited value: without it
 * the application exits with `configuration_invalid` before the behavior under test can occur.
 *
 * The live-database cases need a reachable isolated database. `DATABASE_URL_E2E` takes precedence so
 * a caller can pin one explicitly; otherwise the suite uses `DATABASE_URL`, which the documented
 * gate command already points at the isolated end-to-end database.
 */
export const TEST_AUTH_ENCRYPTION_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export function resolveProcessDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_E2E ?? process.env.DATABASE_URL;
  if (url === undefined || url === '') {
    throw new Error(
      'Set DATABASE_URL_E2E or DATABASE_URL to the isolated end-to-end PostgreSQL database before running the process suite',
    );
  }
  return url;
}
