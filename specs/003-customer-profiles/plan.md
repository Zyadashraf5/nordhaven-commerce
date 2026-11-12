# Implementation Plan: Milestone 03 - Customer Profiles

**Branch**: Not created; the repository has no commits yet | **Date**: 2026-10-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-customer-profiles/spec.md`
**Research**: [research.md](./research.md) | **Data model**: [data-model.md](./data-model.md)

## Summary

Add one Customer Profiles capability to the existing NestJS modular monolith. It lets an
authenticated customer read and update their own storefront profile (display name and contact phone)
and create, list, read, update, delete, and select a default among their own saved shipping addresses.

The capability reuses the accepted Milestone 02 authorization model unchanged: every route is
protected by default, restricted to the `CUSTOMER` role, and scoped to the authenticated principal so
that **no customer identifier is ever accepted from a caller**. It adds **no new dependency**, no new
configuration key, no new infrastructure, and no commerce behavior. Persistence changes ship as one
reviewed additive Prisma migration. HC-DEC-003, HC-DEC-005, HC-DEC-002, HC-DEC-014, and HC-DEC-016
remain open and are recorded as dependencies rather than resolved.

## Technical Context

**Language/Version**: Node.js `22.23.3`, TypeScript `5.9.x`, strict mode with
`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, CommonJS output

**Primary Dependencies**: NestJS `11.2.x`; Prisma `7.10.x` with the `prisma-client` generator and
`@prisma/adapter-pg`; Zod 4 for request-boundary validation; `@nestjs/swagger`. No new dependency is
introduced; the capability is composed entirely from the accepted platform primitives (research.md
Decision 1)

**Storage**: PostgreSQL `18.6`. New Customers-owned tables: `customer_profiles`, `customer_addresses`

**Testing**: Jest `29.x` with `ts-jest`, Nest testing utilities, Supertest, and the existing isolated
`nordhaven_integration` and `nordhaven_e2e` databases; existing unit, integration, E2E, and process
projects

**Target Platform**: Linux container/CI runtime; local development and acceptance on the Windows 10
Pro 22H2 build 19045.6466 host accepted by the Product Owner on 2026-10-19, using Windows PowerShell
5.1-compatible commands

**Project Type**: One backend application inside the existing `pnpm@12.13.0` workspace; no frontend,
no shared package

**Performance Goals**: A profile or address operation completes well inside the existing two-second
local bound; listing returns the customer's own addresses in one indexed query; the milestone adds no
background work and no measurable startup cost beyond one module registration

**Constraints**: No new runtime or development dependency, no new environment key, no Redis or queue,
no automatic schema change at startup, no personal attribute in any response body it does not belong
to, no personal attribute in any log or durable record, no unversioned business route, no commerce
module. HC-DEC-001 through HC-DEC-017 remain unresolved

**Scale/Scope**: One API application, one new business-capability module, eight new versioned
operations (twenty-four total, including the sixteen accepted from Milestone 02), one additive
migration, one extended OpenAPI contract, and extended unit/integration/E2E coverage

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### Pre-Research Gate

| Constitutional requirement | Planned evidence | Gate |
| --- | --- | --- |
| Modular monolith and separation of concerns (I) | One application; the Customers module owns its two tables and exposes only a deliberate public contract; the Identity and Access tables are never queried; shared authorization vocabulary stays in `platform/security`; the boundary checker and hygiene check continue to pass | PASS |
| Secure identity, expiry, revocation, enumeration and brute-force resistance, mandatory admin MFA, no plaintext secrets (II) | Unchanged: the capability adds no credential, secret, or session behavior and reuses the accepted session and role guards. Customer reads and writes require an accepted session, and administrators are refused so the MFA-protected role cannot reach storefront data | PASS |
| Server-side trust enforcement (III) | Zod strict boundary schemas; secure-by-default route protection; `@Roles('CUSTOMER')`; the resource scope is derived from the authenticated principal only; uniform not-found responses; negative-path authorization tests | PASS |
| Atomic inventory reservations (IV) | No inventory behavior is introduced | PASS |
| Explicit bundle semantics (V) | No bundle behavior is introduced | PASS |
| Stock-gated pre-order payment (VI) | No order or payment behavior is introduced | PASS |
| Idempotent payments and verified webhooks (VII) | No payment or webhook behavior is introduced | PASS |
| Exact money and safe database evolution (VIII) | No money model; one additive, reviewed, replayable migration; no startup schema change; no `db push` | PASS |
| Automated testing at every boundary (IX) | Unit (validation/normalization, default rules, authorization decisions), PostgreSQL integration (uniqueness, concurrency, ownership isolation, cascade removal, single-default invariant), E2E (full customer journey, anonymous and administrator denial, cross-customer denial, rate limiting, personal-data redaction) | PASS |
| Observable operations and protected secrets (X) | Correlated structured logs and authorization-decision audit through the accepted platform port; extended redaction paths for personal attributes; canary tests prove zero personal-data leakage | PASS |
| Recorded decisions and open requirements (XI) | Research records every technical decision; HC-DEC-002, HC-DEC-003, HC-DEC-005, HC-DEC-014, and HC-DEC-016 are recorded as open dependencies with review triggers; HC-ASM-M03-001 through HC-ASM-M03-006 are explicit | PASS |
| Simplicity before distribution (XII) | One application and PostgreSQL only; no distributed component; zero new dependencies; one new module | PASS |

No constitutional violation requires an exception. Phase 0 may proceed.

### Post-Design Re-check

The Phase 1 design keeps a single application and database, adds one capability module with a
deliberate public contract, persists all customer state in module-owned tables, and introduces no
distributed component, external service, dependency, or configuration key. Customer routes are
protected by default and scoped to the principal, so cross-customer access is structurally
unreachable; denials are uniform and are audited through the accepted platform port. The OpenAPI
contract gains only authorized customer operations, and the excluded-domain guard keeps rejecting
every commerce term after the `customer` term is deliberately re-approved. All gates remain **PASS**;
no Complexity Tracking entry is required.

## Project Structure

### Documentation (this feature)

```text
specs/003-customer-profiles/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- customer-api.md
|   `-- contract-verification.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
apps/api/src/
|-- app.module.ts                              # Registers the Customers module
|-- modules/
|   |-- health/
|   |-- identity/                              # Unchanged accepted capability
|   `-- customers/
|       |-- index.ts                           # Public contract
|       |-- customers.module.ts
|       |-- api/
|       |   |-- profile.controller.ts          # GET/PATCH the principal's own profile
|       |   |-- addresses.controller.ts        # Address lifecycle and default selection
|       |   |-- customers.policies.ts          # Declared rate-limit policies
|       |   |-- customers.request.ts           # Zod-attached request DTOs
|       |   `-- customers.response.ts          # Response DTOs and projections
|       |-- application/
|       |   |-- customer-profile.service.ts    # Profile read/update and default rules
|       |   |-- customer-address.service.ts    # Address lifecycle, ownership, defaults
|       |   `-- customer.support.ts            # Normalization and projection helpers
|       `-- persistence/
|           |-- customer-profile.repository.ts # Owned profile + default reference
|           `-- customer-address.repository.ts # Owned addresses, scoped queries
|-- platform/
|   |-- http/app-error.ts                      # Adds the reviewed ADDRESS_NOT_FOUND code
|   `-- observability/logging.ts               # Extended redaction paths (personal attributes)

prisma/
|-- schema.prisma                              # Adds the two Customers-owned models
`-- migrations/<timestamp>_customer_profiles/migration.sql

openapi/openapi.json                           # Regenerated committed contract
scripts/
|-- check-repository-hygiene.mjs               # Re-approves the `customer` module capability
`-- openapi-check.mjs                          # Updated inventory and excluded-domain rules
test/
|-- unit/                                      # Customer validation, default, and policy specs
|-- integration/                               # Customer persistence and isolation specs
`-- e2e/                                       # Customer journeys, denial, and contract specs
```

**Structure Decision**: The new capability lives entirely under `modules/customers/` with the same
`index.ts` public-contract convention as the Health and Identity modules. The capability directory
name is plural (`customers`) to match the architecture overview's capability name and the REST
resource name. Cross-module integration is deliberately narrow: the module consumes only the platform
authorization contract (`@Roles`, `@CurrentPrincipal`, `AuthenticatedPrincipal`) and never imports
Identity internals, because the accepted session guard already guarantees a resolved, role-carrying
principal. Prisma schema and migration history stay at the workspace root because the modular monolith
owns one database; ownership is recorded per table in `data-model.md`.

## Architecture Decisions

### Module and Boundary

- One NestJS module, `CustomersModule`, registered in `AppModule.register` after `IdentityModule`.
- `modules/customers/index.ts` exports only `CustomersModule`; no internal type is re-exported until a
  consumer exists.
- The module imports nothing from `modules/identity`. The integration with Identity and Access is the
  platform authorization contract: routes are protected by default, restricted with `@Roles('CUSTOMER')`,
  and scoped with `@CurrentPrincipal()`.
- The `@Modules` boundary checker and the repository hygiene check must both continue to pass; the
  `customer` entry is removed from the hygiene `excludedModules` set because the capability is now
  approved, exactly as `auth` was removed for Milestone 02.

### Data Ownership and Migration

- Two additive tables (`customer_profiles`, `customer_addresses`) are created by one create-only
  migration named `customer_profiles`, whose SQL is reviewed before it is applied locally and replayed
  with `migrate deploy` on the isolated test databases.
- The customers tables store the authenticated customer's identity identifier as a **foreign
  identifier only**. No foreign key is created to `users`, because that table is owned by Identity and
  Access, the milestone defines no account-deletion path, and a cross-module foreign key would couple
  the two modules' schema evolution. The consequence is recorded as a risk with the HC-DEC-003 review
  trigger.
- The default address is a single nullable reference column on the profile
  (`customer_profiles.default_address_id`), so "at most one default" is structural rather than
  application-maintained. Deleting an address clears the reference by `ON DELETE SET NULL`; deleting a
  profile removes its addresses by `ON DELETE CASCADE`.
- No existing table, column, or migration is modified; the change is additive and safe for an existing
  database. Application startup never migrates, and `db push` remains prohibited.
- `data-model.md` records the owning module, the invariants, and the states that must stay consistent.

### Configuration

- The milestone adds **no** configuration key. The capability is enabled by the accepted configuration
  exactly as it stands, which keeps the environment surface and the process-startup contract unchanged.

### Persistence and Concurrency

- A profile is created on first access with an atomic upsert keyed by the identity identifier, so two
  concurrent first requests cannot create duplicates or fail.
- Address ownership is enforced by query scope: every read and write filters by the principal's profile
  identifier in the same statement, so a foreign or unknown address identifier yields the same result.
- The default is set in one transaction that first verifies the target address belongs to the
  principal's profile and then writes the single reference column, so concurrent designations cannot
  produce two defaults.
- Listing uses a deterministic order (`created_at`, then `id`) so responses are reproducible.

### Behavior

1. `GET profile` upserts the principal's profile row if absent and returns the projection; a customer
   therefore never needs a creation step.
2. `PATCH profile` applies only the supplied, validated attributes; an explicit `null` or an
   empty/whitespace-only value clears an optional attribute; an omitted attribute is left unchanged.
3. `POST address` validates the address, and — when the customer has no default yet — stores the new
   address as the default (HC-ASM-M03-001).
4. `GET/PATCH/DELETE address` and `PUT default` resolve the address through the principal's profile and
   answer the standard safe not-found error for a foreign, unknown, or malformed identifier.
5. `DELETE address` removes the address; when it was the default, the profile's reference is cleared by
   the database and the response confirms the deletion.
6. Every successful mutation is logged as a structured, correlated event that names only non-sensitive
   identifiers (never a personal attribute).

### Authorization

- All customer routes inherit the accepted global guard order (availability, rate limit, session
  authentication, roles) and add `@Roles('CUSTOMER')`.
- Anonymous callers receive the accepted `401 UNAUTHENTICATED` envelope; authenticated administrators
  receive `403 FORBIDDEN` and the denial is recorded through the accepted authorization-audit port.
- The route surface contains no customer identifier anywhere, so no request can address another
  customer's data.

### Abuse Resistance

- `@RateLimit` declarations attach one read policy and one write policy to the customer routes using
  the accepted project-owned fixed-window limiter and the `client` key dimension, because the limiter
  runs before the principal is resolved.
- Exceeding a limit returns the accepted `429 RATE_LIMITED` response with `Retry-After`.
- The process-local scope limitation recorded for Milestone 02 is unchanged.

### Observability

- `REDACT_PATHS` gains the personal-attribute field names used by this capability, so a future
  accidental log of a profile or address shape loses those fields.
- The capability records no personal attribute in any structured log, error body, or durable record.
  Only non-sensitive identifiers (the customer's profile identifier, an address identifier, and the
  correlation identifier) may be recorded.
- Authorization decisions continue to be durably audited through the accepted
  `AUTHORIZATION_AUDIT_PORT`, so an administrator's denied attempt on customer data is evidence-backed
  without the capability owning an audit store of its own.

### OpenAPI and Contract Verification

- `createOpenApiDocument` keeps generating the document from decorators and asserting the exact
  operation inventory; the reviewed inventory grows by the eight customer operations.
- The committed `openapi/openapi.json` is regenerated and reviewed.
- `scripts/openapi-check.mjs` keeps structural validation, drift detection, and the excluded-domain
  scan. The `customer` term is deliberately removed from the excluded list because the capability is
  now approved; every other commerce term remains rejected. The authorization-metadata helper already
  treats an undeclared operation as protected, so the new routes are protected-by-default in the gate.
- The gate continues to be database-free; the authenticated customer flows are covered by the E2E
  contract spec against the real database.

### Testing Strategy

- **Unit**: profile and address boundary validation and normalization (including clearing, length
  bounds, control-character rejection, unknown-field rejection, and country-code shape), the
  default-selection rules, the address ownership decision, the response projections, and the new
  redaction paths.
- **Integration** (PostgreSQL): profile uniqueness and concurrent first access, address create/read/
  update/delete, ownership isolation (a second customer cannot see, change, delete, or claim the first
  customer's address), the single-default invariant under concurrent designation, automatic first
  default, clearing the default on deletion, and cascade removal of addresses with their profile.
- **E2E** (HTTP): the full customer journey over HTTP with a real session, profile read/update, address
  lifecycle including default selection, `401` anonymous, `403` administrator, a second customer's
  denied access, `404` uniform not-found, `400` validation, `429` rate limiting, `Cache-Control:
  no-store`, response-uniformity, and a personal-data log canary.
- **Regression**: the accepted Milestone 01 and Milestone 02 suites must continue to pass unchanged.
- The milestone requires the complete gate set to pass once on the accepted baseline plus the
  seeded-failure rejection evidence (M03-SC-010).

### Documentation and Operations

- `.env.example` needs no change; the milestone adds no configuration key.
- `quickstart.md` documents the accepted Windows 10 PowerShell 5.1-compatible path for the customer
  journey, including how to obtain a session from the accepted Identity flows.
- `README.md` gains a short capability summary and the customer route list.
- `docs/development/migrations.md` records the new additive migration.
- `docs/progress/milestone-03.md` records task counts, evidence, defects, and unresolved items.
- `.github/workflows/ci.yml` continues to run the same gates, which now include the customer unit,
  integration, E2E, contract, boundaries, hygiene, and audit checks; no workflow redesign is needed.

## Implementation Phases

### Phase 0 - Research and Decision Lock

- Record decisions, alternatives, and evidence in [research.md](./research.md).
- Confirm that no new dependency, infrastructure, or configuration key is required.

### Phase 1 - Persistence Foundation

- Add the two Prisma models, create the reviewed additive migration, generate the client, and apply and
  verify it on the isolated test databases.
- Add the two repositories and prove uniqueness, concurrency, ownership isolation, the single-default
  invariant, and cascade removal with integration tests.

### Phase 2 - Behavior and Boundary

- Implement validation and normalization, the profile service, and the address service with their unit
  tests.
- Add the request DTOs, response DTOs, and projections.
- Add the extended `AppError` code and the redaction paths.

### Phase 3 - HTTP Surface and Contract

- Add the controllers, the rate-limit policies, the module, and the `AppModule` registration.
- Regenerate and review the OpenAPI contract and update the contract gate for the new inventory and
  excluded-domain rules.
- Add the E2E journeys, denial paths, redaction checks, and the contract spec.

### Phase 4 - Documentation and Acceptance

- Update the README, the development docs, the quickstart, and the Milestone 03 progress record.
- Run the complete non-database gate set plus the database suites on the accepted host and record the
  results.

## Acceptance Verification Commands

```powershell
pnpm format:check
pnpm lint
pnpm boundaries:check
pnpm typecheck
pnpm test:unit
pnpm build
pnpm repo:hygiene
pnpm openapi:check

pnpm db:up
pnpm db:wait
pnpm prisma:generate
pnpm prisma:migrate:deploy
pnpm prisma:migrate:status
pnpm test:integration
pnpm test:e2e
pnpm audit:prod
```

Database-backed suites require `NODE_ENV=test` and a `DATABASE_URL` whose database name ends in
`_integration` or `_e2e`; the existing guard enforces this, and the Milestone 02 encryption key remains
required for the identity suites that share the run.

## Risks and Unresolved Technical Items

| ID | Risk or item | Treatment | Task-generation impact |
| --- | --- | --- | --- |
| M03-TECH-001 | A customer identity has no foreign key to `users`, so an identity removed outside this milestone would leave an orphan profile. | Record the consequence and the HC-DEC-003 review trigger; implement no deletion path; add a repository-level test that removal of a profile removes its addresses. | Not blocking; documented in the data model and the spec's open dependencies. |
| M03-TECH-002 | Country-specific address rules are unknown while HC-DEC-005 is Open, so a stored address may be unusable for some destinations. | Validate generically (shape and length only), never restrict the country set, and record the dependency and review trigger. | Not blocking; the acceptance tasks assert generic validation only. |
| M03-TECH-003 | The auto-default rule (HC-ASM-M03-001) is a convenience policy inside the approved capability. | Implement it deterministically, document it as a numbered assumption, and require confirmation before a checkout journey depends on a default always existing. | Not blocking; covered by unit and integration tests. |
| M03-TECH-004 | In-process rate-limit state resets on restart and does not coordinate across instances. | Unchanged from Milestone 02; documented, and a recorded decision is required before any multi-instance deployment. | Not blocking; the rate-limit test uses a dedicated application instance. |
| M03-TECH-005 | Personal attributes could reach logs through an unexpected error. | Extend `REDACT_PATHS`, log only non-sensitive identifiers, and prove zero leakage with a canary test. | Not blocking; covered by unit and E2E tests. |
| M03-TECH-006 | Deleting the default address leaves the customer without a default. | Defined behavior (HC-ASM-M03-001): clear the selection and let the customer choose; the API always reports the true state. | Not blocking; asserted by integration and E2E tests. |
| M03-TECH-007 | Profile creation on first access races two concurrent requests. | Use an atomic upsert keyed by the identity identifier and assert the single-row outcome in a concurrency test. | Not blocking; covered by integration tests. |

No unresolved item prevents `$speckit-tasks`.
