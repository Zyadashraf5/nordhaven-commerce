# Milestone 02 - Authentication & Authorization Verification Record

**Checkpoint date**: 2026-10-19
**Task state**: 68 of 68 tasks complete (T001-T068)
**Overall state**: All local Milestone 02 acceptance criteria satisfied by a single complete quality-gate
pass plus a seeded-failure rejection pass (M02-SC-010); hosted CI evidence remains NOT VERIFIED pending
an approved initial commit

This record distinguishes commands executed in the Milestone 02 session from Milestone 01's retained
record. No commit, push, deployment, database reset, `db push`, volume deletion, commerce module,
constitution change, or `HC-DEC-*` resolution was performed. Windows PowerShell 5.1 was used throughout;
no optional software was added to the host.

## Scope and constraints honored

- Identity & Access only; no commerce module, entity, or route exists (`order`, `cart`, `catalog`, and
  the rest remain absent and rejected by the hygiene gate).
- **Zero new runtime or development dependencies.** `package.json` and `pnpm-lock.yaml` are unchanged;
  every Milestone 02 primitive uses `node:crypto` or project-owned code (password hashing, TOTP,
  AES-256-GCM, token hashing, rate limiting, guards, OpenAPI post-processing).
- No paid or external service was introduced. Recovery delivery ships only non-production transports
  (in-memory for tests, local file for development, both refused or inert in production); production
  delivery stays blocked behind HC-DEC-014.
- The approved NestJS modular-monolith architecture and the Milestone 01 foundation are preserved.
- No secret, token, password, or key is logged, returned, or persisted in recoverable form.

## Verification performed

### 1. Complete composite gate (M02-SC-010, positive half)

`pnpm verify` executed after all seeds were removed. All eight categories passed and the run stopped
only at the end:

| Category           | Result                                                                     |
| ------------------ | -------------------------------------------------------------------------- |
| Format             | PASS — "All matched files use Prettier code style!"                        |
| ESLint             | PASS — `--max-warnings 0`, zero warnings/errors                            |
| Module boundaries  | PASS — production sources and both fixtures                                |
| TypeScript         | PASS — strict API and root/test configurations                             |
| Unit tests         | PASS — 17 suites, 115/115 tests                                            |
| Build              | PASS — Nest build                                                          |
| Repository hygiene | PASS — no unsafe filename, secret canary, or excluded domain               |
| OpenAPI            | PASS — structural validation, inventory, excluded-domain scan, drift check |

`All composite verification categories passed.`

### 2. Database-backed and process suites

| Suite       | Command                 | Result                                                                          |
| ----------- | ----------------------- | ------------------------------------------------------------------------------- |
| Integration | `pnpm test:integration` | PASS — 2 suites, 14/14 tests against `nordhaven_integration`                    |
| E2E         | `pnpm test:e2e`         | PASS — 3 suites, 16/16 tests against `nordhaven_e2e`                            |
| Process     | `pnpm test:process`     | PASS — 4 passed + 1 skipped (POSIX SIGTERM case, `win32`-conditional), 0 failed |

The process suite was run with neither `AUTH_ENCRYPTION_KEY` exported nor `DATABASE_URL_E2E` set,
proving it is self-contained (defect D1 below).

### 3. Migration status

| Database                | Command                      | Result                                                      |
| ----------------------- | ---------------------------- | ----------------------------------------------------------- |
| `nordhaven`             | `pnpm prisma:migrate:status` | PASS — 2 migrations found, "Database schema is up to date!" |
| `nordhaven_integration` | `pnpm prisma:migrate:status` | PASS — 2 migrations found, "Database schema is up to date!" |
| `nordhaven_e2e`         | `pnpm prisma:migrate:status` | PASS — 2 migrations found, "Database schema is up to date!" |

### 4. Production dependency audit

`pnpm audit --prod --audit-level critical` — PASS, "No known vulnerabilities found".

### 5. Seeded-failure rejection (M02-SC-010, negative half)

One defect per gate category was introduced, the owning category was run, and the seed was removed.
Every category rejected its seed, and no seed survived:

| Category   | Seeded defect                                                      | Rejection evidence                                                 |
| ---------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Format     | Unformatted `.ts` under `platform/`                                | `format:check` exit 1                                              |
| ESLint     | Prettier-clean file with an unused local                           | `lint` exit 1                                                      |
| TypeScript | `const seededBad: number = 'not-a-number'`                         | `typecheck` exit 1                                                 |
| Build      | Same type defect                                                   | `build` exit 1                                                     |
| Boundaries | `modules/health` importing `modules/identity/application/...` deep | `boundaries:check` exit 1 — "private import into modules/identity" |
| Hygiene    | A `modules/order` directory                                        | `repo:hygiene` exit 1 — "order: excluded commerce module"          |
| Unit       | A spec asserting `expect(1).toBe(2)`                               | `test:unit` exit 1 — "1 failed, 115 passed"                        |
| OpenAPI    | A renamed `operationId` in the committed document                  | `openapi:check` exit 1 — "OpenAPI drift detected"                  |

No repeated identical full-suite passes were required, per M02-SC-010.

### 6. Live quickstart smoke test (T066)

`specs/002-authentication-authorization/quickstart.md` was executed end to end as written, using the
document's own `Invoke-Api`/`Convert-ApiJson` helpers, against a built API on `http://localhost:3100`
with the isolated `nordhaven_e2e` database, the `file` notification transport, and
`AUTH_MAX_FAILED_ATTEMPTS=3`:

- **58 assertions, 0 failures.** Every story was exercised: registration and sign-in, two independent
  sessions, single-session revocation, sign-out-everywhere, administrator provisioning, MFA enrollment
  and confirmation, TOTP rejection, recovery-code single use, password reset with prior-session
  revocation, replay rejection, reauthenticated password change, uniform sign-in failures, rate limiting
  (`429`), durable lockout, and the OpenAPI document.
- The single observable difference between the unknown-address and wrong-password `401` bodies is the
  per-request `correlationId`; `statusCode`, `code`, and `message` are identical (M02-SC-003).
- A redaction scan of the live server log (318 lines) found **zero** occurrences of any exercised
  password, the encryption key, or an `Authorization: Bearer` value (M02-SC-008).

### 7. Administrator provisioning (T045)

`node scripts/identity-create-admin.mjs` was exercised in four ways:

| Case                                       | Result                                                          |
| ------------------------------------------ | --------------------------------------------------------------- |
| No `--confirm`                             | exit 2, usage text, no work performed                           |
| `--confirm` without `OPERATOR_ADMIN_EMAIL` | exit 2, `missing_operator_admin_email`                          |
| Valid environment                          | exit 0, prints only `event`, `id`, `email`, `role`, `createdAt` |
| Repeat, and a policy-violating password    | exit 1, `account_exists` / `password_policy`                    |
| Password leakage scan of all outputs       | 0 occurrences                                                   |

The password can only be supplied through the environment, never as an argument.

## Defects found and fixed in this session

| ID  | Defect                                                                                                                                                                                                                                              | Fix                                                                                                                                                                                                                                                                                                           | Verification                                                                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | The process suite silently depended on an inherited `AUTH_ENCRYPTION_KEY` and an undocumented `DATABASE_URL_E2E`. With either missing, the app exited with `configuration_invalid` and the port-conflict case could never reach `port_unavailable`. | Added `test/process/process-environment.ts` pinning the test key and resolving the database URL from `DATABASE_URL_E2E` or `DATABASE_URL` with an explicit error; added `AUTH_ENCRYPTION_KEY` to the `.env`-loader regression test and deleted it from the inherited environment so the file value is proven. | Process suite PASS 4 + 1 skip with neither variable exported; typecheck/lint/format green                                                                                              |
| D2  | The quickstart's `Invoke-Api` error path read the Windows PowerShell 5.1 response stream, which is already consumed, so error envelopes printed empty and obscured every `4xx` body.                                                                | Prefer `$_.ErrorDetails.Message` and fall back to the stream.                                                                                                                                                                                                                                                 | 58/58 live assertions pass, including every asserted error code (`UNAUTHENTICATED`, `SESSION_NOT_FOUND`, `FORBIDDEN`, `INVALID_CREDENTIALS`, `RATE_LIMITED`, `INVALID_RECOVERY_TOKEN`) |
| D3  | The quickstart used fixed example addresses, so a second run against the same database hit duplicate-registration and rate-limit windows.                                                                                                           | Added a per-run `$run` timestamp suffix to the example addresses and documented why.                                                                                                                                                                                                                          | Three consecutive live smoke runs completed with 0 failures                                                                                                                            |
| D4  | `scripts/check-repository-hygiene.mjs` still listed `auth` among the excluded (unapproved) domains although Milestone 02 approves authentication; the approved module directory is `identity`.                                                      | Removed `auth` from `excludedModules`; every commerce term is unchanged.                                                                                                                                                                                                                                      | New unit test proves a `modules/order` directory is still rejected and a `modules/identity` directory is allowed                                                                       |

## Recorded deviations from the task text (nothing was silently dropped)

- **Consolidated database suites.** T025/T039/T046/T051/T053/T056/T057/T058/T059/T063 name
  per-story spec files (`identity-persistence`, `identity-auth`, `identity-admin`, `identity-recovery`,
  `identity-sessions`, `identity-abuse`, `identity-redaction`, `identity-observability`,
  `identity.contract`). The coverage was implemented in two consolidated DB suites instead —
  `test/integration/identity.integration.spec.ts` and `test/e2e/identity.e2e.spec.ts` — because each
  Jest file constructs its own application and database connection; per-story files would multiply app
  startups without adding coverage. Every behavior named in those tasks is asserted:
  at-rest encryption and digest-only storage, unique-constraint and concurrent-registration races,
  idle and absolute expiry, recovery-token consumption and replay, MFA single use, uniform invalid
  credential responses, rate limiting, durable lockout, `503`-before-`401`, role denial (`403`), and
  secret-free security events.
- **Controller layout.** T036 names an `auth.controller.ts` for registration and sign-in; the
  implemented surface is `registration.controller.ts` (registration) and `session.controller.ts`
  (sign-in, principal, sessions). T050 names `auth.controller.ts`; recovery and password change live in
  `password.controller.ts`. The route inventory in `contracts/identity-api.md` (16 operations) is
  unchanged and is asserted by `scripts/openapi-check.mjs`.
- **Unit specs.** T047 (`mfa.service.spec.ts`) and T054 (`session.service.spec.ts`) were not created as
  separate files; their decisions are covered by the guard unit specs, the primitive specs, and the
  integration suite, which exercises enrollment state, root-of-trust decisions, expiry, idle expiry,
  revocation, and refresh throttling against a real database.

## Unresolved items and open decisions

1. **Hosted CI (administrative, NOT VERIFIED)** — the repository still has zero commits. The Product
   Owner deferred the initial commit, GitHub setup, and hosted CI on 2026-10-19. All evidence above is
   local; **no hosted run is claimed.**
2. **HC-DEC-002 (open)** — `409 REGISTRATION_NOT_ALLOWED` on a duplicate address reveals that the
   address is registered. This is an accepted tradeoff of the milestone's registration contract and
   needs a Product Owner decision before it is treated as final. Reset requests do **not** disclose
   existence (uniform `202`).
3. **HC-DEC-014 (open/blocking for production)** — no recovery delivery provider is approved. Only
   `none` (default, production-safe), `file` (development, refused in production), and `memory` (tests)
   transports ship. Production recovery is intentionally non-functional until a provider is approved.
4. **In-process rate-limit counters** — the fixed-window limiter is process-local and resets on restart
   (single-instance deployment assumption). The durable, database-backed lockout is the control that
   survives a restart; both are documented and asserted.
5. **`503` precedes `401`** while an instance is not ready: the availability guard runs before session
   authentication so an unusable instance cannot be probed for credential validity. Documented and
   asserted in the E2E suite.
6. **`test:process` SIGTERM case** is conditionally skipped on Windows (`child.kill('SIGTERM')` is an
   unconditional `TerminateProcess` there). The graceful close sequence is unit-tested on every platform;
   Linux CI would enforce the process case. The interactive Ctrl+C console step was **not** performed
   manually: the smoke-test server was stopped with a process kill.

## File inventory (Milestone 02)

- **Design artifacts**: `specs/002-authentication-authorization/{spec.md, plan.md, research.md,
data-model.md, quickstart.md, tasks.md}`, `checklists/requirements.md`,
  `contracts/identity-api.md`, `contracts/contract-verification.md`, `.specify/feature.json`.
- **Schema**: `prisma/schema.prisma` (6 models, 4 enums) and
  `prisma/migrations/20261019143155_identity_access/migration.sql` (additive, create-only).
- **Platform security**: `platform/http/{app-error.ts, error-response.dto.ts,
openapi-error-responses.ts, safe-exception.filter.ts, safe-exception.filter.spec.ts}`,
  `platform/security/{principal.ts, access.decorators.ts, authorization-audit.port.ts,
rate-limiter.ts, rate-limit.decorator.ts, rate-limit.guard.ts, session-auth.guard.ts, roles.guard.ts,
rate-limiter.spec.ts, access-guards.spec.ts}`, `platform/availability/availability.guard.ts`,
  `platform/observability/correlation.decorator.ts`, extended `platform/config/environment.ts`,
  `platform/openapi/openapi.ts`, `apps/api/src/app.module.ts`.
- **Identity module**: `modules/identity/` — `identity.module.ts`, `index.ts`,
  `api/{registration.controller.ts, session.controller.ts, mfa.controller.ts, password.controller.ts,
accounts.controller.ts, identity.policies.ts, identity.request.ts, identity.response.ts}`,
  `application/{identity.service.ts, session.service.ts, mfa.service.ts, password-reset.service.ts,
security-event.service.ts, administrator-provisioning.service.ts, authorization-audit.service.ts,
identity.support.ts, notification/*}`,
  `crypto/{password-hasher.ts, token.ts, secret-cipher.ts, totp.ts}` with their specs, and
  `persistence/{user.repository.ts, session.repository.ts, identity-token.repository.ts,
mfa.repository.ts, security-event.repository.ts, prisma-errors.ts}`.
- **Tests and helpers**: `test/integration/identity.integration.spec.ts`,
  `test/e2e/identity.e2e.spec.ts`, `test/helpers/{test-configuration.ts, identity-database.ts}`,
  `test/process/process-environment.ts`, extended `test/process/{startup,shutdown}.process.spec.ts`,
  extended `test/unit/repository-hygiene.spec.ts`.
- **Operations**: `scripts/identity-create-admin.mjs`, `scripts/openapi-check.mjs`,
  `scripts/check-repository-hygiene.mjs`, `openapi/openapi.json`, `.env.example`, `README.md`,
  `docs/development/{setup.md, secrets.md, migrations.md}`, `docs/progress/milestone-02.md`.

## Acceptance conclusion

All local Milestone 02 acceptance criteria are satisfied: **68 of 68 tasks complete**, a single complete
quality-gate pass with all eight categories green, a demonstration that every gate category rejects its
own seeded failure (M02-SC-010), database-backed integration, E2E, and process suites green, migrations
current on all three databases, no known production vulnerability, and a 58-assertion live walkthrough of
the published quickstart with secret-free output. No genuine code, security, database, or architecture
defect remains open; the four defects found during verification (D1-D4) were fixed and re-verified.

Two subjects remain outside local control and are recorded, not waived: hosted CI evidence (requires an
approved initial commit) and the open decisions HC-DEC-002 and HC-DEC-014.

**Exact next action**: obtain Product Owner acceptance of this record and a decision on the hosted-CI
deferral. Do not commit or push before approval, and do not start Milestone 03.
