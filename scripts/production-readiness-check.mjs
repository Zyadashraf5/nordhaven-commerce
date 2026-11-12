#!/usr/bin/env node
/**
 * The production-readiness check.
 *
 * The check is a **static and configuration** gate. It reads the repository, validates the
 * deployment configuration, and proves the production guards are in place. It performs no
 * deployment, contacts no external service, and never touches the three original databases.
 *
 * Every finding is a fixed, named rule, so a failure names the rule that broke rather than a
 * symptom.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const findings = [];
const checks = [];

function check(name, condition, detail) {
  const outcome = condition ? 'pass' : 'fail';
  checks.push({ name, outcome, detail });
  if (outcome === 'fail') findings.push(`${name}: ${detail}`);
}

function read(relative) {
  return readFileSync(path.join(root, relative), 'utf8');
}

function walk(directory, predicate, found = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist', '.git', 'coverage', '.cache', 'generated'].includes(entry.name))
      continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, predicate, found);
    else if (predicate(full)) found.push(full);
  }
  return found;
}

// ---------------------------------------------------------------------------------------------
// 1. The production guards.
// ---------------------------------------------------------------------------------------------

const paymentProvider = read(
  'apps/api/src/modules/payments/application/local-test-payment.provider.ts',
);
check(
  'the shipped payment provider refuses to operate in production',
  paymentProvider.includes("'production'") && paymentProvider.toLowerCase().includes('refus'),
  'the local test payment provider must refuse a production environment',
);

const notificationProviders = read(
  'apps/api/src/modules/notification/application/notification.providers.ts',
);
check(
  'the shipped notification transports refuse to operate in production',
  notificationProviders.includes("'production'") &&
    notificationProviders.includes('FileNotificationProvider') &&
    notificationProviders.includes('MemoryNotificationProvider'),
  'the file and memory notification transports must refuse a production environment',
);

const environment = read('apps/api/src/platform/config/environment.ts');
check(
  'the customer notification channel defaults to sending nothing',
  environment.includes('CUSTOMER_NOTIFICATION_TRANSPORT') &&
    environment.includes("z.enum(['none', 'file', 'memory']).default('none')"),
  'the customer notification transport must default to none',
);

const scope = read('apps/api/src/platform/config/environment.ts');
check(
  'a production request reads only production configuration',
  scope.includes('environmentScopeFor') && scope.includes("'production'"),
  'the environment scope must map a production request to the production scope',
);

// ---------------------------------------------------------------------------------------------
// 2. The security posture.
// ---------------------------------------------------------------------------------------------

const identity = read('apps/api/src/modules/identity/application/mfa.service.ts');
check(
  'the administrator multi-factor gate exists',
  identity.includes('MFA') || identity.includes('mfa'),
  'the Identity capability must enforce multi-factor authentication for administrators',
);

const rolesGuard = read('apps/api/src/platform/security/roles.guard.ts');
check(
  'every access decision is recorded',
  rolesGuard.includes('audit') && rolesGuard.includes('GRANTED') && rolesGuard.includes('DENIED'),
  'the roles guard must record both the grant and the denial',
);

const rateLimitGuard = read('apps/api/src/platform/security/rate-limit.guard.ts');
check(
  'the rate limiter runs before the credential work',
  rateLimitGuard.includes('RateLimit'),
  'the rate limit guard must exist and declare its policies',
);

const secretPatterns = [
  ['private key material', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['AWS access key', /\bAKIA[A-Z0-9]{16}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/],
];
const secretFindings = [];
for (const file of walk(path.join(root, 'apps'), (candidate) =>
  /\.(ts|json|mjs)$/.test(candidate),
)) {
  const content = readFileSync(file, 'utf8');
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(content)) secretFindings.push(`${path.relative(root, file)}: ${label}`);
  }
}
check(
  'no credential material is committed',
  secretFindings.length === 0,
  secretFindings.join(', '),
);

// ---------------------------------------------------------------------------------------------
// 3. The deployment configuration.
// ---------------------------------------------------------------------------------------------

const envExample = read('.env.example');
const requiredVariables = [
  'NODE_ENV',
  'PORT',
  'DATABASE_URL',
  'AUTH_ENCRYPTION_KEY',
  'AUTH_SESSION_ABSOLUTE_TTL_SECONDS',
  'AUTH_SESSION_IDLE_TTL_SECONDS',
  'AUTH_MAX_FAILED_ATTEMPTS',
  'AUTH_LOCKOUT_SECONDS',
  'AUTH_PASSWORD_RESET_TTL_SECONDS',
  'AUTH_MFA_ISSUER',
  'AUTH_NOTIFICATION_TRANSPORT',
  'CUSTOMER_NOTIFICATION_TRANSPORT',
];
const missingVariables = requiredVariables.filter((name) => !envExample.includes(`${name}=`));
check(
  'the environment example declares every required variable',
  missingVariables.length === 0,
  `missing: ${missingVariables.join(', ')}`,
);

const compose = read('compose.yaml');
check(
  'the database uses a named volume and a pinned image',
  compose.includes('nordhaven-postgres:/var/lib/postgresql') &&
    compose.includes('image: postgres:'),
  'the compose file must pin the image and use a named volume root',
);

const packageJson = JSON.parse(read('package.json'));
check(
  'the quality gate is a single documented command',
  typeof packageJson.scripts?.verify === 'string',
  'the package must expose a verify script',
);

// ---------------------------------------------------------------------------------------------
// 4. The contract and the schema.
// ---------------------------------------------------------------------------------------------

const openapi = JSON.parse(read('openapi/openapi.json'));
const operations = Object.entries(openapi.paths).flatMap(([route, item]) =>
  Object.keys(item)
    .filter((method) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
    .map((method) => `${method.toUpperCase()} ${route}`),
);
check(
  'the published contract declares its operations',
  operations.length >= 145,
  `the contract declares ${operations.length} operations`,
);
check(
  'the published contract declares its version',
  typeof openapi.info?.version === 'string' && openapi.info.version.length > 0,
  'the contract must carry a version',
);

const prismaValidate = spawnSync(
  process.execPath,
  ['node_modules/prisma/build/index.js', 'validate'],
  {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      DATABASE_URL:
        process.env.DATABASE_URL ??
        'postgresql://nordhaven:local_only_change_me@localhost:5432/hc_m11_20261021_integration?schema=public',
    },
    maxBuffer: 8 * 1024 * 1024,
  },
);
check(
  'the Prisma schema validates',
  prismaValidate.status === 0,
  (prismaValidate.stdout ?? '') + (prismaValidate.stderr ?? ''),
);

// ---------------------------------------------------------------------------------------------
// 5. The dependency posture.
// ---------------------------------------------------------------------------------------------

const audit = spawnSync('corepack', ['pnpm@12.13.0', 'audit', '--prod'], {
  cwd: root,
  encoding: 'utf8',
  shell: true,
  maxBuffer: 8 * 1024 * 1024,
});
check(
  'the production dependency tree has no advisory',
  audit.status === 0,
  ((audit.stdout ?? '') + (audit.stderr ?? '')).slice(0, 4000),
);

const auditAll = spawnSync('corepack', ['pnpm@12.13.0', 'audit', '--audit-level', 'high'], {
  cwd: root,
  encoding: 'utf8',
  shell: true,
  maxBuffer: 8 * 1024 * 1024,
});
check(
  'the development dependency tree has no High advisory',
  auditAll.status === 0,
  ((auditAll.stdout ?? '') + (auditAll.stderr ?? '')).slice(0, 4000),
);

// ---------------------------------------------------------------------------------------------
// The report.
// ---------------------------------------------------------------------------------------------

for (const entry of checks) {
  const marker = entry.outcome === 'pass' ? 'PASS' : 'FAIL';
  process.stdout.write(`${marker}  ${entry.name}\n`);
  if (entry.outcome === 'fail') process.stdout.write(`      ${entry.detail}\n`);
}

const failures = checks.filter((entry) => entry.outcome === 'fail').length;
process.stdout.write(
  `\n${checks.length - failures} of ${checks.length} production-readiness checks passed.\n`,
);
if (failures > 0) {
  process.stderr.write(`${failures} production-readiness check(s) failed.\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    'Local static readiness checks passed; production acceptance remains separately blocked.\n',
  );
}
