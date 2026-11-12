# Feature Specification: Milestone 09 - Orders and Pre-orders

**Feature Branch**: Not created; the repository has no commits yet and no `before_specify` branch hook
is configured

**Created**: 2026-10-21

**Status**: Approved for development. The Product Owner approved the checkout, tax, order, payment,
and refund development scope on 2026-10-21, which resolves the decisions that govern this milestone.

**Input**: User description: "Milestone 09: Orders and Pre-orders for Nordhaven Commerce - order
creation with immutable snapshots, an explicit order lifecycle, idempotent order operations, stock
reservation integration and expiration, customer ownership and administrator authorization, cancellation
rules, and a pre-order lifecycle without any upfront charge."

## Scope Boundaries and Open Decisions

The register records each governing decision as `Approved (development scope)` with its **activation
blockers** stated separately, so a development decision is never mistaken for a production
activation.

- **HC-DEC-004 (Approved, development scope)** - only authenticated customers check out; the server
  revalidates SKU status, current effective prices, quantities, and inventory before order
  confirmation; the checkout and order state machines are explicit and documented; order creation is
  idempotent; order price snapshots are immutable; client-submitted prices and totals are never
  trusted; a cart never reserves stock. The initial pending-payment reservation window is 15 minutes
  and is configurable; an expired or released reservation can never be consumed by a late payment
  event; a payment-pending versus reservation-expiry race is resolved by explicit state transitions
  and reconciliation, never by pretending a provider and PostgreSQL share one transaction. FIXED
  bundles use independently stocked finished goods; DYNAMIC bundles use component-derived inventory
  and the approved bundle composition, and arbitrary customer-selected components are not permitted
  in this phase.
- **HC-DEC-010 (Approved, development scope)** - customer cancellation before shipment follows the
  order and payment state machine; a refund is issued only when appropriate; a duplicate refund is
  never issued. Order state transitions are explicit and model payment, stock allocation,
  cancellation, expiration, and fulfillment.
- **HC-DEC-015 (Approved, development scope)** - a pre-order is recorded under a distinct
  lifecycle; the customer is never charged before sufficient inventory is physically available and
  can be reserved; unavailable stock is never silently turned into immediately payable inventory; no
  shipping or restock commitment is invented.
- **HC-DEC-019 (Approved, development scope)** - one cart per customer, no expiry, no merge, and the
  cart is scoped to the account rather than to a session.

**Still open, and therefore not implemented here:** HC-DEC-001 (V1 scope), HC-DEC-002 (email
verification), HC-DEC-003 (privacy lifecycle), HC-DEC-012 (returns and exchanges), HC-DEC-013
(shipping providers and rates - the shipping **rate** is Milestone 11), HC-DEC-014 (notification
channels), HC-DEC-016 (launch capacity targets), and the project identity, security, and legal
matters those decisions own.

**Production activation blockers.** Local development completion is not production readiness. The
merchant's exact VAT registration status, a production tax configuration, a production destination
list, a reviewed payment-provider contract, production shipping rules, a security sign-off, and
hosted continuous integration all remain unapproved, so production checkout and payment stay
disabled.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Place an order with exactly the figures the customer confirmed (Priority: P1)

A customer with a ready cart places an order. The order records the price, the tax, the discount,
and the currency of every line exactly as they were when the customer confirmed, and the order's
total is the sum of those figures. Later a catalog price change cannot alter the purchase, because
the order keeps its own numbers rather than reading them back.

**Why this priority**: The order is the platform's promise to the customer. A total that drifts after
the fact is not a commerce system, and the constitution requires the snapshot to be immutable.

**Independent Test**: Price a cart, place the order, change the product's price and discount, and
confirm the order's stored line price, tax, and total are unchanged and still internally consistent.

**Acceptance Scenarios**:

1. **Given** a ready cart and a confirmed quote, **When** the customer places the order, **Then** the
   order is created in `PENDING_PAYMENT` and holds every line's price, tax, discount, and currency
   as they were confirmed.
2. **Given** an order whose product's price later changes, **When** the order is read, **Then** its
   stored figures are unchanged.
3. **Given** an order, **When** the customer reads it, **Then** `subtotalMinor + taxTotalMinor`
   equals `totalMinor` exactly, and every amount is an exact integer count of minor units in the
   settlement currency.
4. **Given** a customer who places an order, **When** they read their orders, **Then** they see
   their own orders and nobody else's.

### User Story 2 - Place the same order only once (Priority: P1)

A customer whose connection drops while placing an order retries. The retry places the order once,
not twice, and the customer sees the order they already placed.

**Why this priority**: A duplicated order is a duplicated charge and a duplicated stock hold. It is
the single most damaging defect a checkout can have.

**Independent Test**: Send the same order request with the same idempotency key several times, in
sequence and concurrently, and confirm exactly one order and one reservation exist.

**Acceptance Scenarios**:

1. **Given** an order request with an idempotency key that was already used, **When** it is repeated,
   **Then** the original order is returned and no second order is created.
2. **Given** two concurrent order requests with the same idempotency key, **When** they race,
   **Then** exactly one order exists.
3. **Given** two different customers using the same idempotency key text, **When** they each place an
   order, **Then** each gets their own order.

### User Story 3 - Hold the stock while the customer pays, and let it go when they do not (Priority: P1)

A customer places an order and has fifteen minutes to pay. The stock is held for them, so nobody
else can buy it, and if they do not pay the hold is released and the stock returns to sale. If the
payment arrives after the hold has gone, the platform does not consume stock that is no longer held.

**Why this priority**: Holding stock prevents overselling, and releasing it prevents the platform
from holding stock it will never sell. The race between an expiry and a late payment is the hardest
case and must be handled explicitly.

**Independent Test**: Place an order, let the reservation window lapse, and confirm the stock is
available again and the order is expired. Then place another order, pay it after its window lapsed,
and confirm the stock was not consumed.

**Acceptance Scenarios**:

1. **Given** a placed order, **When** the customer reads it, **Then** it holds a reservation that
   expires fifteen minutes after the order was created.
2. **Given** an order whose window has lapsed, **When** the reservation is read, **Then** it is
   expired and the held stock is available again.
3. **Given** an order whose reservation was released, **When** the order is cancelled, **Then** the
   order is cancelled and no stock is consumed.
4. **Given** an order whose window has lapsed and whose payment then arrives, **When** the payment
   is recorded, **Then** the order is `PAID_PENDING_ALLOCATION`, its stock is not allocated, and the
   discrepancy is recorded.

### User Story 4 - Cancel an order before it ships (Priority: P1)

A customer who no longer wants an order cancels it while it has not shipped. The order records the
cancellation, the held stock returns, and no refund is issued for an order that was never paid.

**Why this priority**: Cancellation is the most common correction a customer makes, and the rule
that no refund is issued for an unpaid order is a financial correctness rule.

**Independent Test**: Cancel an unpaid order and confirm the order is cancelled and the held stock
is released. Cancel an order twice and confirm the second attempt does not change anything.

**Acceptance Scenarios**:

1. **Given** an order in `PENDING_PAYMENT`, **When** the customer cancels it, **Then** the order
   becomes `CANCELLED` and its reservation is released.
2. **Given** an already-cancelled order, **When** the customer cancels it again, **Then** the
   request is idempotent and the order is unchanged.
3. **Given** an order that has already been paid, **When** the customer cancels it, **Then** the
   cancellation is refused, because a paid order needs the refund workflow of Milestone 10.

### User Story 5 - Record an intent to buy what is not yet available (Priority: P2)

A customer wants a product the warehouse does not stock yet. They record a pre-order. Nothing is
charged, no stock is held, and the pre-order waits. When the stock becomes available and can be
reserved, the pre-order becomes payable.

**Why this priority**: A pre-order that charged early, or that silently turned unavailable stock
into payable stock, would break the customer's trust and the platform's stock accounting.

**Independent Test**: Record a pre-order for an unavailable product and confirm nothing is charged,
no reservation exists, and the pre-order reports that it is awaiting stock.

**Acceptance Scenarios**:

1. **Given** a customer who records a pre-order, **When** they read it, **Then** it is in
   `AWAITING_STOCK` and holds no reservation and no payment.
2. **Given** a pre-order whose stock is still unavailable, **When** it is read, **Then** it remains
   `AWAITING_STOCK` and the customer is not asked to pay.
3. **Given** a pre-order the customer no longer wants, **When** they cancel it, **Then** it is
   `CANCELLED`.

## Edge Cases

- An order placed for a cart that has become empty, unavailable, or unaffordable is refused, and the
  reason names the blocker.
- An order placed while the cart's price has changed is refused with a conflict, so the customer
  confirms the new price rather than the platform charging it silently.
- An order placed for a cart whose stock has fallen below the requested quantity is refused.
- Two concurrent order requests with the same idempotency key produce one order and one reservation.
- A repeated order request with a **different** idempotency key produces a second order only if the
  cart still has the stock; the platform never holds the same stock twice.
- A reservation that expires between the order's creation and the order's read leaves the order
  `EXPIRED` rather than `PENDING_PAYMENT` with a dead hold.
- A cancellation that arrives after the reservation already expired is idempotent and does not
  release stock that a later order now holds.
- An order whose destination has no approved shipping or tax rule at creation time is refused, and
  the destination is re-checked rather than trusted from the customer's earlier quote.
- A pre-order for a product whose stock becomes available is not charged until the stock is actually
  reserved.
- A pre-order for a product that is never restocked simply remains awaiting stock; no deadline is
  invented.
- An order that names a bundle records the bundle's composition snapshot, so a later bundle change
  cannot alter the purchase.
- A customer's order is never visible to another customer, and an administrator sees orders only
  through the administrative route.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The platform MUST create an order from a customer's confirmed quote, and the order
      MUST store an **immutable snapshot** of every line's product identity, quantity, unit price,
      discount, tax rate, tax amount, currency, and total, plus the order's subtotal, tax total, and
      total.
- **FR-002**: Every amount MUST be an exact integer count of minor units in the order's explicit
      settlement currency, and the order's `subtotalMinor + taxTotalMinor` MUST equal its
      `totalMinor` exactly.
- **FR-003**: The platform MUST recompute the quote server-side at order creation and MUST NOT use a
      client-supplied price, tax, or total. A quote whose fingerprint differs from the recomputed one
      MUST be refused with a conflict, so a changed price is confirmed rather than silently charged.
- **FR-004**: Order creation MUST be **idempotent** on a stable business key scoped to the
      customer. A repeated key MUST return the original order and MUST NOT create a second order or a
      second reservation, including when two such requests race.
- **FR-005**: The order MUST have an **explicit, documented state machine** with the states
      `PENDING_PAYMENT`, `PAID`, `PAID_PENDING_ALLOCATION`, `PAYMENT_FAILED`, `CANCELLED`,
      `EXPIRED`, and `FULFILLED`, and every transition MUST be permitted from an explicit set of
      source states. A transition that is not permitted MUST be refused, and the refusal MUST NOT
      change the order.
- **FR-006**: Order creation MUST hold the ordered stock with a **configurable reservation window**
      of fifteen minutes by default, through the existing atomic reservation primitive, so two
      concurrent orders cannot both hold the same stock.
- **FR-007**: A reservation that expires or is released MUST NOT be consumed by a later payment
      event. A payment that arrives after the order's reservation has lapsed MUST move the order to
      `PAID_PENDING_ALLOCATION`, which records that the money arrived and that the stock was **not**
      allocated, and the discrepancy MUST be recorded rather than hidden.
- **FR-008**: The platform MUST release the held stock when an order is cancelled, when its window
      lapses, or when its payment fails, and the release MUST be idempotent.
- **FR-009**: Only the **owning customer** may read or cancel an order, and an administrator MUST
      reach orders only through the administrative route. An order that belongs to another customer
      MUST be answered exactly like one that never existed.
- **FR-010**: A customer cancellation MUST be refused for an order that has already been paid,
      because a paid order needs the refund workflow, and it MUST be idempotent for an order that is
      already cancelled or expired.
- **FR-011**: The platform MUST record a pre-order under a **distinct lifecycle** with the states
      `AWAITING_STOCK`, `STOCK_RESERVED`, `AWAITING_PAYMENT`, `CONVERTED`, `CANCELLED`, and
      `EXPIRED`, and MUST NOT capture, charge, or settle any payment while a pre-order is
      `AWAITING_STOCK`.
- **FR-012**: A pre-order MUST become payable only after its stock has been physically available and
      atomically reserved, and the platform MUST NOT turn unavailable stock into payable inventory.
- **FR-013**: Every order and pre-order transition MUST be recorded as a durable, append-only event
      with the actor, the previous state, the next state, and the time, so the history is auditable.
- **FR-014**: The platform MUST revalidate, at order creation, the SKU's publication state, the
      current effective price, the quantity, the stock, and the destination's approvals, and MUST
      refuse the order when any of them fails.
- **FR-015**: The order MUST snapshot the **bundle composition** of every bundle line, so a later
      change to a bundle cannot alter the purchase.
- **FR-016**: The milestone MUST add no new runtime or development dependency, no new
      infrastructure, and no new source of truth. It MUST use the published contracts of the
      Checkout, Cart, Inventory, and Tax capabilities.
- **FR-017**: The milestone MUST apply only safe, additive migrations, and MUST NOT change any
      existing route, operation identifier, status code, or response shape.
- **FR-018**: The platform MUST NOT enable a production checkout or payment path, and MUST NOT
      invent a shipping rate.
- **FR-019**: Every documented order and pre-order behavior MUST be covered by an automated test,
      including the concurrent idempotency case, the overselling case, the expiry race, the
      cross-customer access case, the authorization denial, the cancellation rules, and the failure
      paths.
- **FR-020**: The platform MUST NOT send a customer message for any order or pre-order event, and
      MUST NOT invent a customer deadline for a pre-order, because HC-DEC-014 and HC-DEC-015 leave
      both open.
- **FR-021**: Once an order is created, the platform MUST remove the cart lines the order covers,
      through the Cart capability's own published contract, so the customer does not see the ordered
      items as still buyable. A failure to remove a line MUST NOT undo the order or its stock hold.

### Key Entities

- **Order**: one purchase, with its state, its customer, its money snapshot, its reservation, and its
  audit trail.
- **Order line**: one purchased item, with its own immutable price, tax, and composition snapshot.
- **Order event**: one recorded transition, with the actor and the two states.
- **Order idempotency key**: the stable business key that makes a repeated request safe.
- **Pre-order**: an intent to buy what is not yet available, with its own distinct lifecycle.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every stored amount in every order is an exact integer count of minor units, and the
      order's subtotal, tax total, and total are internally consistent for every combination the
      automated suite covers.
- **SC-002**: Repeating an order request with the same idempotency key, sequentially or
      concurrently, always leaves exactly one order and exactly one reservation.
- **SC-003**: Two concurrent orders for the same scarce stock never both succeed, and the platform's
      available quantity never goes negative.
- **SC-004**: A customer can neither read nor cancel another customer's order, and an
      administrator cannot read one through a customer route.
- **SC-005**: A price change between the confirmation and the order creation is refused with a
      conflict, and the customer confirms the new price.
- **SC-006**: The complete quality gate passes, the previous milestones' behavior is unchanged, and
      the milestone's own documentation records the executed evidence.

## Assumptions

- **M09-ASM-001**: The settlement currency is EGP, as HC-DEC-008 approved, and the order's currency
  is the quote's currency.
- **M09-ASM-002**: The initial pending-payment reservation window is fifteen minutes, which is the
  Inventory capability's existing default, and it is configurable per order.
- **M09-ASM-003**: The order's stock is held at creation and confirmed when the payment succeeds,
  and the Milestone 10 payment event drives that confirmation.
- **M09-ASM-004**: The order's fulfilment state is recorded but no shipment, label, or delivery
  promise is created, because the shipping capability is Milestone 11.
- **M09-ASM-005**: A pre-order's deadline, reminder, and retry policy are not implemented, because
  HC-DEC-015's approved scope does not define them and no notification channel is approved.
- **M09-ASM-006**: The cart lines an order covers are removed from the cart once the order is
  created, through the Cart capability's own published contract, so the Cart keeps ownership of the
  cart data. A failure to remove a line leaves the cart unchanged and is harmless, because the
  order's reservation already holds the stock and the next quote would report the reduced
  availability.
