---
description: "Dependency-ordered implementation tasks for Milestone 06 - Pricing and Search"
---

# Tasks: Milestone 06 - Pricing and Search

**Input**: `/specs/006-pricing-search/` design artifacts
**Scope guard**: Pricing and Search only (customer-facing search and filtering, direct product
discounts, and the effective price); no currency conversion, cart, checkout, order, payment,
reservation, tax, shipping, or notification behavior; no new dependency, configuration key,
infrastructure, error code, or public path; HC-DEC-018 recorded as an open decision; HC-DEC-009,
HC-DEC-008, HC-DEC-004, and HC-DEC-006 remain unresolved.
**Verification rule**: A task is complete only when its named files exist and its stated verification
succeeds.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: May proceed in parallel because it changes independent files after prerequisites are
  complete.
- **[US#]**: Maps the task to a specification user story.

## Phase 1: Setup (Decisions and Documentation)

- [x] T001 Record HC-DEC-018 in `docs/requirements/open-decisions.md` as the open decision for the
  form, window, and stacking rules of a direct product discount, with this milestone's conservative
  interpretation as the proposed answer. (M06-FR-011, M06-FR-012)
- [x] T002 [P] Write `specs/006-pricing-search/{spec.md, plan.md, research.md, data-model.md}` and
  this task list, following the Milestone 05 artifact conventions. (M06-FR-019)
- [x] T003 [P] Assess whether `REDACT_PATHS` in `apps/api/src/platform/observability/logging.ts`
  needs a new entry for the discount or the effective price; record the assessment. The catalog
  carries no personal data, so no change is required. (M06-FR-020)

## Phase 2: Foundational (Persistence and the Money Rule)

- [x] T004 Add the `discountBasisPoints` and `effectivePriceMinor` columns to `Product` in
  `prisma/schema.prisma` with the `products_status_effective_price_idx` index; verify
  `prisma validate`. (M06-FR-011, M06-FR-012)
- [x] T005 Create the reviewed additive migration
  `prisma/migrations/20261020200000_pricing_search/migration.sql` with the two columns, the
  backfill of the derived effective price, the three hand-added `CHECK` constraints, and the index;
  verify the SQL is additive and drops nothing. (M06-FR-012, M06-FR-013)
- [x] T006 Apply the migration to `nordhaven`, `nordhaven_integration`, and `nordhaven_e2e`, capture
  the row counts before and after, and verify they are identical; regenerate the Prisma client.
  (M06-FR-012, M06-SC-002)
- [x] T007 Implement `apps/api/src/modules/catalog/pricing.ts` with the half-up discounted amount and
  the effective price, in exact integer arithmetic, and document the rule. (M06-FR-011, M06-FR-013)
- [x] T008 [P] Add `apps/api/src/modules/catalog/pricing.spec.ts` proving the rounding rule at the
  half case, at the bounds, and against the database expression over a matrix of amounts. (M06-FR-013)

## Phase 3: Domain, Boundary, and Services

- [x] T009 Extend `apps/api/src/modules/catalog/persistence/product.repository.ts`: the discount and
  effective-price columns in the projection, the transactional recomputation on a base-price change
  and on a discount change, and the filtered listing. (M06-FR-005, M06-FR-006, M06-FR-012)
- [x] T010 [P] Extend `apps/api/src/modules/catalog/persistence/category.repository.ts` with the
  identifier lookup of a category and its direct children. (M06-FR-002)
- [x] T011 [P] Extend `apps/api/src/modules/catalog/api/catalog.support.ts` with the search-term and
  attribute-filter normalization, and add the unit tests. (M06-FR-001, M06-FR-004, M06-FR-016)
- [x] T012 Extend `apps/api/src/modules/catalog/api/catalog.request.ts` with the `SearchProductsQuery`
  schema and the `SetProductDiscountRequest` schema, and add the boundary tests. (M06-FR-010,
  M06-FR-016)
- [x] T013 Extend `apps/api/src/modules/catalog/application/product.service.ts` with the search and
  filter resolution and the discount administration. (M06-FR-002, M06-FR-003, M06-FR-010)
- [x] T014 [P] Extend `apps/api/src/modules/catalog/api/catalog.response.ts` with the discount and
  effective-price projection fields. (M06-FR-009)

## Phase 4: HTTP Surface and Contract

- [x] T015 Extend `apps/api/src/modules/catalog/api/catalog.controller.ts` so the anonymous listing
  accepts the filter parameters, and add the documented query parameters. (M06-FR-001, M06-FR-005)
- [x] T016 [P] Add the discount administration route to
  `apps/api/src/modules/catalog/api/admin-products.controller.ts`. (M06-FR-010, M06-FR-014)
- [x] T017 Extend `apps/api/src/platform/openapi/openapi.ts` with the discount operation, the
  documented parameters, the catalog tag description, and the contract version. (M06-FR-019)
- [x] T018 Update `scripts/openapi-check.mjs` with the new operation in the inventory. (M06-FR-019)
- [x] T019 Regenerate and review the committed `openapi/openapi.json`. (M06-FR-019)

## Phase 5: End-to-End and Verification

- [x] T020 [US1, US2] Add the search, filter, and discount coverage to
  `test/integration/catalog.integration.spec.ts`: every filter dimension, the effective-price
  filter, the unknown-name case, the pagination under a filter, the discount lifecycle, the
  recomputation on a base-price change, and the database constraint refusals. (M06-FR-001,
  M06-FR-012)
- [x] T021 [US1, US2, US3] Add the end-to-end journeys to `test/e2e/catalog.e2e.spec.ts`: the
  anonymous search and filter surface, the discount lifecycle, the invalid-request refusals, and the
  anonymous and customer denials. (M06-FR-014, M06-FR-016)
- [x] T022 Run the composite verification gate, the unit, integration, and end-to-end suites, and the
  migration status on all three databases. (M06-SC-005)

## Phase 6: Documentation

- [x] T023 [P] Document the Milestone 06 migration in `docs/development/migrations.md`. (M06-FR-012)
- [x] T024 [P] Add the Milestone 06 section to `README.md`. (M06-FR-019)
- [x] T025 Write `docs/progress/milestone-06.md` with the executed verification evidence. (M06-SC-005)
- [x] T026 Write `specs/006-pricing-search/quickstart.md` and
  `specs/006-pricing-search/contracts/{pricing-search-api.md, contract-verification.md}` and
  `specs/006-pricing-search/checklists/requirements.md`. (M06-FR-019)

## Dependencies

- T004 and T005 precede T006, and T006 precedes every test that touches the new columns.
- T007 precedes T009, because the repository computes the effective price with the shared rule.
- T009, T010, T011, and T012 precede T013, and T013 precedes T015 and T016.
- T017, T018, and T019 precede the end-to-end contract validation in T021.
- T021 precedes the final gate run in T022.

## Verification checkpoint 2026-10-20

- Unit: 278 passed across 29 suites.
- Integration: 116 passed across 7 suites.
- End-to-end: 47 passed across 6 suites.
- Composite `pnpm verify`: all eight categories passed.
- `prisma migrate status`: 10 migrations, up to date on `nordhaven`, `nordhaven_integration`, and
  `nordhaven_e2e`; the row counts of every application table are identical before and after the
  migration.
- The `products_effective_price_consistent`, `products_discount_basis_points_range`, and
  `products_effective_price_nonnegative` constraints were each shown to refuse a bad write and to
  accept a good one.
