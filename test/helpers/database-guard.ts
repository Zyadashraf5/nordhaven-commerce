const allowedHosts = new Set(['localhost', '127.0.0.1', '::1', 'postgres']);

/**
 * The three original databases, which a test must never touch.
 *
 * The originals hold the historical development data and are deliberately **not** on the current
 * schema: they carry fourteen applied migrations while the application requires eighteen. A
 * mutating suite aimed at one of them would both destroy preserved history and fail against a
 * schema the application does not expect.
 *
 * The suffix rule alone would not stop that, because `nordhaven_integration` and `nordhaven_e2e` end
 * with the suite suffixes. The denylist therefore names the originals explicitly, so the rule is
 * enforced by the guard itself and not only by the runner's configuration.
 */
const protectedDatabases = new Set(['nordhaven', 'nordhaven_integration', 'nordhaven_e2e']);

export function assertSafeTestDatabase(
  value: string | undefined,
  suite: 'integration' | 'e2e',
): URL {
  if (process.env.NODE_ENV !== 'test') throw new Error('Database tests require NODE_ENV=test');
  if (value === undefined)
    throw new Error('DATABASE_URL is required; its value will not be printed');
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('PostgreSQL is required');
  if (!allowedHosts.has(url.hostname)) throw new Error('Test database host is not allowlisted');
  const databaseName = url.pathname.replace(/^\//, '');
  if (protectedDatabases.has(databaseName)) {
    throw new Error(
      'The original development databases are protected and must never be used by a test suite',
    );
  }
  const expectedSuffix = `_${suite}`;
  if (!databaseName.endsWith(expectedSuffix)) {
    throw new Error(`Test database name must end with ${expectedSuffix}`);
  }
  return url;
}
