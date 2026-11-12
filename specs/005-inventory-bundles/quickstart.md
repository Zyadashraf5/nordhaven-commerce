# M05 local verification quickstart

Use Node 22.23.3 and pnpm 12.13.0. Keep original development/integration/E2E databases separate from test fixtures. The suites clean their dedicated test data; run them only on new disposable databases ending in _integration or _e2e, never a shared database. No database reset is needed.

1. Set DATABASE_URL to a new local isolated database. Run pnpm prisma:migrate:deploy, pnpm prisma:migrate:status and pnpm prisma:generate. On an existing database, first use read-only migrate status and migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code; investigate differences before any writes.
2. Run pnpm verify. It checks formatting, lint, module boundaries, types, units, build, repository hygiene and OpenAPI drift.
3. Set NODE_ENV=test and DATABASE_URL to the isolated _integration database. Run pnpm test:integration.
4. Switch DATABASE_URL to the isolated _e2e database. Run pnpm test:e2e and pnpm test:process.
5. Run pnpm audit:prod and pnpm audit --json separately. The full audit currently reports an unpatched high development-only braces advisory; it must not be represented as clean.

The automated inventory HTTP journey provisions an MFA administrator, stocks components, creates an empty FIXED bundle, assembles it (200), reserves finished goods once, rejects disassembly of reserved stock (409), confirms the hold, disassembles free goods (200), verifies component/audit state and rejects anonymous/customer callers. Integration additionally races operations and proves rollback/stock constraints. DYNAMIC quantity-only reservations are refused; explicit SKU lines remain the supported operational primitive.

Executed evidence and backup paths are in docs/progress/milestone-05.md. Scripted suites were run; a separate manual curl walkthrough and human warehouse acceptance have not been claimed. Do not proceed to M06 based on these commands.
