import { assertSafeDatabaseTarget } from './database-target';
import { loadEnvironment } from './environment';
import { DatabaseService } from '../database/database.service';
import type { EnvironmentConfiguration } from './environment';
describe('protected database targets', () => {
  it.each([
    'nordhaven',
    'nordhaven_integration',
    'nordhaven_e2e',
    '%6eordhaven',
    'NORDHAVEN',
    '',
    'safe?dbname=nordhaven',
    'safe?DATABASE=nordhaven',
    'safe%2fnordhaven',
  ])('refuses %s before constructing an adapter', (name) => {
    const databaseUrl = 'postgresql://test:private@localhost:1/' + name;
    expect(() => assertSafeDatabaseTarget(databaseUrl)).toThrow('Database target is not permitted');
    expect(() => new DatabaseService({ databaseUrl } as EnvironmentConfiguration)).toThrow(
      'Database target is not permitted',
    );
    expect(() =>
      loadEnvironment({
        NODE_ENV: 'development',
        DATABASE_URL: databaseUrl,
        AUTH_ENCRYPTION_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      }),
    ).toThrow('DATABASE_URL');
  });
  it.each(['hc_batch_final_20261021_dev', 'nordhaven_ci_integration', 'nordhaven_unit_e2e'])(
    'accepts explicit isolated target %s',
    (name) => {
      expect(() =>
        assertSafeDatabaseTarget(
          'postgresql://test:private@localhost:1/' + name + '?schema=public',
        ),
      ).not.toThrow();
    },
  );
});
