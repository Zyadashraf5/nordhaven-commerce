# Research: Milestone 11 - Shipping and Returns

**Date**: 2026-10-21

This record states how the approved scope becomes an implementation, and it keeps the distinction
between a **development decision** and a **production activation** explicit.

## Findings

### R1 - The shipping capability is its own capability, and the order aggregate stays where it is

The architecture overview assigns fulfilment to a "Shipping and Fulfillment" capability and the
order aggregate to "Orders". The implementation follows that: a new Shipping capability owns the
destinations, the methods, the shipments, and the returns, and it references the order by its
**identifier** rather than by a foreign key into the Orders capability's table.

That is the same pattern the Cart capability uses for the catalog's SKUs, and it keeps the ownership
rule intact: the Shipping capability never writes the Orders capability's rows.

### R2 - Every shipping configuration value is administrator-supplied

The instruction is explicit: no rates, no providers, no delivery commitments, and no country
eligibility may be invented. So the platform has **no built-in list of countries**, **no carrier
table**, and **no rate calculation**.

What it has is configuration: a destination is a country an administrator approved, and a method is
a code, a label, and an amount an administrator set. The platform's contribution is to store the
value exactly, to scope it to an environment, and to attribute every change to an administrator.

So the "no invented rates" rule is enforced by the **absence of fields**: there is no
`estimatedDeliveryDays`, no `carrierCode` that must be one of a known list, and no function that
turns a weight into a price.

### R3 - A method's amount is a configured value, and the platform labels it as a test configuration

The amount has to exist, because a shipping method that costs nothing is not a shipping method. So
the amount is a configured integer, and the **environment scope** is what keeps it honest: a method
configured in the `TEST` environment applies only to a `TEST` request, and a production request
finds no method at all until an administrator configures one for production after the shipping
contract is approved.

The label is the administrator's, and the administration surface states the environment it writes
to, so a `TEST` method is visibly a test configuration.

### R4 - The shipping amount joins the total after the tax, and it is not taxed

The tax engine assesses a **product classification**, and there is no approved classification for a
shipping charge. Taxing shipping would mean inventing a tax policy, which the instruction forbids and
which the tax decision does not cover.

So the amount is added to the total after the tax is computed, and the identity becomes
`netSubtotal + shipping + tax === total`. The assumption is recorded explicitly, and the order's
database constraint enforces the new identity so the arithmetic cannot drift.

### R5 - The quote carries a shipping block, and the client never supplies an amount

The quote already refuses a client-supplied price, tax, or total. The shipping amount joins them: the
request carries an optional **method code**, which names a configuration the platform already holds,
and the amount comes from that configuration.

A method that is unknown, inactive, or configured for another destination is refused with a named
blocker, so the customer sees *why* their selection cannot be used rather than a silent zero.

### R6 - The fingerprint covers the shipping selection

The fingerprint exists to detect a stale price. A shipping amount is part of what the customer
confirms, so it MUST be in the fingerprint, otherwise a customer could confirm a quote with one
shipping method and be charged with another.

The fingerprint therefore covers the selected method's code and amount alongside the line figures.

### R7 - The order snapshots the shipping selection, not a reference to it

The constitution requires an order to snapshot the prices, currencies, tax inputs, discounts, bundle
composition, and customer selections. A shipping method is a customer selection, and a method that
is later deactivated or repriced must not alter an existing order.

So the order stores the method's code, its label, its amount, and its currency. It is a snapshot of
the commercial agreement, exactly like the line prices.

### R8 - The shipment lifecycle is data, exactly like the order's and the payment's

The audit's review found that the order and the payment state machines are data tables the
transition check reads. The shipment follows the same shape, so the permitted transitions are one
reviewable artifact and a transition that is not permitted is refused without changing the shipment.

The states are `PREPARED`, `PACKED`, `HANDED_OVER`, `DELIVERED`, and `CANCELLED`. A shipment that
has been handed over cannot be packed again, and a delivered shipment cannot be cancelled.

### R9 - A shipment records what it is, not what will happen

Because no provider and no delivery commitment are approved, the shipment records its destination, its
items, the configured method, and a free-form tracking reference. It records **no** estimated
delivery date, **no** carrier service level, and **no** carrier-verified status.

The tracking reference is explicitly an administrator-set value, and the response says so, so a
customer is never told a shipment is "in transit with carrier X" on the platform's word alone.

### R10 - A shipment is created for a paid order, and only one

A shipment fulfils a paid order, so the platform refuses a shipment for an order that has not been
paid. And the platform refuses a **second** shipment for the same order, because splitting one order
into two shipments is an operational decision that no approved decision covers, and an accidental
duplicate would send the goods twice.

### R11 - A return is a separate aggregate with its own lifecycle

The approved decision says a pre-order is recorded under a distinct lifecycle, and the same
reasoning applies to a return: a return is not an order in another state. It has no payment, no
reservation, and it can be refused without touching the order.

Making it a separate table with its own states is what keeps the guarantee structural: a return that
is `REQUESTED` holds no money and has moved no stock.

### R12 - A return's money and stock movement go through the owning capabilities

The Shipping capability must not write the inventory or the payment tables. So receiving a return
restocks through the **Inventory** capability's published contract and requests the refund through the
**Payments** capability's published contract.

That requires two new published contracts, one on each owning capability, and each is a thin
adapter over that capability's own rules rather than a re-implementation.

### R13 - The restock is an increase, not a reservation release

A confirmed order's stock was **sold**: the reservation was confirmed and the on-hand quantity was
reduced. Returning the goods therefore **increases** the on-hand quantity, exactly as a delivery
receipt does.

Releasing a reservation would be wrong, because the reservation is already terminal. The Inventory
capability's restock contract therefore records a movement of the same kind its assembly records, so
the movement ledger stays complete and the stock conservation invariant still holds.

### R14 - The refund is the Payments capability's decision, not the Shipping capability's

A return's refund is a money movement, and the Payments capability owns the cumulative refund limit
and the idempotent refund key. The Shipping capability therefore *requests* a refund through the
Payments capability's contract and records the outcome.

The refusal is honest: if the payment's remaining refundable amount is smaller than the return's
amount, the refund is refused and the return records the refusal rather than inventing a partial
refund.

### R15 - Every effect happens once, because every effect is conditional

The audit's central lesson was that a check-then-write is not enough under concurrency. So:

- Receiving a return advances the return's state with a **conditional** update, so two concurrent
  receives produce one restock.
- The restock itself is keyed by a **stable key** derived from the return, so a repeated receive is
  refused rather than applied twice.
- The refund carries the return's own idempotency key, so a repeated request returns the same refund.

### R16 - The customer boundary is enforced before any stateful read

The audit found a High finding where an ownership check was missing before a stateful pre-order read.
The rule for this milestone is therefore fixed and applied everywhere: the **owner check precedes the
read**, and a record that is not the caller's is answered exactly as a record that never existed.

### R17 - The administrative surface reads and acts, and never invents a commercial fact

The administrator approves a destination, configures a method, moves a shipment, decides a return,
and chooses whether received goods return to stock. Every one of those is a **decision**, recorded
with the actor. The administrator cannot set a delivery promise, because the model has no such field.

### R18 - The milestone adds no dependency, no infrastructure, and no new source of truth

The destinations, the methods, the shipments, the shipment events, the returns, the return events, and
the return lines are PostgreSQL tables the Shipping capability owns. The stock movement is the
Inventory capability's own ledger, and the refund is the Payments capability's own record.

There is no queue, no cache, no broker, and no new service.

### R19 - The existing destination gate stays coherent

The Checkout capability already requires a destination to carry an approved shipping rule before a
customer may check out. The Shipping capability's destinations are the **same** countries, so the two
must not drift.

The Checkout capability's destination therefore remains the gate, and the Shipping capability's
destination table records the **shipping-specific** approval. The Shipping capability's methods are
what make a destination fulfillable, and the Checkout capability asks the Shipping capability for
them through the published contract, so there is exactly one source of the methods.

### R20 - Nothing about the original databases is touched

The M06–M10 audit recorded a **NO-GO** for running the current baseline against the three original
databases, because they carry fourteen applied migrations and the application requires eighteen. This
milestone therefore adds two further forward migrations, which widens that gap.

That is the correct direction: the originals are preserved as history, and the forward migrations are
applied to the isolated targets and rehearsed for the controlled rollout that M14 must schedule.


## Independent completion verification — 22 October 2026

This supersedes the earlier blanket completion claim for safety/correctness evidence. M11's currently authorized development mechanisms pass: pnpm verify (387unit/37suites), full integration296/15, and shipping/returns HTTP8/1, on the new owned hc_batch_final_20261021 targets. Evidence: C:/Users/zyad/Documents/ChatGPT/zyad ashraf/nordhaven-m11-m14-final-20261021/gates/m11-acceptance-*.log. The historical three original databases remain untouched at14 migrations. New targets now25, with additive return-claim and configuration-history migrations; the older column-removal SQL was not replayed.

Corrections: cumulative serialized return quantity/money claims; exact cumulative integer allocation with cancellation release; historical unknown per-line amounts fail closed; truthful pending/failed refund state; atomic receipt/restock/flags/facts; snapshot-based DYNAMIC component return versus independent FIXED finished goods; movement-key payload validation and sorted locks; retained administrator configuration facts; production shipping configuration refusal; stable concurrent full-refund business-key claims before budget checks. Existing test assertions are retained.

Shipping charge collection is NOT implemented. Earlier spec FR004–FR006, story1 quote-total statements and SC001 must not be treated as satisfied by configured options/shipment snapshots. They remain deferred pending the approved shipping-charge/tax treatment and a separately tested acyclic quote/pricing design. No shipping amount is added to payable totals, and no tax exemption or merchant return policy is inferred. This is an explicit scope/acceptance limitation rather than an approval of a new business decision. Current development acceptance covers the safe mechanisms requested by the Product Owner; final commercial/production acceptance remains blocked.
