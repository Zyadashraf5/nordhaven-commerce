import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * The approved capability directories.
 *
 * Every capability that has been approved is listed here, so the suite proves that the repository
 * hygiene check **allows** each of them. The check's excluded list is currently empty, because
 * every capability the project planned has been approved; a new capability is added to the excluded
 * list until the milestone that approves it, and this list grows at the same moment.
 */
const APPROVED_CAPABILITIES = [
  'identity',
  'customers',
  'catalog',
  'inventory',
  'cart',
  'checkout',
  'tax',
  'order',
  'payments',
  'shipping',
  'review',
  'notification',
  'health',
] as const;

describe('repository hygiene', () => {
  it('passes the non-secret, no-commerce-module inspection', () => {
    const result = spawnSync(process.execPath, ['scripts/check-repository-hygiene.mjs'], {
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('passed');
  });

  it('pins PostgreSQL 18 to the named-volume root used by the image', async () => {
    const compose = await readFile('compose.yaml', 'utf8');
    expect(compose).toContain('image: postgres:18.6-alpine');
    expect(compose).toContain('nordhaven-postgres:/var/lib/postgresql');
    expect(compose).not.toContain('nordhaven-postgres:/var/lib/postgresql/data');
  });

  it.each([
    ['AWS access key', `AKIA${'A'.repeat(16)}`],
    ['private key material', ['-----BEGIN ', 'PRIVATE KEY-----'].join('')],
  ])('rejects a seeded %s canary', async (label, canary) => {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'nordhaven-hygiene-'));
    const script = path.resolve('scripts/check-repository-hygiene.mjs');
    try {
      await mkdir(path.join(fixtureRoot, 'apps/api/src/modules/health'), { recursive: true });
      await writeFile(path.join(fixtureRoot, '.env.example'), 'NODE_ENV=development\n', 'utf8');
      await writeFile(path.join(fixtureRoot, 'leak.txt'), canary, 'utf8');
      const result = spawnSync(process.execPath, [script], { cwd: fixtureRoot, encoding: 'utf8' });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(label);
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it.each(APPROVED_CAPABILITIES)(
    'allows the approved %s capability directory',
    async (capability) => {
      const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'nordhaven-hygiene-'));
      const script = path.resolve('scripts/check-repository-hygiene.mjs');
      try {
        await mkdir(path.join(fixtureRoot, 'apps/api/src/modules', capability), {
          recursive: true,
        });
        await writeFile(path.join(fixtureRoot, '.env.example'), 'NODE_ENV=development\n', 'utf8');
        const allowed = spawnSync(process.execPath, [script], {
          cwd: fixtureRoot,
          encoding: 'utf8',
        });
        expect(allowed.status).toBe(0);
        expect(allowed.stdout).toContain('passed');
      } finally {
        await rm(fixtureRoot, { recursive: true, force: true });
      }
    },
  );

  it('allows every approved capability at once', async () => {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'nordhaven-hygiene-'));
    const script = path.resolve('scripts/check-repository-hygiene.mjs');
    try {
      for (const capability of APPROVED_CAPABILITIES) {
        await mkdir(path.join(fixtureRoot, 'apps/api/src/modules', capability), {
          recursive: true,
        });
      }
      await writeFile(path.join(fixtureRoot, '.env.example'), 'NODE_ENV=development\n', 'utf8');
      const allowed = spawnSync(process.execPath, [script], {
        cwd: fixtureRoot,
        encoding: 'utf8',
      });
      expect(allowed.status).toBe(0);
      expect(allowed.stdout).toContain('passed');
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('still rejects an unsafe secret-bearing filename', async () => {
    const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'nordhaven-hygiene-'));
    const script = path.resolve('scripts/check-repository-hygiene.mjs');
    try {
      await mkdir(path.join(fixtureRoot, 'apps/api/src/modules/health'), { recursive: true });
      await writeFile(path.join(fixtureRoot, '.env.example'), 'NODE_ENV=development\n', 'utf8');
      await writeFile(path.join(fixtureRoot, 'production.pem'), 'not a key\n', 'utf8');
      const rejected = spawnSync(process.execPath, [script], {
        cwd: fixtureRoot,
        encoding: 'utf8',
      });
      expect(rejected.status).not.toBe(0);
      expect(rejected.stderr).toContain('unsafe secret-bearing filename');
    } finally {
      await rm(fixtureRoot, { recursive: true, force: true });
    }
  });
});
