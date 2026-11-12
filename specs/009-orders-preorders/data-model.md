# Data Model: Milestone 09 - Orders and Pre-orders (Implemented)

**Date**: 2026-10-21

**Status**: **Implemented and verified.** Every structure below exists in `prisma/schema.prisma` and
was created by the additive migration
[`20261021100000_orders_preorders`](../../prisma/migrations/20261021100000_orders_preorders/migration.sql).

## What already exists

The order builds on facts the platform already stored, and this section records them so the new
structures are read against reality.

| Existing fact                                    | Where it lives                                                                     | Owner    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- | -------- |
| The customer                                     | the Identity `users` table, as a stable identifier                                | Identity |
| The cart and its lines                          | `carts`, `cart_items`                                                              | Cart     |
| The product, its SKU, and its effective price    | `products`, `product_variants`                                                     | Catalog  |
| The per-SKU stock and the reservation lifecycle   | `inventory_items`, `reservations`, `reservation_lines`                            | Inventory |
| The tax rules and the product classifications    | `tax_rules`, `tax_classifications`                                                | Tax      |
| The approved checkout destinations               | `checkout_destinations`                                                            | Checkout |

## New structures

### The order

```
orders
  id                        the order identifier
  customer_id               the Identity-owned customer, as a stable identifier
  status                    the state
  currency                  the settlement currency of every amount
  subtotal_minor            the exact integer minor units of the line totals, before tax
  tax_total_minor           the exact integer minor units of the tax
  total_minor               the exact integer minor units the customer pays
  destination_country_code  the destination the order was quoted for
  tax_jurisdiction          the jurisdiction whose tax rules were applied
  quote_fingerprint         the fingerprint of the quote the customer confirmed
  reservation_id            the Inventory capability's reservation, which holds the stock
  idempotency_key          the stable business key that makes a repeated request safe
  status_reason             the reason the order left the pending state, when it did
  expires_at                when the payment window closes
  created_at, updated_at
  paid_at, cancelled_at, fulfilled_at
```

**The database constraints.**

- `orders_amounts_consistent` refuses an order whose `subtotal_minor + tax_total_minor` is not its
  `total_minor`. The storage layer therefore refuses an internally inconsistent order, which is
  defence in depth for the exact-money rule.
- `orders_amounts_nonnegative` refuses a negative amount.
- `orders_expiry_after_creation` refuses a window that ends before it starts.
- The unique key on `(customer_id, idempotency_key)` makes the idempotency **structural**: two
  different customers may send the same key text and each get their own order, and one customer who
  retries always finds the first one.

**Why the customer has no foreign key.** HC-DEC-003 leaves account deletion and retention
unresolved, so a foreign key would imply a retention policy that has not been decided. The Cart and
the Wishlist store the customer the same way.

**Why the reservation is an identifier and not a foreign key.** The reservation is the Inventory
capability's own record, and the Orders capability references it by its identifier. A foreign key
would make the Orders capability's table depend on the Inventory capability's table, which is the
ownership rule the architecture forbids.

### The order line

```
order_lines
  id                     the line identifier
  order_id               the owning order
  variant_id             the catalog SKU, when the line is a SKU
  bundle_id              the bundle, when the line is a bundle
  source_line_id         the cart line the order line came from
  sku                    the SKU the customer sees
  product_id, product_name
  quantity               the units
  unit_price_minor       the snapshotted unit price
  unit_currency          the snapshotted currency
  discount_basis_points  the snapshotted direct discount
  tax_rate_basis_points  the snapshotted tax rate
  tax_inclusive          whether the price already included the tax
  tax_classification     the snapshotted classification the line was assessed under
  net_minor              the snapshotted amount before tax
  tax_minor              the snapshotted tax
  total_minor            the snapshotted amount the customer pays
  composition            the snapshotted bundle composition, when the line names a bundle
  created_at
```

**The database constraints.**

- `order_lines_exactly_one_owner` refuses a line that names both a SKU and a bundle, and a line
  that names neither, exactly as a cart line does.
- `order_lines_quantity_in_range` refuses a quantity outside one and nine hundred and ninety-nine,
  the same bound the Cart enforces.
- `order_lines_amounts_consistent` refuses a line whose `net_minor + tax_minor` is not its
  `total_minor`.
- `order_lines_rates_in_range` refuses a discount or a tax rate above one hundred percent.

**Why the snapshot is stored rather than read back.** The constitution requires the prices,
currencies, tax inputs, discounts, bundle composition, and customer selections to be snapshotted, and
the approved decision says the order's price snapshots are immutable. Storing the figures is what
makes a later catalog change unable to alter a purchase.

**Why the composition is stored.** A bundle's composition is what the customer bought. A DYNAMIC
bundle's approved composition is its components at their minimum quantities, and a FIXED bundle's
is its own components, because it is an independently stocked finished good. The snapshot is the
evidence, written once.

### The order event

```
order_events
  id                  the event identifier
  order_id            the order the event belongs to
  event_type          what happened
  previous_status     the state the order was in
  next_status         the state it moved to
  actor               the customer, an administrator, or the system
  actor_user_id       the actor's stable identifier, when the actor is a person
  external_event_id   the external event's identifier, when the event came from outside
  reason              why the transition was refused or what qualified it
  detail              the non-sensitive detail
  created_at
```

**The unique key on `external_event_id`** makes a repeated or a delayed payment event apply exactly
once. The event log is **append-only**: nothing in the application updates or deletes an event, so
the history of an order is a fact rather than a summary.

**A refused transition is recorded.** The event carries the attempted state and the reason, and the
order's own state is left untouched. A customer who tried to cancel a paid order is a fact an
operator needs.

### The pre-order

```
pre_orders
  id                 the pre-order identifier
  customer_id        the Identity-owned customer, as a stable identifier
  status             the pre-order's own state
  total_minor        the exact integer minor units the customer will pay
  currency           the settlement currency
  lines              the snapshotted lines
  order_id           the order the pre-order became, once it was converted
  reservation_id     the Inventory capability's reservation, once the stock was held
  status_reason
  created_at, updated_at, cancelled_at
```

**Why the pre-order is a separate table.** The approved decision says a pre-order may be recorded
under a distinct lifecycle and that the customer is never charged before the stock is available and
reservable. A separate record makes that guarantee **structural**: while the pre-order awaits stock
it has no payable amount, no reservation, and no payment reference, so there is no path by which
it could be charged. Making it a state of the order would leave a payable order in the system.

**The unique key on `order_id`** records that an order comes from at most one pre-order.

## The state machines

The order's states and their permitted transitions are **data** in
`apps/api/src/modules/order/application/order-transitions.ts`, not a `switch` inside the service, so
the permitted set is one reviewable artifact that the transition check reads and the audit trail
cannot disagree with.

```
PENDING_PAYMENT        -> PAID | PAID_PENDING_ALLOCATION | PAYMENT_FAILED | CANCELLED | EXPIRED
PAID                   -> FULFILLED
PAID_PENDING_ALLOCATION-> FULFILLED
PAYMENT_FAILED, CANCELLED, EXPIRED, FULFILLED are terminal
```

The pre-order's own states are `AWAITING_STOCK`, `STOCK_RESERVED`, `AWAITING_PAYMENT`,
`CONVERTED`, `CANCELLED`, and `EXPIRED`, with their own permitted transitions.

## Data ownership

| Capability | Owns                                          | Depends on, through a published contract                        |
| ---------- | --------------------------------------------- | ----------------------------------------------------------------- |
| Orders     | `orders`, `order_lines`, `order_events`, `pre_orders` | The Checkout quote, the Cart reader and writer, the Inventory reservation and bundle contracts |

No capability reaches into another capability's tables, and the `boundaries:check` gate enforces
that the only cross-module import is the module index.

## The migration

**Additive.** The migration creates four tables with their constraints and indexes. No table is
dropped, no column is dropped, no business row is deleted, and no existing row is rewritten. The row
counts of the three canonical databases were captured before and after and were **identical** in
every table, and the migration count advanced from twelve to thirteen.
