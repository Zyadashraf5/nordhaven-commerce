# Tasks: Milestone 11 - Shipping and Returns

**Date**: 2026-10-21

**Status**: **All tasks complete.** Every task below was executed and its acceptance is recorded in
`docs/progress/milestone-11.md`.

## Phase 0 - The safety preconditions

- **T000** Read the M06-M10 independent audit (`PROGRESS.md`, `findings.json`,
  `isolated-final-check.json`, `final-report.md`). **Done.** The audit's decision is a conditional go
  for M11-M14 on the verified isolated databases, and a no-go for the three original databases.
- **T001** Verify that Codex is no longer modifying the project. **Done.** A 120-second continuous
  fingerprint watch recorded no change, and the audit's own fingerprint algorithm reproduced the
  audited baseline exactly: `656af621683c7c0c2b80a40c4f1f227dda5350e5496378581c680cdd4e264c83`.
- **T002** Take a durable, verified source snapshot. **Done.** 440 files, every SHA-256 re-verified,
  no mismatch.
- **T003** Establish separate development and test databases on the current verified schema.
  **Done.** `hc_m11_20261021_integration` and `hc_m11_20261021_e2e`, both verified at 18 migrations,
  status 0, drift 0.
- **T004** Protect the original databases from the automated suites. **Done.** The database guard
  refuses `nordhaven`, `nordhaven_integration`, and `nordhaven_e2e` by name, and the gate runner pins
  both URLs.

## Phase 1 - The specification

- **T101** Write the specification with its scope boundaries, its user stories, its edge cases, its
  functional requirements, and its success criteria. **Done.**
- **T102** Write the research, including the dependency analysis that decided the milestone's shape.
  **Done.**
- **T103** Write the data model. **Done.**
- **T104** Write the implementation plan. **Done.**
- **T105** Write the API contract. **Done.**
- **T106** Write the requirements checklist and mark every item. **Done.**

## Phase 2 - The schema

- **T201** Write `20261021190000_shipping_returns`: the destinations, the methods, the shipments, the
  shipment lines and events, the returns, the return lines and events, with their constraints and
  indexes. **Done.**
- **T202** Write `20261021200000_order_shipping_snapshot` and then withdraw it with
  `20261021210000_order_shipping_snapshot_withdrawn`, because the design decision changed. **Done.**
- **T203** Write `20261021220000_stock_movement_reference`: the movement's business key, its unique
  index, and the `RESTOCK` reason. **Done.**
- **T204** Apply the migrations to the two isolated targets and prove the status and the drift.
  **Done.** 22 migrations, status 0, drift 0, and every applied migration's checksum matches its
  source file.

## Phase 3 - The published contracts

- **T301** Publish the Inventory capability's `INVENTORY_RESTOCK`: the contract, the service, the
  repository's atomic and idempotent restock, the module wiring, and the index export. **Done.**
- **T302** Publish the Payments capability's `PAYMENT_REFUNDS`: the contract, the service that
  resolves the order's attempt, the module wiring, and the index export. **Done.**

## Phase 4 - The Shipping capability

- **T401** Write the capability's contracts, its published interface, and its records. **Done.**
- **T402** Write the shipment and return lifecycles as data. **Done.**
- **T403** Write the repository, with every state change a conditional update and every event
  append-only. **Done.**
- **T404** Write the service: the configuration, the options, the shipment creation and its
  refusals, the lifecycle transitions, the tracking reference, the return request and its
  refusals, the decision, the cancellation, the receipt, the restock, and the refund. **Done.**
- **T405** Write the request schemas, the response projections, and the rate-limit policies.
  **Done.**
- **T406** Write the anonymous options route, the customer's routes, and the administrator's routes.
  **Done.**
- **T407** Wire the module and publish its index. **Done.**

## Phase 5 - The platform

- **T501** Add the six application error codes with their statuses and their fixed messages.
  **Done.**
- **T502** Remove the `shipping` capability from the excluded module list and from the excluded
  OpenAPI domain list. **Done.**
- **T503** Add the twenty-four operations to the reviewed inventory, the operation allow-list, and
  the anonymous operation set, and advance the OpenAPI document to 1.1.0. **Done.**
- **T504** Move the settlement currency and the environment scope to the platform's configuration
  module and keep the existing importers working. **Done.**
- **T505** Register the module in the application module. **Done.**

## Phase 6 - The tests

- **T601** Write the unit suite for the two lifecycles. **Done.** Seven cases.
- **T602** Write the integration suite. **Done.** Eighteen cases.
- **T603** Write the end-to-end suite. **Done.** Eight cases.
- **T604** Update the repository hygiene unit suite, because the pending-capability fixture changed
  from `shipping` to `review`, and add the case that proves the approved capability is allowed.
  **Done.**

## Phase 7 - The verification and the record

- **T701** Run the complete quality gate and fix every genuine failure. **Done.**
- **T702** Run the integration, end-to-end, and process suites against the isolated targets. **Done.**
- **T703** Prove the migration status, the schema drift, and the migration checksum on both isolated
  targets. **Done.**
- **T704** Write `docs/progress/milestone-11.md`, update the architecture overview, and update the
  decision register. **Done.**
- **T705** Take the milestone's verified recovery snapshot. **Done.**


## Independent corrective development tasks

- [x] T901 Verify snapshot, active-writer evidence and protected original database fingerprints.
- [x] T902 Establish three new owned databases without replaying destructive historical SQL.
- [x] T903 Correct serialized cumulative return quantity and integer money claims; add additive migration.
- [x] T904 Correct atomic physical receipt, bundle conservation and idempotent movement identity.
- [x] T905 Correct refund outcome projection and concurrent refund-key claim recovery.
- [x] T906 Retain shipping configuration facts and refuse unapproved production configuration.
- [x] T907 Execute all M11 acceptance gates and record deferred charge/tax items honestly.
