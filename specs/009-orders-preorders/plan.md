# Implementation Plan: Milestone 09 - Orders and Pre-orders

**Branch**: Not created; the repository has no commits yet | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/009-orders-preorders/spec.md`

**Status**: **Implemented and verified.** Every phase below was performed, and the evidence is
recorded in [../../docs/progress/milestone-09.md](../../docs/progress/milestone-09.md).

## Summary

Implement the **order aggregate** and the **pre-order intent**, so a customer can place an order
that holds exactly the figures they confirmed, exactly once, with its stock held for a bounded
window, and so a customer can record an intent to buy what is not yet available without being
charged.

The platform already held every building block: an exact-money rule, a cart that reports the current
effective price, an atomic reservation primitive with an idempotent lifecycle, a deterministic
checkout quote with a fingerprint, and an immutable-snapshot principle already written into the
constitution. The milestone added the missing **commercial record** and the **state machines** on
top of them.

The Product Owner approved the checkout, tax, order, payment, and refund **development scope** on
2026-10-21, which resolved the decisions that govern this milestone. The payment provider, the
webhook verification, and the refunds are Milestones 10; this milestone publishes the contract they
consume.

## Technical Context

**Language/Version**: TypeScript 5.9 in strict mode on Node.js 22 (unchanged).

**Primary Dependencies**: NestJS, Prisma 7 with the PostgreSQL adapter, Zod, `@nestjs/swagger`
(unchanged). **No dependency was added.**

**Storage**: PostgreSQL, through the Orders capability's own Prisma repository.

**Testing**: Jest unit, integration (PostgreSQL), and end-to-end (in-process HTTP) suites, plus the
composite `pnpm verify` gate.

**Target Platform**: Linux server (Docker), matching the accepted foundation.

**Project Type**: Backend web service; a single deployable modular monolith.

**Observability**: Structured, correlated logs; `no-store` responses; every order transition is
recorded as a durable event with its actor, so the history is auditable.

## Constitution Compliance Check

| Principle | How the milestone satisfies it                                                                                                  |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **I. Modular Monolith Boundaries** | The Orders capability is its own module. It reaches the Checkout, Cart, and Inventory capabilities through their **published contracts**, exported from each owner's module index, and reaches no other capability's tables. The `boundaries:check` gate enforces that the only cross-module import is the module index. |
| **II. Secure Identity and Mandatory Admin MFA** | Every customer route requires the `CUSTOMER` role and every administrative route requires the `ADMIN` role. The end-to-end suite proves an anonymous caller and a customer are both refused. |
| **III. Server-Side Trust Enforcement** | The order request's schema is **strict**, so a client-supplied price, tax, or total does not exist in the contract and is refused with `400`. Every amount in the order is computed by the server from a recomputed quote. The negative paths are covered by the end-to-end suite. |
| **IV. Atomic Inventory Reservations** | The order holds its stock through the Inventory capability's **existing** atomic reservation primitive, keyed by the order's business key, so two concurrent orders cannot both hold the same stock. The release, the expiry, and the confirmation are all idempotent, and the concurrency case is proven by the integration suite. |
| **V. Explicit Bundle Semantics** | An order line names a SKU or a bundle and stores the bundle's **resolved composition** - a FIXED bundle's own components and a DYNAMIC bundle's components at their approved minimum quantities - so a later bundle change cannot alter the purchase. |
| **VI. Stock-Gated Pre-Order Payment** | The pre-order is a **separate aggregate** with its own lifecycle. While it awaits stock it has no payable amount, no reservation, and no payment reference, so it **cannot** be charged. The guarantee is a property of the record, not of the code path. |
| **VII. Idempotent Payments and Verified Webhooks** | The Orders capability accepts a payment only through a verified event that the Milestone 10 capability supplies, and the event's identifier is unique, so a repeated or a delayed event applies **once**. The milestone implements the receiving side; the verifying side is Milestone 10's. |
| **VIII. Exact Money and Safe Database Evolution** | Every amount is an exact integer count of minor units, and the database refuses an order whose subtotal plus its tax is not its total. The migration is **additive**: four new tables, no dropped column, no rewritten row, and the row counts before and after are identical. |
| **IX. Automated Testing at Every Boundary** | The integration suite covers the snapshot, the immutability, the idempotency including the concurrent race, the reservation, the cancellation, the settlement, and the late-payment case against PostgreSQL. The end-to-end suite covers the customer and administrator journeys and validates the observed responses against the committed OpenAPI document. |
| **X. Observable Operations and Protected Secrets** | Every response is `no-store` and correlated, and every order transition is recorded as a durable event with its actor, including a refused transition. The milestone adds no secret and no new infrastructure. |
| **XI. Recorded Decisions and Open Requirements** | The approved decisions are recorded in `docs/requirements/open-decisions.md` with their remaining activation blockers, and the specification states its assumptions explicitly, including the reservation window, the fulfilment scope, the absent pre-order deadline, and the absent customer message. |
| **XII. Simplicity Before Distribution** | The milestone adds **no** service, queue, cache, broker, or new source of truth. The order, its lines, its events, and the pre-orders are PostgreSQL tables; the stock hold is the existing reservation primitive; the pricing is the existing quote. |

**Gate result**: `pnpm verify` passed all eight categories: format, lint, boundaries, types, unit,
build, repository hygiene, and OpenAPI.

## Project Structure

```
apps/api/src/modules/order/
  contracts.ts                     the published ledger contract
  order.module.ts
  index.ts
  api/order.request.ts             the request schemas
  api/order.response.ts            the response projections
  api/order.policies.ts            the declared rate-limit policies
  api/order.controller.ts          the customer routes
  api/admin-order.controller.ts    the administrative routes
  application/order-transitions.ts the permitted transitions, as data
  application/order.service.ts     the order lifecycle
  application/pre-order.service.ts the pre-order lifecycle
  persistence/order.repository.ts
  persistence/pre-order.repository.ts
  persistence/prisma-errors.ts
prisma/migrations/20261021100000_orders_preorders/migration.sql
```

## The phases, and what each produced

### Phase 1 - The specification and the research

The specification for the approved development scope, and twenty findings that turn it into an
implementation. The findings fix the recomputed quote, the fingerprint's role, the idempotency
scoping, the data-driven state machine, the reservation sequence, the bounded failure of the
cross-capability write, the late-payment race, the immutable snapshot, the bundle composition, the
customer's ownership, the append-only event log, the distinct pre-order aggregate, and the
one-way dependency on the Milestone 10 contract.

### Phase 2 - The schema

Four new tables with their constraints, the order-status and pre-order-status enums, the
customer-scoped idempotency key, and the unique external event identifier. The migration is
additive, and the row counts before and after the migration are identical.

### Phase 3 - The upstream contracts

The Inventory capability published the reservation contract and the bundle-composition contract, and
the Cart capability published the writer. Each is an adapter over the capability's own rules, not a
re-implementation of them.

### Phase 4 - The order capability

The aggregate, the snapshot, the state machine, the idempotent creation, the cancellation, the
settlement with the late-payment race, and the distinct pre-order lifecycle.

### Phase 5 - The published contract

The twelve new operations, the new tag, and the version were added to the reviewed inventory, and
the committed document was regenerated.

### Phase 6 - The verification

The integration and end-to-end suites, the two defects they found, and the complete `pnpm verify`.

### Phase 7 - The documentation

The executed evidence, the architecture refinement, the project overview, and the README.

## The next phase, and why it is not this milestone's

- **Milestone 10 - Payments and Refunds.** The provider abstraction, the deterministic local test
  provider, the verified webhook processing, the payment state machine, the reconciliation, and the
  full and partial refunds. It consumes the `ORDER_LEDGER` contract this milestone published.
- **Milestone 11 - Shipping.** The shipping capability. The checkout already refuses a destination
  that no approved shipping rule covers, so the gate is in place before the capability exists.

## The risks this milestone leaves, and what contains them

| Risk                                                                | Containment                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| A duplicated order and a duplicated stock hold                       | The customer-scoped idempotency key, proven under a concurrent race.              |
| An order whose figures drift after the customer confirmed them        | The immutable snapshot; the order never reads its figures back.                    |
| A payment arriving after the hold lapsed consuming stock               | The `PAID_PENDING_ALLOCATION` state and the recorded discrepancy.                  |
| A pre-order being charged before its stock is available               | The pre-order has no payable amount, no reservation, and no payment reference.     |
| One customer reaching another customer's order                       | The owner check on every read and every cancellation, answered as not found.       |
| An administrator hand-editing an order                               | The administrative surface reads only; every change is a customer action or a payment outcome. |
