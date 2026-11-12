# Phase 0 Research: Milestone 01 - Backend Foundation

## Research Scope

This document resolves the technical choices required by the reviewed specification. Decisions are
limited to the backend foundation and do not resolve HC-DEC-001 through HC-DEC-017.

## Decision 1: Runtime, Framework, Language, and Test Compatibility

**Decision**: Pin Node.js `22.23.3`. Use NestJS `11.2.x`, TypeScript `5.9.x`, CommonJS application
output, Jest `29.x`, and `ts-jest` `29.x`. Run a compatibility smoke gate before implementing later
foundation phases.

**Rationale**: Node.js 22 and Jest are mandated by the constitution. NestJS 12 is ESM-only, and its
official migration guide states that Jest needs Node.js 24.9 or later to load NestJS 12 packages.
Selecting NestJS 11 is the only option that preserves both approved constraints without relying on
an unsupported test configuration. Node `22.23.3` is the current 22.x patch and also exceeds the
minimums required by the selected tooling.

**Alternatives considered**:

- NestJS 12 + Vitest: rejected because Jest is constitutionally required.
- NestJS 12 + Jest + Node.js 24.9+: rejected because Node.js 22 is constitutionally required.
- NestJS 12 + Jest experimental ESM flags on Node.js 22: rejected as an unsupported production
  foundation.
- NestJS 11 + Jest: selected; it is still maintained and supports the approved constraints.

**Evidence**:

- [NestJS migration guide](https://docs.nestjs.com/migration-guide)
- [NestJS releases](https://github.com/nestjs/nest/releases)
- [Node.js 22 archive](https://nodejs.org/en/download/archive/v22)
- [Node.js release schedule](https://nodejs.org/en/about/previous-releases)

## Decision 2: Workspace Package Manager

**Decision**: Use pnpm 12 workspaces and pin `pnpm@12.13.0` in the root `packageManager` field. CI
uses the pinned version and `--frozen-lockfile`.

**Rationale**: pnpm 12 supports Node.js 22 and Windows, provides strict dependency isolation, and
supports a future storefront without requiring a repository conversion. Workspaces add no runtime
component, and only `apps/api` is created now.

**Alternatives considered**:

- npm workspaces: fewer bootstrap concepts, but weaker dependency isolation and less efficient
  workspace storage.
- Yarn/Bun: no project requirement or material advantage justifies adding a different toolchain.
- Multiple packages now: rejected as speculative; no shared package exists until a concrete
  consumer requires one.

**Evidence**: [pnpm installation and Node compatibility](https://pnpm.io/installation/)

## Decision 3: PostgreSQL Version

**Decision**: Use PostgreSQL `18.6` locally and in CI, pinned to the official
`postgres:18.6-alpine` image tag. For PostgreSQL 18, mount the named data volume at
`/var/lib/postgresql`; the image manages its version-specific data directory below that parent.

**Rationale**: PostgreSQL 18 is supported through November 2030 and is supported by Prisma 7. The
current minor contains accumulated fixes; PostgreSQL recommends staying on the current minor for a
selected major. The same pinned Alpine image is used by Compose and CI. Mounting its PostgreSQL 18
data root avoids an image-created anonymous volume and keeps the named volume authoritative across
container recreation.

**Alternatives considered**:

- PostgreSQL 17: mature and supported, but has one less year of upstream support.
- Floating `postgres:latest`: rejected because it permits unreviewed major upgrades.
- Managed database: outside the local-foundation milestone and unresolved production topology.

**Evidence**:

- [PostgreSQL versioning policy](https://www.postgresql.org/support/versioning/)
- [Prisma 7 supported databases](https://docs.prisma.io/docs/orm/v7/reference/supported-databases)

## Decision 4: Prisma Version and NestJS Integration

**Decision**: Pin Prisma CLI and client to `7.10.x`; use `prisma.config.ts`, the `prisma-client`
generator with an explicit generated path and `moduleFormat = "cjs"`, `@prisma/adapter-pg`, and
`pg`. A non-global `DatabaseModule` owns one `PrismaService` per process, explicit connect/probe,
and shutdown disconnect. The platform database module is global inside the single application so
the operational Health module can consume the one owned lifecycle without constructing a second
client.

**Rationale**: Prisma 7 supports Node.js 22, PostgreSQL 18, explicit output, driver adapters, and
CommonJS generated output. Prisma 8 is not selected because the current line requires a newer
runtime or remains outside the approved stable capability baseline. A single client avoids pool
exhaustion; a narrow module prevents arbitrary cross-module persistence access.

**Alternatives considered**:

- Prisma 8: rejected for this milestone's Node.js 22 and stability constraints.
- Deprecated `prisma-client-js`: rejected for a new project.
- Global raw Prisma client: rejected because it weakens module ownership.
- One Prisma client per module or request: rejected because it multiplies connection pools.

**Evidence**:

- [Prisma 7 system requirements](https://docs.prisma.io/docs/orm/reference/system-requirements)
- [Prisma 7 generator and CommonJS option](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators)
- [Prisma with NestJS](https://docs.prisma.io/docs/guides/frameworks/nestjs)
- [Prisma connection management](https://docs.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-management)

## Decision 5: Database Startup and Runtime Outage Behavior

**Decision**: Fail startup before binding the HTTP listener if the initial database connection and
probe do not succeed within five seconds. After successful startup, remain live during a database
outage, return readiness `503` after a one-second probe timeout, fail future business requests
closed while unready, and return to ready automatically after a successful probe.

**Rationale**: Fail-fast startup prevents an initially unusable instance from ever accepting
traffic. Keeping an already-started process live permits diagnosis and recovery without a restart.
Distinct liveness/readiness prevents restart storms. Deployment routing must consume readiness,
not liveness; the application cannot alone prove an external router's behavior.

**Alternatives considered**:

- Start degraded when PostgreSQL is unavailable: rejected because it adds startup ambiguity and
  increases the risk of routing to a never-ready instance.
- Exit on every runtime database outage: rejected because transient outages could create restart
  loops and delay automatic recovery.
- Cached readiness only: rejected because stale success can hide a current outage.

**Evidence**:

- [NestJS health checks](https://docs.nestjs.com/reliability/terminus)
- [Prisma connection pool timeouts](https://docs.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool)

## Decision 6: Configuration Validation

**Decision**: Use one project-owned environment loader backed by Zod 4 before Nest application
creation, then inject the immutable typed result through a global environment module. Attach Zod
schemas to future request DTO types through the global `ZodValidationPipe`; validation errors list
safe paths only and never rejected values.

**Rationale**: Zod provides one small schema dependency with type inference and deterministic
validation. The custom validation hook is an officially supported Nest configuration pattern. The
same schema approach can be reused at future server boundaries without forcing a business model.

**Alternatives considered**:

- Joi: officially supported but adds a second schema vocabulary without stronger project value.
- Handwritten parsing: fewer dependencies but more custom correctness and diagnostic code.
- Accepting process environment values lazily: rejected because it allows invalid critical
  configuration past startup.

**Evidence**:

- [NestJS configuration validation](https://docs.nestjs.com/techniques/configuration)
- [Zod 4](https://zod.dev/packages/zod)

## Decision 7: Automated Module Boundaries

**Decision**: Use a project-owned static-import boundary checker for `modules/*`, with public-root
entry-point enforcement and automated positive/negative fixtures evaluated by the same exported
algorithm as production source. Run it as a distinct zero-tolerance local and CI gate alongside
ESLint.

**Rationale**: The small checker covers the current TypeScript `from` imports without introducing a
third-party architectural framework. A deliberately failing fixture and an allowed public-root
fixture prove the production algorithm remains active. Expand the parser before introducing other
module-loading forms.

**Alternatives considered**:

- `eslint-plugin-boundaries`: capable but unnecessary for the single-module foundation when a small
  deterministic checker covers the approved import form.
- ESLint core `no-restricted-imports`: brittle for captured module names and public entry points.
- Nx module tags: powerful but an unnecessary workspace framework for one application.
- Review-only enforcement: rejected because the user explicitly prefers automated detection.

**Evidence**: `scripts/lib/module-boundaries.mjs`, `scripts/check-boundaries.mjs`, and
`test/fixtures/boundaries/`.

## Decision 8: Structured Logging and Correlation

**Decision**: Use direct Pino and `pino-http` JSON logs, request correlation, allowlist serializers,
and defense-in-depth redaction. Accept only UUID correlation identifiers; otherwise create one with
the Node.js crypto API. Do not log bodies, query strings, cookies, authorization values, database
URLs, or configuration objects.

**Rationale**: The requirement includes recursive field redaction and request correlation. Nest's
built-in JSON logger is useful but would require project-owned correlation and redaction machinery.
The direct integration keeps the adapter surface project-owned while using Pino's maintained
redaction implementation for the security-critical behavior.

**Alternatives considered**:

- Nest `ConsoleLogger({ json: true })`: fewer dependencies but insufficient built-in field
  redaction for this requirement.
- Winston: broader transport ecosystem than needed; the application writes JSON to stdout/stderr.
- In-process log shipping: rejected; the hosting platform owns collection and transport.

**Evidence**:

- [NestJS logging guidance](https://docs.nestjs.com/techniques/logger)
- [pino-http](https://github.com/pinojs/pino-http)

## Decision 9: API Versioning and OpenAPI Verification

**Decision**: Use URI versioning with the `/api/v1` prefix. Generate OpenAPI from the configured
application after prefix/version setup, commit a canonical derived JSON document, and make CI fail
on generation drift. Verify real health `200`, readiness `503`, and unknown-route `404` responses
against the documented schemas. A factory instrumentation hook applies a test-only interceptor for
the controlled `500` case without adding a production route.

**Rationale**: One bootstrap factory prevents tests, document generation, and runtime from applying
different global settings. Generated-versus-committed comparison exposes accidental API changes.
Real observed-response tests prove the safe error contract, while an exact path allowlist prevents
fake commerce endpoints.

**Alternatives considered**:

- Hand-authored OpenAPI as runtime source: duplicates decorators and is likely to drift.
- Snapshot testing only: detects text changes but does not prove runtime response conformity.
- A fake business or failure endpoint: rejected by milestone scope.
- Documenting an unknown route as an OpenAPI Path Item: rejected because that route intentionally
  does not exist; its response uses a reusable error component instead.

**Evidence**:

- [NestJS OpenAPI generation](https://docs.nestjs.com/openapi/introduction)
- [NestJS URI versioning](https://docs.nestjs.com/techniques/versioning)
- [OpenAPI 3.0 specification](https://spec.openapis.org/oas/v3.0.4.html)

## Decision 10: Test Isolation

**Decision**: Use three Jest projects. Unit tests run in parallel without a database. Integration
and E2E run serially against separate `nordhaven_integration` and `nordhaven_e2e` databases on a
dedicated local/CI PostgreSQL instance. Setup applies committed migrations and cleanup resets only
the suite-owned database after multiple safety guards pass.

**Rationale**: Separate databases prevent cross-suite and developer-data contamination. Serial
database suites are adequate for this foundation and avoid premature per-worker schema complexity.
HTTP E2E cannot safely rely on test-transaction rollback because pooled requests use different
connections.

**Alternatives considered**:

- Testcontainers: excellent isolation but adds a dependency and container orchestration layer not
  needed for two small serial suites.
- Per-test transactions: rejected for full HTTP tests across pooled connections.
- Shared development database: rejected as unsafe and non-reproducible.
- SQLite or mocked persistence: rejected because PostgreSQL/Prisma behavior must be exercised.

**Evidence**: [NestJS testing guidance](https://docs.nestjs.com/fundamentals/testing)

## Decision 11: Migration Workflow

**Decision**: Prisma 7 development commands create a migration without applying it, require SQL
review, then apply it only to the disposable development database. CI/test/deployment use
`migrate deploy` and `migrate status`; `db push`, implicit startup migration, and non-local reset are
prohibited. Generate the client explicitly after schema changes.

**Rationale**: This separates design/review from application, keeps committed SQL auditable, and
allows CI to replay the complete history. Prisma documents `migrate dev` as development-only and
`migrate deploy` for testing/production.

**Alternatives considered**:

- Automatic migrations at application startup: rejected because concurrent instances and failed
  migrations can make startup unsafe.
- `db push`: rejected because it does not provide the required reviewed migration history.
- Editing applied migrations: rejected; corrections use a new migration or incident-only resolve
  procedure.

**Evidence**:

- [Prisma 7 development and production migrations](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/development-and-production)
- [Prisma expand-and-contract migrations](https://www.prisma.io/docs/guides/database/data-migration)

## Decision 12: Continuous Integration Provider

**Decision**: Use GitHub Actions with Linux quality and database jobs plus a Windows hosted quality
job. PostgreSQL is a service container on Ubuntu only. Every CI command is also a documented local
pnpm command.

**Rationale**: GitHub Actions supports PostgreSQL service containers on Linux and provides current
Windows PowerShell runners for path/tooling portability. Splitting jobs makes database and platform
failures diagnosable without inventing a deployment pipeline.

**Alternatives considered**:

- A single Linux job: simpler but fails to test Windows path and PowerShell compatibility.
- PostgreSQL service on the Windows hosted runner: rejected because GitHub service containers
  require Linux.
- Provider-specific CI-only scripts: rejected because failures would not be locally reproducible.

**Evidence**: [GitHub Actions PostgreSQL service containers](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers)

## Decision 13: Windows 10 and Docker Compose Support Contract

**Decision**: Project scripts and documentation target PowerShell 7 on Windows 10 22H2 build 19045
x64 with WSL2 `2.1.5+`, hardware virtualization/SLAT, at least 8 GB RAM, Docker Desktop using Linux
containers, and Compose v2. Support is conditional on the host's Windows edition and servicing or
ESU/LTSC status. Windows 11 is the recommended baseline. Literal Windows 10 acceptance requires a
manual smoke run on a qualifying host.

**Rationale**: These are Docker's published technical prerequisites. Generic Windows 10 support
cannot honestly be guaranteed after Microsoft's servicing window, and a GitHub Windows runner is
not Windows 10. The plan therefore distinguishes PowerShell portability from OS-level acceptance.

**Alternatives considered**:

- Claim unconditional Windows 10 support: rejected as unverifiable and inconsistent with vendor
  lifecycle policy.
- Drop Windows 10: rejected because the stakeholder explicitly requested it.
- Run PostgreSQL natively: rejected because it creates a second unsupported setup path.

**Evidence**:

- [Docker Desktop for Windows prerequisites](https://docs.docker.com/desktop/setup/install/windows-install/)
- [Docker Compose installation](https://docs.docker.com/compose/install/)
- [Microsoft Windows 10 lifecycle](https://learn.microsoft.com/en-us/lifecycle/products/windows-10-home-and-pro)
- [Prisma operating-system requirements](https://docs.prisma.io/docs/orm/reference/system-requirements)

## Dependency-Minimization Review

Each non-framework dependency has one direct requirement:

| Dependency | Justification |
| --- | --- |
| Zod | Fail-fast typed environment validation and reusable boundary schemas |
| Pino and `pino-http` | Structured correlation and security-grade redaction |
| Project boundary script | Automated modular-monolith import enforcement using the same algorithm for fixtures and production source |
| `@apidevtools/swagger-parser` | OpenAPI structural validation in CI |
| `openapi-response-validator` | Contract validation for observed health and safe-error responses |
| `pg` and Prisma PostgreSQL adapter | Required Prisma 7 PostgreSQL transport |
| Supertest | Real HTTP E2E verification through Nest's documented testing pattern |

Redis, BullMQ, a broker, a cache, a search engine, Testcontainers, Nx, and an external telemetry
backend are not justified and are excluded.

## Resolved Unknowns and Remaining Risks

All design choices required to generate implementation tasks are resolved. Two acceptance risks
remain visible rather than being treated as implicit approvals:

- An actual qualifying Windows 10 host and servicing entitlement must be identified for the manual
  smoke test before Milestone 01 can be accepted.
- Production routing infrastructure is outside this milestone; any later deployment specification
  must wire traffic to readiness, never liveness.
