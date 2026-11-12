# Milestone 10 - Payments and Refunds Implementation Record

**Date**: 2026-10-21 (Africa/Cairo). **Status**: **development scope complete and locally
verified.** The provider abstraction, the deterministic non-production test provider, the verified
provider event intake, the payment state machine, the reconciliation, and the full and partial
refunds exist and are tested.

**No real payment was collected, no real refund was issued, and no live provider credential was
used or required.** The only shipped provider is a simulation that refuses to operate in a
production environment.

## Objective

Implement a provider-independent payment architecture, a safe deterministic non-production test
provider, authenticated and verified payment event processing, idempotent webhook processing, a
payment state machine, reconciliation and recovery paths, and full and partial refunds with
cumulative amount constraints.

## Why this milestone could be implemented

The Product Owner approved the checkout, tax, order, payment, and refund **development scope** on
2026-10-21, which resolved the decisions that govern this milestone:

- **HC-DEC-007** - Paymob is the preferred candidate for future Egyptian processing but is **not** an
  activated provider; the architecture is provider-independent; a safe LOCAL/TEST adapter supports
  deterministic success, failure, timeout, duplicate, and delayed-event simulations; webhook
  verification, event deduplication, idempotency, reconciliation, and refund workflows are designed
  and implemented; an unsigned or unauthenticated external payment success is never accepted; no real
  payment is collected, no real refund is issued, and no live credential is used.
- **HC-DEC-010** - customer cancellation before shipment follows the order and payment state
  machine, a refund is issued only when appropriate, and a duplicate refund is never issued.
- **HC-DEC-011** - full and partial refunds are supported with cumulative amount constraints and a
  reliable audit trail, and a duplicate refund is never issued.

## What was delivered

| Artifact                                                             | Content                                                                                                                                |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `specs/010-payments-refunds/spec.md`                                 | The specification for the approved development scope.                                                                                  |
| `specs/010-payments-refunds/research.md`                             | The twenty-one findings that turn the approved scope into an implementation.                                                           |
| `specs/010-payments-refunds/contracts/paymob-adapter-assumptions.md` | The prepared adapter interface and its **unverified** contract assumptions.                                                            |
| `apps/api/src/modules/payments/`                                     | The Payments capability: the provider abstraction, the simulation, the intake, the state machine, the refunds, and the reconciliation. |
| `apps/api/src/modules/order/contracts.ts`                            | The Orders capability's `failPayment` contract, added so a failed payment releases the hold.                                           |
| `prisma/migrations/20261021110000_payments_refunds/`                 | The additive migration with the payment's own consistency constraints.                                                                 |

## The design decisions this milestone made

1. **The provider interface is small and the provider's types never become the platform's.** The
   platform writes its payment behaviour against one interface, and the adapter maps the provider's
   vocabulary into the platform's before the platform sees it. The provider's body is documented in
   the published contract as a **free-form object**, because a provider's shape is not the platform's
   contract.
2. **The event is verified before anything changes, in a fixed order.** The signature over the
   **raw** body, then the identifier, then the shape, then the timestamp. A body altered after it
   was signed therefore fails.
3. **The deduplication is a unique index, not a check-then-write.** Two concurrent deliveries of the
   same event cannot both apply, because the second one cannot record a second event.
4. **Every provider event is recorded whatever its outcome.** An applied, a duplicated, a rejected,
   and an unknown-order event are all recorded, with a fixed, non-sensitive reason that never
   echoes an attacker's input.
5. **A payment advances the order through the Orders capability's contract.** The dependency is one
   way, so the two capabilities do not form a cycle, and the order's state and its stock allocation
   change **with** the payment's state.
6. **The refunds for one payment can never exceed the amount that was paid.** The refunded total is
   advanced with a conditional update inside the write, so two concurrent refunds cannot both
   succeed past the limit, and the database refuses an over-refunded total as a last line of defence.
7. **The platform stores no payment material.** The attempt stores the amount, the currency, the
   provider, and the provider's reference. There is **no column** for a card number, a token, or a
   credential, and the attempt's request schema has **no amount field**, so a client cannot choose
   what it is charged.
8. **The only shipped provider refuses to operate in production.** That refusal is the mechanism:
   there is no configuration that turns it off, so a production request can never collect money.
9. **The Paymob adapter is prepared as an interface and a list of unverified assumptions.** No
   Paymob behavior is implemented, no credential is read, and the signature and timestamp
   assumptions are named as the load-bearing ones, so a future implementation starts from questions
   rather than from a guess presented as a fact.

## The executed evidence

### The automated suites

| Suite       | Result                    | Command                 |
| ----------- | ------------------------- | ----------------------- |
| Unit        | **335 passed**, 34 suites | `pnpm test:unit`        |
| Integration | **205 passed**, 11 suites | `pnpm test:integration` |
| End-to-end  | **94 passed**, 10 suites  | `pnpm test:e2e`         |
| Process     | **4 passed**, 1 skipped   | `pnpm test:process`     |

The counts before this milestone were 316, 188, and 81 respectively.

### The composite verification

`pnpm verify` **passed all eight categories** in order: format, lint, boundaries, types, unit, build,
repository hygiene, and OpenAPI.

### The migration

The migration `20261021110000_payments_refunds` was applied to the three canonical databases
(`nordhaven`, `nordhaven_integration`, `nordhaven_e2e`) and to the two isolated test databases.
`prisma migrate status` reports the schema **up to date** with **fourteen** migrations on all three
canonical databases.

**The migration is additive.** Three new tables, and the row counts were captured before and after
and were **identical** in every table.

### The database constraints

Every hand-added constraint was proven to refuse the bad write against the real database:

| Constraint                                         | Bad write it refuses                            |
| -------------------------------------------------- | ----------------------------------------------- |
| `payment_attempts_amount_nonnegative`              | A negative amount                               |
| `payment_attempts_refunded_within_amount`          | A refunded total above the amount that was paid |
| `refunds_amount_positive`                          | A zero or a negative refund                     |
| `provider_events_provider_provider_event_id_key`   | The same provider event identifier twice        |
| `payment_attempts_customer_id_idempotency_key_key` | The same customer idempotency key twice         |

A valid attempt, a refunded total equal to the amount paid, and a valid refund were each
**accepted**, so the constraints refuse the bad writes rather than everything.

### The OpenAPI contract

The published contract advanced from version 0.9.0 with 93 operations to version **1.0.0** with
**103 operations**. The `openapi:check` gate passed, which asserts the operation inventory, the
authorization metadata of every route, the excluded-domain names, and **zero drift** against the
committed document.

The provider event intake is the one **public** payment route, because a provider is not an
authenticated customer. Its presence in the reviewed public-operation list is deliberate, and the
signature verification is what makes it safe.

## The bugs this milestone found and fixed

1. **A failed payment did not release the order's held stock.** The first implementation recorded
   the failure on the payment and stopped, so the order's reservation stayed held and the stock
   would never have returned to sale. The integration suite caught it, the Orders capability's
   published contract gained a `failPayment` operation, and the payment's failure path now calls it,
   so the release happens exactly once even when the failure event is delivered twice.
2. **The provider adapter could not be resolved by the container.** The provider was bound to a
   string token while the contract declared a symbol, so the application failed to start. The
   binding now uses the declared symbol.

## The remaining activation blockers

Local development completion is **not** production readiness. The following remain unapproved and
keep production checkout, payment, and tax disabled:

- **The provider contract's review and sign-off.** Paymob is a candidate, not an activated
  provider, and no provider contract has been reviewed. This is the blocker **HC-DEC-007** records.
- The merchant's exact VAT registration status and every cross-border tax obligation.
- A production tax configuration and a production destination list.
- Production shipping rules and rates. The shipping capability is Milestone 11.
- A security sign-off on the development dependency advisory.
- Hosted continuous integration. The repository has no commits, so no hosted run is claimed.

## What this milestone does not deliver

- **No real payment, no real refund, and no live credential.** The only shipped provider is the
  non-production simulation, and it refuses to operate in production. A production request cannot
  collect money.
- **No Paymob implementation.** The interface and the unverified assumptions are prepared; the
  behaviour is not written, and no production integration is claimed.
- **No shipping, label, or delivery promise.** The shipping capability is Milestone 11.
- **No customer message.** HC-DEC-014 leaves the notification channel open.
- **No returns or exchanges.** HC-DEC-012 remains open, and a refund here is a money movement, not a
  return.
- **No frontend.** The milestone delivers the API only.
