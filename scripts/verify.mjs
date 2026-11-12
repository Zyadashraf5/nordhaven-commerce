import { spawnSync } from 'node:child_process';

const checks = [
  ['format', ['format:check']],
  ['lint', ['lint']],
  ['boundaries', ['boundaries:check']],
  ['types', ['typecheck']],
  ['unit', ['test:unit']],
  ['build', ['build']],
  ['repository hygiene', ['repo:hygiene']],
  ['OpenAPI', ['openapi:check']],
];

for (const [category, args] of checks) {
  process.stdout.write(`Verification category: ${category}\n`);
  const result = spawnSync('corepack', ['pnpm@12.13.0', ...args], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    process.stderr.write(`Verification failed in category: ${category}\n`);
    process.exit(result.status ?? 1);
  }
}
process.stdout.write('All composite verification categories passed.\n');
