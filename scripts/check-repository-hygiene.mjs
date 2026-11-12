import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const ignored = new Set(['.git', 'node_modules', 'dist', 'coverage', '.cache', '.next', 'build']);
const unsafeNames = [/^\.env($|\.)/i, /\.pem$/i, /\.p12$/i, /\.pfx$/i, /^id_rsa$/i];
const inspectableExtensions = new Set([
  '.example',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.ts',
  '.txt',
  '.yaml',
  '.yml',
]);
const secretCanaries = [
  ['private key material', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['AWS access key', /\bAKIA[A-Z0-9]{16}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/],
];
const excludedModules = new Set([
  // The unapproved commerce capabilities. `customer` for Milestone 03, `catalog` and `product` for
  // Milestone 04, `inventory` and `bundle` for Milestone 05, and `cart` and `wishlist` for
  // Milestone 07 were removed exactly as those capabilities were approved; `checkout` was removed
  // for Milestone 08, and `order`, `preorder`, and `payment` for Milestones 09 and 10. `shipping`
  // was removed for Milestone 11, when the Shipping and Fulfillment capability was approved, and
  // `review` and `notification` for Milestone 12, when the Reviews and Notifications capabilities
  // were approved.
  //
  // The list is currently empty, because every capability the project planned has been approved. A
  // new capability is added here until the milestone that approves it, and it is removed at the
  // same moment, so an unapproved capability can never reach the storefront by accident.
]);
const findings = [];

async function walk(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(full)));
    else result.push(full);
  }
  return result;
}

for (const file of await walk(root)) {
  const relative = path.relative(root, file).replaceAll('\\', '/');
  const name = path.basename(file);
  if (unsafeNames.some((pattern) => pattern.test(name)) && !name.endsWith('.example'))
    findings.push(`${relative}: unsafe secret-bearing filename`);
  if (name !== 'pnpm-lock.yaml' && inspectableExtensions.has(path.extname(name).toLowerCase())) {
    const content = await readFile(file, 'utf8');
    for (const [label, pattern] of secretCanaries) {
      if (pattern.test(content)) findings.push(`${relative}: ${label}`);
    }
  }
}

const modulesRoot = path.join(root, 'apps', 'api', 'src', 'modules');
for (const entry of await readdir(modulesRoot, { withFileTypes: true })) {
  if (entry.isDirectory() && excludedModules.has(entry.name.toLowerCase()))
    findings.push(`${entry.name}: excluded commerce module`);
}

const envExample = await readFile(path.join(root, '.env.example'), 'utf8');
if (/BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/.test(envExample))
  findings.push('.env.example: private key material');

if (findings.length > 0) {
  process.stderr.write(`${findings.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Repository hygiene check passed.\n');
}
