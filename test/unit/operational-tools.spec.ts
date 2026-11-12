import { spawnSync } from 'node:child_process';
describe('restore-drill target validation', () => {
  it.each([
    'nordhaven',
    'nordhaven_integration',
    'nordhaven_e2e',
    'postgres',
    'invalid source',
    'hc_batch_final_20261021_dev;invalid',
  ])('refuses %s before executing Docker', (target) => {
    const result = spawnSync(process.execPath, ['scripts/backup-restore-drill.mjs', target], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, PATH: '', NORDHAVEN_BACKUP_DIR: '' },
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Explicit owned isolated source required');
  });
  it('requires a durable explicit archive directory', () => {
    const result = spawnSync(
      process.execPath,
      ['scripts/backup-restore-drill.mjs', 'hc_batch_final_20261021_dev'],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env, PATH: '', NORDHAVEN_BACKUP_DIR: '' },
      },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Absolute durable NORDHAVEN_BACKUP_DIR required');
  });
});

describe('runtime image smoke isolation', () => {
  it.each(['nordhaven', 'nordhaven_integration', 'nordhaven_e2e', '%68omeware'])(
    'refuses %s before Docker',
    (name) => {
      const result = spawnSync(process.execPath, ['scripts/runtime-image-smoke.mjs'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: '',
          DATABASE_URL: 'postgresql://local:private@localhost:1/' + name,
        },
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('Explicit owned isolated database required for image smoke');
      expect(result.stderr).not.toContain('private');
    },
  );
});
