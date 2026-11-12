---
description: "Dependency-ordered task list for Milestone 09 - Orders and Pre-orders"
---

# Tasks: Milestone 09 - Orders and Pre-orders

**Input**: `/specs/009-orders-preorders/` design artifacts
**Scope**: The approved development scope. The Product Owner approved the checkout, tax, order,
payment, and refund **development scope** on 2026-10-21, which resolved the decisions that govern
this milestone. This milestone implements the order aggregate, its state machine, its idempotency,
its stock hold, its cancellation rules, and the pre-order lifecycle, and it publishes the contract
the Milestone 10 payment capability consumes.
**Verification rule**: A task is complete only when its named files exist and its stated verification
succeeds.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: May proceed in parallel because it changes independent files after prerequisites are
  complete.
- **[US#]**: Maps the task to a specification user story.

## Phase 1: Specification and research

- [x] T001 Write `specs/009-orders-preorders/spec.md` with the approved development scope, the user
      stories, the functional requirements, the edge cases, the assumptions, and the activation
      blockers. (M09-FR-001, M09-FR-002, M09-FR-003)
- [x] T002 [P] Write `specs/009-orders-preorders/research.md` with the twenty findings that turn
      the approved scope into an implementation. (M09-FR-006)
- [x] T003 [P] Write `specs/009-orders-preorders/data-model.md` with the implemented order, line,
      event, and pre-order structures and their constraints. (M09-FR-005)
- [x] T004 [P] Write `specs/009-orders-preorders/contracts/order-preorder-api.md` with the
      implemented surface, the projections, the states, and the error catalogue. (M09-FR-002, M09-FR-003)
- [x] T005 [P] Write `specs/009-orders-preorders/checklists/requirements.md` and this task list.
      (M09-FR-001)

## Phase 2: The schema

- [x] T006 Add `orders`, `order_lines`, `order_events`, and `pre_orders` to
      `prisma/schema.prisma`, with the exactness, the ownership, the quantity, and the rate
      constraints, the customer-scoped idempotency key, the unique external event identifier, and
      the order-status enums. (M09-FR-005)
- [x] T007 Write the additive migration
      `prisma/migrations/20261021100000_orders_preorders/migration.sql` with every constraint
      spelled out, and apply it to the three canonical databases and the two isolated test
      databases. (M09-FR-005)
- [x] T008 Prove the migration is additive: capture the row counts of the three canonical databases
      before and after and confirm they are identical. (M09-FR-005)

## Phase 3: The upstream contracts

- [x] T009 Extend the Inventory capability's published contract with the reservation contract and
      the bundle-composition contract, so the Orders capability holds stock and records a bundle's
      composition without writing the inventory rows itself. (M09-FR-016)
- [x] T010 Implement the Inventory capability's reservation adapter, which translates the request
      into the existing atomic primitive rather than re-implementing the hold. (M09-FR-006)
- [x] T011 Implement the Inventory capability's bundle-composition reader, which resolves a FIXED
      bundle's own components and a DYNAMIC bundle's components at their approved minimum
      quantities. (M09-FR-015)
- [x] T012 Extend the Cart capability's published contract with the writer that removes the cart
      lines an order covers, so the Cart keeps ownership of the cart data. (M09-FR-021)

## Phase 4: The order capability

- [x] T013 Write `apps/api/src/modules/order/contracts.ts` with the published ledger contract, the
      order snapshot, and the settlement request and result. (M09-FR-014)
- [x] T014 Write `apps/api/src/modules/order/persistence/order.repository.ts` and
      `apps/api/src/modules/order/persistence/pre-order.repository.ts`, with the idempotent create,
      the conditional transition, the append-only event, and the external event lookup. (M09-FR-004,
      M09-FR-005)
- [x] T015 Write `apps/api/src/modules/order/application/order-transitions.ts` with the permitted
      transitions as **data**, so the state machine is one reviewable artifact. (M09-FR-005)
- [x] T016 Write `apps/api/src/modules/order/application/order.service.ts`: the idempotent
      creation, the quote revalidation, the stock hold, the snapshot, the cancellation, and the
      settlement with the late-payment race. (M09-FR-001, M09-FR-002, M09-FR-003, M09-FR-004,
      M09-FR-006, M09-FR-007, M09-FR-008, M09-FR-010, M09-FR-011)
- [x] T017 Write `apps/api/src/modules/order/application/pre-order.service.ts` with the distinct
      lifecycle, the readiness evaluation, and the cancellation. (M09-FR-011, M09-FR-012)
- [x] T018 Write the order routes: the request schemas, the response projections, the policies, the
      customer controller, and the administrative controller. (M09-FR-009, M09-FR-013)
- [x] T019 Write `apps/api/src/modules/order/order.module.ts` and `index.ts`, and register the module
      in the application module. (M09-FR-016)

## Phase 5: The published contract

- [x] T020 Add the twelve new operations, the new tag, and the version to the reviewed operation
      inventory, and regenerate the committed OpenAPI document. (M09-FR-002)
- [x] T021 Update the operation inventory, the excluded-domain list, and the excluded-module list in
      the verification scripts, and add the order coverage to the repository hygiene test.
      (M09-FR-002, M09-FR-016)

## Phase 6: Verification

- [x] T022 Write the integration suite: the snapshot, the immutability, the stock hold, the cart
      clearing, the event log, the refusal paths, the idempotency including the concurrent race, the
      cancellation, the payment settlement including the late-payment case, the pre-order, and the
      customer boundary. (M09-FR-019)
- [x] T023 Write the end-to-end suite: the authorization denials, the exact order, the repeated key,
      the missing key, the refused client price, the changed price, the cancellation, the
      cross-customer invisibility, the pre-order, and the administrative visibility. (M09-FR-019)
- [x] T024 Fix the defect the suite found: the helper that decides whether an order still holds its
      reservation had inverted semantics, so a successful payment never allocated the stock. The
      helper was renamed to `holdsReservation` so the sense is obvious. (M09-FR-007)
- [x] T025 Fix the contract drift the end-to-end suite found: the order's `statusReason` was
      documented as a plain string while the response sends `null`. (M09-FR-002)
- [x] T026 Run the complete verification: `pnpm verify` passes all eight categories, and the unit,
      integration, end-to-end, and process suites all pass. (M09-FR-019)

## Phase 7: Documentation

- [x] T027 Record the executed evidence in `docs/progress/milestone-09.md`. (M09-FR-019)
- [x] T028 Update `docs/requirements/project-overview.md` and
      `docs/architecture/architecture-overview.md` with the Milestone 09 refinement, the new
      capability, and the new published contracts. (M09-FR-006)
- [x] T029 Update the README with the Milestone 09 surface, the routes, and the recorded acceptance.
      (M09-FR-001)

## Milestone 10 (not performed by this milestone)

The following are **traceability records only**. They are not performed here, and this milestone
neither starts nor completes them.

- [ ] T030 [M10] Implement the payment provider abstraction and the deterministic local test
      provider, with the success, failure, timeout, duplicate, and delayed simulations.
      (M10-FR-002, M10-FR-003)
- [ ] T031 [M10] Implement the verified webhook processing, the durable event deduplication, the
      payment state machine, and the reconciliation. (M10-FR-004, M10-FR-005)
- [ ] T032 [M10] Implement the full and partial refunds with the cumulative amount constraints and
      the audit trail. (M10-FR-007)
- [ ] T033 [M10] Prepare the Paymob adapter interface and its contract assumptions, without
      activating a provider or claiming a production integration. (M10-FR-006)
