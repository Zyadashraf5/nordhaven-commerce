---
description: "Dependency-ordered task list for Milestone 08 - Checkout and Tax"
---

# Tasks: Milestone 08 - Checkout and Tax

**Input**: `/specs/008-checkout-tax/` design artifacts
**Scope**: The approved development scope. The Product Owner approved the checkout, tax, order,
payment, and refund **development scope** on 2026-10-21, which resolved the decisions that previously
blocked this milestone. This milestone implements the tax engine and the checkout calculation. The
order aggregate and the payment lifecycle belong to Milestones 09 and 10, and this milestone
publishes the contracts they consume.
**Verification rule**: A task is complete only when its named files exist and its stated verification
succeeds.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: May proceed in parallel because it changes independent files after prerequisites are
  complete.
- **[US#]**: Maps the task to a specification user story.

## Phase 1: Specification and research

- [x] T001 Rewrite `specs/008-checkout-tax/spec.md` for the approved development scope: the scope
  boundaries, the approved decisions with their activation blockers, the user stories, the functional
  requirements, the edge cases, and the assumptions. (M08-FR-001, M08-FR-002, M08-FR-003)
- [x] T002 [P] Write `specs/008-checkout-tax/research.md` with the twenty findings that turn the
  approved scope into an implementation, each with its reasoning. (M08-FR-006)
- [x] T003 [P] Write `specs/008-checkout-tax/data-model.md` with the implemented tax rule, the
  product tax classification, the checkout destination, the cart line's owner, and the proof that the
  migration is additive. (M08-FR-005)
- [x] T004 [P] Write `specs/008-checkout-tax/contracts/checkout-tax-api.md` with the implemented
  surface, the projections, the closed blocker set, the error catalogue, and the published contracts.
  (M08-FR-002, M08-FR-003)
- [x] T005 [P] Write `specs/008-checkout-tax/checklists/requirements.md`. (M08-FR-001)
- [x] T006 Record the approved decisions in `docs/requirements/open-decisions.md`: HC-DEC-004, 005,
  006, 007, 008, 009, 010, 011, 012, 013, 014, 015, 019, and 020, each with its approved
  development scope and its remaining activation blockers. (M08-FR-004)

## Phase 2: The schema

- [x] T007 Add `tax_rules`, `tax_classifications`, and `checkout_destinations` to
  `prisma/schema.prisma`, with the `EnvironmentScope` enum, the cross-module foreign key to the
  catalog's product, the composite destination key, and the audit columns. (M08-FR-005, M08-FR-007)
- [x] T008 Alter `cart_items` so a line names a SKU **or** a bundle, with the hand-added
  exactly-one-owner check and the two unique indexes. (M08-FR-005)
- [x] T009 Write the additive migration
  `prisma/migrations/20261021090000_checkout_tax/migration.sql` with every constraint spelled out,
  and apply it to the three canonical databases and the two isolated test databases. (M08-FR-005)
- [x] T010 Prove the migration is additive: capture the row counts of the three canonical databases
  before and after and confirm they are identical. (M08-FR-005)

## Phase 3: The tax capability

- [x] T011 Write `apps/api/src/modules/tax/api/tax.support.ts` with the environment scope, the
  rounding rule, and the value schemas. (M08-FR-001, M08-FR-003)
- [x] T012 Write `apps/api/src/modules/tax/application/tax.engine.ts` as a pure function: the
  deterministic rule selection, the exclusive and inclusive treatments, the exact totals, and the
  missing-rule report. (M08-FR-003, M08-FR-004)
- [x] T013 Write `apps/api/src/modules/tax/persistence/tax.repository.ts` and
  `apps/api/src/modules/tax/persistence/prisma-errors.ts`. (M08-FR-007)
- [x] T014 Write `apps/api/src/modules/tax/application/tax.service.ts` with the administration, the
  classification resolution, and the published assessor. (M08-FR-004, M08-FR-007)
- [x] T015 Write `apps/api/src/modules/tax/contracts.ts` and `apps/api/src/modules/tax/index.ts` with
  the published assessor contract. (M08-FR-014)
- [x] T016 Write the tax administration routes: the request schemas, the response projections, the
  policies, and the controller. (M08-FR-007)
- [x] T017 Write `apps/api/src/modules/tax/tax.module.ts` and register it in the application module.
  (M08-FR-014)
- [x] T018 Add the three new error codes to the closed application error catalogue. (M08-FR-002)

## Phase 4: The upstream contracts

- [x] T019 Write `apps/api/src/modules/cart/contracts.ts` and publish the `CART_READER` contract, so
  the Checkout capability reads a cart without reaching into the cart tables. (M08-FR-014, M08-FR-017)
- [x] T020 Extend the Cart capability with the bundle line: the repository, the service, the request
  and response projections, the route, and the module wiring. (M08-FR-005)
- [x] T021 Write `apps/api/src/modules/inventory/contracts.ts` and publish the
  `INVENTORY_AVAILABILITY` contract. (M08-FR-014, M08-FR-017)
- [x] T022 Write `apps/api/src/modules/inventory/application/inventory-availability.service.ts` with
  the expiry-aware availability for a SKU, a FIXED bundle, and a DYNAMIC bundle. (M08-FR-008)

## Phase 5: The checkout capability

- [x] T023 Write `apps/api/src/modules/checkout/contracts.ts` with the quote, the closed blocker set,
  and the published quoter contract. (M08-FR-011, M08-FR-014)
- [x] T024 Write `apps/api/src/modules/checkout/api/checkout.support.ts` with the settlement currency
  and the deterministic fingerprint. (M08-FR-012, M08-FR-013)
- [x] T025 Write
  `apps/api/src/modules/checkout/persistence/checkout-destination.repository.ts`. (M08-FR-007)
- [x] T026 Write `apps/api/src/modules/checkout/application/checkout.service.ts`: the readiness
  evaluation, the line pricing, the availability check, the tax assessment, the exact totals, and the
  fingerprint. (M08-FR-008, M08-FR-009, M08-FR-010, M08-FR-012, M08-FR-013)
- [x] T027 Write the checkout routes: the request schemas, the response projections, the policies,
  the customer controller, and the destination administration controller. (M08-FR-007, M08-FR-011)
- [x] T028 Write `apps/api/src/modules/checkout/checkout.module.ts` and
  `apps/api/src/modules/checkout/index.ts`, and register the module in the application module.
  (M08-FR-014)

## Phase 6: The published contract

- [x] T029 Add the eight new operations, the two new tags, and the version to the reviewed operation
  inventory, and regenerate the committed OpenAPI document. (M08-FR-002)
- [x] T030 Update the operation inventory, the excluded-domain list, and the excluded-module list in
  the verification scripts, and add the checkout and tax coverage to the repository hygiene test.
  (M08-FR-002, M08-FR-017)

## Phase 7: Verification

- [x] T031 Write the tax engine's unit tests: the rule selection, the rounding, the inclusive and
  exclusive treatments, the exact totals, the missing-rule report, and the mixed-mode report.
  (M08-FR-020)
- [x] T032 Write the checkout support's unit tests: the fingerprint's determinism and its sensitivity
  to every material change. (M08-FR-020)
- [x] T033 Write the integration suite: the tax configuration, the destinations, and the quote with
  every blocker, the exact totals, the price change, the currency refusal, and the per-classification
  assessment. (M08-FR-020)
- [x] T034 Write the end-to-end suite: the authorization denials, the malformed request, the exact
  quote, the determinism, every blocker, the refusal of a client-supplied price, the isolation between
  customers, the administration, and the proof that a quote reserves nothing. (M08-FR-016, M08-FR-020)
- [x] T035 Fix the test-isolation defect the bundle line exposed: the reset helpers now delete the
  rows in the order the foreign keys require, and the catalog reset clears the inventory rows that
  reference a SKU. (M08-FR-020)
- [x] T036 Prove the database constraints refuse the bad writes: a cart line with both owners, a cart
  line with neither, a duplicate SKU line, a duplicate bundle line, a rate out of range, an inverted
  effective window, and a destination without a jurisdiction. (M08-FR-003, M08-FR-005)
- [x] T037 Run the complete verification: `pnpm verify` passes all eight categories, and the unit,
  integration, end-to-end, and process suites all pass. (M08-FR-020)

## Phase 8: Documentation

- [x] T038 Record the executed evidence in `docs/progress/milestone-08.md`. (M08-FR-020)
- [x] T039 Update `docs/requirements/project-overview.md` and `docs/architecture/architecture-overview.md`
  with the Milestone 08 refinement, the new capabilities, and the new published contracts.
  (M08-FR-006)
- [x] T040 Update the README with the Milestone 08 surface and the recorded acceptance. (M08-FR-001)

## Milestone 09 and 10 (not performed by this milestone)

The following are **traceability records only**. They are not performed here, and this milestone
neither starts nor completes them.

- [ ] T041 [M09] Create the order aggregate with its immutable price, tax, discount, and
  bundle-composition snapshots, and its explicit state machine. (M09-FR-001)
- [ ] T042 [M09] Implement the idempotent order creation, the stock reservation with the
  fifteen-minute window, and the cancellation and expiration rules. (M09-FR-003, M09-FR-004)
- [ ] T043 [M09] Implement the pre-order lifecycle without any upfront charge. (M09-FR-006)
- [ ] T044 [M10] Implement the payment provider abstraction, the deterministic local test provider,
  the verified webhook processing, the payment state machine, and the reconciliation. (M10-FR-002)
- [ ] T045 [M10] Implement the full and partial refunds with the cumulative amount constraints and
  the audit trail. (M10-FR-007)
