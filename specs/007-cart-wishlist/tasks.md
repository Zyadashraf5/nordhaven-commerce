---
description: "Dependency-ordered implementation tasks for Milestone 07 - Cart and Wishlist"
---

# Tasks: Milestone 07 - Cart and Wishlist

**Input**: `/specs/007-cart-wishlist/` design artifacts
**Scope guard**: Cart and Wishlist only (an authenticated customer's cart of catalog SKUs with a
quantity, the last-known price, the current effective price, and the price-change signal; and a
wishlist of catalog products); no reservation, stock hold, checkout, order, payment, tax, shipping,
notification, bundle cart line, or currency-conversion behavior; no new dependency, configuration
key, infrastructure, or cross-module code import; HC-DEC-019 recorded as an open decision;
HC-DEC-004, HC-DEC-009, and HC-DEC-008 remain unresolved.
**Verification rule**: A task is complete only when its named files exist and its stated verification
succeeds.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: May proceed in parallel because it changes independent files after prerequisites are
  complete.
- **[US#]**: Maps the task to a specification user story.

## Phase 1: Setup (Decisions, Error Contract, and Documentation)

- [x] T001 Record HC-DEC-019 in `docs/requirements/open-decisions.md` as the open decision for the
  cart lifecycle, with this milestone's conservative interpretation as the proposed answer.
  (M07-FR-011, M07-FR-012)
- [x] T002 Add `CART_ITEM_NOT_FOUND` and `WISHLIST_ITEM_NOT_FOUND` (404) to the closed
  `AppErrorCode` union with their statuses, constant messages, and factories in
  `apps/api/src/platform/http/app-error.ts`. (M07-FR-011)
- [x] T003 [P] Write `specs/007-cart-wishlist/{spec.md, plan.md, research.md, data-model.md}` and
  this task list, following the Milestone 06 artifact conventions. (M07-FR-016)
- [x] T004 [P] Assess whether `REDACT_PATHS` in `apps/api/src/platform/observability/logging.ts`
  needs a new entry for the cart or the wishlist; record the assessment. Neither carries personal
  data beyond the resolved principal, so no change is required. (M07-FR-018)

## Phase 2: Foundational (Persistence)

- [x] T005 Add the `Cart`, `CartItem`, and `CustomerWishlistItem` models, the `ProductVariant.cartItems`
  and `Product.wishlistItems` relations, and the `CustomerProfile.wishlistItems` relation to
  `prisma/schema.prisma`; verify `prisma validate`. (M07-FR-002, M07-FR-003, M07-FR-019)
- [x] T006 Create the reviewed additive migration
  `prisma/migrations/20261020210000_cart_wishlist/migration.sql` with the three tables, their foreign
  keys, unique constraints, indexes, and the two hand-added `CHECK` constraints; verify the SQL drops
  nothing. (M07-FR-013, M07-FR-019)
- [x] T007 Apply the migration to `nordhaven`, `nordhaven_integration`, and `nordhaven_e2e`, capture the
  row counts before and after, and verify they are identical; regenerate the Prisma client.
  (M07-FR-013)
- [x] T008 [P] Add `test/helpers/cart-database.ts` and extend the catalog and inventory reset helpers
  so a cart line is removed before the SKU it references. (M07-FR-019)

## Phase 3: Domain, Boundary, and Services

- [x] T009 Implement `apps/api/src/modules/cart/api/cart.support.ts` with the quantity rules and the
  declared bounds, and add the unit tests. (M07-FR-003, M07-FR-012)
- [x] T010 Implement `apps/api/src/modules/cart/persistence/cart.repository.ts` with the cart and line
  persistence, the catalog read through the declared relation, and the concurrent-first-access
  handling. (M07-FR-002, M07-FR-006)
- [x] T011 Implement `apps/api/src/modules/cart/application/cart.service.ts`: read, add, set quantity, and
  remove, with the last-known price refreshed on every write and the purchasable signal.
  (M07-FR-003, M07-FR-005, M07-FR-006, M07-FR-007)
- [x] T012 [P] Implement `apps/api/src/modules/customers/persistence/wishlist.repository.ts` with the
  wishlist persistence and the catalog read through the declared relation. (M07-FR-009, M07-FR-010)
- [x] T013 [P] Implement `apps/api/src/modules/customers/application/wishlist.service.ts`: read, save, and
  remove, with the purchasable signal. (M07-FR-009, M07-FR-010, M07-FR-011)
- [x] T014 [P] Implement `apps/api/src/modules/cart/api/cart.request.ts` and
  `apps/api/src/modules/cart/api/cart.response.ts` with the strict schemas and the projections.
  (M07-FR-005, M07-FR-006, M07-FR-012)
- [x] T015 [P] Implement `apps/api/src/modules/customers/api/customers.request.ts` and
  `customers.response.ts` additions for the wishlist. (M07-FR-009, M07-FR-012)

## Phase 4: HTTP Surface and Contract

- [x] T016 Implement `apps/api/src/modules/cart/api/cart.controller.ts` and
  `apps/api/src/modules/cart/api/cart.policies.ts`. (M07-FR-001, M07-FR-017)
- [x] T017 [P] Implement `apps/api/src/modules/customers/api/wishlist.controller.ts`. (M07-FR-009,
  M07-FR-017)
- [x] T018 Wire the capability: add `cart.module.ts` and `index.ts`, register `CartModule` in
  `apps/api/src/app.module.ts`, and add the wishlist providers and controller to
  `CustomersModule`. (M07-FR-015)
- [x] T019 Extend `apps/api/src/platform/openapi/openapi.ts` with the seven operations, the `Cart` tag,
  the tag descriptions, and the contract version. (M07-FR-016)
- [x] T020 Update `scripts/openapi-check.mjs` with the new operation inventory and the narrowed
  excluded-domain list, and update `scripts/check-repository-hygiene.mjs` with the approved module
  names. (M07-FR-016)
- [x] T021 Update `test/unit/repository-hygiene.spec.ts` to prove the approved `cart` module is
  accepted while a still-excluded module directory is rejected. (M07-FR-016)
- [x] T022 Regenerate and review the committed `openapi/openapi.json`. (M07-FR-016)

## Phase 5: End-to-End and Verification

- [x] T023 [US1, US2, US3] Add `test/integration/cart-wishlist.integration.spec.ts`: the cart and wishlist
  lifecycles, the quantity merge, the price-change signal, the customer isolation, the database
  constraint refusals, the deletion protection, and the "never reserves stock" property.
  (M07-FR-003, M07-FR-006, M07-FR-014, M07-FR-019)
- [x] T024 [US1, US2, US3] Add `test/e2e/cart-wishlist.e2e.spec.ts`: the customer journeys, the
  anonymous and administrator denials, the invalid-request refusals, the customer isolation, and the
  live OpenAPI response validation. (M07-FR-001, M07-FR-014, M07-FR-017)
- [x] T025 Run the composite verification gate, the unit, integration, and end-to-end suites, and the
  migration status on all three databases. (M07-SC-005)

## Phase 6: Documentation

- [x] T026 [P] Document the Milestone 07 migration in `docs/development/migrations.md`. (M07-FR-013)
- [x] T027 [P] Add the Milestone 07 section to `README.md`. (M07-FR-016)
- [x] T028 Write `docs/progress/milestone-07.md` with the executed verification evidence. (M07-SC-005)
- [x] T029 Write `specs/007-cart-wishlist/quickstart.md` and
  `specs/007-cart-wishlist/contracts/{cart-wishlist-api.md, contract-verification.md}` and
  `specs/007-cart-wishlist/checklists/requirements.md`. (M07-FR-016)

## Dependencies

- T005 and T006 precede T007, and T007 precedes every test that touches the new tables.
- T009, T010, T011, T014, and T016 precede the cart end-to-end coverage in T024.
- T012, T013, T015, and T017 precede the wishlist coverage in T024.
- T019, T020, T021, and T022 precede the contract validation in T024.
- T024 precedes the final gate run in T025.

## Verification checkpoint 2026-10-20

- Unit: 283 passed across 30 suites.
- Integration: 143 passed across 8 suites.
- End-to-end: 55 passed across 7 suites.
- Process: 4 passed, 1 skipped (the pre-existing Windows graceful-shutdown signal test).
- Composite `pnpm verify`: all eight categories passed.
- `prisma migrate status`: 11 migrations, up to date on `nordhaven`, `nordhaven_integration`, and
  `nordhaven_e2e`; the row counts of every application table are identical before and after the
  migration.
