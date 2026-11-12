# Feature Specification: Milestone 08 - Checkout and Tax

**Feature Branch**: Not created; the repository has no commits yet and no `before_specify` branch hook
is configured

**Created**: 2026-10-21

**Status**: Approved for development. The Product Owner approved the checkout, tax, order, payment,
and refund development scope on 2026-10-21, which resolves the decisions that previously blocked this
milestone.

**Input**: User description: "Milestone 08: Checkout and Tax for Nordhaven Commerce - secure checkout
calculation, validation, tax estimation, deterministic totals, checkout readiness rules, and the
typed interfaces that order creation needs, with the order and payment ownership completed in
Milestones 09 and 10."

## Scope Boundaries and Open Decisions

The Product Owner approved the **development scope** on 2026-10-21. The register records each
decision as `Approved (development scope)` with its **activation blockers** stated separately, so a
development decision is never mistaken for a production activation.

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
- **HC-DEC-006 (Approved, development scope)** - a configurable, auditable tax calculation engine
  with product classification, destination, effective dates, tax-inclusive and tax-exclusive
  pricing, an explicit rounding rule, and tax snapshots. The possibility of Egyptian VAT where
  legally applicable is supported, but **14 percent is not hardcoded** as a universal rate on every
  product, order, or country. Automated tests use clearly identified **TEST** tax fixtures.
  Production tax calculation is not enabled for a jurisdiction without an approved tax
  configuration, and no tax exemption, zero rate, or Egyptian e-receipt compliance is assumed.
- **HC-DEC-008 (Approved, development scope)** - EGP is the initial checkout and settlement
  currency. Other currencies may be displayed for information later. No live FX conversion, FX
  settlement, or international payment guarantee is implemented.
- **HC-DEC-009 (Approved, development scope)** - no live FX conversion is implemented; every
  monetary amount is in the base or settlement currency.
- **HC-DEC-005 (Approved, development scope)** - browsing may remain global, but final checkout and
  payment are disabled for a destination without approved shipping and tax rules. No live shipping
  price, delivery promise, or unsupported country is invented; shipping integration stays modular
  for Milestone 11.
- **HC-DEC-020 (Approved, development scope)** - dynamic bundles use component-derived inventory and
  the approved bundle composition, and arbitrary customer-selected components are **not** permitted in
  this phase.

**Still open, and therefore not implemented here:** HC-DEC-001 (V1 scope), HC-DEC-002 (email
verification), HC-DEC-003 (privacy lifecycle), HC-DEC-012 (returns and exchanges), HC-DEC-013
(shipping providers and rates - the shipping **rate** is Milestone 11), HC-DEC-014 (notification
channels), HC-DEC-016 (launch capacity targets), and the project identity, security, and legal
matters those decisions own.

**Production activation blockers.** Local development completion is not production readiness. The
following remain unapproved and keep production checkout, payment, and tax disabled: the merchant's
exact VAT registration status and cross-border tax obligations; a production tax configuration and a
production destination list; a reviewed payment-provider contract; production shipping rules and
rates; a security sign-off on the development dependency advisory; and hosted continuous
integration. The platform enforces this structurally: a production-scoped tax rule or destination
that does not exist blocks the operation, and the only payment adapter is a non-production one.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See an exact, trustworthy price for the whole cart (Priority: P1)

A customer with a cart asks what the whole thing will cost. The platform returns a single quote with
the price of every line at the price that applies **now**, the tax on every line, the subtotal, the
tax total, and the final total, all in exact minor units in one currency. The customer is told when
a price changed since they added the item, so they are never surprised at the last step.

**Why this priority**: A wrong total is the fastest way to lose a customer's trust, and the
constitution requires exact money with an explicit rounding rule. The quote is also the input every
later step consumes, so it must be right before anything is built on it.

**Independent Test**: Fill a cart with several products, apply a tax configuration, request a quote,
and confirm the line prices, the line taxes, the subtotal, the tax total, and the total are exact
integers that add up, that the tax matches the configured rate under the stated rounding rule, and
that a price change between the cart and the quote is reported.

**Acceptance Scenarios**:

1. **Given** a cart of two products priced 129900 and 5000 minor units, **When** the customer
   requests a quote, **Then** the subtotal is 134900 minor units, the tax is computed on that
   subtotal, and the total is the subtotal plus the tax, all in one currency.
2. **Given** a product whose catalog price changed since it was added to the cart, **When** the
   customer requests a quote, **Then** the quote uses the current price and reports the change.
3. **Given** a tax configuration whose rate produces a fractional minor unit, **When** the tax is
   computed, **Then** it is rounded half up to the nearest whole minor unit, and the rule is named in
   the quote.
4. **Given** a tax configuration where the price already includes tax, **When** the quote is
   produced, **Then** the tax is extracted from the gross amount, the net subtotal and the tax total
   are both reported, and the total equals what the customer pays.
5. **Given** a destination with no configured tax rule, **When** the customer requests a quote,
   **Then** the quote is not ready and names the missing configuration; no zero tax is assumed.
6. **Given** a customer who sends a price or a total, **When** the quote is produced, **Then** the
   submitted values are ignored entirely and the server's own values are used.

---

### User Story 2 - Be told exactly what stops a checkout (Priority: P1)

A customer whose cart cannot be checked out - a product was unpublished, the stock ran out, the
destination is not supported, or a tax rule is missing - is told each reason in plain terms instead
of meeting a generic error. The customer can fix what is fixable and try again.

**Why this priority**: A checkout that fails with an unexplained error is unusable, and a checkout
that silently proceeds past a missing tax rule would charge an unverified amount.

**Independent Test**: Construct a cart that is empty, then one whose product was unpublished, then
one whose line exceeds the available stock, then one for an unsupported destination, and confirm
each produces its own named reason.

**Acceptance Scenarios**:

1. **Given** an empty cart, **When** the customer requests a quote, **Then** the quote is not ready
   and reports that the cart is empty.
2. **Given** a cart line whose product is no longer published, **When** the customer requests a
   quote, **Then** the quote is not ready and reports that the product is unavailable.
3. **Given** a cart line whose quantity exceeds the available stock, **When** the customer requests a
   quote, **Then** the quote is not ready and reports insufficient stock for that line.
4. **Given** a destination that is not approved for checkout, **When** the customer requests a
   quote, **Then** the quote is not ready and reports that the destination is not supported.
5. **Given** a destination with no tax rule for a line's classification, **When** the customer
   requests a quote, **Then** the quote is not ready and reports the missing tax rule.

---

### User Story 3 - Quote the same thing the same way every time (Priority: P2)

The quote for a given cart and destination is the same every time it is produced, so the customer,
the order, and the payment all refer to the same numbers. A quote carries a fingerprint that changes
if anything material changed, so a later step can detect that it is working from a stale price.

**Why this priority**: Determinism is what makes an order, an invoice, and a payment agree. The
fingerprint is what lets Milestone 09 refuse an order built from a quote the customer never saw.

**Independent Test**: Produce the same quote twice and confirm the totals and the fingerprint are
identical, then change a price and confirm the fingerprint changes.

**Acceptance Scenarios**:

1. **Given** an unchanged cart and destination, **When** the quote is produced twice, **Then** the
   totals and the fingerprint are identical.
2. **Given** a quote, **When** a line's price changes, **Then** a new quote has a different
   fingerprint.
3. **Given** a quote, **When** the customer is told the fingerprint, **Then** the customer can
   present it back and a later step can tell whether it still matches.

## Edge Cases

- An empty cart produces a not-ready quote rather than a zero total that could be paid.
- A cart line whose product was deleted, or whose variant no longer exists, is reported as
  unavailable rather than crashing the quote.
- A tax rate of zero basis points is a valid configured rate and produces a zero tax, but a
  **missing** rule is never treated as a zero rate.
- A tax rule whose effective window has closed is not applied, even if it is the only rule.
- Two tax rules that both match the same line are resolved deterministically by priority, then by
  the most recent effective start, and never by an arbitrary database order.
- A tax-inclusive rule combined with a tax-exclusive rule in one quote is reported as ambiguous
  rather than mixed silently.
- A price that changed between the cart and the quote is applied at the current price and reported;
  the customer is never charged the stale price.
- A currency that is not the settlement currency is rejected rather than converted.
- A cart line for a DYNAMIC bundle reserves the bundle's approved component composition; a customer
  cannot substitute components.
- A cart line for a FIXED bundle reserves the bundle's own finished goods.
- A production request finds no production tax rule and no production destination, so production
  checkout is blocked by construction rather than by configuration that might be wrong.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The platform MUST calculate tax from **configurable rules** stored as data, each with
      an environment scope, a jurisdiction, a product classification, a rate in basis points, a
      tax-inclusive or tax-exclusive flag, an effective window, and a priority. No rate may be
      hardcoded as a universal rate.
- **FR-002**: Each product MUST have a tax classification owned by the Tax capability, and a
      product with no classification MUST use the standard classification.
- **FR-003**: Tax MUST be calculated with exact integer arithmetic in minor units, with the rounding
      rule **half up** applied once per line, and the rule MUST be named in every quote.
- **FR-004**: A tax-inclusive rule MUST extract the tax from the gross amount, and the quote MUST
      report the net subtotal, the tax total, and the total so that the total always equals what the
      customer pays.
- **FR-005**: A tax rule MUST apply only while its effective window is open, and where several
      rules match, the resolution MUST be deterministic.
- **FR-006**: A missing tax rule MUST make the quote not ready and MUST NOT be treated as a zero
      rate, and no tax exemption or zero-rate treatment may be assumed.
- **FR-007**: The platform MUST expose the tax rules and the approved checkout destinations
      through an administrative interface, and every change MUST be attributable to an actor and
      recorded.
- **FR-008**: A quote MUST revalidate, server-side, that every line's product is still published,
      that the current effective price is used, that the quantity is within the supported range, and
      that the stock is available.
- **FR-009**: The platform MUST NEVER trust a client-supplied price, tax amount, or total; every
      amount in a quote MUST be computed by the server.
- **FR-010**: A quote MUST report a price change between the cart and the quote, so the customer is
      informed before confirming.
- **FR-011**: The quote MUST expose an explicit readiness state and a typed reason for every
      blocker.
- **FR-012**: The subtotal, the tax total, and the total MUST be exact integer minor units in one
      explicit currency, and MUST be internally consistent.
- **FR-013**: A quote MUST carry a deterministic fingerprint of its material content, and the
      fingerprint MUST change when any material amount, line, or destination changes.
- **FR-014**: The checkout capability MUST publish a typed quote contract that the Orders
      capability consumes, so that order creation never depends on a checkout implementation detail.
- **FR-015**: A cart MUST NOT reserve stock; reservation happens only as part of order creation, and
      only for the lines the order contains.
- **FR-016**: Only an authenticated customer MAY obtain a quote, and a customer MUST NOT obtain a
      quote for another customer's cart.
- **FR-017**: The capability MUST add no new runtime or development dependency, no new
      infrastructure, and no new cross-module table read: it MUST use the published contracts of the
      Cart, Inventory, and Tax capabilities.
- **FR-018**: The capability MUST apply only safe, additive migrations, and MUST NOT change any
      existing route, operation identifier, status code, or response shape except by adding to the
      cart line projection the bundle identity a bundle line needs.
- **FR-019**: The capability MUST NOT enable production tax calculation or production checkout for a
      destination without an approved production configuration, and MUST NOT invent a shipping rate.
- **FR-020**: Every documented checkout behavior MUST be covered by an automated test, including the
      rounding, the missing-rule case, the invalid destination, the stale price, the stock change,
      the authorization denial, the repeated request, and the failure path.

### Key Entities

- **Tax rule**: a configurable rate for one environment, jurisdiction, and product classification,
  with an effective window, an inclusive or exclusive flag, and a priority.
- **Tax classification**: the tax classification of one product.
- **Checkout destination**: a country that may check out, with the tax jurisdiction it uses, whether
  shipping is approved for it, and the environment the approval belongs to.
- **Quote**: the server-calculated price of a cart for a destination, with its lines, its tax
  breakdown, its totals, its readiness, and its fingerprint.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every amount in every quote is an exact integer count of minor units, and the subtotal,
      the tax total, and the total are internally consistent for every combination of tax
      configuration, price, and quantity the automated suite covers.
- **SC-002**: The same cart and destination always produce the same totals and the same fingerprint,
      and any material change alters the fingerprint.
- **SC-003**: A quote is never produced for a cart that cannot be checked out, and every such cart
      has its own named reason.
- **SC-004**: No client-supplied price, tax amount, or total can change any amount the platform
      returns.
- **SC-005**: The complete quality gate passes, the previous milestones' behavior is unchanged, and
      the milestone's own documentation records the executed evidence.

## Assumptions

- **M08-ASM-001**: EGP is the checkout and settlement currency; a product priced in another currency
  cannot be checked out, because no conversion is implemented.
- **M08-ASM-002**: A tax rule's environment scope is either `TEST` or `PRODUCTION`; the platform
  selects the rules for the running environment, so a production request finds no rule until a
  production rule is approved and configured.
- **M08-ASM-003**: The tax rounding rule is half up, applied once per line, and a tax-inclusive
  line's net amount is the gross amount reduced by the rate, rounded half up.
- **M08-ASM-004**: The standard product classification is `STANDARD`; any other classification
  requires an explicit rule.
- **M08-ASM-005**: A DYNAMIC bundle line uses the bundle's approved component composition, and a
  customer cannot choose or substitute components.
- **M08-ASM-006**: The quote's fingerprint covers the destination, the line identities, the
  quantities, the unit prices, the tax amounts, and the totals, so any material change alters it.
