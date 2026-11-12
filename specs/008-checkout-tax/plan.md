# Implementation Plan: Milestone 08 - Checkout and Tax

**Branch**: Not created; the repository has no commits yet | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-checkout-tax/spec.md`

**Status**: **Implemented and verified.** Every phase below was performed, and the evidence is
recorded in [../../docs/progress/milestone-08.md](../../docs/progress/milestone-08.md).

## Summary

Implement the **tax** capability and the **checkout** capability, so a customer can be told exactly
what a cart costs, exactly why a cart cannot be checked out, and exactly what changed since they
last agreed to a price - and so a later milestone can create an order from a figure both the
customer and the platform agree on.

The platform already held every building block: an authenticated customer, a cart that reports the
last-known and the current price of every line, a per-SKU stock ledger with an atomic reservation
primitive, an exact-money rule with an explicit rounding boundary, and an immutable-snapshot
principle already written into the constitution. The milestone added the missing **policy** as
configuration and code: the tax rules, the approved destinations, the readiness rules, and the
deterministic totals.

The Product Owner approved the checkout, tax, order, payment, and refund **development scope** on
2026-10-21, which resolved the decisions that previously blocked the milestone. The order aggregate
and the payment lifecycle are Milestones 09 and 10; this milestone publishes the contract the Orders
capability consumes.

## Technical Context

**Language/Version**: TypeScript 5.9 in strict mode on Node.js 22 (unchanged).

**Primary Dependencies**: NestJS, Prisma 7 with the PostgreSQL adapter, Zod, `@nestjs/swagger`
(unchanged). **No dependency was added.** The tax engine is integer arithmetic, the tax
configuration is data, and the published contracts are TypeScript interfaces.

**Storage**: PostgreSQL, through the Tax and Checkout capabilities' own Prisma repositories.

**Testing**: Jest unit, integration (PostgreSQL), and end-to-end (in-process HTTP) suites, plus the
composite `pnpm verify` gate.

**Target Platform**: Linux server (Docker), matching the accepted foundation.

**Project Type**: Backend web service; a single deployable modular monolith.

**Observability**: Structured, correlated logs; `no-store` responses; the tax configuration changes
are attributable to the administrator who made them, and the tax rule and the destination carry
that identifier.

## Constitution Compliance Check

| Principle | How the milestone satisfies it                                                                                                  |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **I. Modular Monolith Boundaries** | The Tax and the Checkout capabilities are separate modules. The Checkout capability reaches the Cart, the Inventory, and the Tax through their **published contracts**, exported from each owner's module index, and reaches no other module's tables. The `boundaries:check` gate enforces that the only cross-module import is the module index. |
| **II. Secure Identity and Mandatory Admin MFA** | Every customer route requires the `CUSTOMER` role and every administrative route requires the `ADMIN` role, so the administrator's mandatory second factor applies. The end-to-end suite proves a customer is refused the administrative routes. |
| **III. Server-S Trust Enforcement** | The quote's request schema is strict, so a client-submitted price, tax, or total does not exist in the contract and is refused with `400`. Every amount in the quote is computed by the server. The negative paths are covered by the end-to-end suite. |
| **IV. Atomic Inventory Reservations** | The milestone creates **no** reservation. A quote holds no stock, and the end-to-end suite proves the on-hand and reserved counts are unchanged after a quote. The reservation itself is Milestone 09's. |
| **V. Explicit Bundle Semantics** | A cart line names a SKU or a bundle, never both and never neither, enforced by the `cart_items_exactly_one_owner` check. The availability contract distinguishes a FIXED bundle's own finished goods from a DYNAMIC bundle's component-derived capacity, and a customer may not select components arbitrarily. |
| **VI. Stock-Gated Pre-Order Payment** | Nothing in this milestone captures or settles a payment. The pre-order lifecycle is Milestone 09's. |
| **VII. Idempotent Payments and Verified Webhooks** | Nothing in this milestone touches a payment. The payment architecture is Milestone 10's. |
| **VIII. Exact Money and Safe Database Evolution** | Every amount is an exact integer count of minor units, and the tax is computed in integer arithmetic with a named, once-per-line, half-up rounding rule. The migration is **additive**: three tables, one nullable column, one new column, and no rewritten row, and the row counts before and after are identical. |
| **IX. Automated Testing at Every Boundary** | The tax engine and the fingerprint have unit tests, the configuration and the quote have integration tests against PostgreSQL, and the customer and administrator journeys have end-to-end tests that validate the observed responses against the committed OpenAPI document. |
| **X. Observable Operations and Protected Secrets** | Every response is `no-store` and correlated, and the administrative changes record the acting administrator. The milestone adds no secret and no new infrastructure. |
| **XI. Recorded Decisions and Open Requirements** | The approved decisions are recorded in `docs/requirements/open-decisions.md` with their remaining activation blockers, and the specification states its assumptions explicitly. |
| **XII. Simplicity Before Distribution** | The milestone adds **no** service, queue, cache, broker, or new source of truth. The tax engine is a pure function, the configuration is data, and the contracts are TypeScript interfaces. |

**Gate result**: `pnpm verify` passed all eight categories: format, lint, boundaries, types, unit,
build, repository hygiene, and OpenAPI.

## Project Structure

```
apps/api/src/modules/
  tax/                       the Tax capability
    api/tax.support.ts         the environment scope, the rounding rule, the value schemas
    api/tax.request.ts         the administrative request schemas
    api/tax.response.ts        the administrative response projections
    api/tax.policies.ts        the declared rate-limit policies
    api/admin-tax.controller.ts the administrative routes
    application/tax.engine.ts  the pure calculation
    application/tax.service.ts  the configuration and the published assessor
    persistence/tax.repository.ts
    contracts.ts                the published assessor contract
    tax.module.ts
    index.ts
  checkout/                  the Checkout capability
    api/checkout.support.ts     the settlement currency and the fingerprint
    api/checkout.request.ts     the request schemas
    api/checkout.response.ts    the response projections
    api/checkout.policies.ts    the declared rate-limit policies
    api/checkout.controller.ts  the customer quote route
    api/admin-checkout.controller.ts the destination administration routes
    application/checkout.service.ts the readiness evaluation and the totals
    persistence/checkout-destination.repository.ts
    contracts.ts                the published quoter contract
    checkout.module.ts
    index.ts
  cart/contracts.ts         the published cart reader
  inventory/contracts.ts     the published availability reader
prisma/migrations/20261021090000_checkout_tax/migration.sql
```

## The phases, and what each produced

### Phase 1 - The specification and the research

The specification was rewritten for the approved development scope, and twenty findings recorded how
the approved scope becomes an implementation. The findings fix the module boundary, the data
ownership, the rounding rule, the missing-rule behaviour, the fingerprint, the availability
contract, the bundle semantics, and the environment scope that keeps production disabled.

### Phase 2 - The schema

Three tables were added, one column was made nullable, and one column was added, with the
hand-written constraints. The migration is additive, and the row counts before and after the
migration are identical.

### Phase 3 - The Tax capability

The pure engine, the configuration, the administration, and the published assessor. The engine is
exhaustively unit tested because it is a pure function.

### Phase 4 - The upstream contracts

The Cart published its reader and gained the bundle line; the Inventory published its availability
reader. The availability reader releases the lapsed reservations first, so a quote never understates
what can be reserved.

### Phase 5 - The Checkout capability

The destinations, the readiness evaluation, the line pricing, the availability check, the tax
assessment, the exact totals, and the fingerprint.

### Phase 6 - The published contract

The eight new operations, the two new tags, and the version were added to the reviewed inventory,
and the committed document was regenerated.

### Phase 7 - The verification

The unit, integration, and end-to-end suites, the proof that the database constraints refuse the
bad writes, the fix of the test-isolation defect the bundle line exposed, and the complete
`pnpm verify`.

### Phase 8 - The documentation

The executed evidence, the architecture refinement, the project overview, and the README.

## The next phases, and why they are not this milestone's

- **Milestone 09 - Orders and Pre-orders.** The order aggregate, its immutable snapshots, its state
  machine, the idempotent creation, the fifteen-minute reservation, the cancellation and expiration
  rules, and the pre-order lifecycle. It consumes the `CheckoutQuoter` contract this milestone
  published.
- **Milestone 10 - Payments and Refunds.** The provider abstraction, the deterministic local test
  provider, the verified webhook processing, the payment state machine, the reconciliation, and the
  full and partial refunds. It consumes the order contract Milestone 09 publishes.
- **Milestone 11 - Shipping.** The shipping capability. The checkout already refuses a destination
  that no approved shipping rule covers, so the gate is in place before the capability exists.

## The risks this milestone leaves, and what contains them

| Risk                                                                 | Containment                                                                     |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| A production request finds a tax rule and checks out                 | The `EnvironmentScope` makes it structural: production looks only for production rules, and none exists. |
| A stale price is applied at order creation                           | The quote's fingerprint; Milestone 09 compares the fingerprint it holds against a recomputed one. |
| A missing tax rule is treated as a zero rate                          | A missing rule is a blocker, and a configured zero rate is a separate, explicit fact. |
| A customer is quoted for a destination the platform cannot serve      | The destination needs both an approved shipping rule and an approved tax rule.     |
| The quote's figures disagree with the order's figures                 | Both come from the same published `CheckoutQuoter` contract and the same engine.  |
| Availability disagrees with what the reservation would grant          | The availability contract is the Inventory capability's own, expiry-aware rule.     |
