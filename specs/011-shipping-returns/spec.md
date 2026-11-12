# Feature Specification: Milestone 11 - Shipping and Returns

**Feature Branch**: Not created; the repository has no commits yet and no `before_specify` branch hook
is configured

**Created**: 2026-10-21

**Status**: Approved for development. The Product Owner authorized the Milestone 11–14 batch on
2026-10-21, and the M06–M10 audit recorded a **CONDITIONAL GO** for M11–M14 development on the
verified isolated databases.

**Input**: User description: "Milestone 11 — Shipping & Returns. Complete the Spec Kit workflow,
backend implementation, API contracts, and tests for shipping destinations, configurable shipping
methods, shipment lifecycle, tracking, returns, and inventory/refund coordination. Do not invent actual
shipping rates, providers, delivery commitments, country eligibility, or merchant return policies. Use
explicitly labeled test configurations where external business approval is missing."

## Scope Boundaries and Open Decisions

The register records the governing decisions as `Approved (development scope)` with their **activation
blockers** stated separately.

- **HC-DEC-005 (Approved, development scope)** - browsing may remain global, but final checkout and
  payment are disabled for a destination without approved shipping and tax rules, and no live
  shipping price, delivery promise, or unsupported country is invented. Shipping integration stays
  modular for Milestone 11.
- **HC-DEC-012 (Open)** - the return and exchange policy - eligibility window, item condition,
  bundle treatment, reverse logistics, inventory disposition, fees, and refund interaction - is **not**
  approved. This milestone therefore builds the return **mechanism** and leaves every policy
  parameter to configuration, and it does not implement an exchange.
- **HC-DEC-013 (Open)** - the shipping providers, services, rate calculation, service areas,
  tracking, labels, delivery exceptions, and fallback behavior are **not** approved. This milestone
  therefore has **no provider**, **no carrier rate calculation**, and **no delivery commitment**; a
  shipping method's amount is a value an administrator configures, and the platform never computes
  one.

**What "do not invent" means here, concretely.**

| Not invented | What the milestone does instead |
| ------------ | --------------------------------- |
| A shipping rate | A method's amount is a configured value, environment-scoped and explicitly labelled as a test configuration. |
| A provider or carrier | A shipment records a free-form tracking reference an administrator sets. No provider is registered and no provider is called. |
| A delivery commitment | The model has no estimated delivery date or transit time at all. |
| Country eligibility | Destinations are administrator-approved configuration. The platform carries no built-in country list. |
| A merchant return policy | The return mechanism exists; the window, the reasons, and the restock decision are configuration or an administrator's decision at receipt. |
| A live refund | A completed return requests a refund through the Payments capability's contract, which is itself a non-production provider. |

**Production activation blockers.** Local development completion is not production readiness. The
merchant's VAT registration status, a production tax configuration, a production destination and
shipping-method configuration, a reviewed payment-provider contract, an approved shipping-provider
contract, a security sign-off on the development dependency advisory, and hosted continuous
integration all remain outstanding.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See the shipping options and what they cost (Priority: P1)

A customer with a cart asks what it would cost to ship. The platform lists the shipping methods an
administrator has configured for that destination, each with its configured amount, and adds the
chosen one to the total. When no method has been configured for the destination, the platform says so
rather than inventing one.

**Why this priority**: A customer who cannot see the shipping cost cannot complete a purchase, and a
platform that invents a rate is worse than one that admits it has none.

**Independent Test**: Configure two methods for one country and none for another, quote a cart for
each, and confirm the first lists the two methods with their configured amounts and the second
reports that no method is available and charges nothing.

**Acceptance Scenarios**:

1. **Given** two configured methods for a destination, **When** the customer quotes the cart, **Then**
   both are listed with their exact configured amounts and the selected one is added to the total.
2. **Given** no configured method for a destination, **When** the customer quotes the cart, **Then**
   no method is listed, no shipping amount is added, and the quote reports that no method is
   available.
3. **Given** a method that is configured for another destination, **When** the customer selects it,
   **Then** the selection is refused and the quote names the method as unavailable.
4. **Given** a client that submits its own shipping amount, **When** the quote is produced, **Then**
   the submitted amount is ignored and the configured amount is used.

### User Story 2 - Follow a shipment (Priority: P1)

A customer follows a shipment. The shipment moves through an explicit lifecycle - prepared, packed,
handed to the carrier, delivered - and every transition is recorded with who caused it. A shipment
that is cancelled stops there.

**Why this priority**: A shipment that silently changes state cannot be reconciled, and a customer
who is told a shipment is "on its way" when it is not has been misled.

**Independent Test**: Move a shipment through its lifecycle and confirm each transition is recorded,
that an impermissible transition is refused without changing the shipment, and that a cancellation
is recorded.

**Acceptance Scenarios**:

1. **Given** a prepared shipment, **When** it is packed, handed to the carrier, and delivered, **Then**
   the shipment reports each state and records each transition with its actor.
2. **Given** a delivered shipment, **When** a transition is attempted, **Then** it is refused, the
   shipment is unchanged, and the refusal is recorded.
3. **Given** a shipment, **When** the administrator sets a tracking reference, **Then** the reference
   is stored and reported, and no carrier is contacted.

### User Story 3 - Return something (Priority: P2)

A customer asks to return part or all of an order. The return is recorded against the order, the
administrator decides whether the returned goods go back into stock when they arrive, and the money
for the returned goods is refunded through the Payments capability.

**Why this priority**: A return that does not put the goods back into stock, or that refunds money
without recording what was returned, breaks the platform's stock and money accounting.

**Independent Test**: Request a return, approve it, receive it, restock it, and confirm the stock
returned to sale and the refund was requested; then confirm a rejected return restocks nothing and
refunds nothing.

**Acceptance Scenarios**:

1. **Given** a paid order, **When** the customer requests a return of part of it, **Then** the return
   is recorded as requested, with the exact lines and quantities, and nothing is refunded yet.
2. **Given** an approved return whose goods arrive, **When** the administrator receives it and chooses
   to restock, **Then** the stock returns to sale through the Inventory capability and a refund is
   requested through the Payments capability.
3. **Given** a rejected return, **When** it is rejected, **Then** no stock is restocked and no refund
   is requested.
4. **Given** a return for an order that belongs to another customer, **When** it is requested, **Then**
   the request is refused exactly as an unknown order would be.

### User Story 4 - Never let a return or shipment move money or stock twice (Priority: P1)

A request that is retried - by a customer, by an operator, or by a network retry - must not restock
the same goods twice or refund the same money twice.

**Why this priority**: A duplicated refund or a duplicated restock is a direct financial and stock
defect, and the platform's own audit found the same class of defect in the payment path.

**Independent Test**: Repeat a restock and a refund request, and deliver the same return-received
command twice, and confirm each effect happens once.

**Acceptance Scenarios**:

1. **Given** a return that was already received and restocked, **When** the receive command is
   repeated, **Then** the stock is not restocked again and the return is unchanged.
2. **Given** a refund that was already requested for a return, **When** the refund is repeated, **Then**
   the same refund is returned and no second money movement is recorded.

## Edge Cases

- A cart is quoted for a destination that has no approved destination row; the quote reports the
  destination as unsupported and adds no shipping amount.
- A customer selects a method that has been deactivated since the quote was produced; the order is
  refused so the customer confirms a current figure.
- A shipment is created for an order that has not been paid; the shipment is refused, because
  fulfilment of an unpaid order is not a supported operation.
- A shipment is created twice for the same order; the platform refuses the second one rather than
  splitting the order into two shipments without a rule that says to.
- A return is requested for more units of a line than the order contains; the request is refused.
- A return is requested against an order that was never paid; the return is refused, because there is
  no money to return.
- A return's goods arrive and the administrator chooses not to restock them; the return is recorded as
  received without restocking, and the reason is recorded.
- A return is cancelled after it was received; the cancellation is refused, because the stock has
  already moved.
- Two administrators receive the same return at the same time; the stock is restocked once.
- A refund for a return is refused because the payment's remaining refundable amount is smaller than
  the return's amount; the refusal names the remaining amount.
- A tracking reference is set to an empty string; the empty value is refused rather than stored.
- The same idempotency key is used for two different returns; the second request is refused as a
  conflicting key rather than applied.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The platform MUST own a **Shipping and Fulfillment** capability that holds the
      shipping destinations, the shipping methods, the shipments, and the returns, and that reaches no
      other capability's tables.
- **FR-002**: A shipping destination MUST be administrator-configured and environment-scoped, so a
      `TEST` destination can never enable a production checkout, and the platform MUST carry **no**
      built-in country list.
- **FR-003**: A shipping method MUST be administrator-configured and environment-scoped, and MUST
      state its exact integer minor-unit amount and its currency. The platform MUST NOT compute a
      rate, MUST NOT call a carrier, and MUST NOT store an estimated delivery date.
- **FR-004**: The platform MUST expose the configured methods for a destination through a published
      contract, and the Checkout capability MUST add the selected method's configured amount to the
      quote's total. A method that is unavailable for the destination MUST be refused.
- **FR-005**: The Checkout capability MUST ignore any client-supplied shipping amount, exactly as it
      ignores a client-supplied price or tax.
- **FR-006**: An order MUST snapshot the selected shipping method's code, label, amount, and
      currency, and its total MUST equal its net subtotal plus its shipping amount plus its tax. The
      database MUST refuse an order whose figures do not add up.
- **FR-007**: The platform MUST have an explicit, documented **shipment state machine** with the
      states `PREPARED`, `PACKED`, `HANDED_OVER`, `DELIVERED`, and `CANCELLED`, and every transition
      MUST be permitted from an explicit set of source states.
- **FR-008**: Every shipment transition MUST be recorded in an **append-only** event log with the
      actor, the previous state, the next state, the reason, and the time. A refused transition MUST
      be recorded while the shipment's own state is left unchanged.
- **FR-009**: A shipment MUST be created only for an order that has been paid, and the platform MUST
      refuse a second shipment for the same order.
- **FR-010**: A shipment MUST record the destination it is going to and the items it carries, and
      MUST NOT contain a delivery commitment, a carrier rate, or a carrier integration.
- **FR-011**: A tracking reference MUST be a free-form value an administrator sets, and the platform
      MUST NOT present it as carrier-verified tracking.
- **FR-012**: The platform MUST have an explicit, documented **return state machine** with the states
      `REQUESTED`, `APPROVED`, `REJECTED`, `RECEIVED`, `REFUNDED`, and `CANCELLED`, and every
      transition MUST be permitted from an explicit set of source states.
- **FR-013**: A return MUST reference an order the platform owns and MUST record the exact lines and
      quantities returned, and a request for more units of a line than the order contains MUST be
      refused.
- **FR-014**: A return MUST NOT be requested against an order that was never paid, because there is
      no money to return.
- **FR-015**: Receiving a return MUST restock through the Inventory capability's published contract and
      MUST request the refund through the Payments capability's published contract. The Shipping
      capability MUST NOT write the inventory or the payment tables.
- **FR-016**: Receiving a return MUST restock **once**, and a repeated receive MUST NOT restock again.
- **FR-017**: A refund for a return MUST be **idempotent** on a stable business key, and the refunds
      for one return MUST never exceed the amount the return covers.
- **FR-018**: A return MUST be refused for an order that belongs to another customer, exactly as an
      unknown order would be refused.
- **FR-019**: Every administrative change to a destination, a method, a shipment, or a return MUST be
      attributable to the administrator who made it, and MUST be recorded.
- **FR-020**: The milestone MUST add no new runtime or development dependency, no new
      infrastructure, and no new source of truth.
- **FR-021**: The milestone MUST apply only safe, additive migrations, and MUST NOT change any
      existing route's operation identifier, status code, or response shape except by adding the
      shipping block to the quote and the order.
- **FR-022**: Every documented shipping and return behavior MUST be covered by an automated test,
      including the unavailable method, the refused transition, the duplicate restock, the repeated
      refund, the cross-customer access, the authorization denial, and the idempotency race.
- **FR-023**: The platform MUST NOT send a customer message about a shipment or a return, because
      HC-DEC-014 leaves the notification channel open.

### Key Entities

- **Shipping destination**: an administrator-approved country, environment-scoped.
- **Shipping method**: an administrator-configured method with its exact amount, environment-scoped.
- **Shipment**: one fulfilment of one order, with its state, its destination snapshot, its items, and
  its recorded transitions.
- **Shipment event**: one recorded shipment transition.
- **Return**: one requested return, with its lines, its state, and its recorded transitions.
- **Return event**: one recorded return transition.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every shipping and return amount is an exact integer count of minor units, and an
      order's net subtotal plus its shipping amount plus its tax equals its total exactly.
- **SC-002**: The quote for a destination lists exactly the configured methods and nothing else, and
      the platform never computes a rate.
- **SC-003**: A repeated receive or a repeated refund changes nothing the second time.
- **SC-004**: A customer can neither read nor act on another customer's shipment or return, and the
      platform discloses nothing about whether the record exists.
- **SC-005**: No shipment, return, destination, or method contains a carrier, a computed rate, or a
      delivery date.
- **SC-006**: The complete quality gate passes, the previous milestones' behavior is unchanged, and
      the milestone's own documentation records the executed evidence.

## Assumptions

- **M11-ASM-001**: The settlement currency is EGP, as HC-DEC-008 approved, and a shipping method's
  amount uses that currency.
- **M11-ASM-002**: A shipping method's amount is a **configured** value, not a computed rate. Every
  method an administrator creates in a `TEST` environment is a test configuration, and the label
  states so.
- **M11-ASM-003**: The platform carries no delivery estimate, no carrier, and no country list, and
  no such field is added to the data model.
- **M11-ASM-004**: A return's eligibility window, its reasons, and its restock policy are
  **configuration and administrative decisions**, not platform rules, because HC-DEC-012 is open.
- **M11-ASM-005**: Shipping is **not taxed** by the tax engine in this milestone, because no
  shipping tax classification is approved. The amount is added to the order's total after the tax is
  computed, and the assumption is recorded.
- **M11-ASM-006**: A restock is a stock increase through the Inventory capability's contract; it is
  not a return of a reservation, because a confirmed order's stock was already sold.
- **M11-ASM-007**: A return's refund is requested against the order's successful payment through the
  Payments capability's contract, and it is subject to that capability's cumulative refund limit.
- **M11-ASM-008**: The platform sends no customer message about a shipment or a return, because
  HC-DEC-014 leaves the notification channel open.


## Independent completion verification — 22 October 2026

This supersedes the earlier blanket completion claim for safety/correctness evidence. M11's currently authorized development mechanisms pass: pnpm verify (387unit/37suites), full integration296/15, and shipping/returns HTTP8/1, on the new owned hc_batch_final_20261021 targets. Evidence: C:/Users/zyad/Documents/ChatGPT/zyad ashraf/nordhaven-m11-m14-final-20261021/gates/m11-acceptance-*.log. The historical three original databases remain untouched at14 migrations. New targets now25, with additive return-claim and configuration-history migrations; the older column-removal SQL was not replayed.

Corrections: cumulative serialized return quantity/money claims; exact cumulative integer allocation with cancellation release; historical unknown per-line amounts fail closed; truthful pending/failed refund state; atomic receipt/restock/flags/facts; snapshot-based DYNAMIC component return versus independent FIXED finished goods; movement-key payload validation and sorted locks; retained administrator configuration facts; production shipping configuration refusal; stable concurrent full-refund business-key claims before budget checks. Existing test assertions are retained.

Shipping charge collection is NOT implemented. Earlier spec FR004–FR006, story1 quote-total statements and SC001 must not be treated as satisfied by configured options/shipment snapshots. They remain deferred pending the approved shipping-charge/tax treatment and a separately tested acyclic quote/pricing design. No shipping amount is added to payable totals, and no tax exemption or merchant return policy is inferred. This is an explicit scope/acceptance limitation rather than an approval of a new business decision. Current development acceptance covers the safe mechanisms requested by the Product Owner; final commercial/production acceptance remains blocked.
