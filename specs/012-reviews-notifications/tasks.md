# Tasks: Milestone 12 - Reviews and Notifications

**Date**: 2026-10-21

**Status**: **All tasks complete.**

## Phase 1 - The specification

- **T101** Write the specification with its scope boundaries, its user stories, its edge cases, its
  functional requirements, and its success criteria. **Done.**
- **T102** Write the research, including the analysis of what was approved and what was therefore
  not invented. **Done.**
- **T103** Write the data model. **Done.**
- **T104** Write the implementation plan and the task list. **Done.**
- **T105** Write the API contract. **Done.**
- **T106** Write the requirements checklist and mark every item. **Done.**

## Phase 2 - The schema

- **T201** Write `20261021230000_reviews_notifications`: the two review tables, the two notification
  tables, the `ReviewStatus` enum, the check constraints, the unique keys, and the indexes. **Done.**
- **T202** Apply the migration to the two isolated targets and prove the status, the drift, and the
  checksums. **Done.** 23 applied migrations, exit 0, no difference.

## Phase 3 - The Notifications capability

- **T301** Write the provider abstraction, the notification, the delivery result, and the published
  contracts. **Done.**
- **T302** Write the three transports: the memory transport, the file transport, and the transport
  that sends nothing. **Done.**
- **T303** Write the repository with the unique business key and the recorded delivery attempts.
  **Done.**
- **T304** Write the service: the record first, the delivery second, and the idempotent request.
  **Done.**
- **T305** Write the customer's and the administrator's read surfaces, the request schema, and the
  response projections. **Done.**
- **T306** Write the module, the provider binding, and the index export. **Done.**

## Phase 4 - The Reviews capability

- **T401** Write the capability's contracts and its published interface. **Done.**
- **T402** Write the repository with the conditional updates and the append-only event log. **Done.**
- **T403** Write the service: the eligibility rule, the creation, the edit, the moderation, and the
  notification of the author. **Done.**
- **T404** Write the request schemas and the response projections, including the public projection
  that carries no author identity. **Done.**
- **T405** Write the public, the customer's, and the administrator's routes. **Done.**
- **T406** Write the rate-limit policy. **Done.**
- **T407** Write the module and publish its index. **Done.**

## Phase 5 - The Orders capability's published method

- **T501** Publish `paidOrdersOf` so the Reviews capability can decide the eligibility without
      reading the Orders capability's tables. **Done.**

## Phase 6 - The platform

- **T601** Add the customer notification transport to the configuration, with the production
      restriction. **Done.**
- **T602** Add the eight application error codes with their statuses and their fixed messages.
      **Done.**
- **T603** Remove the `review` and `notification` terms from the excluded module list and from the
      excluded OpenAPI domain list, and rewrite the repository hygiene suite. **Done.**
- **T604** Add the fourteen operations to the reviewed inventory, the operation allow-list, and the
      anonymous operation set, and advance the OpenAPI document to 1.2.0. **Done.**
- **T605** Add the eight new persistence roots to the boundary check's ownership table. **Done.**

## Phase 7 - The tests

- **T701** Write the integration suite of twelve cases. **Done.**
- **T702** Write the end-to-end suite of six cases. **Done.**
- **T703** Update the configuration fixtures for the new transport. **Done.**

## Phase 8 - The verification and the record

- **T801** Run the complete quality gate and fix every genuine failure. **Done.**
- **T802** Run the integration, end-to-end, and process suites against the isolated targets. **Done.**
- **T803** Prove the migration status, the schema drift, and the checksums on both isolated targets.
      **Done.**
- **T804** Write `docs/progress/milestone-12.md` and update the architecture overview. **Done.**
- **T805** Take the milestone's verified recovery snapshot. **Done.**


## Independent corrective development tasks

- [x] T901 Reproduce review/notification races, ownership, recovery and production-binding defects.
- [x] T902 Publish exact owner purchase lookup across complete history.
- [x] T903 Serialize review creation and atomically retain moderation/notification intent.
- [x] T904 Implement durable metadata/lease/claim recovery with an additive migration.
- [x] T905 Make local adapters idempotent and production binding inert.
- [x] T906 Publish authenticated audited retry and explicit OpenAPI contracts.
- [x] T907 Wire safe local shipment/return notices with post-commit delivery.
- [x] T908 Verify rollback, lease recovery, full regression and HTTP authorization.
