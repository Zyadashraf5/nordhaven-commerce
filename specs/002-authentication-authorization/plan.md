# Implementation Plan: Milestone 02 - Authentication & Authorization

**Branch**: Not created; the repository has no commits yet | **Date**: 2026-10-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-authentication-authorization/spec.md`
**Research**: [research.md](./research.md) | **Data model**: [data-model.md](./data-model.md)

## Summary

Add one Identity and Access capability to the existing NestJS modular monolith. It provides customer
registration with email and password, memory-hard credential hashing, opaque server-side sessions with
absolute and idle expiry plus per-session and all-session revocation, multiple simultaneous device
sessions, a single-use password-reset token lifecycle delivered through a provider-agnostic
notification boundary, customer-versus-administrator authorization, mandatory RFC 6238 TOTP MFA for
administrators with encrypted secrets and hashed single-use recovery codes, secure-by-default route
protection with availability/authentication/role guards, abuse resistance through an in-process rate
limiter plus durable account lockout, an extended safe error contract, and structured plus durable
security records.

The milestone adds **no new dependency**, no new infrastructure, and no commerce behavior. Schema
changes ship as one reviewed additive Prisma migration. HC-DEC-002, HC-DEC-003, and HC-DEC-014 remain
open and are recorded as dependencies rather than resolved.

## Technical Context

**Language/Version**: Node.js `22.23.3`, TypeScript `5.9.x`, strict mode with
`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, CommonJS output

**Primary Dependencies**: NestJS `11.2.x`; Prisma `7.10.x` with the `prisma-client` generator and
`@prisma/adapter-pg`; Zod 4 for configuration and request-boundary validation; `@nestjs/swagger`;
Pino/`pino-http`. No new dependency is introduced for authentication, MFA, rate limiting,
authorization, or token handling; all use the Node.js standard library (research.md Decision 12)

**Storage**: PostgreSQL `18.6`. New Identity-owned tables: `users`, `sessions`, `identity_tokens`,
`admin_mfa_credentials`, `admin_mfa_recovery_codes`, `security_events`

**Testing**: Jest `29.x` with `ts-jest`, Nest testing utilities, Supertest, and the existing isolated
`nordhaven_integration` and `nordhaven_e2e` databases; existing unit, integration, E2E, and process
projects

**Target Platform**: Linux container/CI runtime; local development and acceptance on the Windows 10
Pro 22H2 build 19045.6466 host accepted by the Product Owner on 2026-10-19, using Windows PowerShell
5.1-compatible commands

**Project Type**: One backend application inside the existing `pnpm@12.13.0` workspace; no frontend,
no shared package

**Performance Goals**: A single password verification completes within 500 ms on the accepted
development host; authentication and recovery responses remain comfortably below the existing
two-second local bound; the rate limiter bounds memory with deterministic pruning; the complete
non-database gate set continues to run inside the existing fifteen-minute CI budget

**Constraints**: No Redis, queue, broker, microservice, search engine, external identity provider, or
paid service. No new runtime dependency. No automatic schema change at startup. No secret in any
response, log, or durable record. No unversioned business route. No commerce module. HC-DEC-001
through HC-DEC-017 remain unresolved

**Scale/Scope**: One API application, one new business-capability module, sixteen versioned
operations (two existing health operations plus fourteen identity operations), one additive migration,
one extended OpenAPI contract, and extended unit/integration/E2E coverage

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### Pre-Research Gate

| Constitutional requirement | Planned evidence | Gate |
| --- | --- | --- |
| Modular monolith and separation of concerns (I) | One application; Identity and Access owns its model, persistence, and public contract; shared security vocabulary lives in `platform/security`; the boundary checker and hygiene check continue to pass | PASS |
| Secure identity, expiry, revocation, enumeration and brute-force resistance, mandatory admin MFA, no plaintext secrets (II) | `scrypt` hashing with versioned parameters; hash-only session storage with absolute and idle expiry and revocation; durable lockout plus rate limiting; uniform invalid-credential responses and dummy verification; enforced TOTP with AES-256-GCM secret encryption and SHA-256 recovery codes; recovery material never logged | PASS |
| Server-side trust enforcement (III) | Zod boundary validation; secure-by-default global guards; role and ownership checks with negative-path tests; stable non-sensitive error contract | PASS |
| Atomic inventory reservations (IV) | No inventory behavior is introduced | PASS |
| Explicit bundle semantics (V) | No bundle behavior is introduced | PASS |
| Stock-gated pre-order payment (VI) | No order or payment behavior is introduced | PASS |
| Idempotent payments and verified webhooks (VII) | No payment or webhook behavior is introduced | PASS |
| Exact money and safe database evolution (VIII) | No money model; one additive, reviewed, replayable migration; no startup schema change; no `db push` | PASS |
| Automated testing at every boundary (IX) | Unit (hashing, tokens, TOTP vectors, limiter, guards, policy), PostgreSQL integration (uniqueness, concurrency, session and token lifecycle, encrypted MFA, lockout durability), E2E (full journeys, denial, replay, rate limiting, redaction) | PASS |
| Observable operations and protected secrets (X) | Correlated structured security events plus durable audit records; extended redaction; canary tests prove zero secret leakage | PASS |
| Recorded decisions and open requirements (XI) | Research records every technical decision; HC-DEC-002, HC-DEC-003, and HC-DEC-014 are recorded as open dependencies with review triggers | PASS |
| Simplicity before distribution (XII) | One application and PostgreSQL only; no distributed component; zero new dependencies | PASS |

No constitutional violation requires an exception. Phase 0 may proceed.

### Post-Design Re-check

The Phase 1 design keeps a single application and database, adds one capability module with a
deliberate public contract, persists all identity state in module-owned tables, and introduces no
distributed component or external service. Guarding is secure-by-default and ordered so that an
unavailable database yields `503` rather than an authentication error. The OpenAPI contract gains only
authorized identity operations, and the excluded-domain guard keeps rejecting every commerce term. All
gates remain **PASS**; no Complexity Tracking entry is required.

## Project Structure

### Documentation (this feature)

```text
specs/002-authentication-authorization/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- identity-api.md
|   `-- contract-verification.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
apps/api/src/
|-- app.module.ts                              # Registers ordered global guards
|-- modules/
|   |-- health/
|   |   `-- api/health.controller.ts           # Mounted route marked @Public()
|   `-- identity/
|       |-- index.ts                           # Public contract
|       |-- identity.module.ts
|       |-- api/
|       |   |-- auth.controller.ts             # Public entry points
|       |   |-- session.controller.ts          # Authenticated session operations
|       |   |-- mfa.controller.ts              # Administrator MFA flows
|       |   |-- admin-users.controller.ts      # @Roles('ADMIN') listing
|       |   |-- identity.errors.ts             # Reviewed error messages
|       |   |-- identity.request.ts            # Zod-attached request DTOs
|       |   `-- identity.response.ts           # Response DTOs
|       |-- application/
|       |   |-- identity.service.ts            # Registration and sign-in
|       |   |-- session.service.ts             # Session issuance, validation, revocation
|       |   |-- password-reset.service.ts      # Recovery token lifecycle
|       |   |-- mfa.service.ts                 # Enrollment, verification, recovery codes
|       |   |-- security-event.service.ts      # Structured and durable security records
|       |   `-- notification/
|       |       |-- notification.port.ts
|       |       |-- memory-notification.transport.ts
|       |       `-- file-notification.transport.ts
|       |-- crypto/
|       |   |-- password-hasher.ts
|       |   |-- token.ts
|       |   |-- secret-cipher.ts
|       |   `-- totp.ts
|       `-- persistence/
|           |-- user.repository.ts
|           |-- session.repository.ts
|           |-- identity-token.repository.ts
|           |-- mfa.repository.ts
|           `-- security-event.repository.ts
|-- platform/
|   |-- availability/
|   |   `-- availability.guard.ts              # Reject business work while not ready
|   |-- config/environment.ts                  # Extended configuration schema
|   |-- database/database.service.ts           # Exposes the owned Prisma client
|   |-- http/
|   |   |-- app-error.ts                       # Typed, closed-set application errors
|   |   `-- safe-exception.filter.ts           # Extended handling for AppError
|   |-- observability/logging.ts               # Extended redaction paths
|   |-- openapi/openapi.ts                     # Decorator-driven generation and post-processing
|   `-- security/
|       |-- access.decorators.ts               # @Public, @Roles, @CurrentPrincipal
|       |-- principal.ts                       # Principal type and role vocabulary
|       |-- rate-limit.decorator.ts
|       |-- rate-limit.guard.ts
|       |-- session-auth.guard.ts
|       |-- roles.guard.ts
|       `-- rate-limiter.ts                    # Project-owned fixed-window limiter

prisma/
|-- schema.prisma                              # Adds the six Identity-owned models
`-- migrations/<timestamp>_identity_access/migration.sql

openapi/openapi.json                           # Regenerated committed contract
scripts/
|-- identity-create-admin.mjs                  # Guarded administrator provisioning
`-- openapi-check.mjs                          # Updated inventory and excluded-domain rules
test/
|-- unit/                                      # Hash, token, TOTP, limiter, guard, policy specs
|-- integration/                               # Identity persistence and lifecycle specs
`-- e2e/                                       # Identity journeys, denial, and contract specs
```

**Structure Decision**: The new capability lives entirely under `modules/identity/` with the same
`index.ts` public-contract convention as the Health module. Cross-cutting enforcement primitives
(decorators, guard classes, the principal type, the rate limiter, and `AppError`) live under
`platform/`, because they are infrastructure that both the Health and Identity modules must use and
because placing them inside a feature module would create a feature-to-feature dependency. Prisma
schema and migration history stay at the workspace root because the modular monolith owns one database;
ownership is recorded per table in `data-model.md`.

## Architecture Decisions

### Configuration

Extend the validated environment schema with identity settings that all have safe defaults except the
encryption key:

| Key | Default | Rule |
| --- | --- | --- |
| `AUTH_ENCRYPTION_KEY` | none | Required; base64-encoded 32 bytes; never logged or echoed |
| `AUTH_SESSION_ABSOLUTE_TTL_SECONDS` | `2592000` | 300 to 7776000 |
| `AUTH_SESSION_IDLE_TTL_SECONDS` | `604800` | 300 to 2592000 |
| `AUTH_MAX_FAILED_ATTEMPTS` | `10` | 3 to 100 |
| `AUTH_LOCKOUT_SECONDS` | `900` | 30 to 86400 |
| `AUTH_PASSWORD_RESET_TTL_SECONDS` | `1800` | 300 to 86400 |
| `AUTH_MFA_ISSUER` | `Nordhaven Commerce` | 1 to 64 safe characters; used in the `otpauth://` URI |
| `AUTH_NOTIFICATION_TRANSPORT` | `none` | `none`, `file`, or `memory`; `file` is rejected when `NODE_ENV=production` |

Configuration diagnostics continue to name invalid keys without printing values.

### Data Ownership and Migration

- Six additive tables and their enums are created by one create-only migration named `identity_access`,
  whose SQL is reviewed before it is applied locally and replayed with `migrate deploy` on the
  isolated test databases.
- No existing table, column, or migration is modified; the change is additive and safe for an existing
  database.
- Application startup never migrates. `db push` remains prohibited.
- `data-model.md` records the owning module for every table and the states that must stay consistent.

### Authorization

- Global guards are registered in `AppModule.register` in this order: availability, session
  authentication, role authorization. A unit test proves an unready instance answers a protected route
  with `503` before any authentication error.
- `@Public()` marks the only unauthenticated routes: liveness, readiness, registration, sign-in,
  sign-in MFA completion, MFA enrollment, MFA enrollment confirmation, password-reset request, and
  password-reset confirmation.
- `@Roles('ADMIN')` restricts administrative operations. Administrative enforcement never trusts
  client-supplied role information.
- Anonymous denials return `401 UNAUTHENTICATED`; authenticated role denials return `403 FORBIDDEN`;
  both use the shared safe envelope. Denials on administrative routes are recorded as security events.

### Authentication Behavior

1. Registration normalizes the email, validates the password policy, hashes with `scrypt`, inserts the
   account, and returns the account summary without issuing a session. A duplicate address returns
   `409 REGISTRATION_NOT_ALLOWED` and is rate-limited; this unavoidable existence signal is documented
   as an accepted tradeoff until HC-DEC-002 and HC-DEC-014 allow a verification-based flow.
2. Sign-in verifies the password (or a dummy hash when the account is absent), records the outcome,
   and either issues a session, requires an MFA code, or requires MFA enrollment.
3. A locked account is answered exactly like an invalid credential and still performs a dummy
   verification.
4. Session validation hashes the presented credential, looks it up, checks revocation, absolute
   expiry, and idle expiry, and refreshes `lastUsedAt` at most once per minute to bound write load.
5. Password reset invalidates prior outstanding reset tokens, issues a hashed single-use token, hands
   a delivery message to the notification port, and always answers with the same `202`.
6. Completing a reset re-applies the password policy, marks the token consumed, revokes every session,
   and records the event.
7. Password change requires the current password, revokes all other sessions, and keeps the
   reauthenticated session.

### Administrator MFA

- An administrator without confirmed MFA receives `202` with a single-use enrollment challenge.
- Enrollment returns the `otpauth://` URI and the base32 secret exactly once, stores the secret
  AES-256-GCM encrypted with an unconfirmed state, and requires a correct code to confirm.
- Confirmation marks the credential confirmed and returns ten single-use recovery codes exactly once
  as SHA-256 hashes plus the plaintext for that one response.
- Sign-in after enrollment returns `202` with a single-use verification challenge; completion requires
  a valid TOTP code or an unused recovery code, rejects replayed time steps, and issues the session.
- Invalid, expired, replayed, or mismatched codes, challenges, and recovery codes all fail with the
  same safe verification error.

### Abuse Resistance

- `@RateLimit` declarations attach a policy to each authentication, registration, and recovery route;
  the limiter keys on client address plus the normalized account identifier when it is present in a
  validated body.
- Exceeding a limit returns `429 RATE_LIMITED` with `Retry-After`; the response is independent of the
  account's existence.
- Durable lockout counters and `lockedUntil` live on the account row and survive a restart; a
  successful sign-in clears them.
- The limiter prunes expired windows so memory stays bounded, and its process-local scope is documented
  as a single-instance limitation.

### Observability

- `REDACT_PATHS` gains identity-specific secret field names; existing request-level redaction stays.
- Every security event carries the request correlation identifier and a closed, non-sensitive detail
  shape, and is emitted to the structured logger and persisted to `security_events`. A persistence
  failure is caught, logged without sensitive fields, and never alters the authentication outcome.
- Administrative actions (for example, an administrative listing) are recorded as durable events.

### OpenAPI and Contract Verification

- `createOpenApiDocument` generates the document from controller and DTO decorators, then asserts the
  exact operation inventory, normalizes `additionalProperties: false`, replaces every error schema with
  the shared `ErrorResponse` component, and adds the correlation header to every response.
- The committed `openapi/openapi.json` is regenerated and reviewed.
- `scripts/openapi-check.mjs` keeps structural validation, drift detection, and the excluded-domain
  scan (now allowing the authorized identity terms while still rejecting every commerce term), and
  additionally validates unauthenticated identity responses (`401` and validation errors) plus the
  register, sign-in, and reset-request success shapes using stubbed services, so the gate remains
  database-free.
- An end-to-end contract spec validates authenticated identity responses against the committed
  document with the real database.

### Testing Strategy

- **Unit**: password policy and hashing round-trip plus constant-time comparison, token generation and
  hashing, AES-256-GCM round-trip and tamper rejection, TOTP against RFC 6238 Appendix B vectors plus
  replay rejection, rate limiter windows and pruning, guard decisions (public, missing, invalid,
  expired, role denial, unready-before-unauthenticated), and error-contract mapping.
- **Integration** (PostgreSQL): unique and concurrent registration, session persistence and expiry and
  revocation across restarts, durable lockout, reset-token single-use and supersession and expiry,
  encrypted MFA material at rest, recovery-code single use, and security-event persistence.
- **E2E** (HTTP): registration, multi-client sign-in, session listing and revocation, sign-out and
  sign-out-all, the full administrator MFA enrollment and sign-in journey with denial paths,
  password-reset journey including reuse and expiry, password change, rate limiting, `401`/`403`/`429`
  envelopes, and the controlled `500` regression.
- **Negative-path and redaction**: prove that passwords, session credentials, MFA secrets and codes,
  recovery codes and tokens, authorization headers, and connection strings never appear in responses,
  structured logs, or durable records.
- Milestone 01 required three consecutive full verification passes only for the foundation's
  acceptance criteria. Milestone 02 requires the complete gate set to pass once on the accepted
  baseline plus the seeded-failure rejection evidence (M02-SC-010).

### Documentation and Operations

- `.env.example` documents every new key with a placeholder encryption key.
- `quickstart.md` documents the accepted Windows 10 PowerShell 5.1-compatible path, including how to
  generate a development encryption key, provision the launch administrator, and exercise the flows.
- `README.md`, `docs/development/secrets.md`, and `docs/development/migrations.md` are updated to
  describe identity behavior, the encryption key, and the additive migration.
- `docs/progress/milestone-02.md` records task counts, evidence, defects, and unresolved items.
- `.github/workflows/ci.yml` continues to run the same gates, which now include identity unit,
  integration, E2E, contract, boundaries, hygiene, and audit checks; no workflow redesign is needed.

## Implementation Phases

### Phase 0 - Research and Decision Lock

- Record decisions, alternatives, and evidence in [research.md](./research.md).
- Confirm that no new dependency is required and that the configuration additions are safe defaults
  plus one required key.

### Phase 1 - Platform Security Foundation

- Add `AppError` and extend the safe exception filter and redaction paths.
- Add `platform/security` decorators, principal type, rate limiter, and the three global guards.
- Extend the environment schema and `.env.example`, and expose the owned Prisma client.
- Prove guard ordering and error mapping with unit tests before adding identity behavior.

### Phase 2 - Identity Persistence

- Add the Prisma models and enums, create the reviewed additive migration, generate the client, and
  apply and verify it on the isolated test databases.
- Add repositories and prove uniqueness, concurrency, and lifecycle behavior with integration tests.

### Phase 3 - Identity Behavior

- Implement hashing, token, cipher, and TOTP primitives with their unit tests.
- Implement registration, sign-in, sessions, password reset, password change, MFA, and security events.
- Mark the Health routes public and register the Identity module.

### Phase 4 - HTTP Surface and Contract

- Add controllers and DTOs, then regenerate and review the OpenAPI contract.
- Update the contract gate for the new inventory and excluded-domain rules.
- Add the E2E journeys, denial paths, redaction checks, and the contract spec.

### Phase 5 - Operations, Documentation, and Acceptance

- Add the guarded administrator provisioning script.
- Update `.env.example`, the README, the development docs, the quickstart, and the Milestone 02
  progress record.
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
pnpm test:process
pnpm audit:prod
```

Database-backed suites require `NODE_ENV=test` and a `DATABASE_URL` whose database name ends in
`_integration` or `_e2e`; the existing guard enforces this and the encryption key must be exported for
tests exactly as for development.

## Risks and Unresolved Technical Items

| ID | Risk or item | Treatment | Task-generation impact |
| --- | --- | --- | --- |
| M02-TECH-001 | Password-reset delivery cannot reach a real user while HC-DEC-014 is open. | Ship the complete token lifecycle behind a provider-agnostic port with test and development transports only; refuse the file transport in production; record the dependency and its review trigger. | Not blocking tasks; the acceptance tasks assert the uniform response and the safe no-delivery path. |
| M02-TECH-002 | Registration duplicate detection reveals that an address is registered. | Rate-limit registration, record the attempt, choose a non-confirming `409` code, and document the residual as an accepted tradeoff pending HC-DEC-002 and HC-DEC-014. | Not blocking; recorded in the spec, data model, and progress notes. |
| M02-TECH-003 | Account lockout can be abused to deny service to a known account. | Use a bounded, expiring lockout, keep the response indistinguishable from an invalid credential, keep the client rate limit independent of account existence, and document the tradeoff. | Not blocking; covered by unit and E2E tests. |
| M02-TECH-004 | In-process rate-limit state resets on restart and does not coordinate across instances. | Document the limitation, keep durable lockout for the security-critical case, and require a recorded decision before any multi-instance deployment. | Not blocking; recorded in the spec and quickstart. |
| M02-TECH-005 | Bearer transport defers the browser cookie and cross-site request-forgery decision. | Keep the API-first bearer design for this milestone and require the storefront milestone to revisit transport, CSRF, and cookie attributes before a browser client is released. | Not blocking; recorded as an assumption in the spec. |
| M02-TECH-006 | Email verification and account-deletion compliance remain unresolved. | Implement neither; record HC-DEC-002 and HC-DEC-003 with review triggers and never present an account as verified. | Not blocking; the scope boundaries exclude both. |
| M02-TECH-007 | A future parameter review may need stronger password hashing. | Store a versioned, self-describing hash so parameters can be increased without a flag day; record the review trigger. | Not blocking; the storage format already supports it. |
| M02-TECH-008 | MFA secret encryption depends on a single configured key. | Require the key at startup, never log it, document generation and rotation expectations, and record key rotation as an operational follow-up. | Not blocking; rotation is an operational task, not a code task. |

No unresolved item prevents `$speckit-tasks`.
