# Development Setup and Commands

Use the exact versions and first-start sequence in the root README. `.env.example` contains local
placeholders only. Export configuration in the session instead of creating a root `.env`: the
repository-hygiene gate rejects any `.env*` file except `*.example`, so a root `.env` makes
`pnpm verify` fail. If you prefer a file, copy the example outside the repository and set
`DOTENV_CONFIG_PATH` to it. Never place a real credential in a tracked file.

Milestone 02 requires one additional value, `AUTH_ENCRYPTION_KEY` (base64 for 32 random bytes). It
protects administrator MFA secrets at rest and must be a strong random value; the placeholder in
`.env.example` is intentionally not usable. Generate one with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

| Command                                                     | Purpose                                                         |
| ----------------------------------------------------------- | --------------------------------------------------------------- |
| `pnpm dev`                                                  | Start the API with fail-fast initial database verification      |
| `pnpm build`                                                | Compile the API                                                 |
| `pnpm format`                                               | Apply deterministic formatting intentionally                    |
| `pnpm format:check`                                         | Check formatting without rewriting                              |
| `pnpm lint`                                                 | Run strict ESLint rules                                         |
| `pnpm boundaries:check`                                     | Reject private cross-module imports                             |
| `pnpm typecheck`                                            | Run strict TypeScript checks                                    |
| `pnpm test:unit`                                            | Run database-free unit tests                                    |
| `pnpm test:integration`                                     | Run serial Prisma/PostgreSQL tests using `_integration`         |
| `pnpm test:e2e`                                             | Run serial HTTP tests using `_e2e`                              |
| `pnpm test:process`                                         | Verify startup and shutdown process behavior                    |
| `pnpm openapi:check`                                        | Validate generated OpenAPI, path allowlist, and committed drift |
| `pnpm openapi:generate`                                     | Regenerate the committed OpenAPI derivative for review          |
| `pnpm repo:hygiene`                                         | Check secret filenames and excluded module names                |
| `pnpm verify`                                               | Run the non-database composite quality gate                     |
| `pnpm db:up` / `pnpm db:down`                               | Start PostgreSQL / stop it without deleting its volume          |
| `pnpm db:wait`                                              | Wait for a bounded real PostgreSQL probe                        |
| `pnpm prisma:generate` / `pnpm prisma:validate`             | Generate the client / validate Prisma configuration             |
| `pnpm prisma:migrate:create --name descriptive_name`        | Create a reviewable migration without applying it               |
| `pnpm prisma:migrate:dev`                                   | Apply an already reviewed development migration                 |
| `pnpm prisma:migrate:deploy` / `pnpm prisma:migrate:status` | Deploy committed migrations / inspect history                   |
| `pnpm audit:prod`                                           | Fail on known critical production dependency advisories         |

Additional Milestone 02 commands:

| Command                                            | Purpose                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `node scripts/identity-create-admin.mjs --confirm` | Provision an administrator from `OPERATOR_ADMIN_EMAIL` and `OPERATOR_ADMIN_PASSWORD` (run `pnpm build` first) |

Tests reach three separate databases and the guard rejects any other name: development `nordhaven`,
`nordhaven_integration`, and `nordhaven_e2e`. Create the two test databases once (this never resets an
existing database):

```powershell
foreach ($database in @('nordhaven_integration', 'nordhaven_e2e')) {
  $exists = docker compose exec -T postgres psql -U nordhaven -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname='$database';"
  if ($exists -ne '1') { docker compose exec -T postgres createdb -U nordhaven $database }
}
```

Then export `NODE_ENV=test`, `AUTH_ENCRYPTION_KEY`, and the matching `DATABASE_URL` before each
suite, for example:

```powershell
$env:NODE_ENV = 'test'
$env:AUTH_ENCRYPTION_KEY = '<your local key>'
$env:DATABASE_URL = 'postgresql://nordhaven:local_only_change_me@localhost:5432/nordhaven_integration'
pnpm test:integration
```

`pnpm db:down` is the normal cleanup command. Volume deletion and database reset are intentionally
not exposed by the normal workflow because they are destructive.

The pinned PostgreSQL 18 container stores its versioned cluster beneath `/var/lib/postgresql`.
Compose therefore mounts the `nordhaven-postgres` named volume at that parent path, not at the
pre-18 `/var/lib/postgresql/data` path. Do not change the mount or remove/recreate the volume as a
troubleshooting shortcut.
