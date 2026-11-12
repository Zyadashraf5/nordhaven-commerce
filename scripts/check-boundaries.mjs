import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { findModuleBoundaryViolations, fixtureSourcePath } from './lib/module-boundaries.mjs';

const root = process.cwd();
const sourceRoot = path.join(root, 'apps', 'api', 'src');
const violations = [];

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const full = path.join(directory, entry.name);
      return entry.isDirectory() ? filesUnder(full) : [full];
    }),
  );
  return nested.flat();
}

for (const file of (await filesUnder(sourceRoot)).filter((item) => item.endsWith('.ts'))) {
  const relative = path.relative(sourceRoot, file).replaceAll('\\', '/');
  const content = await readFile(file, 'utf8');
  violations.push(...findModuleBoundaryViolations(relative, content));
}

const fixtureRoot = path.join(root, 'test', 'fixtures', 'boundaries');
const allowed = await readFile(path.join(fixtureRoot, 'allowed.ts.fixture'), 'utf8');
const forbidden = await readFile(path.join(fixtureRoot, 'forbidden.ts.fixture'), 'utf8');
const allowedSource = fixtureSourcePath(allowed);
const forbiddenSource = fixtureSourcePath(forbidden);
if (
  allowedSource === undefined ||
  findModuleBoundaryViolations(allowedSource, allowed).length !== 0
) {
  violations.push('Allowed fixture was not accepted by the production boundary algorithm');
}
if (
  forbiddenSource === undefined ||
  findModuleBoundaryViolations(forbiddenSource, forbidden).length !== 1
) {
  violations.push('Forbidden fixture was not rejected by the production boundary algorithm');
}

if (violations.length > 0) {
  process.stderr.write(`${violations.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Module boundary check passed.\n');
}
