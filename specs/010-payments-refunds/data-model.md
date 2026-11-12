# Data Model: Milestone 10 - Payments and Refunds (Implemented)

**Date**: 2026-10-21

**Status**: **Implemented and verified.** Every structure below exists in `prisma/schema.prisma` and
was created by the additive migration
[`20261021110000_payments_refunds`](../../prisma/migrations/20261021110000_payments_refunds/migration.sql).

## What already exists

The payment records build on facts the platform already stored, and this section records them so the
new structures are read against reality.

| Existing fact                                     | Where it lives                                                    | Owner    |
| ------------------------------------------------- | ------------------------------------------------------------------ | -------- |
| The order and its immutable price and tax snapshot | `orders`, `order_lines`                                          | Orders   |
| The order's held stock                            | the Inventory capability's `reservations`                          | Inventory |
| The customer                                      | the Identity `users` table, as a stable identifier                 | Identity |

## New structures

### The payment attempt

```
payment_attempts
  id                 the attempt identifier
  order_id           the order the attempt pays for, as a stable identifier
  customer_id        the Identity-owned customer, as a stable identifier
  status             the state
  amount_minor       the exact integer minor units the attempt covers
  currency           the settlement currency
  provider           the provider that owns the attempt
  provider_reference the provider's own reference for the attempt
  idempotency_key    the stable business key that makes a repeated request safe
  refunded_minor     the exact integer minor units already refunded against the attempt
  last_event_id      the provider event that last changed the attempt's state
  status_reason      the reason the attempt's state changed
  created_at, updated_at
  succeeded_at, failed_at
```

**Why the platform stores no payment material.** The attempt stores the amount, the currency, the
provider, and the provider's reference. There is **no column** for a card number, a token, or a
credential, so there is nothing to leak and the platform never handles a card.

**The database constraints.**

- `payment_attempts_amount_nonnegative` refuses a negative amount.
- `payment_attempts_refunded_nonnegative` refuses a negative refunded total.
- `payment_attempts_refunded_within_amount` refuses a refunded total above the amount that was
  paid. The platform's own conditional update enforces it first; the constraint is the last line of
  defence.
- The unique key on `(customer_id, idempotency_key)` makes the idempotency **structural**: two
  customers may send the same key text and each get their own attempt, and one customer who retries
  always finds the first one.

**Why the customer has no foreign key.** HC-DEC-003 leaves account deletion and retention
unresolved, so a foreign key would imply a retention policy that has not been decided. The Cart,
the Wishlist, and the Order all store the customer the same way.

### The provider event

```
provider_events
  id                  the event identifier
  provider            the provider that delivered it
  provider_event_id   the provider's own identifier for the event
  event_type          the provider's own type name
  outcome             whether the platform applied it, ignored it as a duplicate, refused it, or
                      could not resolve an order for it
  order_id            the order the event referred to, when one was resolved
  payment_attempt_id  the attempt the event referred to, when one was resolved
  reason              the reason, when there was one
  detail              the non-sensitive detail
  created_at
```

**The unique key on `(provider, provider_event_id)` is the durable deduplication.** The platform
checks for a recorded event and applies the event only when there is none, and the uniqueness
constraint is what makes that safe when two deliveries race: the second one cannot record a second
event.

**The event is recorded whatever the outcome.** An `APPLIED`, a `DUPLICATE`, a `REJECTED`, and an
`UNKNOWN_ORDER` event are all recorded, so a forged, a replayed, or an out-of-order delivery is
auditable rather than invisible. The recorded `reason` is a fixed, non-sensitive name, so it never
echoes anything an attacker supplied.

### The refund

```
refunds
  id                 the refund identifier
  payment_attempt_id the attempt being refunded
  order_id           the order the attempt pays for
  customer_id        the Identity-owned customer, as a stable identifier
  status             the state
  amount_minor       the exact integer minor units the refund covers
  currency           the settlement currency
  reason             why the refund was issued
  idempotency_key    the stable business key that makes a repeated request safe
  provider_reference the provider's own reference for the refund
  created_at, updated_at, succeeded_at
```

**The database constraint.** `refunds_amount_positive` refuses a zero or a negative amount, so a
refund always moves something.

**The unique key on `(customer_id, idempotency_key)`** makes a repeated refund request return the
original refund rather than creating a second one.

**The cumulative limit is enforced inside the write.** The refunded total is advanced with a
conditional update that applies only while the attempt's refunded total plus the refund's amount
still fits within the amount that was paid. Two concurrent refunds therefore cannot both succeed
past the limit: the second one updates nothing and the transaction rolls back.

## The state machines

The payment attempt's states and the refund's states are **data** in
`apps/api/src/modules/payments/application/payment-transitions.ts`, so the permitted sets are
reviewable artifacts that the transition check reads.

```
PENDING    -> SUCCEEDED | FAILED | CANCELLED
SUCCEEDED  -> REFUNDED
FAILED, CANCELLED, REFUNDED are terminal

PENDING    -> SUCCEEDED | FAILED
SUCCEEDED, FAILED are terminal
```

## Data ownership

| Capability | Owns                                          | Depends on, through a published contract      |
| ---------- | --------------------------------------------- | --------------------------------------------- |
| Payments   | `payment_attempts`, `provider_events`, `refunds` | The Orders capability's ledger contract   |

The Payments capability does not reach into the Orders capability's tables: it changes an order's
state through the Orders capability's published contract, so the two capabilities do not depend on
each other.

## The migration

**Additive.** The migration creates three tables with their constraints and indexes. No table is
dropped, no column is dropped, no business row is deleted, and no existing row is rewritten. The row
counts of the three canonical databases were captured before and after and were **identical** in
every table.
