---
description: "Dependency-ordered implementation tasks for Milestone 04 - Product Catalog"
---

# Tasks: Milestone 04 - Product Catalog

**Input**: `/specs/004-product-catalog/` design artifacts
**Scope guard**: Product Catalog only (categories, brands, products, images, attributes, variants, base price); no inventory, bundle, search, filter, discount, or conversion behavior; no new dependency; no new configuration key; no resolution of HC-DEC-001 through HC-DEC-017.
**Verification rule**: A task is complete only when its named files exist and its stated verification succeeds.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: May proceed in parallel because it changes independent files after prerequisites are complete.
- **[US#]**: Maps the task to a specification user story.

## Phase 1: Setup (Error Contract, Observability, Guardrails)

- [x] T001 Add `CATEGORY_NOT_FOUND`, `BRAND_NOT_FOUND`, `PRODUCT_NOT_FOUND`, `VARIANT_NOT_FOUND` (404) and `CATALOG_CONFLICT` (409) to the closed `AppErrorCode` union with statuses, constant messages, and factories in `apps/api/src/platform/http/app-error.ts`. (M04-FR-019) — Done; lint/typecheck clean.
- [x] T002 [P] Extend `REDACT_PATHS` in `apps/api/src/platform/observability/logging.ts` for any new response field name that could carry personal data and extend `redaction.spec.ts`. (M04-FR-020) — Assessed: the catalog carries no personal data, so no new path was required; `redaction.spec.ts` unchanged (see `docs/progress/milestone-04.md`).
- [x] T003 [P] Remove `catalog` and `product` from `excludedModules` in `scripts/check-repository-hygiene.mjs` and extend `test/unit/repository-hygiene.spec.ts` to prove the catalog module is accepted while a still-excluded module is rejected. (M04-FR-021) — Done; unit suite proves catalog accepted and inventory still rejected.

## Phase 2: Foundational (Persistence)

- [x] T004 Add the `ProductStatus` enum and the `Category`, `Brand`, `Product`, `ProductImage`, `ProductAttribute`, `ProductVariant` models to `prisma/schema.prisma`; verify `pnpm prisma:validate`. (M04-FR-001, M04-FR-009) — Done; `prisma:validate` passes.
- [x] T005 Create the reviewed additive migration `pnpm prisma:migrate:create --name product_catalog`; verify the SQL is create-only. (M04-FR-005) — Done; `20261019214516_product_catalog`, create-only, with a hand-added non-negative price `CHECK`.
- [x] T006 Apply the migration and regenerate the client; verify `prisma migrate status` reports up to date on `nordhaven`, `nordhaven_integration`, and `nordhaven_e2e`. (M04-FR-005) — Done; "Database schema is up to date!" on all three.
- [x] T007 Implement `apps/api/src/modules/catalog/persistence/category.repository.ts`. (M04-FR-001–M04-FR-003) — Done.
- [x] T008 [P] Implement `apps/api/src/modules/catalog/persistence/brand.repository.ts`. (M04-FR-004) — Done.
- [x] T009 [P] Implement `apps/api/src/modules/catalog/persistence/product.repository.ts` and `persistence/prisma-errors.ts`. (M04-FR-005–M04-FR-010) — Done.
- [x] T010 [P] Add `test/helpers/catalog-database.ts` to reset the catalog tables in dependency order. (M04-FR-005) — Done.
- [x] T011 Add PostgreSQL integration coverage in `test/integration/catalog.integration.spec.ts`. (M04-FR-002, M04-FR-003, M04-FR-007, M04-FR-008, M04-FR-009, M04-FR-024) — Done; 14 tests, all green.

## Phase 3: Domain, Boundary, and Services

- [x] T012 Implement `apps/api/src/modules/catalog/api/catalog.support.ts` with the slug/SKU normalization, price and hierarchy rules, and control-character guard. (M04-FR-006, M04-FR-018) — Done.
- [x] T013 [P] Add `apps/api/src/modules/catalog/api/catalog.support.spec.ts`. (M04-FR-006, M04-FR-018) — Done.
- [x] T014 [P] Implement `apps/api/src/modules/catalog/api/catalog.request.ts` with the strict Zod boundary schemas and path parameters. (M04-FR-018) — Done.
- [x] T015 [P] Add `apps/api/src/modules/catalog/api/catalog.request.spec.ts`. (M04-FR-018) — Done.
- [x] T016 [P] Implement `apps/api/src/modules/catalog/api/catalog.response.ts` with the response DTOs and projections. (M04-FR-020) — Done.
- [x] T017 Implement `apps/api/src/modules/catalog/application/category.service.ts`. (M04-FR-001–M04-FR-003) — Done.
- [x] T018 [P] Implement `apps/api/src/modules/catalog/application/brand.service.ts`. (M04-FR-004) — Done.
- [x] T019 Implement `apps/api/src/modules/catalog/application/product.service.ts`. (M04-FR-005–M04-FR-011, M04-FR-024) — Done.
- [x] T020 [P] Add unit specs for the category, brand, and product services with repository fakes. (M04-FR-003, M04-FR-011) — Done; `application/catalog-services.spec.ts`.

## Phase 4: HTTP Surface and Contract

- [x] T021 Implement `apps/api/src/modules/catalog/api/catalog.policies.ts` with the declared read and write rate-limit policies. (M04-FR-022) — Done; `catalog.read` 300/300 s, `catalog.write` 60/900 s, both `key: 'client'`.
- [x] T022 [US1] Implement `apps/api/src/modules/catalog/api/admin-categories.controller.ts`. (M04-FR-016) — Done.
- [x] T023 [P] [US1] Implement `apps/api/src/modules/catalog/api/admin-brands.controller.ts`. (M04-FR-016) — Done.
- [x] T024 [US1] Implement `apps/api/src/modules/catalog/api/admin-products.controller.ts`. (M04-FR-016) — Done.
- [x] T025 [P] [US1] Implement `apps/api/src/modules/catalog/api/admin-variants.controller.ts`. (M04-FR-016) — Done.
- [x] T026 [US2] Implement `apps/api/src/modules/catalog/api/catalog.controller.ts` for anonymous browsing. (M04-FR-012–M04-FR-015) — Done.
- [x] T027 Wire the capability: add `catalog.module.ts` and `index.ts`, and register `CatalogModule` in `apps/api/src/app.module.ts`. (M04-FR-016) — Done.
- [x] T028 Extend `apps/api/src/platform/openapi/openapi.ts`: the catalog operations, the `Catalog` tag, and the version/description. (M04-FR-021) — Done; 23 operations, version `0.4.0`.
- [x] T029 Update `scripts/openapi-check.mjs`: the operation inventory, the anonymous allow-list, and the approved excluded-term change. (M04-FR-021) — Done; `product` removed from the excluded list.
- [x] T030 Regenerate and review the committed `openapi/openapi.json`. (M04-FR-021) — Done; 47 operations; drift check passes.

## Phase 5: End-to-End and Verification

- [x] T031 [US1, US2] Add `test/e2e/catalog.e2e.spec.ts` covering the administrator journey, anonymous browsing, unpublished non-disclosure, validation and conflict paths, and authorization denial. (M04-FR-012–M04-FR-021) — Done; 8 tests, all green.
- [x] T032 [US3] Add the rate-limit proof, the response-metadata assertions, and live OpenAPI response validation to `test/e2e/catalog.e2e.spec.ts`. (M04-FR-020, M04-FR-022) — Done.
- [x] T033 Run the composite verification gate and the affected suites on the finished tree. (M04-SC-008) — Done; `pnpm verify` 8/8, integration 44/44, e2e 33/33, process 4+1 skipped.
- [x] T034 Prove the gate still rejects a seeded contract and hygiene failure, then restore and re-run green. (M04-SC-008) — Done; seeded format/lint defect halted the gate with exit 1; restored file byte-identical and the gate re-ran green.
- [x] T035 Execute the published quickstart live and record the result. (M04-SC-001) — Done; 31/31 assertions pass, log scan clean (see `docs/progress/milestone-04.md`).

## Phase 6: Documentation

- [x] T036 Write `docs/progress/milestone-04.md` with the verification record, defects, deviations, and acceptance conclusion. — Done.
- [x] T037 Update `README.md` and `docs/development/migrations.md` for Milestone 04. — Done.
- [x] T038 Write `specs/004-product-catalog/quickstart.md` and `.specify/feature.json`. — Done.

## Dependencies

- T001–T003 precede everything.
- T004–T006 precede T007–T011.
- T007–T009 precede T017–T019; T012–T016 precede T017–T019.
- T017–T021 precede T022–T027.
- T028–T030 precede T031–T032 (the E2E suite validates against the committed document).
- T031–T032 precede T033–T035.
