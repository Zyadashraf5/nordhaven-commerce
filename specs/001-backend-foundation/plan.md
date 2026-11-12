# Implementation Plan: Milestone 01 - Backend Foundation

**Branch**: `001-backend-foundation` | **Date**: 2026-10-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-backend-foundation/spec.md`

## Summary

Create one production-oriented NestJS modular-monolith application inside a pnpm workspace. The
foundation uses strict TypeScript, PostgreSQL through Prisma, versioned REST/OpenAPI contracts,
validated configuration, safe structured logging, distinct liveness and readiness, graceful
shutdown, Jest test layers, and GitHub Actions quality gates. It deliberately contains only an
operational Health module and platform capabilities; it creates no commerce domain modules or
business schema.

Database startup is fail-fast: configuration validation, connection, and a bounded probe complete
before the HTTP listener binds; failure exits the process non-zero. After startup, a database outage keeps the process live but makes
readiness return `503`; deployments MUST route using readiness rather than liveness. Future
database-dependent routes also fail closed while database readiness is lost.

## Technical Context

**Language/Version**: Node.js `22.23.3`, TypeScript `5.9.x`, CommonJS application output with strict
type checking

**Primary Dependencies**: NestJS `11.2.x`; Prisma ORM `7.10.x` with the `prisma-client` generator,
CommonJS client output, `@prisma/adapter-pg`, and `pg`; Zod 4 for configuration and boundary
schemas; `@nestjs/swagger`; direct Pino/`pino-http` integration for structured logging and
redaction; Express as the Nest default HTTP adapter; project-owned bounded health probes

**Storage**: PostgreSQL `18.6` for local development and tests; no business tables in this milestone;
only Prisma-managed migration metadata may be persisted

**Testing**: Jest `29.x` with `ts-jest` `29.x`, Nest testing utilities, Supertest, and real
PostgreSQL integration/E2E databases; four independently runnable unit, integration, E2E, and
process test projects

**Target Platform**: Linux container/CI runtime; local development on Windows 10 22H2 build 19045
with PowerShell 7, WSL2, and Docker Compose v2 when the host remains serviced, with Windows 11 as
the recommended supported host (acceptance decision 2026-10-19: the Product Owner approved this
Windows 10 Pro 22H2 build 19045.6466 host as the Milestone 01 local acceptance environment and
withdrew the 2026-10-18 Windows 11 substitution; Windows PowerShell 5.1-compatible commands are
approved because PowerShell 7 is not installed; see `quickstart.md` sections 1 and 10)

**Project Type**: `pnpm@12.13.0` workspace/monorepo containing one backend web-service application;
no speculative shared packages or frontend application

**Performance Goals**: Local liveness/readiness responses complete within two seconds; startup
database connection is bounded to five seconds; graceful shutdown completes within ten seconds;
normal CI completes within fifteen minutes; clean local setup completes within fifteen minutes
excluding downloads

**Constraints**: Node.js 22 and Jest are constitutional constraints. NestJS 12 is not selected
because its ESM-only packages require Node.js 24.9+ for the supported Jest path. No automatic
schema migration on startup, no secret-bearing logs or responses, no unversioned business routes,
and no Redis, BullMQ, microservices, brokers, search services, or commerce behavior

**Scale/Scope**: One API application, one local PostgreSQL service, one operational module, two
health endpoints, one OpenAPI contract, four test projects, and foundational CI/documentation only.
The 10,000-daily-user project input is not a concurrency target or production SLO; HC-DEC-016 stays
open.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

### Pre-Research Gate

| Constitutional requirement | Planned evidence | Gate |
| --- | --- | --- |
| Modular monolith and separation of concerns | One Nest application; Health is the only module; platform concerns are separated; the project boundary checker rejects private cross-module imports | PASS |
| Secure identity and administrator MFA | Identity and MFA are explicitly out of scope; no bypass or placeholder implementation is created | PASS |
| Server-side validation and authorization | Configuration and external operational inputs are validated; safe HTTP conventions are established; business authorization is deferred with business modules | PASS |
| Atomic inventory and bundle correctness | No inventory or bundle behavior or schema is introduced; HC-DEC-017 remains open | PASS |
| Stock-gated pre-orders and payment safety | No order, pre-order, or payment behavior is introduced | PASS |
| Exact money and safe migrations | No money model is introduced; Prisma migrations are reviewable, replayed on isolated databases, and never run implicitly at startup | PASS |
| Automated unit, integration, and E2E tests | Separate Jest projects and required CI jobs cover success, failure, recovery, and process lifecycle | PASS |
| Logging, monitoring, and secrets protection | Structured allowlisted logs, correlation IDs, explicit redaction, health signals, `.gitignore`, and secret canary tests | PASS |
| Documented decisions and unresolved requirements | Research records every technology choice; HC-DEC-001 through HC-DEC-017 remain unresolved | PASS |
| Simplicity before distribution | One deployable application and PostgreSQL only; each additional dependency has a named foundation requirement | PASS |

No constitutional violation requires an exception. Phase 0 may proceed.

### Post-Design Re-check

The Phase 1 design retains a single application and database, defines public operational contracts,
uses no business entity, and adds no distributed component. The OpenAPI contract contains only
health endpoints and shared safe-error schemas. Test database isolation and migration replay are
explicit. All gates remain **PASS**; no Complexity Tracking entry is required.

## Project Structure

### Documentation (this feature)

```text
specs/001-backend-foundation/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- openapi.yaml
|   `-- contract-verification.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md                    # Created later by $speckit-tasks
```

### Source Code (repository root)

```text
apps/
`-- api/
    |-- src/
    |   |-- main.ts
    |   |-- app.module.ts
    |   |-- bootstrap/
    |   |   `-- create-application.ts
    |   |-- modules/
    |   |   `-- health/
    |   |       |-- api/
    |   |       |-- application/
    |   |       |-- health.module.ts
    |   |       `-- index.ts
    |   |-- platform/
    |   |   |-- config/
    |   |   |-- database/
    |   |   |-- http/
    |   |   |-- observability/
    |   |   |-- openapi/
    |   |   |-- shutdown/
    |   |   `-- validation/
    |   `-- generated/
    |       `-- prisma/         # Generated; never hand-edited
    |-- nest-cli.json
    |-- tsconfig.json
    `-- tsconfig.build.json
prisma/
|-- schema.prisma
|-- migrations/
`-- migration_lock.toml
openapi/
`-- openapi.json               # Deterministically generated review artifact
scripts/
|-- check-boundaries.mjs
|-- check-repository-hygiene.mjs
|-- db-wait.mjs
|-- openapi-generate.mjs
|-- openapi-check.mjs
|-- prisma-migrate-create.mjs
`-- verify.mjs
test/
|-- unit/
|-- integration/
|-- e2e/
|-- process/
|-- fixtures/
`-- helpers/
docs/
`-- development/
    |-- setup.md
    |-- migrations.md
    |-- secrets.md
    `-- troubleshooting.md
.github/
`-- workflows/
    |-- ci.yml
    `-- windows.yml
compose.yaml                    # PostgreSQL only
apps/api/Dockerfile
eslint.config.mjs
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
prettier.config.mjs
prisma.config.ts
tsconfig.base.json
.env.example
.gitignore
.nvmrc
```

**Structure Decision**: Use a pnpm workspace now so the future storefront can join without a
repository migration, but create only `apps/api`. Operational capabilities live under `platform/`;
business capabilities will later live under `modules/<capability>/` and expose only `index.ts`.
The Health module demonstrates a module contract without inventing commerce behavior. Prisma schema
and migration history remain at the workspace root because the modular monolith has one database;
the generated client is internal to the API database capability.

## Architecture Decisions

### Runtime and Compatibility Baseline

- Pin Node.js `22.23.3` in `.nvmrc`, the package engine range, CI, and the Docker build.
- Pin `pnpm@12.13.0` through `packageManager`; use a frozen lockfile in CI.
- Select NestJS `11.2.x`, TypeScript `5.9.x`, Jest `29.x`, and `ts-jest` `29.x`. This avoids the
  unsupported NestJS 12 + Jest + Node.js 22 combination while satisfying every approved project
  constraint.
- Use CommonJS application output. Configure Prisma 7's generated client with
  `moduleFormat = "cjs"`; run an early build/unit/integration smoke gate before adding later phases.
- Pin all direct dependencies exactly in the lockfile and use no global Nest or Prisma CLI.

### Database Startup and Degraded Readiness

1. Validate the full environment before constructing the application.
2. Construct one process-wide Prisma client through `DatabaseModule`.
3. Before `listen()`, connect and run a trivial database query with a five-second connection bound.
4. On failure, write one sanitized fatal event, disconnect, exit non-zero, and never bind a port.
5. After startup, `/api/v1/health/live` depends only on process responsiveness.
6. `/api/v1/health/ready` runs a fresh database probe with a one-second database timeout and an
   overall response bound below two seconds; it returns `503` on failure.
7. A runtime database failure marks the instance unready. A later successful probe restores
   readiness without restart. Future database-dependent business routes must add a global
   availability guard before they are introduced; this milestone contains no such route.
8. Every deployment or load balancer MUST use readiness, never liveness, as its routing gate. This
   milestone defines and tests that contract but does not claim a production router exists.

### Module Boundary Enforcement

- Use the project-owned `scripts/check-boundaries.mjs` check for static cross-module imports. The
  same exported algorithm evaluates production source and positive/negative fixtures.
- A capability may use its own internals and approved platform APIs. Another capability may import
  only the target module root/`index.ts`; it may not deep-import `api`, `application`, `domain`, or
  `persistence` files.
- Domain/application code may not import bootstrap, controllers, generated Prisma code, or another
  module's persistence. Root composition may wire public module exports but contains no rules.
- `pnpm lint --max-warnings=0` runs locally and in every quality CI job.
- A lint fixture deliberately performs a forbidden private import and a permitted public import;
  an automated architecture test proves the first fails and the second passes so configuration
  drift cannot silently disable enforcement.

### Configuration, Logging, Errors, and Shutdown

- The project environment loader invokes one Zod schema before application creation. It produces
  an immutable typed configuration object and validates `NODE_ENV`, `PORT`, `DATABASE_URL`, log
  level, database startup/probe bounds, and shutdown bound. Diagnostics name invalid keys but never
  echo secret values or a complete URL.
- Use direct Pino and `pino-http` JSON output because correlation and field redaction are explicit
  security requirements. Log only allowlisted request metadata; never log bodies, query strings,
  cookies, authorization headers, environment dumps, or database URLs. Defense-in-depth redaction
  covers common secret key names.
- Accept a caller correlation ID only when it is a UUID; otherwise generate a UUID. Return
  `X-Correlation-ID`, attach it to request logs using asynchronous context, and include it in safe
  error bodies.
- A global exception filter emits the contract's stable error envelope. Unknown exceptions become
  `INTERNAL_ERROR`; their response omits the cause and stack. Internal diagnostics stay redacted.
- On termination, mark readiness false first, stop accepting new application work, allow a bounded
  drain, disconnect Prisma, flush logs, and exit within eight seconds. Linux CI verifies SIGTERM;
  PowerShell documentation uses Ctrl+C because native Windows signal delivery differs.

### OpenAPI Contract Verification

- Configure URI versioning and `/api` global prefix before OpenAPI generation so operations appear
  as `/api/v1/...`.
- Application decorators/bootstrap are the executable source of truth. A deterministic script
  generates `openapi/openapi.json`; the derived file is committed for review.
- The generated contract contains exactly the two health paths in this milestone and reusable
  `LivenessResponse`, `ReadinessResponse`, and `ErrorResponse` schemas. No fake commerce path is
  permitted.
- `pnpm openapi:check` generates a temporary document, validates its OpenAPI structure, compares a
  canonicalized form with the committed document, checks the exact path inventory, and rejects
  excluded commerce terms.
- E2E and contract tests use the generated document and real HTTP responses to verify liveness
  `200`, readiness `200`, injected database failure readiness `503`, an intentionally absent URL
  `404`, and a test-instrumented controlled `500` without adding a production-only test route.
  Tests assert content type, required fields/types, status, correlation header/body agreement, and
  absence of stack traces or secrets. The `404` is validated against the reusable error component,
  not represented as a fake path.

### Test Isolation and CI

- Unit tests are parallel and use no database.
- Integration and E2E suites use separate `nordhaven_integration` and `nordhaven_e2e` databases on a
  dedicated local/CI PostgreSQL instance. Safety guards require `NODE_ENV=test`, an allowlisted local
  host, and database names ending in `_integration` or `_e2e` before destructive setup.
- Apply committed migrations to each dedicated database, run database suites serially, use
  session-scoped temporary state for isolation checks, and close every Nest/Prisma handle. The
  foundation migration creates no owned business table that requires destructive cleanup.
- GitHub Actions has Linux `quality`, `integration`, and `e2e` jobs plus a Windows `powershell` job.
  PostgreSQL service containers run only on Ubuntu. The Windows job verifies frozen install,
  formatting, boundaries, type checking, unit tests, build, OpenAPI, repository hygiene, and
  Compose configuration under PowerShell.
- Actual Windows 10 compatibility requires the manual quickstart on a qualifying patched host; a
  hosted Windows runner verifies path and PowerShell portability but is not proof of Windows 10.

## Implementation Phases

### Phase 0 - Research and Compatibility Lock

- Record the decisions and alternatives in [research.md](./research.md).
- Verify Node/Nest/Jest/Prisma compatibility with a minimal temporary smoke setup during
  implementation before committing the workspace foundation.
- Lock versions only after the smoke setup passes; do not float to NestJS 12 or Prisma 8.

### Phase 1 - Workspace and Quality Baseline

- Create the pnpm workspace, one `apps/api` package, strict TypeScript configuration, deterministic
  formatter/linter, automated boundary rules, package scripts, Dockerfile, ignore policy, and safe
  environment example.
- Prove the required permitted/forbidden import fixtures in lint and CI.

### Phase 2 - Configuration, Database, and Migration Foundation

- Implement validated typed configuration and sanitized startup failures.
- Add PostgreSQL 18.6 Compose service and prerequisite checks.
- Configure Prisma 7, generated client output, the database lifecycle module, fail-fast startup,
  safe migration scripts, and isolated test databases.

### Phase 3 - HTTP and Operational Foundation

- Configure `/api/v1` URI versioning, correlation, safe error mapping, structured redacted logging,
  liveness/readiness, runtime degraded state, and graceful shutdown.
- Generate the exact OpenAPI document and derived review artifact.

### Phase 4 - Automated Verification

- Add unit, integration, E2E, process-lifecycle, migration replay, redaction canary, and OpenAPI
  drift/response tests.
- Ensure tests cover database startup failure, runtime outage, recovery, `404`, `503`, and bounded
  shutdown without adding a commerce endpoint.

### Phase 5 - CI, Documentation, and Acceptance

- Add GitHub Actions Linux quality/database jobs and the Windows PowerShell portability job.
- Document setup, commands, migration safety, troubleshooting, cleanup, secrets response, and the
  readiness routing contract.
- Run the full quickstart on Linux and on the qualifying Windows 10 host before milestone acceptance.

## Data and Migration Approach

- `prisma/schema.prisma` contains the PostgreSQL datasource and Prisma 7 client generator only; it
  defines no business model.
- `prisma.config.ts` is the single CLI configuration source. Runtime configuration remains owned by
  the application config capability.
- Generated client output is reproducible, ignored from manual review where appropriate, and
  regenerated explicitly after schema changes and before builds.
- Development schema work uses `migrate dev --create-only`, mandatory SQL review, then `migrate dev`
  against the disposable developer database. `db push` is prohibited.
- Test/CI and future deployment use `migrate deploy` followed by `migrate status`. CI applies the
  complete committed history to empty databases and repeats deployment to prove safe re-execution.
- Application startup never runs migrations. Reset is a separately named local/test-only command
  guarded by environment and database-name checks.
- Later destructive or locking changes require expand/backfill/contract sequencing, backup and
  recovery evidence, and a separate reviewed feature plan.

## Acceptance Verification Commands

The commands below are planned public package scripts; they are implemented in this milestone and
must work from PowerShell without Bash-only syntax.

```powershell
node --version
pnpm --version
wsl --version
docker version
docker info
docker compose version
docker compose config --quiet

pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
pnpm test:unit

pnpm db:up
pnpm db:wait
pnpm prisma:generate
pnpm prisma:migrate:deploy
pnpm test:integration
pnpm test:e2e
pnpm test:process
pnpm openapi:check
pnpm repo:hygiene
pnpm audit --prod --audit-level critical
pnpm verify
```

Runtime verification uses `Invoke-RestMethod` against `/api/v1/health/live`,
`/api/v1/health/ready`, and `/api/docs-json`; database outage/recovery and shutdown sequences are
defined in [quickstart.md](./quickstart.md).

## Risks and Unresolved Technical Items

| ID | Risk or item | Treatment | Task-generation impact |
| --- | --- | --- | --- |
| M01-TECH-001 | Node.js 22 approaches end of maintenance in 2027. | Pin the latest approved 22 patch now and schedule a runtime/constitution review no later than 2027-Q1. | Not blocking M01 tasks. |
| M01-TECH-002 | NestJS 12 is incompatible with the required Node 22 + Jest supported path. | Use maintained NestJS 11, TypeScript 5.9, Jest 29, and an early compatibility smoke gate. Upgrade only through a later reviewed decision. | Resolved for task generation. |
| M01-TECH-003 | Generic Windows 10 vendor support cannot be promised after Microsoft/Docker servicing ends; no qualifying host is identified in the repository. | Target patched Windows 10 22H2 build 19045 with ESU/LTSC eligibility, document prerequisites, and require a named manual smoke-test result before milestone acceptance. Windows 11 is recommended. Update (2026-10-18): the Product Owner approved Windows 11 acceptance replacing the Windows 10 manual smoke test; the Windows 10 ESU/LTSC host requirement no longer gates acceptance. Update (2026-10-19, operative): the Product Owner approved this Windows 10 Pro 22H2 build 19045.6466 host as the Milestone 01 local acceptance environment, withdrew the 2026-10-18 Windows 11 substitution, and approved Windows PowerShell 5.1-compatible commands because PowerShell 7 is not installed; the named manual smoke test was executed on this host and recorded in `docs/progress/milestone-01.md`. | Does not block task creation or implementation; the original Windows 10 acceptance claim required a named host test, which the 2026-10-19 decision provides and the executed smoke test satisfies. |
| M01-TECH-004 | Production traffic routing cannot be proven without deployment infrastructure. | Define readiness as the mandatory routing gate, fail startup before bind, fail future DB routes closed, and make readiness wiring a non-negotiable gate in a later deployment specification. | Not in M01 implementation scope and not a task-generation blocker. |
| M01-TECH-005 | Prisma 8 is not selected because Node 22 compatibility and required capabilities are not the approved baseline. | Pin Prisma 7.10.x and review upgrades explicitly; never install `latest`. | Resolved for task generation. |
| M01-TECH-006 | HC-DEC-016 leaves production SLOs and budgets open. | Treat all time bounds here as local/CI acceptance limits only. | Not blocking foundation tasks. |

No unresolved item prevents `$speckit-tasks`. M01-TECH-003 must appear as an explicit manual
acceptance task, and M01-TECH-004 must be carried forward to any deployment feature.
