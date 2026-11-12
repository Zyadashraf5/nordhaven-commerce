# Research: Milestone 10 - Payments and Refunds

> Independent remediation note (2026-10-21): historical assumptions about detached transactions, constant-only order TTL, foreign root lookups and provider/refund/pre-order behavior are superseded by [the audited remediation design](../../docs/audits/m06-m10-remediation-design.md). Approved business decisions and the constitution are unchanged.

**Date**: 2026-10-21

The Product Owner approved the checkout, tax, order, payment, and refund **development scope** on
2026-10-21. This record states how the approved scope becomes an implementation, and it keeps the
distinction between a **development decision** and a **production activation** explicit.

## Findings

### R1 - The provider is behind an interface, and the interface is small

The approved decision requires a provider-independent architecture. The interface is therefore
deliberately small: create an attempt, capture it, refund it, verify a delivered event, and look a
payment up. Everything else about a provider is the adapter's business.

A small interface is what makes the abstraction real. A wide one that exposes a provider's own
vocabulary would leak that vocabulary into the payment rules, and the interface would change
whenever a provider's shape changed.

### R2 - A provider's types never become the platform's types

The event the provider delivers is mapped into the platform's vocabulary by the **adapter**, before
the platform sees it. The platform's event carries the platform's own fields: the provider's event
identifier, the platform's event type, the order, the amount, the currency, and the occurrence
time.

The consequence is that the provider's body is never a platform schema. It is the **provider's**
format, and the platform verifies it and maps it. The published OpenAPI contract therefore documents
the intake route with a free-form body, because a provider's shape is not the platform's contract.

### R3 - The verification happens before anything changes, and the order of the checks is fixed

The approved decision says an unsigned or unauthenticated external payment success is never
accepted. The checks are therefore, in order: the **signature** over the raw body, then the
**timestamp** inside the accepted window, then the **shape** of the parsed body, then the
**identifier**, which is what makes the delivery deduplicated.

The signature is checked over the **raw** body, before it is parsed. A body that was altered after
it was signed therefore fails, which is the whole point of signing the raw bytes.

The identifier is checked **before** the body is parsed, so a delivery with no identifier is refused
even when its body is malformed.

### R4 - The event is deduplicated durably, and the deduplication is a uniqueness constraint

The approved decision requires durable deduplication. A check-then-write is not enough, because two
concurrent deliveries of the same event would both pass the check.

So the deduplication is a **unique index** on the provider's own event identifier, and the write
that records the event is the thing that enforces it. The second delivery finds the recorded event
and returns its recorded outcome without applying anything.

### R5 - The recorded event is the audit trail, whatever the outcome

An event is recorded whether it was **applied**, ignored as a **duplicate**, **rejected**, or
**unknown**. That is what makes a forged, a replayed, or an out-of-order delivery auditable rather
than invisible.

A rejected event records the **reason**, which is a fixed, non-sensitive name such as
`SIGNATURE_INVALID`. The reason never echoes anything an attacker supplied.

### R6 - A payment event advances the order through the Orders capability's contract

The order's state and its stock allocation must change **with** the payment's state, not
separately. So the Payments capability does not write the Orders capability's tables: it calls the
Orders capability's published `settlePayment` contract, and the Orders capability performs the
transition and the stock confirmation together.

The dependency is **one way**. The Payments capability depends on the Orders contract, and the
Orders capability does not depend on the Payments capability, so the two do not form a cycle.

### R7 - A late payment does not consume stock that is no longer held

The approved decision says an expired or released reservation can never be consumed by a late
payment event. The Orders capability already implements that rule: it moves the order to
`PAID_PENDING_ALLOCATION`, which records that the money arrived and that the stock was **not**
allocated.

So the Payments capability does not need its own rule for the race. It records the payment, and the
Orders capability applies the rule it already owns. The rule lives in one place.

### R8 - A failed payment releases the hold, exactly once

A failure is the other half of the race: the order's held stock must return to sale, or the
platform would hold stock it will never sell. The release happens through the Orders capability's
`failPayment` contract, and the Inventory capability's release is idempotent, so a failure event
delivered twice releases the stock once.

### R9 - The payment attempt is idempotent on the customer's business key

A customer whose connection drops while starting a payment retries. The retry must create **one**
attempt, not two, because two attempts would be two charges.

The unique key is on `(customer_id, idempotency_key)`, so the scoping is the same as the order's
own idempotency key: two customers may send the same key text and each get their own attempt, and
one customer who retries always finds the first one.

### R10 - The amount comes from the order, never from the client

The attempt's amount is the order's total, read through the Orders capability's contract. The
request schema has no amount field, so a client cannot ask for a different amount to be charged.

### R11 - The refund's cumulative limit is enforced inside the write

The approved decision requires the refunds for one payment never to exceed the amount that was
paid. A check-then-write is not enough, because two concurrent refunds would both pass the check.

So the refunded total is advanced with a **conditional** update: it applies only while the attempt's
refunded total plus the refund's amount still fits within the amount that was paid. The second
concurrent refund updates nothing, the transaction rolls back, and the refund is refused. The
database's own check constraint refuses a refunded total above the amount as a last line of defence.

### R12 - A refund is idempotent on its own business key

A repeated refund request must not refund twice. The unique key is on `(customer_id,
idempotency_key)`, the same shape as the attempt's, and a repeated request returns the original
refund.

### R13 - A refund of a payment that never succeeded is refused

Only a `SUCCEEDED` payment can be refunded. A refund of a `PENDING` or a `FAILED` payment is
refused with `409 REFUND_NOT_ALLOWED`, and the refusal names the payment's state without naming
anything sensitive.

### R14 - The provider is the authority, so the reconciliation asks the provider

The constitution says the payment status must be reconciled with the provider and that a client
callback alone is never proof of payment. The reconciliation therefore asks the provider for its
record of each payment and compares it with the platform's.

A difference is **reported**, not silently resolved in the platform's favour, because the platform
has no way to know which of the two records is correct without the provider's own reconciliation
process.

### R15 - The reconciliation is a read

The reconciliation reports and it never moves money. It creates no refund and changes no payment
state, so running it is always safe and an operator can run it as often as they need.

### R16 - The shipped provider is a simulation, and it refuses to operate in production

The approved decision says no real payment is collected and no live credential is used. The only
shipped provider is therefore a **simulation** whose results are a deterministic function of the
request and the delivered headers, and it never reaches a network.

It **refuses to operate in a production environment**, and that refusal is the mechanism: there is
no configuration that turns it off, so a production request can never collect money through it.

### R17 - The simulation covers the outcomes the platform must survive

The approved decision names success, failure, timeout, duplicate, and delayed deliveries. The
simulation produces each of them, and the platform's handling of each is proven by the automated
suite:

- **success** - the payment is recorded, the order is paid, and the stock is allocated.
- **failure** - the payment is recorded as failed, the order's hold is released.
- **timeout** - the provider never answers, so the attempt stays `PENDING` and the platform does not
  assume a result it did not receive.
- **duplicate** - the same event delivered twice applies once.
- **delayed** - an event delivered after the order's hold lapsed moves the order to
  `PAID_PENDING_ALLOCATION` and allocates no stock.

### R18 - The platform stores no payment material

The attempt stores the amount, the currency, the provider, the provider's reference, and the
state. There is **no column** for a card number, a token, or a credential, so there is nothing to
leak. The platform never handles a card.

### R19 - The platform's own contract and the provider's contract are different things

The customer's payment routes and the administrative routes are the platform's contract, and they
are published. The provider's intake route is the **provider's** contract, and the published
document describes it as a free-form body, because a provider's shape is not the platform's
contract.

### R20 - The Paymob adapter is prepared, and it is not activated

The approved decision says a Paymob adapter interface and its contract assumptions may be prepared
without inventing undocumented provider behavior or claiming a production integration.

So the milestone prepares the **interface** the adapter implements and records the **assumptions**
the implementation would rest on, and it implements **neither**. The adapter is not registered, no
credential exists, and no production behaviour is claimed. The assumptions are recorded as
unverified, so a future implementation starts from a known list of questions rather than from a
guess presented as a fact.

### R21 - The milestone adds no dependency, no infrastructure, and no new source of truth

The provider abstraction is a TypeScript interface, the event intake is a route, the payment and
refund rules are the platform's own code, and the records are PostgreSQL tables the Payments
capability owns. There is no queue, no cache, no broker, and no new service.
