# Tasks: Milestone 13 - Administration and Operations

**Date**: 2026-10-21

**Status**: **All tasks complete.**

## Phase 1 - The specification

- **T101** Write the specification with its scope boundaries, its user stories, its edge cases, its
  functional requirements, and its success criteria. **Done.**
- **T102** Write the research, including the analysis of what the earlier milestones already
  delivered and what was therefore missing. **Done.**
- **T103** Write the data model, which states that the milestone adds no schema. **Done.**
- **T104** Write the implementation plan. **Done.**
- **T105** Write the API contract. **Done.**
- **T106** Write the requirements checklist and mark every item. **Done.**

## Phase 2 - The published read contracts

- **T201** Publish the Orders capability's `listAll` and `listForCustomerOf`. **Done.**
- **T202** Publish the Shipping capability's `listAll`, `listForCustomerOf`, `listAllReturns`, and
      `listReturnsForCustomerOf`. **Done.**
- **T203** Publish the Reviews capability's `listAll` and `listForCustomerOf`. **Done.**
- **T204** Publish the Notifications capability's `listAll` and `listForRecipientOf`. **Done.**
- **T205** Publish the Payments capability's new `PAYMENT_OPERATIONS` contract, with the repository
      aggregation, the service, the module wiring, and the index export. **Done.**
- **T206** Publish the Identity capability's new `IDENTITY_AUDIT` contract, with the service, the
      module wiring, and the index export. **Done.**
- **T207** Prove that every extension is additive: no existing contract member changed its meaning
      and no existing route changed. **Done.**

## Phase 3 - The Administration capability

- **T301** Write the capability's contracts. **Done.**
- **T302** Write the service: the operational picture, the customer list, the customer detail, and
      the security trail. **Done.**
- **T303** Write the request schemas and the response projections. **Done.**
- **T304** Write the controller with the four administrative routes. **Done.**
- **T305** Write the rate-limit policy. **Done.**
- **T306** Write the module and publish its index. **Done.**

## Phase 4 - The platform

- **T401** Register the module in the application module. **Done.**
- **T402** Add the `CUSTOMER_NOT_FOUND` error code with its status and its fixed message. **Done.**
- **T403** Add the four operations to the reviewed inventory, the operation allow-list, and the
      committed OpenAPI document, which advanced to 1.3.0. **Done.**
- **T404** Prove that the milestone added no schema, no migration, and no dependency. **Done.**

## Phase 5 - The tests

- **T501** Write the integration suite: the picture, the customer list and detail, the money, and
      the security trail. **Done.**
- **T502** Write the end-to-end suite: the anonymous refusal, the customer denial, the picture, the
      customer list, the unknown customer, and the audit trail. **Done.**
- **T503** Prove the administrator authentication, the multi-factor enrollment, the role boundary,
      and the recorded access decision for the milestone's own routes. **Done.**

## Phase 6 - The verification and the record

- **T601** Run the complete quality gate and fix every genuine failure. **Done.**
- **T602** Run the integration, end-to-end, and process suites against the isolated targets.
      **Done.**
- **T603** Prove the migration status, the schema drift, and the invariants on both isolated
      targets. **Done.**
- **T604** Write `docs/progress/milestone-13.md`, update the architecture overview, and update the
      decision register. **Done.**
- **T605** Take the milestone's verified recovery snapshot. **Done.**


## Independent corrective development tasks

- [x] T901 Reproduce incomplete aggregate, account and activity projections beyond500.
- [x] T902 Publish owner aggregates, safe account facts and bounded batch counts.
- [x] T903 Preserve all account/commerce identities in stable bounded keyset pages.
- [x] T904 Expose exact totals and explicit bounded-ID metadata in reviewed OpenAPI.
- [x] T905 Retain the concurrent administrative transition refusal fact.
- [x] T906 Execute integration/HTTP/full composite acceptance gates and preserve scope.
