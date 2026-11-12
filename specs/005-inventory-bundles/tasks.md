---
description: "Dependency-ordered implementation tasks for Milestone 05 - Inventory and Bundles"
---

# Tasks: Milestone 05 - Inventory and Bundles

**Input**: `/specs/005-inventory-bundles/` design artifacts
**Scope guard**: Inventory and Bundles only (per-SKU stock, atomic reservations with an idempotent lifecycle, FIXED finished goods with atomic assembly/disassembly and DYNAMIC component-derived stock); no cart, checkout, order, payment, shipping, or search behavior; no new dependency; no new configuration key; HC-DEC-017 approved 2026-10-20 with Principle V amended; other open decisions remain unresolved.
**Verification rule**: A task is complete only when its named files exist and its stated verification succeeds.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: May proceed in parallel because it changes independent files after prerequisites are complete.
- **[US#]**: Maps the task to a specification user story.

## Phase 1: Setup (Error Contract, Observability, Guardrails)

- [x] T001 Add `INVENTORY_NOT_FOUND`, `RESERVATION_NOT_FOUND`, `BUNDLE_NOT_FOUND` (404) and `INVENTORY_CONFLICT` (409) to the closed `AppErrorCode` union with statuses, constant messages, and factories in `apps/api/src/platform/http/app-error.ts`. (M05-FR-014)
- [x] T002 [P] Assess whether `REDACT_PATHS` in `apps/api/src/platform/observability/logging.ts` needs a new entry for any inventory response field name; record the assessment even if no change is required. (M05-FR-010)
- [x] T003 [P] Remove `inventory` and `bundle` from `excludedModules` in `scripts/check-repository-hygiene.mjs` and extend `test/unit/repository-hygiene.spec.ts` to prove the inventory module is accepted while a still-excluded module is rejected. (M05-FR-012)

## Phase 2: Foundational (Persistence and Concurrency Primitive)

- [x] T004 Add the `ReservationStatus`, `StockMovementReason`, and `BundleKind` enums and the `InventoryItem`, `StockMovement`, `Reservation`, `ReservationLine`, `Bundle`, `BundleComponent` models to `prisma/schema.prisma`; verify `pnpm prisma:validate`. (M05-FR-001, M05-FR-004, M05-FR-006)
- [x] T005 Create the reviewed additive migration `pnpm prisma:migrate:create --name inventory_bundles`; hand-add the `CHECK` constraints (non-negative `on_hand`/`reserved`, positive `quantity`, `max_quantity >= min_quantity`) and verify the SQL is create-only. (M05-FR-001, M05-FR-013)
- [x] T006 Apply the migration and regenerate the client; verify `prisma migrate status` reports up to date on `nordhaven`, `nordhaven_integration`, and `nordhaven_e2e`. (M05-SC-006)
- [x] T007 Implement `apps/api/src/modules/inventory/persistence/inventory.repository.ts` with the conditional atomic stock update, the movement writer, and the lazy expiry of active reservations. (M05-FR-003, M05-FR-005, M05-FR-010)
- [x] T008 [P] Implement `apps/api/src/modules/inventory/persistence/reservation.repository.ts`. (M05-FR-004, M05-FR-005)
- [x] T009 [P] Implement `apps/api/src/modules/inventory/persistence/bundle.repository.ts`. (M05-FR-006, M05-FR-007)
- [x] T010 Implement `apps/api/src/modules/inventory/persistence/prisma-errors.ts` mapping constraint violations to stable codes. (M05-FR-014)
- [x] T011 [P] Add `test/helpers/inventory-database.ts` to reset the inventory, bundle, reservation, movement, and catalog tables in dependency order. (M05-FR-001)
- [x] T012 Add PostgreSQL integration coverage in `test/integration/inventory.integration.spec.ts`: persistence and constraints, the concurrency proof (N > M concurrent reservations yield exactly M successes, no negative available stock, no partial bundle hold), idempotency of every transition, lazy expiry, and bundle resolution. (M05-FR-003, M05-FR-005, M05-FR-007, M05-FR-008, M05-SC-002, M05-SC-003, M05-SC-004)

## Phase 3: Domain, Boundary, and Services

- [x] T013 Implement `apps/api/src/modules/inventory/api/inventory.support.ts` with the quantity rules and the bundle-resolution math (`floor` minimum over components, fixed and dynamic validation). (M05-FR-006, M05-FR-007, M05-FR-013)
- [x] T014 [P] Add `apps/api/src/modules/inventory/api/inventory.support.spec.ts`. (M05-FR-007, M05-FR-013)
- [x] T015 [P] Implement `apps/api/src/modules/inventory/api/inventory.request.ts` with the strict Zod boundary schemas and path parameters. (M05-FR-002, M05-FR-006)
- [x] T016 [P] Add `apps/api/src/modules/inventory/api/inventory.request.spec.ts`. (M05-FR-002)
- [x] T017 [P] Implement `apps/api/src/modules/inventory/api/inventory.response.ts` with the response DTOs and projections. (M05-FR-010)
- [x] T018 Implement `apps/api/src/modules/inventory/application/inventory.service.ts`: per-SKU stock set/adjust and the reservation lifecycle (create idempotent and atomic, read, extend, confirm, release, lazy expiry). (M05-FR-001–M05-FR-005, M05-FR-009)
- [x] T019 [P] Implement `apps/api/src/modules/inventory/application/bundle.service.ts`: bundle administration, availability resolution, and bundle reservation resolution. (M05-FR-006–M05-FR-009)
- [x] T020 [P] Add unit specs for the inventory and bundle services with repository fakes. (M05-FR-005, M05-FR-007, M05-FR-008)

## Phase 4: HTTP Surface and Contract

- [x] T021 Implement `apps/api/src/modules/inventory/api/inventory.policies.ts` with the declared read and write rate-limit policies. (M05-FR-012)
- [x] T022 [US1] Implement `apps/api/src/modules/inventory/api/admin-inventory.controller.ts`. (M05-FR-011)
- [x] T023 [P] [US2] Implement `apps/api/src/modules/inventory/api/admin-bundles.controller.ts`. (M05-FR-011)
- [x] T024 [P] [US1] Implement `apps/api/src/modules/inventory/api/admin-reservations.controller.ts`. (M05-FR-011)
- [x] T025 Wire the capability: add `inventory.module.ts` and `index.ts`, and register `InventoryModule` in `apps/api/src/app.module.ts`. (M05-FR-011)
- [x] T026 Extend `apps/api/src/platform/openapi/openapi.ts`: the inventory, bundle, and reservation operations, the `Inventory` tag, and the version/description. (M05-FR-012)
- [x] T027 Update `scripts/openapi-check.mjs`: the operation inventory, the excluded-term changes, and the unchanged anonymous allow-list. (M05-FR-012)
- [x] T028 Regenerate and review the committed `openapi/openapi.json`. (M05-FR-012)

## Phase 5: End-to-End and Verification

- [x] T029 [US1, US2] Add `test/e2e/inventory.e2e.spec.ts` covering the administrator stock journey, the reservation lifecycle over HTTP, the bundle journey, and authorization denial for both an anonymous caller and an authenticated customer. (M05-FR-011, M05-SC-008)
- [x] T030 [US3] Add the rate-limit proof, the response-metadata assertions, and live OpenAPI response validation to `test/e2e/inventory.e2e.spec.ts`. (M05-FR-012, M05-SC-007)
- [x] T031 Run the composite verification gate and the affected suites on the finished tree. (M05-SC-005)
- [x] T032 Prove the gate still rejects a seeded contract and hygiene failure, then restore and re-run green. (M05-SC-005)
- [ ] T033 Execute the published quickstart live and record the result, including a log scan for secrets. (M05-SC-001)

## Phase 6: Documentation

- [x] T034 Write `docs/progress/milestone-05.md` with the verification record, defects, deviations, blockers (HC-DEC-017, HC-DEC-004), and acceptance conclusion. — Done.
- [x] T035 Update `README.md` and `docs/development/migrations.md` for Milestone 05. — Done.
- [x] T036 Write `specs/005-inventory-bundles/quickstart.md` and set `.specify/feature.json` to `specs/005-inventory-bundles`. — Done.

## Dependencies

- Phase 1 precedes Phase 2. Phase 2 precedes Phase 3. Phase 3 precedes Phase 4. Phase 4 precedes Phase 5.
- T029–T030 precede T031–T033.
- T004–T006 (schema and migration) precede every repository task.


## Verification checkpoint 2026-10-20

HC-DEC-017 is approved and Principle V amended. See docs/progress/milestone-05.md for actual pass counts, database backups/reconciliation and the open development-dependency advisory. T033 manual published quickstart/log-scan acceptance is not claimed; the scripted HTTP journey has been executed. Hosted CI, deployment and PO acceptance remain unverified. No M06 work.
