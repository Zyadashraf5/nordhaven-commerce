# Milestone 13 - Administration and Operations Implementation Record

**Date**: 2026-10-21

**Status**: **COMPLETE for development scope.** The milestone passes every development acceptance
gate. It performs no live financial or production operation, and it activates nothing.

## Objective

Implement the administration workflows for the completed platform - the operational monitoring, the
customer administration, the financial operations, and the audit trail - within the existing
approved scope, with administrator authentication, MFA, role boundaries, audit trails, and security
controls enforced.

## Task count

| Phase                               | Tasks                      |
| ----------------------------------- | -------------------------- |
| 1 - The specification               | 6                          |
| 2 - The published read contracts    | 7                          |
| 3 - The Administration capability   | 6                          |
| 4 - The platform                    | 4                          |
| 5 - The tests                       | 3                          |
| 6 - The verification and the record | 5                          |
| **Total**                           | **31 tasks, all complete** |

## Features implemented

1. **The Administration capability**, a thin orchestration layer that imports the Orders, Shipping,
   Reviews, Notifications, Payments, and Identity modules and reads them through their published
   contracts. It owns **no** table and **no** business rule, and it therefore has no bypass path
   into another capability's persistence.
2. **The operational picture.** The orders, the shipments, the returns, the reviews, and the
   messages **by state**, the account count, the collected money, the refunded money, the pending
   refund money, and the currency. It is computed on every request, so it cannot drift from the
   capabilities it reports.
3. **The customer administration.** The customers the platform holds records for, each with their
   order, review, shipment, and return counts, and the detail view with the identifiers of their
   records.
4. **The financial operations view.** The money, aggregated by the **database over the Payments
   capability's own tables**, inside the Payments capability, and published as a contract. The
   Administration capability never computes a total from a row it read itself.
5. **The audit trail.** The platform's own security events - the authentication and authorization
   decisions - in one place, carrying no credential.
6. **The published read contracts.** The Orders ledger gained `listAll` and `listForCustomerOf`, the
   Shipping fulfilment gained `listAll`, `listForCustomerOf`, `listAllReturns`, and
   `listReturnsForCustomerOf`, the Reviews library gained `listAll` and `listForCustomerOf`, the
   Notifications sender gained `listAll` and `listForRecipientOf`, the Payments capability gained
   the new `PAYMENT_OPERATIONS` contract, and the Identity capability gained the new
   `IDENTITY_AUDIT` contract. **Every extension is additive**: no existing member changed its
   meaning and no existing route changed.
7. **The enforced controls.** Every route requires the `ADMIN` role, the administrator's session is
   protected by the mandatory multi-factor enrollment, and every access decision - a grant and a
   denial alike - is recorded as a security event.

## The executed evidence

### The automated suites

| Suite       | Result                    | Change from the M13 baseline       |
| ----------- | ------------------------- | ---------------------------------- |
| unit        | **387 passed**, 37 suites | unchanged                          |
| integration | **285 passed**, 15 suites | +4 (the administration suite)      |
| end-to-end  | **117 passed**, 14 suites | +5 (the administration HTTP suite) |
| process     | **4 passed**, 1 skipped   | unchanged                          |

The M13 baseline, taken before any implementation, was 387 unit, 281 integration, and 112
end-to-end tests passing. **Every previous test still passes.**

### The composite verification

`pnpm verify` ran its eight categories in order and **exited 0**: format, lint, module boundaries,
types, unit, build, repository hygiene, and the OpenAPI validation and drift check.

### The schema

**The milestone adds no migration.** The isolated targets still carry **23 applied migrations**,
`prisma migrate status` exits 0, `prisma migrate diff` exits 0 with no difference, and the stock,
money, and reservation invariant counts are 0. The three original databases remain at **14** applied
migrations and were not touched.

### The OpenAPI contract

The document advanced from **1.2.0** to **1.3.0** and gained **4 operations**, from 141 to 145. Every
operation is in the reviewed inventory, in the operation allow-list, and in the committed document.

## The bugs this milestone found and fixed

1. **The customer summary was immutable.** The first implementation built the customer summaries as
   frozen `CustomerSummary` records and then tried to increment their counters, which strict
   TypeScript refused. The counters are now accumulated in a mutable working record that is
   converted to the published projection on the way out.
2. **The customer list was built in two contradictory passes.** The first implementation created an
   empty summary for each record and then counted them in a second pass, which meant a customer
   created by the first pass was counted twice for the record that created them. The single pass
   that creates and counts together replaced it.
3. **The Payments capability had no read for its own money.** The administrative surface would have
   had to read the Payments capability's tables to count the money, which the ownership rules
   forbid. The `PAYMENT_OPERATIONS` contract and its repository aggregation were added instead, and
   the aggregation is done by the database inside the owning capability.
4. **The Identity capability published nothing at all.** Its module index exported only the module,
   so the account list and the security trail were unreachable from outside it. The
   `IDENTITY_AUDIT` contract and the module's exports were added.

## The outstanding dependencies

1. **The reconciliation of the three original databases** and their outstanding forward migrations,
   which Milestone 14 must schedule as a controlled rollout.
2. **The production tax, payment, and shipping activation**, which stay blocked by the open
   decisions and by the shipped providers' own refusals.
3. **The notification channel**, which stays blocked by HC-DEC-014.
4. **A finer role model**, if the merchant's organization ever needs one. The platform has two roles,
   and the milestone proves the boundary rather than inventing a model that is not approved.

## What this milestone does not deliver

- **A live financial operation from the administrative surface.** The surface is a read.
- **A stored operational snapshot.** The picture is computed, so it cannot drift.
- **A new role model, a permission matrix, or a per-administrator scope.**
- **A bulk operation, a data export, or a report scheduler.**

## The development acceptance

**Milestone 13 passes its development acceptance gates.** The specification is complete, the
implementation is complete, the API contract is published and enforced, the tests are complete and
passing, the milestone added no schema and no dependency, the previous milestones' behaviour is
unchanged, and the executed evidence is recorded above.

The milestone does **not** claim production readiness, and it performs **no** live financial or
production operation.

## Independent completion verification — 22 October 2026

M13 acceptance passed on isolated26-migration targets: pnpm verify 387 unit/37 suites, full integration 312/15, administrator HTTP 6/1. Evidence: C:/Users/zyad/Documents/ChatGPT/zyad ashraf/nordhaven-m11-m14-final-20261021/gates/m13-acceptance-\*.log.

Three defects were reproduced before correction: global501 records reported500, a known account beyond the first500 incorrectly reported unknown, and customer activity totals silently capped500. A separate deterministic shipment race demonstrated a missing refusal fact. Owner-published database aggregates now cover complete stored history. Bounded owner identity pages are merged into a UUID-keyset customer page, preserving unlinked commerce identities without introducing a global customer table or bypassing module ownership. Safe account facts and per-customer counts are queried in bounded batches. Customer detail provides exact totals and at most500 identifiers per type, explicitly marked recordsTruncated. Concurrent shipment refusal is recorded durably.

Compatibility: all previous operationIDs/statuses/fieldtypes remain. /admin/customers adds optionallimit/cursor and nextCursor; customer detail adds recordsTruncated. These are additive corrections to previously misleading reads, not role or business-policy changes. Global state counts describe persisted owner state; this operational picture is not a coordinated external accounting snapshot. No order expiry or state mutation is caused by the new aggregate/ID readers. Existing domain operation routes retain their owner rules and ADMIN/MFA guards. No schema/migration/dependency was added.

## Independent final acceptance —2026-10-22

Authoritative report:m11-m14-batch-report.md. Final416 unit/40 suites,312 integration/15,119E2E/14; Windowsprocess4 pass/1skip; actual localLinuxprocess5/2 pass. Full composite verify/OpenAPI/Prisma/compose/image build/runtime scan and non-root smoke passed. Prod audit0; full audit1 High braces; readiness15/16 thereforefailed. Source26/originals 14/12 pending; original data/backups/checksums preserved. Actual retained 51-table restore passed. M14tasks18 complete/6blocked. Production remains PARTIAL/BLOCKED; no deployment or original mutation.
