import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import process from 'node:process';

/**
 * Guarded administrator provisioning.
 *
 * There is no administrative self-registration, so the only way to create an administrator is this
 * explicit operational path. The email and password are read from the environment only: a password
 * passed on the command line would leak into shell history and the process table. Every exit path
 * reports a fixed reason and never echoes a credential or a database error.
 *
 * Usage (from the repository root, after `pnpm build`):
 *   $env:OPERATOR_ADMIN_EMAIL = 'operator@example.com'
 *   $env:OPERATOR_ADMIN_PASSWORD = '<at least 12 characters>'
 *   node scripts/identity-create-admin.mjs --confirm
 */
const require = createRequire(import.meta.url);

const usage = [
  'Usage: node scripts/identity-create-admin.mjs --confirm',
  '',
  'Required environment variables:',
  '  OPERATOR_ADMIN_EMAIL     the administrator sign-in address',
  '  OPERATOR_ADMIN_PASSWORD  the administrator password (never passed as an argument)',
  '  DATABASE_URL             the target database',
  '  AUTH_ENCRYPTION_KEY      base64 for 32 bytes; required to start the application',
].join('\n');

function fail(reason, exitCode) {
  process.stderr.write(
    `${JSON.stringify({ event: 'administrator_provisioning_failed', reason })}\n`,
  );
  process.exit(exitCode);
}

function loadBuiltApi() {
  try {
    return {
      createApplication: require('../apps/api/dist/bootstrap/create-application.js')
        .createApplication,
      toStartupDiagnostic: require('../apps/api/dist/bootstrap/startup-diagnostics.js')
        .toStartupDiagnostic,
      AdministratorProvisioningService:
        require('../apps/api/dist/modules/identity/application/administrator-provisioning.service.js')
          .AdministratorProvisioningService,
    };
  } catch {
    process.stderr.write('The API is not built. Run `pnpm build` first.\n');
    process.exit(2);
  }
}

if (!process.argv.includes('--confirm')) {
  process.stderr.write(`${usage}\n\nRefusing to run without --confirm.\n`);
  process.exit(2);
}

const email = process.env.OPERATOR_ADMIN_EMAIL;
const password = process.env.OPERATOR_ADMIN_PASSWORD;

if (email === undefined || email.trim() === '') fail('missing_operator_admin_email', 2);
if (password === undefined || password === '') fail('missing_operator_admin_password', 2);

const { createApplication, toStartupDiagnostic, AdministratorProvisioningService } = loadBuiltApi();

let app;
try {
  ({ app } = await createApplication());
} catch (error) {
  process.stderr.write(`${JSON.stringify(toStartupDiagnostic(error))}\n`);
  process.exit(1);
}

try {
  const created = await app.get(AdministratorProvisioningService).provision({
    email,
    password,
    correlationId: randomUUID(),
  });
  process.stdout.write(
    `${JSON.stringify({
      event: 'administrator_provisioned',
      id: created.id,
      email: created.email,
      role: created.role,
      createdAt: created.createdAt,
    })}\n`,
  );
} catch (error) {
  if (error instanceof Error && error.name === 'BadRequestException') {
    fail('password_policy', 1);
  }
  if (
    error instanceof Error &&
    error.message === 'An account already exists for the supplied email address'
  ) {
    fail('account_exists', 1);
  }
  fail('unexpected_error', 1);
} finally {
  await app.close();
}
