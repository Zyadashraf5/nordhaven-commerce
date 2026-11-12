# Research: Milestone 09 - Orders and Pre-orders

> Independent remediation note (2026-10-21): historical assumptions about detached transactions, constant-only order TTL, foreign root lookups and provider/refund/pre-order behavior are superseded by [the audited remediation design](../../docs/audits/m06-m10-remediation-design.md). Approved business decisions and the constitution are unchanged.

**Date**: 2026-10-21

The Product Owner approved the checkout, tax, order, payment, and refund **development scope** on
2026-10-21. This record states how the approved scope becomes an implementation, and it keeps the
distinction between a **development decision** and a **production activation** explicit.

## Findings

### R1 - The order is created from a recomputed quote, never from the client's figures

The approved decision forbids trusting a client-submitted price or total. The only safe way to honour
that is for the Orders capability to ask the Checkout capability for a **fresh** quote at the moment
of creation, and to snapshot *that*.

The client may present the fingerprint of the quote it saw. If the recomputed fingerprint differs,
the price moved between the confirmation and the order, and the order is refused with a conflict so
the customer confirms the new figure. The client never supplies an amount; it supplies only a
token that says "this is what I saw".

### R2 - The quote's fingerprint is the staleness check, and nothing else

A fingerprint is only useful if it changes exactly when the material content changes. The Milestone
08 fingerprint covers the destination, the currency, and every line's identity, quantity, unit
price, net amount, tax amount, and total, plus the totals. That is precisely the content the order
snapshots, so a fingerprint match means the order's snapshot and the customer's confirmation are the
same figures.

The Orders capability therefore stores the fingerprint **on the order**, so the evidence that the
customer confirmed these figures survives with the order itself.

### R3 - The idempotency key is scoped to the customer

An idempotency key identifies "this request", so it must identify the request *and* the customer it
belongs to. Scoping the unique key to `(customer_id, idempotency_key)` means two different customers
who happen to send the same key text each get their own order, while one customer who retries
always gets the same one.

The key is a **business** key, not a transport artifact. It is stored on the order, so the second
request finds the first order rather than creating a new one.

### R4 - The order's state machine is small, explicit, and enforced by the data

The approved decision requires the payment, stock allocation, cancellation, expiration, and
fulfillment transitions to be modelled explicitly. The states are `PENDING_PAYMENT`, `PAID`,
`PAYMENT_FAILED`, `CANCELLED`, `EXPIRED`, and `FULFILLED`.

The permitted transitions are stored in a table rather than in a `switch`, so the permitted set is
**data** that the transition check reads, and every transition the platform performs is recorded
against it. A transition that is not permitted is refused, and the refusal changes nothing.

The state is stored as an enum so the database refuses an unknown state, and the transition table
references it, so a transition to a state that does not exist cannot be recorded either.

### R5 - The reservation is the order's stock promise, and it is held at creation

The approved decision says a cart never reserves stock and that the reservation is created as part
of the order. The Inventory capability already has an atomic, idempotent reservation primitive with
an idempotency key, an expiry, and an explicit confirm, release, and expire lifecycle, and it
already sweeps the lapsed holds.

So the Orders capability asks the Inventory capability to create a reservation with a key derived
from the order's idempotency key, so a retried order request holds the stock **once**.

### R6 - The reservation window is fifteen minutes and is configurable

The approved decision names a configurable fifteen-minute initial window. The Inventory capability's
existing default is already fifteen minutes, and the reservation primitive accepts an explicit
duration. The Orders capability therefore passes the window explicitly, and the value is a
**constant of the Orders capability** rather than a configuration key, because the approved decision
fixes it and no approved decision makes it environment-specific.

Making it a constant rather than a key keeps the milestone's "no new configuration key" property and
keeps the value visible in one place.

### R7 - The order and the reservation are two records, and the order records which reservation it holds

A cross-module transaction is not available: the Inventory capability owns the reservation tables
and the Orders capability owns the order tables, and the platform has no distributed transaction.

The honest sequence is therefore: create the reservation first, then create the order, and let the
order record the reservation's identifier. If the order's write fails after the reservation
succeeds, the reservation is left to expire on its own and its stock returns to sale. That is a
**bounded, self-healing** failure, not a leak, and it is far better than pretending the two writes
are atomic.

The order's creation is idempotent on its key, so a retry takes the same path and produces the same
reservation.

### R8 - A late payment never consumes a reservation that is gone

The approved decision says an expired or released reservation can never be consumed by a late
payment event, and that the payment-pending versus reservation-expiry race is resolved by explicit
state transitions and reconciliation.

The Inventory capability's confirmation already refuses a reservation that is not active. So the
Orders capability's `confirm` path asks the Inventory capability to confirm, and a refusal leaves
the order in `PENDING_PAYMENT` with a recorded `RESERVATION_UNAVAILABLE` event, rather than marking
it `PAID` and claiming stock that is not held.

The order's own state is therefore never advanced on a confirmation that did not happen. The
platform records the discrepancy, which is what "reconciliation" means here.

### R9 - The order's stock is confirmed when the payment succeeds, and the confirmation is Milestone 10's trigger

The Milestone 10 payment module confirms the order's payment and the order's stock together, through
the Orders capability's published contract. The Orders capability exposes a `settle` operation that
confirms the reservation and advances the state to `PAID` atomically from the Orders side.

The two capabilities therefore depend on each other in one direction only: the Payments capability
depends on the Orders contract, and the Orders capability does not depend on the Payments
capability. There is no cycle.

### R10 - The order snapshots what it bought, not what it points at

The constitution requires the prices, currencies, tax inputs, discounts, bundle composition, and
customer selections to be snapshotted, and the approved decision says the order's price snapshots
are immutable.

So the order's lines store the product's identity, the quantity, the unit price, the discount in
basis points, the tax rate in basis points, the tax amount, the currency, and the line total. A
later catalog change cannot alter them, because the order never reads them back.

### R11 - The bundle composition is snapshotted on the order's line

The constitution requires the bundle composition to be snapshotted, and the approved decision says a
FIXED bundle is independently stocked finished goods and a DYNAMIC bundle resolves to its approved
composition.

So an order line that names a bundle stores the **resolved component lines** - each component SKU
and the quantity the bundle consumes - at the moment the order was created. The snapshot is the
evidence of what the customer bought, and it is written once.

### R12 - The order's line is derived from the quote's line, and the quote's line is derived from the cart

The order's line is a **copy** of the quote's line with the order's identifier added. The copy is
made inside the order's write, so an order can never disagree with the quote it was created from.

The bundle's component resolution needs the bundle's composition, which the Inventory capability
owns. The Inventory capability therefore exposes the composition through its published contract, so
the Orders capability never reads the bundle tables.

### R13 - The customer owns the order, and the identifier is never guessable

The order's customer is the Identity-owned customer, stored as a stable identifier with no foreign
key, exactly as the cart and the wishlist store theirs. HC-DEC-003 leaves account deletion and
retention unresolved, so a foreign key would imply a retention policy that has not been decided.

An order that belongs to another customer is answered exactly like one that never existed, so the
API never discloses whether an order exists.

### R14 - The order's event log is append-only and records the actor

The approved decision requires the order's transitions to be recorded. Every transition writes an
event with the actor, the previous state, the next state, the reason, and the time.

The event log is **append-only**: nothing updates or deletes an event, so the history of an order is
a fact rather than a summary. The actor is the customer or the administrator, and a system-driven
transition records the system as the actor.

### R15 - The idempotency key's request is recorded so a retry is answered from the same intent

The idempotency record stores the key, the customer, the order it created, and the time. The unique
key on `(customer_id, idempotency_key)` is what makes the second request find the first order.

The record is written **in the same transaction** as the order, so a crash between the reservation
and the order leaves the reservation to expire and the key still unused, and the customer's retry
takes the whole path again.

### R16 - The pre-order is a distinct aggregate, not an order in a different state

The approved decision says a pre-order may be recorded under a distinct lifecycle and that the
customer is never charged before sufficient inventory is physically available and can be reserved.

Making the pre-order a **separate table** with its own states is what keeps that guarantee
structural. A pre-order cannot be paid, because it has no payable amount, no reservation, and no
payment reference. It has no path to `PAID` at all.

### R17 - A pre-order becomes payable only after a real reservation

The pre-order's transition to `STOCK_RESERVED` requires the Inventory capability to actually
reserve the stock. The reservation is created with a key derived from the pre-order's identifier, so
the transition is idempotent and the stock is held once.

Only after the hold exists does the pre-order become `AWAITING_PAYMENT`. The order that eventually
settles the pre-order is created the same way a normal order is, so the customer pays an ordinary
order.

### R18 - The pre-order's stock check is a read, and a failed check changes nothing

The pre-order's readiness is evaluated by asking the Inventory capability for the availability of
its lines. A read never changes state, so a pre-order that is not yet available simply stays
`AWAITING_STOCK`.

The evaluation is idempotent, so a customer or an administrator may ask for it repeatedly without
side effects.

### R19 - The order's events are recorded for every transition, including the refusals that matter

A refused transition is a fact an operator needs: a customer who tried to cancel a paid order, or a
payment that arrived too late, both leave evidence. The refusal is recorded as an event with the
attempted next state and the reason, and the order's own state is unchanged.

This is what makes the late-payment case auditable rather than merely handled.

### R20 - The milestone adds no dependency, no infrastructure, and no new source of truth

The order, its lines, its events, its idempotency records, and the pre-orders are all PostgreSQL
tables owned by the Orders capability. The stock hold is the Inventory capability's existing
reservation primitive, the pricing is the Checkout capability's existing quote, and the tax is the Tax
capability's existing engine.

There is no queue, no cache, no broker, and no new service. The one cross-capability call the
milestone cannot avoid - asking the Cart to remove the ordered lines - goes through the Cart's
published contract, so the Cart keeps ownership of its own data.
