# Research, Plan, Tasks and Contract: Milestone 13 - Administration and Operations

**Date**: 2026-10-21

**Status**: **Executed.**

## Research

### R1 - The administrative surface for each capability already exists

Milestones 04 to 12 delivered the administrative routes for the catalog, the inventory, the bundles,
the pricing, the tax, the checkout destinations, the orders, the payments, the shipping, the
returns, the reviews, and the messages. Rebuilding them would duplicate the capabilities and create
a second path to the same rules. This milestone therefore **adds the layer that is missing**: the
operational picture, the customer administration, the financial view, and the audit trail.

### R2 - The Administration capability is a leaf consumer

It imports the Orders, Shipping, Reviews, Notifications, Payments, and Identity modules and reads
them through their published contracts. It owns no table and no rule, so it introduces no cycle and
no bypass path.

### R3 - The read contracts are the milestone's real work

The Orders capability published `findOrderById`, the Shipping capability published the option and
the record readers, the Reviews capability published the approved reviews, and the Payments and
Identity capabilities published nothing at all. The milestone therefore **adds** the read members
each capability needs, without changing a single existing member.

### R4 - The picture is a summary, never a snapshot

Nothing is stored. The picture is computed on each request from the owning capabilities' own
records, so it cannot drift from them, and there is no second source of truth to reconcile.

### R5 - The administrative surface is a read

Every money movement, stock change, and state change stays in the capability that owns the rule.
That is what makes "no unapproved live financial operation" structural rather than conventional: the
administrative surface has no operation that could move money.

### R6 - The controls are the existing ones, and the milestone proves them

Administrator authentication, the mandatory multi-factor enrollment, the role boundary, and the
recorded access decision were delivered by Milestone 01 and Milestone 02 and are enforced by the
platform's global guard order. The milestone's job is to prove them for its own routes, which the
end-to-end suite does: an anonymous caller is refused with 401, a customer is refused with 403, and
both the grant and the denial are recorded as security events.

### R7 - The customer list is the platform's own customers

The list is built from the accounts the Identity capability publishes and the commerce records the
other capabilities publish, so a customer with a record and no account is still reported, and an
account with no record is reported with zero counts.

### R8 - The money is counted by the Payments capability

The aggregation is done by the database over the Payments capability's own tables, inside the
Payments capability, and published as a contract. The Administration capability never computes a
total from a row it read itself.

## Plan

1. **The published read contracts** - the Orders ledger gains `listAll` and `listForCustomerOf`, the
   Shipping fulfilment gains `listAll`, `listForCustomerOf`, `listAllReturns`, and
   `listReturnsForCustomerOf`, the Reviews library gains `listAll` and `listForCustomerOf`, the
   Notifications sender gains `listAll` and `listForRecipientOf`, the Payments capability gains the
   new `PAYMENT_OPERATIONS` contract with the financial summary, and the Identity capability gains
   the new `IDENTITY_AUDIT` contract with the account list and the security trail.
2. **The Administration capability** - the service that assembles the picture, the customer list,
   and the customer detail, the controller with the four routes, the request schemas, the response
   projections, and the rate-limit policy.
3. **The platform** - the module registration, the `CUSTOMER_NOT_FOUND` error code, the four new
   operations, and the OpenAPI document at **1.3.0**.
4. **The tests** - four integration cases and five end-to-end cases.

## Tasks

| Phase | Tasks |
| ----- | ----- |
| 1 - The specification | 6 (spec, research, data model, plan, contract, checklist) |
| 2 - The published read contracts | 7 |
| 3 - The Administration capability | 6 |
| 4 - The platform | 4 |
| 5 - The tests | 3 |
| 6 - The verification and the record | 5 |
| **Total** | **31 tasks, all complete** |

## Data Model

**The milestone adds no table, no column, and no migration.** The Administration capability stores
nothing. Its whole data model is the set of records the other capabilities own, read through their
published contracts:

| The view reports | It is read from | Through |
| ---------------- | --------------- | ------- |
| the orders by state | the Orders capability | `ORDER_LEDGER.listAll` |
| the shipments and the returns by state | the Shipping capability | `SHIPPING_FULFILLMENT.listAll`, `listAllReturns` |
| the reviews by state | the Reviews capability | `REVIEW_LIBRARY.listAll` |
| the messages by state | the Notifications capability | `NOTIFICATION_SENDER.listAll` |
| the accounts | the Identity capability | `IDENTITY_AUDIT.listAccounts` |
| the money | the Payments capability | `PAYMENT_OPERATIONS.financialSummary` |
| the security trail | the Identity capability | `IDENTITY_AUDIT.recentSecurityEvents` |

## Contract

### The routes

| Route | Operation | Authentication |
| ----- | --------- | -------------- |
| `GET /api/v1/admin/overview` | `getOperationalOverview` | administrator |
| `GET /api/v1/admin/customers` | `listCustomers` | administrator |
| `GET /api/v1/admin/customers/{customerId}` | `getCustomer` | administrator |
| `GET /api/v1/admin/audit` | `listAuditEvents` | administrator |

### The request bodies

There is none. Every route is a read, and the only query parameter is the audit trail's `limit`,
which is a bounded integer between one and two hundred.

### The response projections

| Projection | Reports |
| ---------- | ------- |
| the picture | the orders, the shipments, the returns, the reviews, and the messages **by state**, the account count, the collected money, the refunded money, the pending refund money, and the currency |
| the customer summary | the identifier, the address, the role, the account's creation time, and the order, review, shipment, and return counts |
| the customer detail | the summary and the identifiers of the customer's orders, reviews, shipments, and returns |
| the audit trail | the event type, the outcome, the actor's identifier and role, the correlation identifier, and the time |

### The error codes

| Code | Status | Meaning |
| ---- | ------ | ------- |
| `CUSTOMER_NOT_FOUND` | 404 | the platform holds no record of this customer |

The existing `UNAUTHENTICATED` and `FORBIDDEN` codes cover the access decisions.


## Independent completion verification — 22 October 2026

M13 acceptance passed on isolated26-migration targets: pnpm verify387unit/37suites, full integration312/15, administrator HTTP6/1. Evidence: C:/Users/zyad/Documents/ChatGPT/zyad ashraf/nordhaven-m11-m14-final-20261021/gates/m13-acceptance-*.log.

Three defects were reproduced before correction: global501records reported500, a known account beyond the first500 incorrectly reported unknown, and customer activity totals silently capped500. A separate deterministic shipment race demonstrated a missing refusal fact. Owner-published database aggregates now cover complete stored history. Bounded owner identity pages are merged into a UUID-keyset customer page, preserving unlinked commerce identities without introducing a global customer table or bypassing module ownership. Safe account facts and per-customer counts are queried in bounded batches. Customer detail provides exact totals and at most500 identifiers per type, explicitly marked recordsTruncated. Concurrent shipment refusal is recorded durably.

Compatibility: all previous operationIDs/statuses/fieldtypes remain. /admin/customers adds optionallimit/cursor and nextCursor; customer detail adds recordsTruncated. These are additive corrections to previously misleading reads, not role or business-policy changes. Global state counts describe persisted owner state; this operational picture is not a coordinated external accounting snapshot. No order expiry or state mutation is caused by the new aggregate/ID readers. Existing domain operation routes retain their owner rules and ADMIN/MFA guards. No schema/migration/dependency was added.
