# Milestone 03 - Customer Profiles Verification Record

**Checkpoint date**: 2026-10-19
**Task state**: 34 of 34 tasks complete (T001-T034)
**Overall state**: All local Milestone 03 acceptance criteria satisfied by a single complete quality-gate
pass plus a seeded-failure rejection pass (M03-SC-010); hosted CI evidence remains NOT VERIFIED pending
an approved initial commit

This record distinguishes commands executed in the Milestone 03 session from the retained Milestone 01
and Milestone 02 records. No commit, push, deployment, database reset, `db push`, volume deletion,
commerce module, constitution change, or `HC-DEC-*` resolution was performed. Windows PowerShell 5.1 was
used throughout; no optional software was added to the host.

## Scope and constraints honored

- **Customer Profiles only.** No catalog, checkout, cart, order, payment, wishlist, or other commerce
  module, entity, or route exists; the hygiene gate still rejects every excluded domain.
- **Zero new runtime or development dependencies.** No `package.json` entry, lockfile entry, or
  configuration key was added. The customer rate-limit policies are module constants
  (`customers.policies.ts`), not configuration. OpenAPI response validation reuses
  `openapi-response-validator` and `@apidevtools/swagger-parser`, which were already present.
- **No new error code beyond the one approved addition.** `ADDRESS_NOT_FOUND` (404) is the only addition
  to the closed `AppErrorCode` union; every other outcome reuses an existing code.
- **The open decisions were not resolved.** Account deletion, data export, and retention are absent
  (HC-DEC-003 Open), email verification is absent (HC-DEC-002 Open), no supported-country list is
  enforced (HC-DEC-005 Open), and no real notification provider is used (HC-DEC-014 Open).
- **No customer identifier is accepted from any caller.** Every route scopes to the principal of the
  presented session, so a request cannot name another customer's profile or address.
- The approved NestJS modular-monolith architecture and the Milestone 01 and Milestone 02 foundations
  are preserved. The Customers module owns its own persistence and holds no foreign key into the
  Identity `users` table; `user_id` is used only as a stable foreign identifier.
- No secret, token, password, or key is logged, returned, or persisted in recoverable form; customer
  personal attributes are added to the log redaction paths as defence in depth.

## Verification performed

### 1. Complete composite gate (M03-SC-010, positive half)

`pnpm verify` executed after all seeds were removed. All eight categories passed and the run stopped
only at the end:

| Category           | Result                                                                     |
| ------------------ | -------------------------------------------------------------------------- |
| Format             | PASS — "All matched files use Prettier code style!"                        |
| ESLint             | PASS — `--max-warnings 0`, zero warnings/errors                            |
| Module boundaries  | PASS — production sources and both fixtures                                |
| TypeScript         | PASS — strict API and root/test configurations                             |
| Unit tests         | PASS — 20 suites, 155/155 tests (Milestone 02: 17 suites, 115 tests)       |
| Build              | PASS — Nest build                                                          |
| Repository hygiene | PASS — no unsafe filename, secret canary, or excluded domain               |
| OpenAPI            | PASS — structural validation, inventory, excluded-domain scan, drift check |

`All composite verification categories passed.`

### 2. Database-backed and process suites

| Suite       | Command                 | Result                                                                |
| ----------- | ----------------------- | --------------------------------------------------------------------- |
| Integration | `pnpm test:integration` | PASS — 3 suites, 30/30 tests against `nordhaven_integration`          |
| E2E         | `pnpm test:e2e`         | PASS — 4 suites, 25/25 tests against `nordhaven_e2e`                  |
| Process     | `pnpm test:process`     | PASS — 4 passed + 1 skipped (POSIX SIGTERM case, `win32`-conditional) |

Milestone 03 added 16 integration tests (16 customer) and 9 E2E tests, and the Milestone 01 and
Milestone 02 cases in those suites pass unchanged.

### 3. Migration status

| Database                | Command                      | Result                                                      |
| ----------------------- | ---------------------------- | ----------------------------------------------------------- |
| `nordhaven`             | `pnpm prisma:migrate:status` | PASS — 3 migrations found, "Database schema is up to date!" |
| `nordhaven_integration` | `pnpm prisma:migrate:status` | PASS — 3 migrations found, "Database schema is up to date!" |
| `nordhaven_e2e`         | `pnpm prisma:migrate:status` | PASS — 3 migrations found, "Database schema is up to date!" |

The Milestone 03 migration (`20261019175814_customer_profiles`) is additive and create-only, and
introduces no enum. It is documented in `docs/development/migrations.md`.

### 4. Production dependency audit

`pnpm audit --prod --audit-level critical` — PASS, "No known vulnerabilities found".

### 5. Seeded-failure rejection (M03-SC-010, negative half)

One defect per gate category was introduced, the owning category was run, and the seed was removed.
Every category rejected its seed with exit 1, and no seed or seed artifact survived (the committed
`openapi/openapi.json` was restored byte-identically, verified by file hash):

| Category           | Seeded defect                                                                     | Rejection evidence        |
| ------------------ | --------------------------------------------------------------------------------- | ------------------------- |
| Format             | Prettier-unformatted `tmp-seed.ts` under `modules/customers/`                     | `format:check` exit 1     |
| ESLint             | Prettier-clean file with an unused local                                          | `lint` exit 1             |
| Boundaries         | `modules/customers/tmp-seed.ts` importing `modules/identity/persistence/...` deep | `boundaries:check` exit 1 |
| TypeScript         | `export const seed: number = 'not-a-number'`                                      | `typecheck` exit 1        |
| Unit               | A spec asserting `expect(1).toBe(2)`                                              | `test:unit` exit 1        |
| Build              | `export const seed: number = ;` (unparseable source)                              | `build` exit 1            |
| Repository hygiene | A root `.env` file                                                                | `repo:hygiene` exit 1     |
| OpenAPI            | A renamed route key in the committed document (drift)                             | `openapi:check` exit 1    |

No repeated identical full-suite passes were required, per M03-SC-010. A follow-up full `pnpm verify`
after cleanup passed with all eight categories green, proving the seeds left no residue.

### 6. Live quickstart smoke test (T030)

The published `specs/003-customer-profiles/quickstart.md` was executed end to end using the document's
own `Invoke-Api` helper, against a built API on `http://localhost:3100` with the `nordhaven` database,
`NODE_ENV=development`, and `LOG_LEVEL=info`:

- **61 assertions, 0 failures.** Every story was exercised: lazy profile creation, whitespace trimming,
  clearing an attribute, strict rejection of an unknown profile field, anonymous denial, two saved
  addresses with the automatic first default, country-code normalization, partial update, refusal of a
  client-chosen default, the two-letter country-code rule, default selection and profile reflection,
  deletion clearing the selection without promotion, `404 ADDRESS_NOT_FOUND`, four cross-customer
  attempts answered identically to an unknown identifier, the intruder's empty list and null default,
  the owner's data unchanged, administrator provisioning, MFA enrollment and confirmation, a rejected
  second factor, administrator denial on a customer route (`403 FORBIDDEN`), and `no-store` plus
  `X-Correlation-ID` metadata.
- A redaction scan of the live server log (**121 lines**) found **zero** occurrences of the injected
  personal-data canary (`QS7F`, present in the recipient name, street line, city, and postal code),
  **zero** occurrences of any issued session token, and **zero** occurrences of the
  `AUTH_ENCRYPTION_KEY` (M03-SC-008).

### 7. Contract verification against the committed document

`specs/003-customer-profiles/contracts/contract-verification.md` requires that observed customer
responses be validated against the published artifact. This is implemented in
`test/e2e/customer.e2e.spec.ts`: every asserted customer response body (200, 201, 204 is header-only,
400, 401, 403, 404) is validated with `openapi-response-validator` against `openapi/openapi.json`,
with `additionalProperties: false`, so an undocumented extra field fails the suite. The E2E file reads
the committed document from disk, so the artifact that is published is the artifact that is asserted.

## Defects found and fixed in this session

| ID  | Defect                                                                                                                                                                                                                                                                      | Fix                                                                                                                                                                                                                             | Verification                                                                                            |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| D1  | The customer personal-attribute guard used a control-character regular expression, which ESLint rejects with `no-control-regex`.                                                                                                                                            | Replaced the literal with a numeric code-point scan (`isFreeOfControlCharacters`) in `application/customer.support.ts`.                                                                                                         | `lint` clean; the support spec asserts rejection of control characters through the boundary schema.     |
| D2  | `CreateCustomerAddressRequest` declared optional address attributes as `string \| undefined`, but the schema always produces `string \| null`, so the service call failed `TS2345`.                                                                                         | Declared the fields definitively as `string \| null`.                                                                                                                                                                           | `typecheck` exit 0.                                                                                     |
| D3  | **First-access profile creation was not race-safe.** `prisma.upsert` still surfaced `P2002` under concurrent first access (four parallel service calls in the cross-customer integration test), so a legitimate first read could fail with a unique violation.              | `findOrCreateByUserId` now reads, creates, catches a unique-constraint violation, and re-reads; the check lives in a module-local `persistence/prisma-errors.ts` because module boundaries forbid importing Identity internals. | Integration test strengthened to 5 parallel first accesses; green, and the full gate passes.            |
| D4  | The integration address-ordering assertion depended on database timestamp resolution; two rows created in the same millisecond could order non-deterministically.                                                                                                           | Pinned the second row's `createdAt` (+1000 ms) and added a repeat-call stability assertion on the listed order.                                                                                                                 | Integration suite green and order-stable across repeat calls.                                           |
| D5  | Unit specs read the DTO class instead of the schema attached to it, and one service spec expected the service to trim whitespace that the boundary pipe already trims.                                                                                                      | Added a `SchemaHolder`/`ZodType` helper reading `ZOD_VALIDATION_SCHEMA`, and corrected the service spec to assert the service does not re-normalize.                                                                            | Unit suites green (155 tests).                                                                          |
| D6  | The E2E administrator flow reused a TOTP time step that enrollment had already consumed, so the second factor was (correctly) refused and the administrator session was never issued.                                                                                       | The flow now completes the second factor with a recovery code, mirroring the accepted Milestone 02 contract suite.                                                                                                              | E2E administrator-denial test green, including the `ADMIN_ACCESS_DENIED` audit assertion.               |
| D7  | The journey E2E suite could exhaust the `customers.write` budget, because the rate-limit guard runs before authentication, so even rejected requests consume the counter.                                                                                                   | Raised the declared `customers.write` limit to 60 writes / 900 s per client and recorded it in `contracts/customer-api.md`; the rate-limit proof uses a dedicated application instance.                                         | Journey suite green; the dedicated proof still reaches `429 RATE_LIMITED` with a numeric `Retry-After`. |
| D8  | The live quickstart harness (verification tooling, not product code) asserted that the owner's surviving address was still the default after section 7 had deleted the _selected_ default. Deleting the default clears the selection by design, so the assertion was wrong. | Corrected the harness to assert the address data is unchanged and that no default was promoted, and added an explicit profile check that the selection stayed cleared.                                                          | Live quickstart PASS 61/61.                                                                             |
| D9  | `test/integration/customer.integration.spec.ts` resolved the address repository into a variable it never used.                                                                                                                                                              | Removed the unused injection; persistence is exercised through the services and the Prisma client.                                                                                                                              | `lint` (zero warnings) and the integration suite green.                                                 |

No genuine product, security, database, or architecture defect remains open; D3 was the only
correctness defect and it is fixed and covered by a concurrency assertion.

## Recorded deviations from the task text (nothing was silently dropped)

- **Consolidated database suites.** T010 and T026/T027 name one integration and one E2E spec, which is
  what exists (`test/integration/customer.integration.spec.ts`, `test/e2e/customer.e2e.spec.ts`); the
  rate-limit proof and the personal-data canary are additional `describe` blocks in the E2E file, each
  with its own application instance, rather than separate files. Each Jest file constructs its own
  application and database connection, so additional files would multiply app startups without adding
  coverage.
- **Controller layout.** The HTTP surface is `api/profile.controller.ts` and `api/addresses.controller.ts`
  rather than a single controller; the route inventory in `contracts/customer-api.md` (8 operations) is
  unchanged and is asserted by `scripts/openapi-check.mjs`.
- **Default selection verb.** Selection uses an idempotent `PUT /api/v1/customers/me/addresses/{addressId}/default`
  returning the address, and the default is read from `GET /customers/me/profile` (`defaultAddressId`).
  The nullable unique `default_address_id` on `customer_profiles` is the single source of truth, which is
  what makes the concurrent-selection invariant provable.
- **`customers.write` budget.** The declared write limit is 60 writes / 900 s per client rather than the
  initially drafted 30, for the reason recorded as defect D7. `customers.read` is unchanged at
  300 reads / 300 s.
- **OpenAPI response validation implemented, not weakened.** The open item recorded in
  `contracts/contract-verification.md` was resolved by implementing live response validation in the E2E
  suite instead of amending the document, so the documentation and the enforcement now agree.
- **Not implemented, because Open.** Account deletion, data export, and retention (HC-DEC-003), email
  verification (HC-DEC-002), a supported-country allow-list (HC-DEC-005), and real notification
  delivery (HC-DEC-014). No task required them and none was resolved.

## Unresolved items and open decisions

1. **Hosted CI (administrative, NOT VERIFIED)** — the repository still has zero commits. The Product
   Owner deferred the initial commit, GitHub setup, and hosted CI on 2026-10-19. All evidence above is
   local; **no hosted run is claimed.**
2. **HC-DEC-003 (open)** — account deletion, data export, and retention are unimplemented; a request to
   delete an account has no route. This is deliberately out of scope for Milestone 03.
3. **HC-DEC-002 (open, carried from Milestone 02)** — `409 REGISTRATION_NOT_ALLOWED` on a duplicate
   address reveals that the address is registered. Still an accepted tradeoff pending a Product Owner
   decision.
4. **HC-DEC-005 (open)** — `countryCode` is validated for ISO 3166-1 alpha-2 shape and normalized to
   upper case, but no supported-country list is enforced, so a well-formed unsupported country is stored.
5. **HC-DEC-014 (open/blocking for production)** — no notification provider is approved; recovery delivery
   remains non-production only (carried from Milestone 02).
6. **In-process rate-limit counters** — the fixed-window limiter is process-local and resets on restart
   (single-instance deployment assumption). Both customer policies use the `client` dimension because the
   limiter runs before session authentication, so the principal is not yet resolved; this is the same
   accepted behavior recorded for Milestone 02.
7. **`503` precedes `401`** while an instance is not ready, and `ADDRESS_NOT_FOUND` is used uniformly for
   foreign, unknown, and deleted addresses so no existence is disclosed. Both are documented and asserted.

## File inventory (Milestone 03)

- **Design artifacts**: `specs/003-customer-profiles/{spec.md, plan.md, research.md, data-model.md,
quickstart.md, tasks.md}`, `checklists/requirements.md`, `contracts/customer-api.md`,
  `contracts/contract-verification.md`, `.specify/feature.json`.
- **Schema**: `prisma/schema.prisma` (`CustomerProfile`, `CustomerAddress`) and
  `prisma/migrations/20261019175814_customer_profiles/migration.sql` (additive, create-only).
- **Customers module**: `apps/api/src/modules/customers/` — `customers.module.ts`, `index.ts`,
  `api/{profile.controller.ts, addresses.controller.ts, customers.policies.ts, customers.request.ts,
customers.response.ts, customers.request.spec.ts}`,
  `application/{customer-profile.service.ts, customer-address.service.ts, customer.support.ts,
customer.support.spec.ts, customer-address.service.spec.ts}`,
  `persistence/{customer-profile.repository.ts, customer-address.repository.ts, prisma-errors.ts}`.
- **Platform changes**: `platform/http/app-error.ts` (`ADDRESS_NOT_FOUND`),
  `platform/observability/logging.ts` and `redaction.spec.ts` (personal-attribute paths),
  `platform/openapi/openapi.ts` (`put`/`patch` method union, 8 operations, `Customers` tag),
  `app.module.ts` (module registration).
- **Tests and helpers**: `test/integration/customer.integration.spec.ts`,
  `test/e2e/customer.e2e.spec.ts`, `test/helpers/customer-database.ts`, extended
  `test/unit/repository-hygiene.spec.ts`.
- **Operations and docs**: `openapi/openapi.json` (24 operations, version `0.3.0`),
  `scripts/openapi-check.mjs`, `scripts/check-repository-hygiene.mjs`, `README.md`,
  `docs/development/migrations.md`, `docs/progress/milestone-03.md`.

## Acceptance conclusion

All local Milestone 03 acceptance criteria are satisfied: **34 of 34 tasks complete**, a single complete
quality-gate pass with all eight categories green, a demonstration that every gate category rejects its
own seeded failure (M03-SC-010) with no residue, database-backed integration, E2E, and process suites
green, migrations current on all three databases, no known production vulnerability, live validation of
every customer response against the committed OpenAPI document, and a 61-assertion live walkthrough of
the published quickstart with a clean personal-data/token/key log scan. The nine defects found during
verification (D1-D9) were fixed and re-verified; the only correctness defect (D3) carries a dedicated
concurrency assertion.

Two subjects remain outside local control and are recorded, not waived: hosted CI evidence (requires an
approved initial commit) and the open decisions HC-DEC-002, HC-DEC-003, HC-DEC-005, and HC-DEC-014.

**Exact next action**: obtain Product Owner acceptance of this record and a decision on the hosted-CI
deferral. Do not commit or push before approval, and do not start Milestone 04.
