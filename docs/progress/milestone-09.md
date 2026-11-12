# Milestone 09 - Orders and Pre-orders Implementation Record

**Date**: 2026-10-21 (Africa/Cairo). **Status**: **development scope complete and locally
verified.** The order aggregate, its immutable snapshots, its state machine, its recorded
transitions, the idempotent creation, the stock hold, the cancellation rules, and the pre-order
lifecycle exist and are tested. The payment provider, the webhook verification, and the refunds
belong to Milestone 10 and are **not** implemented here.

## Objective

Implement order creation with immutable snapshots, an explicit order lifecycle, idempotent order
operations, stock reservation integration and expiration, customer ownership and administrator
authorization, cancellation rules, and a pre-order lifecycle without any upfront charge.

## Why this milestone could be implemented

The Product Owner approved the checkout, tax, order, payment, and refund **development scope** on
2026-10-21, which resolved the decisions that govern this milestone:

- **HC-DEC-004** - order creation is idempotent, the order's price snapshots are immutable, a
  client-supplied price or total is never trusted, a cart never reserves stock, the initial
  pending-payment reservation window is fifteen minutes and is configurable, an expired or released
  reservation can never be consumed by a late payment event, and a payment-pending versus
  reservation-expiry race is resolved by explicit state transitions and reconciliation.
- **HC-DEC-010** - customer cancellation before shipment follows the order and payment state
  machine, a refund is issued only when appropriate, and a duplicate refund is never issued.
- **HC-DEC-015** - a pre-order is recorded under a distinct lifecycle, the customer is never charged
  before sufficient inventory is physically available and can be reserved, unavailable stock is
  never silently turned into immediately payable inventory, and no shipping or restock commitment is
  invented.

## What was delivered

| Artifact                                             | Content                                                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `specs/009-orders-preorders/spec.md`                 | The specification for the approved development scope.                                                   |
| `specs/009-orders-preorders/research.md`             | The twenty findings that turn the approved scope into an implementation.                                |
| `apps/api/src/modules/order/`                        | The Orders capability: the aggregate, the snapshots, the state machine, the idempotency, the pre-order. |
| `apps/api/src/modules/inventory/contracts.ts`        | The published reservation and bundle-composition contracts the Orders capability consumes.              |
| `apps/api/src/modules/cart/contracts.ts`             | The published cart writer, so the Cart keeps ownership of the cart data.                                |
| `prisma/migrations/20261021100000_orders_preorders/` | The additive migration with the order's own consistency constraints.                                    |

## The design decisions this milestone made

1. **The order is created from a recomputed quote, never from the client's figures.** The client may
   present the fingerprint of the quote it saw; it may never present an amount. When the recomputed
   fingerprint differs, the price moved and the order is refused with a conflict.
2. **The idempotency key is scoped to the customer.** The unique key on `(customer_id,
idempotency_key)` means two customers who send the same key text each get their own order, while
   one customer who retries always finds the first one. Five concurrent requests produce one order
   and one reservation.
3. **The permitted transitions are data, not a `switch`.** The state machine is a table the
   transition check reads, so the permitted set is one reviewable artifact and the audit trail
   cannot disagree with it.
4. **The order holds stock with the Inventory capability's existing atomic reservation**, keyed by
   the order's business key, so a retried request holds the stock exactly once. The order and the
   reservation are two records in two capabilities, and the order records the reservation's
   identifier rather than pretending the two writes are atomic.
5. **A late payment moves the order to `PAID_PENDING_ALLOCATION`,** which records that the money
   arrived and that the stock was **not** allocated. The discrepancy is recorded as an event, so the
   race is auditable rather than merely handled.
6. **The pre-order is a separate table with its own lifecycle,** not an order in another state. It
   has no payable amount, no reservation, and no payment reference while it awaits stock, so it
   **cannot** be charged.
7. **The order's event log is append-only.** A refused transition is recorded as an event while the
   order's own state is left untouched, because a customer who tried to cancel a paid order is a fact
   an operator needs.
8. **The order's snapshot is what the customer confirmed.** The price, the discount, the tax rate,
   the tax amount, the currency, the bundle composition, and the quote's fingerprint are all stored,
   so a later catalog change cannot alter a purchase.

## The executed evidence

### The automated suites

| Suite       | Result                    | Command                 |
| ----------- | ------------------------- | ----------------------- |
| Unit        | **316 passed**, 32 suites | `pnpm test:unit`        |
| Integration | **188 passed**, 10 suites | `pnpm test:integration` |
| End-to-end  | **81 passed**, 9 suites   | `pnpm test:e2e`         |
| Process     | **4 passed**, 1 skipped   | `pnpm test:process`     |

The counts before this milestone were 315, 164, and 69 respectively.

### The composite verification

`pnpm verify` **passed all eight categories** in order: format, lint, boundaries, types, unit, build,
repository hygiene, and OpenAPI.

### The migration

The migration `20261021100000_orders_preorders` was applied to the three canonical databases
(`nordhaven`, `nordhaven_integration`, `nordhaven_e2e`) and to the two isolated test databases.
`prisma migrate status` reports the schema **up to date** with **thirteen** migrations on all three
canonical databases.

**The migration is additive.** Four new tables, and the row counts were captured before and after
and were **identical** in every table.

### The OpenAPI contract

The published contract advanced from version 0.8.0 with 81 operations to version **0.9.0** with
**93 operations**. The `openapi:check` gate passed, which asserts the operation inventory, the
authorization metadata of every route, the excluded-domain names, and **zero drift** against the
committed document.

## The bugs this milestone found and fixed

1. **The order's stock-hold guard had inverted semantics.** The first version of the helper that
   decides whether an order still holds its reservation returned "holds no stock" for
   `PENDING_PAYMENT`, which is exactly the state that **does** hold it. The consequence was that a
   successful payment moved the order to `PAID_PENDING_ALLOCATION` instead of `PAID`, and the
   stock was never allocated. The integration suite caught it, the helper was renamed to
   `holdsReservation` so the sense is obvious, and the payment now allocates the stock.
2. **The order's response declared a non-nullable reason.** The `statusReason` property was
   documented as a plain string while the response sends `null` for an order that has no reason. The
   end-to-end suite's contract validation caught the drift, and the projection now declares it
   nullable.

## The remaining activation blockers

Local development completion is **not** production readiness. The following remain unapproved and
keep production checkout, payment, and tax disabled:

- The merchant's exact VAT registration status and every cross-border tax obligation.
- A production tax configuration and a production destination list.
- A reviewed payment-provider contract. The Paymob adapter interface may be prepared, but no
  provider is activated and no live credential exists.
- Production shipping rules and rates. The shipping capability is Milestone 11.
- A security sign-off on the development dependency advisory.
- Hosted continuous integration. The repository has no commits, so no hosted run is claimed.

## What this milestone does not deliver

- **No payment, refund, or provider behavior.** The payment provider abstraction, the deterministic
  local test provider, the verified webhook processing, the payment state machine, the
  reconciliation, and the full and partial refunds belong to Milestone 10. The Orders capability
  publishes the `ORDER_LEDGER` contract that Milestone 10 consumes, and the settlement path is
  already implemented and tested against it.
- **No shipping, label, or delivery promise.** The order's fulfilment state is recorded, but the
  shipping capability is Milestone 11.
- **No customer message and no pre-order deadline.** HC-DEC-014 leaves the notification channel
  open, and HC-DEC-015's approved scope does not define a deadline, so neither is invented.
- **No customer-selected dynamic bundle components.** The approved decision forbids arbitrary
  selection in this phase, and the bundle's approved composition is used.
- **No frontend.** The milestone delivers the API only.
