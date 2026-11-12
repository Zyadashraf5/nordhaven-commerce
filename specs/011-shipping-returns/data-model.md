# Data Model: Milestone 11 - Shipping and Returns

**Date**: 2026-10-21

**Status**: **Delivered.** Every structure below is additive and was created by forward migrations
that were applied to the **isolated** targets only. The three original databases are not migrated and
remain a controlled-rollout task for Milestone 14.

## What already exists

| Existing fact                                             | Where it lives                                              | Owner    |
| --------------------------------------------------------- | ------------------------------------------------------------ | -------- |
| The order and its immutable price and tax snapshot        | `orders`, `order_lines`                                     | Orders   |
| The customer                                               | the Identity `users` table, as a stable identifier          | Identity |
| The per-SKU stock and the reservation lifecycle            | `inventory_items`, `reservations`, `reservation_lines`       | Inventory |
| The stock movement ledger                                  | `stock_movements`                                           | Inventory |
| The payment attempt, its refunds, and the refund budget    | `payment_attempts`, `refunds`                               | Payments |
| The approved checkout destination                          | `checkout_destinations`                                     | Checkout |

## New structures

### The shipping destination

```
shipping_destinations
  country_code          the destination country, as the primary key
  environment           the scope the approval belongs to: TEST or PRODUCTION
  enabled               whether the destination may be shipped to
  label                 the administrator's label
  carrier_code          the carrier, or null when no provider is activated
  updated_by_user_id    the administrator who last changed it
  created_at, updated_at
```

**Why the environment scope.** A `TEST` destination can never enable a production shipment, and a
production request finds no destination until an administrator configures one for production after
the shipping contract is approved. The environment is therefore the mechanism that keeps an
unapproved shipping configuration out of a production shipment.

**Why the platform carries no country list.** Country eligibility is configuration, so the platform
stores only what an administrator approved. There is no built-in list to drift from the approved one.

**Why it is a separate table from `checkout_destinations`.** The two answer different questions and
have different owners. The Checkout capability's destination answers "may a customer check out for
this country, and whose tax rules apply", and it is the gate the checkout calculation uses. The
Shipping capability's destination answers "may we ship here, and which options exist", and it is
the gate the fulfilment uses. Neither table can answer the other's question, so neither has to
guess.

### The shipping method

```
shipping_methods
  id                        the method identifier
  environment               the scope the configuration belongs to
  code                      the method's code, unique per environment
  label                     the administrator's label
  destination_country_code  the destination it applies to, or null for any enabled destination
  amount_minor              the configured amount, in exact integer minor units
  currency                  the settlement currency
  active                    whether the method may be selected
  updated_by_user_id        the administrator who last changed it
  created_at, updated_at
```

**Why the amount is a configured integer.** The platform computes no rate. The amount is a value an
administrator set, scoped to an environment, and the administration surface states the environment it
writes to, so a `TEST` method is visibly a test configuration.

**Why there is no delivery estimate.** No delivery commitment is approved, so the model has **no**
estimated delivery date, transit time, or service level. The absence of the field is what enforces
the rule.

**The database constraints.** `shipping_methods_amount_nonnegative` refuses a negative amount, and
`shipping_methods_amount_within_range` refuses an amount outside the platform's stored integer range,
so a configured amount can never exceed what the money columns can hold.

### The shipment

```
shipments
  id                    the shipment identifier
  order_id              the order being fulfilled, as a stable identifier
  customer_id           the owning customer, as a stable identifier
  status                the state
  destination_country_code  the destination snapshot
  destination_label     the destination's label at the time
  method_code           the selected method's code
  method_label          the selected method's label at the time
  amount_minor          the selected method's configured amount
  currency              the settlement currency
  tracking_reference    a free-form reference an administrator set
  carrier_code          the carrier, or null
  dispatched_at         when the shipment was handed over
  delivered_at          when the shipment was delivered
  cancelled_at          when the shipment was cancelled
  status_reason         why the state changed
  created_at, updated_at
```

**Why the method is snapshotted.** A method is a customer selection, and the constitution requires the
order to snapshot its selections. A method that is later deactivated or repriced must not alter an
existing shipment, so the code, the label, and the amount are copied.

**Why there is no carrier-verified tracking.** No provider is activated, so the tracking reference is
an administrator-set value and the response says so. The platform never presents it as a carrier's
own status.

**Why one shipment per order.** Splitting an order into two shipments is an operational decision no
approved decision covers, and an accidental duplicate would send the goods twice. The unique key on
`order_id` makes that structural.

### The shipment line and event

```
shipment_lines
  id             the line identifier
  shipment_id    the owning shipment
  order_line_id  the order line the goods come from
  quantity       the units

shipment_events
  id               the event identifier
  shipment_id      the owning shipment
  event_type       what happened
  previous_status  the state the shipment was in
  next_status      the state it moved to
  actor            the customer, an administrator, or the system
  actor_user_id    the actor's stable identifier
  reason           why the transition was refused or what qualified it
  detail           the non-sensitive detail
  created_at
```

**The event log is append-only.** Nothing updates or deletes an event, so a shipment's history is a
fact rather than a summary, and a **refused** transition is recorded while the shipment's own state
is left unchanged.

### The return and its line and event

```
returns
  id             the return identifier
  order_id       the order the return is against, as a stable identifier
  customer_id    the owning customer, as a stable identifier
  status         the state
  reason_code    the administrator's or the customer's reason
  currency       the settlement currency
  total_minor    the exact integer minor units the return covers
  refund_id      the Payments capability's refund, once one was requested
  refund_status  REQUESTED, COMPLETED, or REFUSED
  received_at    when the goods arrived
  decided_at     when the request was approved or rejected
  cancelled_at   when the return was cancelled
  created_at, updated_at

return_lines
  id            the line identifier
  return_id     the owning return
  order_line_id the order line the goods come from
  quantity      the units returned
  restocked     whether the units went back into stock

return_events
  ... the same shape as the shipment event log
```

**Why the return is a separate table.** A return is not an order in another state. It has no payment
and no reservation, so while it is `REQUESTED` it holds no money and has moved no stock, and that
guarantee is a property of the record rather than of a code path.

**Why `restocked` is on the line.** The administrator's decision at receipt is per line, and the
platform records it so a second receive cannot restock the same units again.

**The database constraints.** `returns_total_nonnegative` refuses a negative amount, and
`return_lines_quantity_positive` refuses a zero or negative quantity.

### The stock movement's business key

```
stock_movements
  reference   the stable business key of the movement, unique when present
```

**Why the key is here.** A restock that comes back from a received return must happen **once**, and
the Shipping capability cannot decide that by itself, because it does not own the inventory table.
The idempotency therefore lives in the Inventory capability: the movement carries the stable key of
the restock, and the key is unique. A repeated restock collides on the key inside the same
transaction that increments the on-hand quantity, and the increment is skipped.

**The new reason.** `StockMovementReason` gains `RESTOCK`, so the movement ledger distinguishes a
returned good from an administrative adjustment.

## What the milestone deliberately does **not** change

**The order's figures.** The order's total is still `subtotal + tax`, and the order's table gained
no shipping column. The reason is recorded in the milestone's research: a Checkout capability that
depended on the Shipping capability would close the cycle
`Checkout -> Shipping -> Payments -> Orders -> Checkout`, because the Shipping capability must read
an order, and the Payments capability already depends on the Orders capability.

**The checkout quote.** The quote is unchanged, so the Milestone 08 and Milestone 09 behaviour and
their regression suites are untouched.

**The shipping charge is recorded, not collected.** A shipment carries the configured amount of its
method, and the platform says so in the response. Charging a shipping amount is deferred until the
shipping rate and the provider are approved, because charging an unapproved rate is exactly what the
milestone's instruction forbids.

## The state machines

The shipment's and the return's permitted transitions are **data**, in the Shipping capability's
application layer, exactly as the order's and the payment's are.

```
PREPARED     -> PACKED | CANCELLED
PACKED       -> HANDED_OVER | CANCELLED
HANDED_OVER  -> DELIVERED
DELIVERED, CANCELLED are terminal

REQUESTED  -> APPROVED | REJECTED | CANCELLED
APPROVED   -> RECEIVED | CANCELLED
RECEIVED   -> REFUNDED
REJECTED, REFUNDED, CANCELLED are terminal
```

## Data ownership

| Capability | Owns                                                                        | Depends on, through a published contract          |
| ---------- | --------------------------------------------------------------------------- | -------------------------------------------------- |
| Shipping   | `shipping_destinations`, `shipping_methods`, `shipments`, `shipment_lines`, `shipment_events`, `returns`, `return_lines`, `return_events` | The Orders capability's ledger, the Inventory capability's restock, the Payments capability's refund |
| Checkout  | the existing destination gate and the quote                                   | unchanged in this milestone                       |
| Orders    | the existing order aggregate                                                  | unchanged in this milestone                       |
| Inventory | the stock, the movement ledger, and the new restock contract                  | unchanged in this milestone                       |
| Payments  | the payment attempt, the refund, and the new refund contract                  | unchanged in this milestone                       |

The Shipping capability references the order by its identifier and never writes the Orders
capability's tables.

## The migrations

Three additive forward migrations:

1. `20261021190000_shipping_returns` - the destinations, the methods, the shipments, the shipment
   lines and events, the returns, the return lines and events, with their constraints and indexes.
2. `20261021200000_order_shipping_snapshot` - the order's shipping columns and the updated order
   consistency constraint.
3. `20261021210000_order_shipping_snapshot_withdrawn` - the withdrawal of the second migration's
   columns, because the design decision changed. It restores the original order constraint and drops
   the four columns, which were added during the same unreleased milestone and were never populated
   with a commercial figure.
4. `20261021220000_stock_movement_reference` - the stock movement's business key, its unique index,
   and the `RESTOCK` reason.

None rewrites history, and none touches the three original databases. The isolated targets carry
all four; the originals stay at fourteen applied migrations and remain a controlled-rollout task for
Milestone 14.
