# Research: Milestone 08 - Checkout and Tax

> Independent remediation note (2026-10-21): historical assumptions about detached transactions, constant-only order TTL, foreign root lookups and provider/refund/pre-order behavior are superseded by [the audited remediation design](../../docs/audits/m06-m10-remediation-design.md). Approved business decisions and the constitution are unchanged.

**Date**: 2026-10-21

The Product Owner approved the checkout, tax, order, payment, and refund **development scope** on
2026-10-21, which resolves the decisions that blocked the earlier planning-only milestone. The
findings below record how the approved scope becomes an implementation, and they preserve the
distinction between a **development decision** and a **production activation**.

## Findings

### R1 - The tax rules are configuration data, not code

The approved decision requires "a configurable, auditable tax calculation engine with product
classification, destination, effective dates, tax-inclusive/exclusive pricing, rounding, and tax
snapshots", and explicitly forbids hardcoding 14 percent as a universal rate.

That rules out a constant. A rule therefore needs, at minimum:

- an **environment scope**, so a `TEST` rule can never apply to a production request and a
  production request finds no rule until one is approved and configured. This is what makes the
  "no production tax without an approved configuration" rule structural rather than a convention.
- a **jurisdiction**, the country whose rules apply, because the destination determines the tax.
- a **product classification**, because the rate depends on what the product is, not only where it
  ships.
- a **rate in basis points**, an exact integer, because money is never a float.
- an **inclusive or exclusive flag**, because a tax-inclusive price needs the tax extracted rather
  than added.
- an **effective window**, because a rule must be able to expire.
- a **priority**, so overlapping rules resolve deterministically rather than by database order.

The rate is stored in basis points rather than a decimal percentage so that no rounding happens
before the calculation.

### R2 - The tax calculation is a pure function

The engine takes a list of priced lines, the rules, and the destination, and returns the tax
breakdown. It performs no I/O, so it is exhaustively unit-testable and cannot drift from the
persistence layer.

The arithmetic is integer-only:

- **Exclusive** (the price excludes tax): `tax = round_half_up(net * rate / 10000)`, where `net` is
  the line's exact net amount.
- **Inclusive** (the price already includes tax): the net is extracted first and the tax is the
  difference, so `tax = gross - net` and `net + tax = gross` exactly. Rounding once, at the
  extraction, keeps the identity exact.

The rounding rule is **half up**, applied once per line, matching the Milestone 06 price rule's
convention. A per-line round and then a sum is not the same as a round of a sum, and the decision
is that the tax is a **per-line** amount, because tax is assessed per item, and the totals sum the
per-line amounts. This is stated explicitly because it is observable.

### R3 - The subtotal, the tax total, and the total are always consistent

The quote reports a net subtotal, a tax total, and a total, and the identity
`total = netSubtotal + taxTotal` holds **exactly**, in every configuration, including a tax-inclusive
one. A tax-inclusive quote therefore reports a net subtotal that is *less* than the gross line
amounts, with the tax total making up the difference, so the customer still pays the gross amount
they were shown.

Reporting the gross amount as the "subtotal" for a tax-inclusive quote would break the identity, so
the subtotal is always the net one and the total is always what is charged. The response names the
pricing mode so a client is never confused.

### R4 - A missing tax rule blocks the quote; it is never a zero rate

The approved decision forbids assuming an exemption or a zero rate, and requires production tax
calculation to be disabled for a jurisdiction without an approved configuration. The only
implementation that satisfies both is to make a missing rule a **blocker**.

So a quote for a destination with no matching rule is not ready, with the reason
`TAX_RULE_MISSING`. The alternative - treating the missing rule as zero tax - would let an
unconfigured jurisdiction check out for free, which is exactly what the decision forbids.

The one place a zero rate is legitimate is an **explicitly configured** rule with a rate of zero
basis points. That is a configured decision, not an absence.

### R5 - A price change is reported, not applied silently

HC-COM-001 requires the server to revalidate cart pricing and inform the customer of any change. The
Milestone 07 cart already stores the last-known price and the current price per line, and reports
whether they differ. The quote therefore reuses that comparison and reports it, and always uses the
**current** price. The customer is never charged a stale price, and the change is visible before the
customer confirms.

### R6 - The quote is a fingerprint, so a later step can detect staleness

A customer confirms a quote; between the quote and the confirmation a price may change. The order
must not be created from a quote the customer never saw.

The quote therefore carries a **fingerprint**: a deterministic digest of the material content -
the destination, each line's identity, quantity, unit price, tax amount, and the totals. The
Milestone 09 order creation recomputes the quote and compares the fingerprint. A mismatch is a
conflict, not a silent re-price.

The fingerprint covers the material content only, so it is stable across an unrelated change such as
a re-read of the same cart.

### R7 - The quote is a pure function of the cart and the destination

The same cart and destination always produce the same quote. That is what makes the fingerprint
meaningful, and it rules out a quote that depends on a timestamp or on a random identifier. The
quote's *readiness* can depend on the current time only through a tax rule's effective window, which
is itself deterministic for a given instant.

### R8 - The Checkout capability publishes a contract; the Orders capability consumes it

Milestone 09 owns the order. If the Orders capability imported the Checkout implementation, the two
would be coupled and a circular dependency would form, because checkout needs the order's
reservation behaviour. So the Checkout capability publishes a **typed quote contract** through its
module index, and the Orders capability depends on that contract, not on the checkout's internals.

The contract is deliberately narrow: a quote request and a quote result. Everything the order needs
- the lines, the prices, the tax, the totals, the fingerprint, the blockers - is in the result.

### R9 - The three upstream capabilities are read through published contracts

The quote needs the cart's lines, the catalog's current prices, and the inventory's availability.
Reading those tables directly would reach into another capability's data, which the architecture
rules forbid.

The existing codebase already has the pattern for this: the Cart and Wishlist capabilities read the
Catalog's rows through a **declared foreign key** and a Prisma relation, never by importing the
Catalog's code. The Checkout capability follows the same rule. Where the Checkout capability needs
capability behaviour rather than a row - the inventory's availability, which depends on the
reservation ledger - it uses a published contract.

### R10 - The inventory's availability is a contract, not a table read

Availability is not a column. It is `on_hand - reserved`, and the reservation ledger is the
Inventory capability's own state, with its own expiry rules. Reading `inventory_items` directly from
checkout would ignore the reservation holds and would produce a quote that says "in stock" for a
line another customer is holding.

So the Inventory capability publishes an **availability contract**, and the quote uses it. The
availability calculation stays in one place, the Inventory capability's.

### R11 - A DYNAMIC bundle line uses the approved composition, and a customer cannot substitute

The approved decision permits component-derived inventory for a DYNAMIC bundle and forbids
arbitrary customer-selected components. The M05 bundle model already stores the approved
composition - the component SKUs with their minimum and maximum quantities - and the Milestone 05
bundle service already resolves a bundle's availability from that composition.

So the DYNAMIC bundle's line quantity is expressed in **bundle units**, and the availability and the
eventual reservation are derived from the approved composition. A customer never chooses components.

The quantity semantics are therefore: for a FIXED bundle the line quantity is in bundle units; for a
DYNAMIC bundle the line quantity is also in bundle units, and the approved composition determines
the component quantities. This is a deliberate simplification: without it, a DYNAMIC bundle's
quantity would be ambiguous.

### R12 - A FIXED bundle line is priced by its own product, and reserved as finished goods

A FIXED bundle is an independently stocked finished good with its own product, so it has its own
base price, its own direct discount, and its own effective price. The quote prices it exactly like a
variant line, and the reservation it leads to holds the bundle's own finished goods.

This is what HC-DEC-017 approved, and it is why the cart line must be able to reference a bundle
rather than only a variant.

### R13 - A cart line may reference a variant or a bundle, never both

The M05 inventory row already uses the "exactly one owner" pattern: an inventory row belongs to a
variant or to a bundle, never both. The cart line follows the same pattern with the same database
constraint, so a line can never reference a missing or an ambiguous owner.

This is why the M08 migration alters the M07 cart table: the cart line gains a nullable bundle
reference and a nullable variant reference with an exactly-one-owner constraint, and the variant
reference becomes nullable. The change is additive and safe.

### R14 - The tax classification belongs to the Tax capability

A product's tax classification is tax data, and the Tax capability owns the tax rules, so it owns
the classification too. The Catalog capability is not modified, and the Tax capability references the
product through the same declared-foreign-key pattern the Cart and Wishlist capabilities use.

A product with no classification uses the standard classification, which is stated as an assumption
rather than as a database default, because the classification table is the authority and the absence
of a row is the signal.

### R15 - The destination approval is checkout-owned configuration

"Final checkout/payment must be disabled for destinations without approved shipping and tax rules"
requires the platform to know which destinations are approved. That is checkout configuration, and it
is environment-scoped for the same reason the tax rules are.

The destination row carries the tax jurisdiction it uses, whether shipping is approved for it, and
whether it is enabled at all. A destination that is enabled but has no shipping approval still
blocks the quote, because the approved decision requires **both**.

### R16 - A quote is not ready for a reason, and the reason is a closed set

The blockers are a closed, typed set, so a client can render them and a test can assert them. The
set is deliberately small: an empty cart, an unavailable product, an unsupported quantity, a line
that exceeds the available stock, an unsupported destination, a destination with no shipping
approval, a missing tax rule, a mixed tax-pricing mode, and a price that is not in the settlement
currency.

The last two are the reasons the implementation found while it was written. A **mixed tax-pricing
mode** means some rules treat the price as tax-inclusive and others as tax-exclusive, so a single
subtotal would be ambiguous even though every individual line is exact. A **price that is not in the
settlement currency** must be refused rather than converted, because no conversion is implemented
(HC-DEC-009), and a converted amount would be a number the platform cannot reproduce.

The reasons are reported on the quote rather than thrown as errors, because a customer needs to see
all of them at once, not one per attempt.

### R17 - Only the customer may obtain a quote

The quote is scoped to the authenticated principal, exactly as the cart and the wishlist are. No
route names a customer, so there is no identifier to guess.

### R18 - No production activation is possible from this milestone

The production tax rules and the production destination list do not exist, so a production request
finds no rule and no destination and is blocked. The only payment adapter is a non-production one.
The milestone therefore cannot be activated for production by configuration alone, which is the
correct posture for an unreviewed tax and payment posture.

### R19 - The audit trail records the actor and the change

"Configurable, auditable" means the change to a tax rule or a destination is attributable. Each
administrative write records the acting administrator, the change, and the time, in the same row
history the M02 security events use.

The audit records the administrator's identifier and the changed fields, never a secret and never a
customer's data.

### R20 - No new dependency, configuration key, or infrastructure

The engine is integer arithmetic, the configuration is data, and the contracts are TypeScript
interfaces. Nothing is added to `package.json`, no environment key is introduced, and no service is
introduced.
