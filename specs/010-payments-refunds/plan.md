# Implementation Plan: Milestone 10 - Payments and Refunds

**Branch**: Not created; the repository has no commits yet | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/010-payments-refunds/spec.md`

**Status**: **Implemented and verified.** Every phase below was performed, and the evidence is
recorded in [../../docs/progress/milestone-10.md](../../docs/progress/milestone-10.md).

## Summary

Implement the **payment provider abstraction**, the **deterministic non-production test provider**,
the **verified provider event intake**, the **payment state machine**, the **reconciliation**, and
the **full and partial refunds**.

The platform already held every building block: an order with an immutable price and tax snapshot,
an atomic reservation with an idempotent lifecycle, an exact-money rule, an append-only event
pattern, and a durable audit trail in the Identity capability. The milestone added the missing
**money movement** and its safety rules on top of them.

The Product Owner approved the checkout, tax, order, payment, and refund **development scope** on
2026-10-21, which resolved the decisions that govern this milestone. The provider contract's review
remains the activation blocker.

## Technical Context

**Language/Version**: TypeScript 5.9 in strict mode on Node.js 22 (unchanged).

**Primary Dependencies**: NestJS, Prisma 7 with the PostgreSQL adapter, Zod, `@nestjs/swagger`
(unchanged). **No dependency was added.** The signature is the platform's own `node:crypto` HMAC, and
the provider abstraction is a TypeScript interface.

**Storage**: PostgreSQL, through the Payments capability's own Prisma repository.

**Testing**: Jest unit, integration (PostgreSQL), and end-to-end (in-process HTTP) suites, plus the
composite `pnpm verify` gate.

**Target Platform**: Linux server (Docker), matching the accepted foundation.

**Project Type**: Backend web service; a single deployable modular monolith.

**Observability**: Structured, correlated logs; `no-store` responses; every provider event is
recorded whatever its outcome, so a forged, a replayed, or an out-of-order delivery is auditable.

## Constitution Compliance Check

| Principle | How the milestone satisfies it                                                                                                  |
| --------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **I. Modular Monolith Boundaries** | The Payments capability is its own module. It changes an order's state through the Orders capability's **published contract**, never by writing the Orders capability's tables, so the dependency is one way and the two do not form a cycle. The `boundaries:check` gate enforces that the only cross-module import is the module index. |
| **II. Secure Identity and Mandatory Admin MFA** | Every customer route requires the `CUSTOMER` role and every administrative route requires the `ADMIN` role. The provider intake is the one **public** route, because a provider is not a customer, and it is exactly that which makes the verification load-bearing. The end-to-end suite proves an anonymous caller and a customer are both refused from the other routes. |
| **III. Server-Side Trust Enforcement** | The attempt's request schema is **strict** and has **no amount field**, so a client cannot choose what it is charged. The amount is the order's total, read through the Orders capability's contract. The provider's event is verified before anything changes. The negative paths are covered by the end-to-end suite. |
| **IV. Atomic Inventory Reservations** | The milestone creates no reservation. It **releases** the order's existing hold on a payment failure, through the Orders capability's contract and therefore the Inventory capability's own idempotent release, so a failure event delivered twice releases the stock once. |
| **V. Explicit Bundle Semantics** | The milestone does not change the bundle rules. An order's bundle composition was snapshotted in Milestone 09, and a refund refers to the payment, not to the composition. |
| **VI. Stock-Gated Pre-Order Payment** | A pre-order has no payable amount, no reservation, and no payment reference while it awaits stock, so it cannot be paid. The milestone adds no path by which one could be. |
| **VII. Idempotent Payments and Verified Webhooks** | The provider event is **verified** before any state change - the signature over the raw body, the identifier, the shape, and the timestamp - and it is **durably deduplicated** on a unique index, so a repeated, a delayed, or an out-of-order delivery applies exactly once. The reconciliation compares the platform's records with the provider's, so the provider - not a client callback - is the authority. |
| **VIII. Exact Money and Safe Database Evolution** | Every amount is an exact integer count of minor units, and the database refuses a negative amount, a zero refund, and a refunded total above the amount that was paid. The migration is **additive**: three new tables, no dropped column, no rewritten row, and the row counts before and after are identical. |
| **IX. Automated Testing at Every Boundary** | The provider's verification and determinism have unit tests, the payment, refund, and reconciliation rules have integration tests against PostgreSQL, and the customer, administrator, and provider journeys have end-to-end tests that validate the observed responses against the committed OpenAPI document. |
| **X. Observable Operations and Protected Secrets** | Every provider event is recorded whatever its outcome, with a fixed, non-sensitive reason that never echoes an attacker's input. The platform stores **no** payment material: there is no column for a card number, a token, or a credential. |
| **XI. Recorded Decisions and Open Requirements** | The approved decisions are recorded in `docs/requirements/open-decisions.md` with their remaining activation blockers, and the Paymob assumptions are recorded as **unverified**, so a future implementation starts from a known list of questions rather than from a guess presented as a fact. |
| **XII. Simplicity Before Distribution** | The milestone adds **no** service, queue, cache, broker, or new source of truth. The provider abstraction is a TypeScript interface, the event intake is a route, and the records are PostgreSQL tables the Payments capability owns. |

**Gate result**: `pnpm verify` passed all eight categories: format, lint, boundaries, types, unit,
build, repository hygiene, and OpenAPI.

## Project Structure

```
apps/api/src/modules/payments/
  contracts.ts                     the provider abstraction and the event vocabulary
  payment.module.ts
  index.ts
  api/payment.request.ts           the request schemas
  api/payment.response.ts          the response projections
  api/payment.policies.ts          the declared rate-limit policies
  api/payment.controller.ts        the customer routes
  api/admin-payment.controller.ts  the administrative routes
  api/payment-webhook.controller.ts the provider event intake
  api/payment.webhook.response.ts  the intake's projections
  application/payment-transitions.ts the permitted transitions, as data
  application/local-test-payment.provider.ts the non-production simulation
  application/payment.service.ts   the payment lifecycle
  persistence/payment.repository.ts
  persistence/prisma-errors.ts
prisma/migrations/20261021110000_payments_refunds/migration.sql
```

## The phases, and what each produced

### Phase 1 - The specification and the research

The specification for the approved development scope, twenty-one findings that turn it into an
implementation, the data model, the contract, the prepared Paymob assumptions, and the checklist.

### Phase 2 - The schema

Three new tables with their constraints, the payment and refund statuses, the provider event
outcome, the customer-scoped idempotency keys, and the unique provider event identifier. The
migration is additive, and the row counts before and after the migration are identical.

### Phase 3 - The provider abstraction

The provider interface, the platform's own event vocabulary, and the deterministic non-production
simulation with the success, failure, timeout, duplicate, and delayed outcomes, the signature
verification, and the refusal to operate in production.

### Phase Four - The Orders capability's failure path

The `failPayment` contract, so a failed payment releases the order's hold exactly once.

### Phase 5 - The payment capability

The repository with the conditional transitions, the durable event deduplication, and the
conditional refund advance; the state machine as data; the service with the idempotent attempt, the
verified event application, the success and failure paths, the refund, and the reconciliation; and
the routes.

### Phase 6 - The published contract

The ten new operations, the new tag, and the version were added to the reviewed inventory, and the
committed document was regenerated.

### Phase 7 - The verification

The unit, integration, and end-to-end suites, the defect the integration suite found, and the
complete `pnpm verify`.

### Phase 8 - The documentation

The executed evidence, the architecture refinement, the project overview, and the README.

## The risks this milestone leaves, and what contains them

| Risk                                                        | Containment                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| A forged payment success being accepted                     | The signature over the raw body is verified before anything changes, and the refusal is recorded. |
| A duplicated delivery charging twice                        | The unique index on the provider's event identifier, proven under a concurrent race. |
| A refund exceeding the amount that was paid                | The conditional advance inside the write, plus the database constraint, plus the refusal. |
| A refund being issued twice for one request                 | The unique key on the customer-scoped refund idempotency key.                   |
| The platform handling or storing a card                     | There is no column for one, and the request schema has no field for a card.      |
| A production request collecting money                       | The only shipped provider refuses to operate in production, and there is no configuration that changes it. |
| A Paymob implementation written on a wrong assumption      | The assumptions are recorded as unverified, with the signature and the timestamp named as the load-bearing ones. |

## The next phase, and why it is not this milestone's

- **Milestone 11 - Shipping and Fulfillment.** The shipping capability. The checkout already refuses
  a destination that no approved shipping rule covers, so the gate is in place before the capability
  exists, and the order's fulfilment state is already recorded.
