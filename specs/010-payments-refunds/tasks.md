---
description: "Dependency-ordered task list for Milestone 10 - Payments and Refunds"
---

# Tasks: Milestone 10 - Payments and Refunds

**Input**: `/specs/010-payments-refunds/` design artifacts
**Scope**: The approved development scope. The Product Owner approved the checkout, tax, order,
payment, and refund **development scope** on 2026-10-21, which resolved the decisions that govern
this milestone. This milestone implements the provider abstraction, the deterministic non-production
test provider, the verified event intake, the payment state machine, the reconciliation, and the
full and partial refunds.
**Verification rule**: A task is complete only when its named files exist and its stated verification
succeeds.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: May proceed in parallel because it changes independent files after prerequisites are
  complete.
- **[US#]**: Maps the task to a specification user story.

## Phase 1: Specification and research

- [x] T001 Write `specs/010-payments-refunds/spec.md` with the approved development scope, the user
      stories, the functional requirements, the edge cases, and the assumptions. (M10-FR-001,
      M10-FR-002, M10-FR-003)
- [x] T002 [P] Write `specs/010-payments-refunds/research.md` with the twenty-one findings that turn
      the approved scope into an implementation. (M10-FR-006)
- [x] T003 [P] Write `specs/010-payments-refunds/data-model.md` with the implemented attempt, event,
      and refund structures and their constraints. (M10-FR-005)
- [x] T004 [P] Write `specs/010-payments-refunds/contracts/payment-refund-api.md` with the
      implemented surface, the states, and the error catalogue. (M10-FR-002, M10-FR-003)
- [x] T005 [P] Write `specs/010-payments-refunds/contracts/paymob-adapter-assumptions.md` with the
      adapter interface and the **unverified** contract assumptions, without implementing a Paymob
      behaviour or claiming a production integration. (M10-FR-021)
- [x] T006 [P] Write `specs/010-payments-refunds/checklists/requirements.md` and this task list.
      (M10-FR-001)

## Phase 2: The schema

- [x] T007 Add `payment_attempts`, `provider_events`, and `refunds` to `prisma/schema.prisma`, with
      the payment and refund statuses, the provider event outcome, the exactness constraints, the
      customer-scoped idempotency keys, the unique provider event identifier, and the unique
      external event identifier. (M10-FR-005)
- [x] T008 Write the additive migration
      `prisma/migrations/20261021110000_payments_refunds/migration.sql` with every constraint
      spelled out, and apply it to the three canonical databases and the two isolated test
      databases. (M10-FR-005)
- [x] T009 Prove the migration is additive: capture the row counts of the three canonical databases
      before and after and confirm they are identical. (M10-FR-005)

## Phase 3: The provider abstraction

- [x] T010 Write `apps/api/src/modules/payments/contracts.ts` with the provider interface, the
      provider's own request and result types, and the platform's event vocabulary. (M10-FR-001,
      M10-FR-002)
- [x] T011 Write `apps/api/src/modules/payments/application/local-test-payment.provider.ts`, the
      deterministic non-production simulation, with the success, failure, timeout, duplicate, and
      delayed outcomes, the signature verification, and the refusal to operate in production.
      (M10-FR-002, M10-FR-003)
- [x] T012 Write the provider's unit tests: the availability refusal in production, the signature,
      the identifier, the shape, the timestamp, and the determinism of every simulated result.
      (M10-FR-020)

## Phase 4: The Orders capability's failure path

- [x] T013 Extend the Orders capability's published contract with `failPayment`, so a failed payment
      releases the order's held stock exactly once. (M10-FR-009)
- [x] T014 Implement the failure path in the Orders capability, with the idempotent event and the
      permitted transition. (M10-FR-009)

## Phase 5: The payment capability

- [x] T015 Write `apps/api/src/modules/payments/persistence/payment.repository.ts` and
      `prisma-errors.ts`, with the conditional transitions, the durable event deduplication, and the
      conditional refund advance. (M10-FR-005, M10-FR-007, M10-FR-010, M10-FR-011)
- [x] T016 Write `apps/api/src/modules/payments/application/payment-transitions.ts` with the
      permitted transitions as **data**. (M10-FR-006)
- [x] T017 Write `apps/api/src/modules/payments/application/payment.service.ts`: the idempotent
      attempt, the verified event application, the success and failure paths, the refund, and the
      reconciliation. (M10-FR-004, M10-FR-005, M10-FR-006, M10-FR-007, M10-FR-008, M10-FR-009,
      M10-FR-010, M10-FR-011, M10-FR-012, M10-FR-013, M10-FR-014)
- [x] T018 Write the payment routes: the request schemas, the response projections, the policies, the
      customer controller, the administrative controller, and the provider event intake.
      (M10-FR-004, M10-FR-005)
- [x] T019 Write `apps/api/src/modules/payments/payment.module.ts` and `index.ts`, bind the provider
      through its token, and register the module in the application module. (M10-FR-003, M10-FR-018)

## Phase 6: The published contract

- [x] T020 Add the ten new operations, the new tag, and the version to the reviewed operation
      inventory, and regenerate the committed OpenAPI document. (M10-FR-002)
- [x] T021 Update the operation inventory, the excluded-domain list, and the excluded-module list in
      the verification scripts, and add the payment coverage to the repository hygiene test.
      (M10-FR-002, M10-FR-018)

## Phase 7: Verification

- [x] T022 Write the integration suite: the attempt, the idempotency, the success, the duplicate, the
      race, the unknown order, the failure and the stock release, the refunds including the
      over-refund and the repeated key, and the reconciliation. (M10-FR-020)
- [x] T023 Write the end-to-end suite: the authorization denials, the attempt, the repeated key, the
      missing key, the forged and the unsigned event, the applied and the repeated event, the refund,
      the refused over-refund, the reconciliation, and the customer boundary. (M10-FR-020)
- [x] T024 Fix the defect the integration suite found: a failed payment did not release the order's
      held stock, so the Orders capability's `failPayment` contract was added and the payment's
      failure path now calls it. (M10-FR-009)
- [x] T025 Run the complete verification: `pnpm verify` passes all eight categories, and the unit,
      integration, end-to-end, and process suites all pass. (M10-FR-020)

## Phase 8: Documentation

- [x] T026 Record the executed evidence in `docs/progress/milestone-10.md`. (M10-FR-020)
- [x] T027 Update `docs/requirements/project-overview.md` and
      `docs/architecture/architecture-overview.md` with the Milestone 10 refinement, the new
      capability, and the published contracts. (M10-FR-006)
- [x] T028 Update the README with the Milestone 10 surface, the routes, and the recorded acceptance.
      (M10-FR-001)
