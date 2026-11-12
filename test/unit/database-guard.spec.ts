import { assertSafeTestDatabase } from '../helpers/database-guard';

describe('assertSafeTestDatabase', () => {
  const previous = process.env.NODE_ENV;
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
  });
  afterAll(() => {
    process.env.NODE_ENV = previous;
  });

  it('accepts a local, suite-owned database', () => {
    expect(
      assertSafeTestDatabase(
        'postgresql://test:test@localhost:5432/hc_m11_20261021_integration',
        'integration',
      ).pathname,
    ).toBe('/hc_m11_20261021_integration');
  });

  it.each([
    'postgresql://test:test@example.com:5432/hc_m11_20261021_integration',
    'postgresql://test:test@localhost:5432/postgres',
    'postgresql://test:test@localhost:5432/hc_m11_20261021_integration_wrong',
  ])('rejects unsafe target %s', (url) => {
    expect(() => assertSafeTestDatabase(url, 'integration')).toThrow();
  });

  it.each(['nordhaven', 'nordhaven_integration', 'nordhaven_e2e'])(
    'refuses the original development database %s even when its name matches a suite suffix',
    (databaseName) => {
      const suite = databaseName.endsWith('_e2e') ? 'e2e' : 'integration';
      expect(() =>
        assertSafeTestDatabase(`postgresql://test:test@localhost:5432/${databaseName}`, suite),
      ).toThrow(/original development databases are protected/);
    },
  );
});
