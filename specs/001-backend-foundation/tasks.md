---
description: "Dependency-ordered implementation tasks for Milestone 01 - Backend Foundation"
---

# Tasks: Milestone 01 - Backend Foundation

**Input**: `/specs/001-backend-foundation/` design artifacts  
**Scope guard**: Operational foundation only; no commerce modules or resolution of HC-DEC-001 through HC-DEC-017.  
**Verification rule**: A task is complete only when its named files exist and its stated verification succeeds, or the task explicitly records an environment-dependent NOT VERIFIED result.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: May proceed in parallel because it changes independent files after prerequisites are complete.
- **[US#]**: Maps the task to a specification user story.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish reproducible workspace, dependency, ignore, and container foundations.

- [x] T001 Create the pnpm workspace and pinned Node/package-manager metadata in `package.json`, `pnpm-workspace.yaml`, `.npmrc`, and `.nvmrc`; verify package metadata parses and versions match `plan.md`.
- [x] T002 Create the NestJS API package manifest and strict build layout in `apps/api/package.json`, `apps/api/nest-cli.json`, and `apps/api/tsconfig*.json`; verify all referenced configs resolve.
- [x] T003 [P] Configure strict shared TypeScript settings in `tsconfig.base.json`; verify `strict`, `noUncheckedIndexedAccess`, and safe module settings are enabled.
- [x] T004 [P] Configure deterministic formatting and linting in `prettier.config.mjs`, `.prettierignore`, and `eslint.config.mjs`; verify check commands never rewrite files.
- [x] T005 [P] Create safe repository/container exclusions in `.gitignore` and `.dockerignore` plus a non-secret `.env.example`; verify local secrets, dependencies, outputs, coverage, and generated Prisma code are excluded while examples remain trackable.
- [x] T006 [P] Create reproducible local PostgreSQL and API build definitions in `compose.yaml` and `apps/api/Dockerfile`; verify `docker compose config --quiet` when Docker is available.
- [x] T007 Install pinned dependencies and generate `pnpm-lock.yaml`; verify `pnpm install --frozen-lockfile` succeeds after lock generation.

**Checkpoint**: The workspace can install reproducibly and static tooling has a safe baseline.

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish application composition, configuration, database lifecycle, and test harnesses shared by all stories.

- [x] T008 Create the platform/module directory structure and composition shell in `apps/api/src/app.module.ts`, `apps/api/src/bootstrap/`, `apps/api/src/platform/`, and `apps/api/src/modules/health/`; verify no commerce capability directory exists.
- [x] T009 [P] Implement typed, fail-fast Zod environment validation and safe diagnostics in `apps/api/src/platform/config/environment.ts` and `apps/api/src/platform/config/environment.spec.ts`; verify invalid values fail without echoing secrets. (M01-FR-014–016)
- [x] T010 [P] Configure Prisma 7 without business models in `prisma/schema.prisma`, `prisma.config.ts`, and generated output under `apps/api/src/generated/prisma/`; verify `prisma generate`, `prisma validate`, and schema inspection show no business entity. (M01-FR-009–013)
- [x] T011 Implement the owned Prisma/database lifecycle and bounded probe in `apps/api/src/platform/database/database.service.ts` and `database.module.ts`; verify connect, probe timeout, and close are one owned lifecycle. (M01-FR-009, M01-FR-018)
- [x] T012 Implement application availability transitions in `apps/api/src/platform/availability/application-availability.service.ts` and its unit test; verify STARTING, READY, DEGRADED, SHUTTING_DOWN, and STOPPED transitions match `data-model.md`.
- [x] T013 Create the shared application factory and fail-fast bootstrap in `apps/api/src/bootstrap/create-application.ts` and `apps/api/src/main.ts`; verify an initial failed database probe exits non-zero before HTTP bind. (M01-FR-006, M01-FR-014)
- [x] T014 [P] Configure separate Jest unit, integration, E2E, and process projects in `jest.config.ts` and `test/config/`; verify each suite is independently discoverable. (M01-FR-031–034)
- [x] T015 [P] Add guarded database test utilities in `test/helpers/database-guard.ts`; verify non-test, non-local, or incorrectly suffixed database URLs are rejected without database mutation. (M01-FR-034)

**Checkpoint**: Shared configuration and database startup behavior are independently testable; user-story work may begin.

## Phase 3: User Story 1 - Start a Consistent Backend Workspace (Priority: P1) 🎯 MVP

**Goal**: A developer can install, inspect, build, and validate a strict modular NestJS workspace through consistent commands.

**Independent Test**: From a clean checkout run install, format check, lint, boundary check, typecheck, unit tests, and build; inspect the tree for zero commerce modules.

- [x] T016 [P] [US1] Add allowed and forbidden boundary fixtures in `test/fixtures/boundaries/` before enforcement; verify the fixtures represent public and private imports. (M01-FR-005)
- [x] T017 [US1] Implement automated public-module boundary enforcement in `eslint.config.mjs` and `scripts/check-boundaries.mjs`; verify the allowed fixture passes and forbidden fixture is rejected. (M01-FR-005–007)
- [x] T018 [US1] Wire deterministic root quality scripts in `package.json`; verify `format:check`, `lint`, `boundaries:check`, `typecheck`, `test:unit`, `build`, and `verify` return meaningful exit codes. (M01-FR-003–004)
- [x] T019 [US1] Add repository-scope and excluded-domain inspection in `scripts/check-repository-hygiene.mjs`; verify unsafe tracked patterns and commerce module names fail the check. (M01-FR-007, M01-FR-038–042)

**Checkpoint**: US1 is independently usable as a strict, business-empty workspace.

## Phase 4: User Story 2 - Run Safely Against a Local Database (Priority: P1)

**Goal**: A developer can start PostgreSQL, validate configuration, apply reviewed migrations, and observe safe startup/runtime database behavior.

**Independent Test**: With dedicated test databases, apply migrations twice, start successfully, prove initial database failure exits before bind, then prove a post-start outage degrades and recovers readiness.

- [x] T020 [P] [US2] Add database/configuration unit tests in `apps/api/src/platform/database/database.service.spec.ts` and expand `environment.spec.ts`; verify success, timeout, malformed URL, and secret-redaction cases fail before implementation if behavior is absent.
- [x] T021 [P] [US2] Add the reviewed baseline migration artifact in `prisma/migrations/00000000000000_foundation/migration.sql` and `prisma/migrations/migration_lock.toml`; verify it contains no business table and is repeat-deploy safe. (M01-FR-010–013)
- [x] T022 [US2] Implement guarded PowerShell-compatible database wait and migration scripts in `scripts/db-wait.mjs`, `scripts/prisma-migrate-create.mjs`, and `package.json`; verify no normal command performs reset, `db push`, or startup migration. (M01-FR-011–013)
- [x] T023 [US2] Add PostgreSQL/Prisma integration coverage in `test/integration/database.integration.spec.ts`; verify real probe, migration status/deploy repetition, outage, recovery, and isolated cleanup when Docker is available. (M01-FR-032–034)
- [x] T024 [US2] Add process startup tests in `test/process/startup.process.spec.ts`; verify unreachable PostgreSQL causes non-zero exit before port bind and produces no secret. (M01-FR-014–016)

**Checkpoint**: US2 proves migration safety and the approved initial-startup policy without destructive operations.

## Phase 5: User Story 3 - Observe and Integrate Safely (Priority: P2)

**Goal**: Operators receive versioned health contracts, bounded readiness, safe errors, correlation, redacted structured logs, and graceful shutdown.

**Independent Test**: Exercise healthy, runtime outage/recovery, unknown route, unsupported version, controlled error, correlation, OpenAPI, and shutdown scenarios.

- [x] T025 [P] [US3] Add unit tests for correlation acceptance/replacement and log redaction in `apps/api/src/platform/observability/correlation.spec.ts` and `redaction.spec.ts`. (M01-FR-026–029)
- [x] T026 [P] [US3] Add unit tests for safe error mapping and availability behavior in `apps/api/src/platform/http/safe-exception.filter.spec.ts` and `availability.spec.ts`. (M01-FR-023–025)
- [x] T027 [US3] Implement request correlation and structured Pino logging in `apps/api/src/platform/observability/`; verify UUID propagation, concurrency isolation, allowlisted fields, and configured redaction. (M01-FR-026–029)
- [x] T028 [US3] Implement the shared safe error envelope and no-store operational headers in `apps/api/src/platform/http/`; verify 404, 500, and 503 responses contain no raw causes or secrets. (M01-FR-019, M01-FR-023–025)
- [x] T029 [US3] Implement liveness/readiness controllers and fresh bounded PostgreSQL probes in `apps/api/src/modules/health/`; verify liveness never probes the database and readiness recovers only after a successful fresh probe. (M01-FR-017–020)
- [x] T030 [US3] Configure `/api/v1` URI versioning and Swagger generation in `apps/api/src/bootstrap/create-application.ts` and `apps/api/src/platform/openapi/openapi.ts`; verify only the two approved health operations are generated. (M01-FR-021–022)
- [x] T031 [US3] Implement deterministic OpenAPI generation/drift and response validation in `scripts/openapi-check.mjs`, `scripts/openapi-generate.mjs`, and `openapi/openapi.json`; verify the document validates and matches observed 200/404/503 responses. (M01-FR-022)
- [x] T032 [US3] Implement bounded graceful shutdown and traffic rejection in `apps/api/src/platform/shutdown/` and bootstrap wiring; verify readiness becomes 503, new work is rejected, resources close, and exit completes within ten seconds. (M01-FR-030)
- [x] T033 [US3] Add E2E and process coverage in `test/e2e/health.e2e.spec.ts`, `test/e2e/errors.e2e.spec.ts`, and `test/process/shutdown.process.spec.ts`; verify runtime outage/recovery, contract, versioning, redaction, and SIGTERM behavior. (M01-FR-033)

**Checkpoint**: US3 exposes only the approved operational interface and proves safe runtime behavior.

## Phase 6: User Story 4 - Verify Every Change Before Merge (Priority: P2)

**Goal**: Local and CI gates reject static, test, migration, contract, security, and build regressions.

**Independent Test**: Run each documented command locally and validate CI definitions contain the same gates with PostgreSQL-backed jobs.

- [x] T034 [P] [US4] Create Linux CI quality and PostgreSQL test jobs in `.github/workflows/ci.yml`; verify clean install, formatting, lint, boundaries, typecheck, build, unit, integration, E2E, process, migration, OpenAPI, audit, and artifact-safe diagnostics are represented. (M01-FR-035–036)
- [x] T035 [P] [US4] Create Windows PowerShell portability CI in `.github/workflows/windows.yml`; verify it checks repository scripts and Compose configuration without claiming Windows 10 acceptance. (M01-FR-035–037)
- [x] T036 [US4] Add a composite `verify` orchestration in `scripts/verify.mjs` and `package.json`; verify it stops on the first failed category and identifies that category without printing environment values. (M01-FR-035–036)
- [x] T037 [US4] Run and record three complete non-destructive verification passes in `docs/progress/milestone-01.md`; acceptance requires three passes within the documented CI bound or an explicit NOT VERIFIED record. (M01-SC-008)

**Checkpoint**: US4 supplies reproducible local and hosted quality gates.

## Phase 7: User Story 5 - Follow Safe Repository Practices (Priority: P3)

**Goal**: Developers can identify secrets, generated files, migration rules, cleanup boundaries, and incident response without unsafe operations.

**Independent Test**: Inspect ignore behavior and follow documentation from setup through non-destructive cleanup without undocumented commands or usable credentials.

- [x] T038 [P] [US5] Document supported setup, commands, troubleshooting, migration recovery, safe cleanup, and secrets response in `README.md` and `docs/development/`; verify every public script is documented. (M01-FR-037, M01-FR-039)
- [x] T039 [P] [US5] Add repository hygiene and secret-canary tests in `test/unit/repository-hygiene.spec.ts`; verify common credential/private-key patterns are rejected while `.env.example` remains safe. (M01-FR-038–039)
- [x] T040 [US5] Validate the implemented workflow against `specs/001-backend-foundation/quickstart.md` and record exact results in `docs/progress/milestone-01.md`; mark host- or service-dependent checks NOT VERIFIED. (M01-SC-001–002, M01-SC-011)

**Checkpoint**: US5 makes safe repository operation reviewable and repeatable.

## Phase 8: Polish and Cross-Cutting Acceptance

- [x] T041 Reconcile generated/runtime OpenAPI with `specs/001-backend-foundation/contracts/openapi.yaml`; verify paths, methods, headers, schemas, and error examples agree exactly.
- [x] T042 Run format, lint, boundaries, typecheck, unit, build, audit, Compose, Prisma, integration, E2E, process, OpenAPI, and migration checks; record exact commands/results and mark unavailable checks NOT VERIFIED in `docs/progress/milestone-01.md`.
- [x] T043 Inspect the final tree for constitutional compliance and absence of commerce modules, Redis, BullMQ, brokers, microservices, usable secrets, and implicit resolution of HC-DEC-001–017; verify all findings are recorded in `docs/progress/milestone-01.md`.
- [x] T044 Perform the qualifying Windows 10 smoke test from `quickstart.md` and record host evidence in `docs/progress/milestone-01.md`; if no qualifying host is available, leave this task unchecked and record the acceptance blocker. Completed on 2026-10-19: the Product Owner approved this Windows 10 Pro 22H2 build 19045.6466 host as the acceptance environment (withdrawing the 2026-10-18 Windows 11 substitution) and approved PowerShell 5.1-compatible commands; smoke-test results are recorded in `docs/progress/milestone-01.md`.

## Dependencies and Execution Order

- Phase 1 is sequential where lockfile generation depends on manifests; tasks marked `[P]` touch independent files.
- Phase 2 depends on Phase 1 and blocks all user stories.
- US1 and US2 are both P1; execute US1 before US2 because its commands and boundary gates support later verification.
- US3 depends on the database/availability lifecycle from US2.
- US4 depends on US1–US3 commands and tests.
- US5 may begin after Phase 2, but its final validation depends on all preceding stories.
- Phase 8 depends on every desired user story. T044 is an external manual acceptance gate, not an implementation dependency.

## Parallel Opportunities

- T003–T006 can proceed in parallel after T001–T002.
- T009, T010, T014, and T015 modify independent configuration/test files after T008.
- Test-first tasks T020–T021 and T025–T026 can proceed in parallel within their phases.
- CI files T034 and T035 are independent after all public commands stabilize.
- Documentation T038 and hygiene tests T039 are independent.

## Implementation Strategy

1. Complete Setup and Foundational phases without adding a business entity or route.
2. Deliver US1 as the first independently verifiable workspace increment.
3. Deliver US2 and prove the distinct initial-startup and runtime-outage policies.
4. Deliver US3 operational APIs and contract verification.
5. Add CI, documentation, and final non-destructive acceptance evidence.
6. Never perform a destructive database operation, deploy externally, or commit/push as part of these tasks.

## Acceptance Remediation Status (2026-10-18)

- The focused remediation pass corrected the audited implementation, coverage, boundary-check, and
  documentation defects without adding a commerce capability or resolving an `HC-DEC-*` item.
- The independently recorded task count was **41 of 44**. T037, T042, and T044 intentionally
  remained unchecked until the Docker-backed final baseline, three complete passes, and qualifying
  Windows 10 acceptance run were executed and recorded.
- Exact current and historical evidence is maintained in `docs/progress/milestone-01.md`.

## Final Acceptance Status (2026-10-19)

- The independently recorded task count is **44 of 44**.
- T037: three consecutive complete verification passes finished (3.5 min / 2.8 min / 2.7 min,
  all within the documented CI bound); an earlier pre-outage run was interrupted by a power
  outage, treated as failed, and its pass count restarted.
- T042: every listed check passed locally and is recorded command-for-command in
  `docs/progress/milestone-01.md`. Hosted CI evidence remains explicitly NOT VERIFIED because
  the repository has no commits and initial commit requires Product Owner approval.
- T044: executed on the Product Owner-approved Windows 10 Pro 22H2 build 19045.6466 host using
  approved PowerShell 5.1-compatible commands; results recorded in `docs/progress/milestone-01.md`.
- No destructive database operation, external deployment, constitution change, or commit/push
  was performed.
