import { spawnSync } from 'node:child_process';

const marker = process.argv.indexOf('--name');
const name = marker >= 0 ? process.argv[marker + 1] : undefined;
if (name === undefined || !/^[a-z][a-z0-9_]{2,63}$/.test(name)) {
  process.stderr.write('Usage: pnpm prisma:migrate:create --name descriptive_name\n');
  process.exit(2);
}
if (process.env.NODE_ENV === 'production') {
  process.stderr.write('Migration creation is prohibited in production.\n');
  process.exit(2);
}
const result = spawnSync(
  'corepack',
  ['pnpm@12.13.0', 'exec', 'prisma', 'migrate', 'dev', '--create-only', '--name', name],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);
process.exitCode = result.status ?? 1;
