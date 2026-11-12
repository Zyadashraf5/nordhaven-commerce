# Nordhaven Commerce Architecture Overview

## Status and Authority

This is a preliminary architecture knowledge base, not a description of implemented
infrastructure and not a final entity-relationship design. Approved technology constraints come
from the [project constitution](../../.specify/memory/constitution.md) and
[project overview](../requirements/project-overview.md). Business choices in
[Open Decisions](../requirements/open-decisions.md) remain unresolved and override no facts by
implication.

## Approved Architecture Constraints

| ID             | Constraint                                                                                                                                                           |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HC-ARC-CON-001 | Use Node.js 22, strict TypeScript, and NestJS.                                                                                                                       |
| HC-ARC-CON-002 | Build a modular monolith organized by business capability, with separated API, application, domain, and persistence concerns.                                        |
| HC-ARC-CON-003 | Use PostgreSQL as the durable source of truth and Prisma as the default data-access and migration tool.                                                              |
| HC-ARC-CON-004 | Expose versioned REST APIs and keep the OpenAPI contract synchronized with behavior.                                                                                 |
| HC-ARC-CON-005 | Track and atomically reserve inventory per sellable SKU without allowing negative availability or overselling.                                                       |
| HC-ARC-CON-006 | Represent money exactly with an explicit currency and documented rounding rules; never use binary floating point for monetary calculations.                          |
| HC-ARC-CON-007 | Require server-side validation and authorization, secure customer authentication, and MFA for every administrator.                                                   |
| HC-ARC-CON-008 | Make payment operations idempotent and accept provider events only after webhook verification and durable deduplication.                                             |
| HC-ARC-CON-009 | Do not capture or settle a pre-order payment until stock is available and atomically reserved.                                                                       |
| HC-ARC-CON-010 | Use Docker for reproducible development and deployable builds and Jest for automated unit, integration, and end-to-end tests.                                        |
| HC-ARC-CON-011 | Introduce Redis, BullMQ, or another infrastructure component only after documenting a measured need, ownership, durability, failure modes, retries, and idempotency. |

## Preliminary System Context

The planned website, future React/Next.js storefront, and administrative interface are API
clients. They authenticate to one versioned REST/OpenAPI surface owned by the NestJS modular
monolith. The application persists authoritative business state in PostgreSQL through module-owned
data access. External payment, shipping, exchange-rate, tax, media, and notification systems are
adapter boundaries whose providers and exact responsibilities remain open.

No separate microservice, cache, queue, search engine, or worker deployment is approved by this
overview. Such components require a documented decision under the constitution.

## Preliminary Module Boundaries

These boundaries are candidates for planning. They may be refined through specifications and
decision records, but modules must not reach into another module's repositories or tables.

| Module                   | Owns                                                                                                                                                                                                                     | Permitted dependencies through public contracts                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Identity and Access      | Customer credentials, authentication, recovery, sessions, administrator MFA, principals, and authorization primitives                                                                                                    | Notifications for approved security messages; audit capability                                                                  |
| Customers                | Customer profile, saved shipping addresses, default-address selection, account-deletion requests, and wishlist ownership                                                                                                 | Identity and Access; Catalog identifiers for wishlist references                                                                |
| Catalog                  | Products, brands, two-level categories, attributes, variants, sellable SKU identity, descriptive product data, product media references, product search and filtering, direct product discounts, and the effective price | Media capability                                                                                                                |
| Inventory                | Warehouse stock balances or ledger, availability, per-SKU reservations, expiry, confirmation, and release                                                                                                                | Catalog SKU contract; audit capability                                                                                          |
| Bundles                  | Fixed bundle definitions, dynamic bundle rules, component quantities, selection validation, and composition snapshots                                                                                                    | Catalog, Inventory, and Pricing contracts; fixed-stock behavior is blocked by HC-DEC-017                                        |
| Pricing and FX           | Base-currency prices, direct product discounts, exact monetary calculations, display-currency quotes, and FX provenance                                                                                                  | Catalog SKU/product contract; external FX adapter after HC-DEC-009                                                              |
| Discovery                | Product search, filters, and read-optimized discovery views                                                                                                                                                              | Published Catalog and Pricing read contracts                                                                                    |
| Reviews                  | Ratings, comments, review image references, moderation state, and moderation audit facts                                                                                                                                 | Customers, Catalog, Media, and Identity and Access                                                                              |
| Cart                     | Authenticated carts, cart lines, selected variants or bundle configurations, and last-known price/availability references                                                                                                | Identity and Access, Catalog, Bundles, Pricing and FX, and Inventory                                                            |
| Checkout                 | Application-level orchestration of revalidation and the approved checkout state machine                                                                                                                                  | Cart, Customers, Pricing and FX, Tax, Inventory, Orders, Payments, and Shipping; exact sequencing is blocked by HC-DEC-004      |
| Tax                      | Tax quotes and the evidence used for order tax snapshots                                                                                                                                                                 | Pricing and FX, Customers/address contract, and an external tax adapter if approved under HC-DEC-006                            |
| Orders                   | Order aggregate, immutable commercial snapshots, order states, cancellation facts, and links to fulfillment and payment state                                                                                            | Receives validated inputs through public application contracts; policies depend on HC-DEC-004 and HC-DEC-010 through HC-DEC-012 |
| Pre-Orders               | Awaiting-stock intent, stock-readiness transition, payment invitation eligibility, deadline, and retry state                                                                                                             | Orders, Inventory, Payments, and Notifications; deadlines are blocked by HC-DEC-015                                             |
| Payments                 | Payment attempts, stable idempotency keys, provider references, verified webhook events, captures, refunds, reconciliation, and payment state                                                                            | Orders contract and provider adapters selected under HC-DEC-007                                                                 |
| Shipping and Fulfillment | Owned-warehouse fulfillment, shipments, packages, labels, tracking, and delivery exceptions                                                                                                                              | Orders, Inventory, Customers/address contract, Notifications, and providers selected under HC-DEC-013                           |
| Notifications            | Approved transactional messages, templates, delivery attempts, provider references, and consent-relevant evidence                                                                                                        | Consumes published events; channels and policy are blocked by HC-DEC-014                                                        |
| Media                    | Metadata and controlled references for product and review images                                                                                                                                                         | External object/media storage adapter when selected                                                                             |
| Administration           | Authenticated administrator use cases and moderation/catalog/operations entry points                                                                                                                                     | Identity and Access plus published application services; it owns no bypass path into other modules' persistence                 |
| Audit and Operations     | Security-sensitive audit records and shared telemetry conventions                                                                                                                                                        | Receives structured facts from modules without taking ownership of their business state                                         |

### Refinements recorded by the implemented milestones

The table above is the preliminary boundary list. Two milestones refined it, and each refinement is
recorded here so the table and the implementation stay in step.

- **Milestone 06 - search and pricing live with the Catalog.** The preliminary table places product
  search in a "Discovery" capability and the direct product discount in "Pricing and FX". The
  implementation extends the Catalog module instead, because the Catalog already owns the products,
  categories, brands, attributes, and the price, and because a price filter needs the base price and
  the discount together in one indexed query. A separate discovery module would either duplicate
  the predicate or read another module's tables, both of which the ownership rules forbid. The
  separate "Pricing and FX" boundary remains available for the display-currency quotes and FX
  provenance that HC-DEC-009 and HC-DEC-008 will require.
- **Milestone 07 - the cart is its own capability; the wishlist belongs to Customers.** The
  preliminary table already assigns the cart to a "Cart" capability, and that is what was
  implemented. The table also assigns wishlist ownership to "Customers", and the implementation
  follows it, so the wishlist reuses the existing customer-scoped route family and the customer
  profile it already depends on.
- **Milestone 08 - the tax and the checkout are separate capabilities that publish contracts to each
  other.** The preliminary table already assigns "Tax" and "Checkout" to separate capabilities, and
  the implementation follows it: the Tax capability owns the tax rules, the product tax
  classifications, and the calculation, and the Checkout capability owns the approved destinations and
  the quote. The Tax capability is **not** merged into the Catalog, because a tax rule is a
  jurisdiction-scoped rate with an effective window and a priority, and the Catalog's price is a
  different fact with a different lifecycle. The Checkout capability is **not** merged into the Cart,
  because a quote is a calculation over the whole cart rather than a property of any one line, and
  because the Cart's contract is deliberately scoped to a customer's intent.
- **Cross-module behaviour is reached through published contracts, not through table reads.** The
  preliminary rule already said that cross-module calls use published application interfaces, and
  Milestone 08 is the first milestone that needed one. The Cart publishes `CART_READER`, the
  Inventory publishes `INVENTORY_AVAILABILITY`, and the Tax capability publishes `TAX_ASSESSOR`; each
  is exported from the owning capability's module index and is the only cross-module import the
  consuming capability makes. The rule that remains is the one this overview already records:
  cross-module **data** is referenced through declared database foreign keys, and a capability never
  reaches into another capability's tables. A cart line references a SKU and a bundle that way, and a
  tax classification references a product that way. The two mechanisms do not conflict, because a
  declared foreign key carries a stable identifier and a published contract carries behaviour that
  the identifier alone cannot express - availability, in particular, is `on_hand - reserved` after
  the lapsed reservations are released, and a DYNAMIC bundle's capacity is derived from its
  component composition.
- **Cross-module data is referenced through declared foreign keys.** The Cart and the wishlist
  reference the Catalog's SKUs and products through declared database foreign keys and read the
  referenced rows through that relation, exactly as the Inventory module references the Catalog's
  SKUs. No feature module imports another feature module's internal code, and the boundary check
  enforces it.
- **Milestone 09 - the order is its own capability, and the pre-order is a separate aggregate
  inside it.** The preliminary table assigns the order aggregate and the pre-order intent to
  separate capabilities, and the implementation follows the order aggregate as a capability. The
  pre-order is a **separate table with its own lifecycle** rather than a separate module, because the
  guarantee the approved decision requires is structural: a pre-order has no payable amount, no
  reservation, and no payment reference while it awaits stock, so it **cannot** be charged. Making
  that a property of the record rather than of the module is what enforces it.
- **Milestone 10 - the payment provider is an adapter behind a narrow interface, and the dependency
  between Payments and Orders runs one way.** The preliminary table already assigns the payment
  capability to its own boundary, and the implementation follows it. The provider abstraction is
  deliberately small, and every provider-specific type is confined to its adapter, so a provider's
  vocabulary never becomes a core domain model. The Payments capability changes an order's state
  through the Orders capability's published contract rather than by writing the Orders capability's
  tables, so the two capabilities do not depend on each other and the boundary check can enforce that
  the only cross-module import is the module index.
- **Milestone 11 - the Shipping and Fulfillment capability is one capability, and the shipping
  charge is recorded rather than collected.** The preliminary table already assigns fulfilment to a
  "Shipping and Fulfillment" capability, and the implementation follows it: the capability owns the
  shipping destinations, the shipping methods, the shipments, and the returns, and it reaches the
  Orders, Inventory, and Payments capabilities only through their published contracts. The
  destination configuration is a **separate table** from the Checkout capability's
  `checkout_destinations`, because the two answer different questions with different owners: the
  Checkout capability's destination answers "may a customer check out here, and whose tax rules
  apply", and the Shipping capability's destination answers "may we ship here, and which options
  exist".
  The milestone deliberately does **not** add the shipping amount to the order's total. The Payments
  capability already depends on the Orders capability, and the Shipping capability must depend on
  both the Orders capability (a shipment is created for an order) and the Payments capability (a
  received return is refunded), so a Checkout capability that depended on the Shipping capability
  would close the cycle `Checkout -> Shipping -> Payments -> Orders -> Checkout`. The alternative
  was to split the capability into a configuration module and a fulfilment module, which was
  rejected because it would split one business capability in order to collect a price that is not
  approved. The amount is therefore configured, reported, and recorded on the shipment, and it is
  **not** collected, because HC-DEC-013 leaves the providers, the rate calculation, and the service
  areas open. The order's figures and the checkout quote are unchanged.
  The restock and the refund became two more published contracts: the Inventory capability publishes
  `INVENTORY_RESTOCK`, because only it owns the on-hand quantity and the movement ledger and can
  therefore make a restock idempotent, and the Payments capability publishes `PAYMENT_REFUNDS`,
  because only it owns the cumulative refund limit.
  The `SETTLEMENT_CURRENCY` and the environment scope moved from the Checkout capability's support
  module to the platform's configuration module, because they are platform facts rather than
  capability facts and two capabilities now name them.
- **Milestone 12 - the reviews and the notifications are two capabilities, and the channel is a
  binding.** The preliminary table already assigns reviews and notifications to separate
  capabilities, and the implementation follows it. The Reviews capability owns the review and its
  moderation trail; the Notifications capability owns the message, the provider abstraction, and the
  delivery record. The Reviews capability asks the Orders capability which of the customer's orders
  have been paid, through the ledger's new `paidOrdersOf` method, so the verified-purchase rule is
  a published interaction rather than a table read, and the Orders capability publishes the method
  rather than the Reviews capability reaching into its rows.
  The notification provider is bound through the `NOTIFICATION_PROVIDER` token, so a real channel is
  a binding and not a change to the platform's rules, and the only shipped providers are the local
  test transports and the transport that sends nothing, because HC-DEC-014 leaves the channel open.
  The notification's recipient is a **stable identifier** and the provider resolves the address,
  because the Identity capability owns the address and the Notifications capability must not read
  it.
- **Milestone 13 - the Administration capability is a leaf consumer with no bypass path.** The
  preliminary table already assigns the administrator use cases to an "Administration" capability,
  and the implementation follows it: the capability imports the Orders, Shipping, Reviews,
  Notifications, Payments, and Identity modules and reads them through their **published
  contracts**. It owns no table and no business rule, so it introduces no cycle and no bypass path
  into another capability's persistence, and every operational action stays in the capability that
  owns the rule.
  The milestone's real work was the **published read contracts** the surface needs: the Orders
  ledger, the Shipping fulfilment, the Reviews library, the Notifications sender, and the two new
  contracts, the Payments capability's `PAYMENT_OPERATIONS` and the Identity capability's
  `IDENTITY_AUDIT`. Every extension is **additive** - no existing contract member changed its
  meaning and no existing route changed.
  The operational picture is **computed, never stored**, so it cannot drift from the capabilities it
  reports and there is no second source of truth to reconcile. The money is aggregated by the
  database over the Payments capability's own tables, inside the Payments capability, so the
  administrative surface never computes a total from a row it read itself.
- **Milestone 14 - production readiness is a set of named checks, and the acceptance work that the
  batch could not do is recorded rather than implied.** The architecture gained no component. It
  gained three executable gates - the readiness check, the backup and restore drill, and the
  performance and reliability probe - and the operational documentation that describes them. The
  drill **refuses** the three original databases by name, because a backup operation against a
  preserved historical database is exactly the kind of accidental write the batch is forbidden to
  make, and it restores into a **scratch** database so the restore is proved by a comparison rather
  than by the absence of an error. The probe measures the platform rather than asserting a
  performance claim, and it proves the availability ordering - an instance that is not ready answers
  503 and never 401 - that a performance run would otherwise hide.
  The reconciliation of the three original databases, their outstanding forward migrations, the
  post-migration drift and data-preservation checks, the final regression against them, the hosted
  continuous integration, the real provider approvals, the tax and merchant compliance, and the
  remaining dependency finding are recorded in the **deferred acceptance checklist** and the
  **production readiness register**, each with its closing condition and its owner. Milestone 14 is
  therefore **PARTIAL and BLOCKED** for final production acceptance, and the architecture records
  that as the honest state rather than implying a readiness it does not have.

## Dependency and Data-Ownership Rules

1. A module owns its domain model and persistence access. Another module may retain stable foreign
   identifiers but must not query or mutate the owner's tables directly.
2. Cross-module calls use published application interfaces or documented events. Controllers must
   not coordinate repositories across modules.
3. PostgreSQL is authoritative for orders, payments, inventory, reservations, customer state, and
   other durable business data. Redis, if approved later, cannot be authoritative for these records.
4. Transactions protect invariants inside their owning module. Workflows that cross module
   boundaries must define idempotency, failure compensation, and observable state transitions.
5. Order records snapshot prices, currencies, tax inputs, discounts, bundle composition, and
   customer selections required to preserve the original commercial agreement.
6. Provider adapters translate external tax, payment, shipping, FX, media, or notification
   contracts. Provider-specific types must not become core domain models.
7. Personally identifiable data and secrets must be minimized, access-controlled, redacted from
   telemetry, and governed by the unresolved privacy decisions before launch.

## Critical Flow Invariants

### Cart to Checkout

- Only an authenticated customer may own or use a cart.
- The server must revalidate current prices, discounts, bundle composition, and SKU availability
  before checkout and report changes to the customer.
- The final checkout sequence, reservation lifetime, tax timing, shipping quote behavior, order
  creation point, and payment sequence remain blocked by HC-DEC-004 and related decisions.
- No flow may infer success solely from a browser response or allow an inventory check followed by
  a non-atomic reservation.

### Pre-Order to Payment

- A pre-order begins without payment capture or settlement.
- When required stock becomes available, Inventory must atomically reserve it before the pre-order
  becomes eligible for payment.
- The customer-visible lifecycle must distinguish awaiting stock, ready for payment, paid, and
  failed. Payment attempts must be idempotent.
- Payment deadlines, reminders, retry limits, and stock release are not defined until HC-DEC-015
  and HC-DEC-014 are approved.

### Bundle Availability

- Dynamic bundles validate customer selections and reserve every selected component SKU in the
  required quantity as one consistent operation.
- Fixed-bundle availability cannot be finalized until HC-DEC-017 determines whether ready-stock
  bundles are independent SKUs, component-derived stock, or a reconciled hybrid.
- Any approved fixed-bundle model must prevent physical inventory from being available both as a
  finished bundle and as components. It must also satisfy the constitution or trigger a formal
  constitutional amendment before implementation.

### Payment Provider Events

- Each create, capture, refund, and retry operation uses a stable business idempotency key.
- Webhook authenticity, timestamp tolerance, and replay protection are checked before state
  changes. Event IDs and resulting transitions are durably deduplicated.
- Duplicate, delayed, and out-of-order events must not produce invalid payment or order states.
- Provider reconciliation, not a client callback alone, establishes authoritative payment state.

## Preliminary API and Persistence Direction

- REST resources are versioned and described by OpenAPI. Stable error shapes must avoid sensitive
  detail and distinguish validation, authentication, authorization, conflict, and unavailable-state
  failures.
- Request validation occurs at the API boundary; authorization is repeated at the application or
  domain boundary where resource context is known.
- Prisma models and migrations follow module ownership even if all modules share one PostgreSQL
  database. This overview intentionally does not define tables or a final ERD.
- Monetary fields use an exact database representation and an explicit ISO currency. FX quotes and
  commercial snapshots retain enough provenance to reproduce displayed and charged totals after
  HC-DEC-008 and HC-DEC-009 are resolved.
- Inventory concurrency must be proven with integration tests against PostgreSQL rather than only
  with mocks or process-local locking.

## Architecture Recommendations

Recommendations are proposals, not implemented or approved infrastructure.

| ID             | Recommendation                                                                                                                                                     | Trigger for reconsideration                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| HC-ARC-REC-001 | Start with one API application and one PostgreSQL database, preserving logical module ownership.                                                                   | Measured scaling, isolation, compliance, or deployment needs demonstrate that extraction benefits exceed distributed-system cost. |
| HC-ARC-REC-002 | Implement initial search and filtering with indexed PostgreSQL queries and projections.                                                                            | Measured relevance, language, latency, or catalog-growth requirements cannot be met safely.                                       |
| HC-ARC-REC-003 | Use synchronous in-process module contracts for the baseline and consider a transactional outbox only for workflows that require durable asynchronous publication. | A specified workflow needs retryable work beyond the request lifecycle or reliable external event delivery.                       |
| HC-ARC-REC-004 | Add BullMQ only for a named, idempotent background workload with retry, dead-letter, monitoring, and recovery rules.                                               | Examples may include approved notification delivery or media processing, but no example is pre-approved.                          |
| HC-ARC-REC-005 | Add Redis only after measuring a caching, rate-limiting, coordination, or queue requirement and defining behavior during Redis failure.                            | Database-backed or process-local behavior no longer meets an approved target under HC-DEC-016.                                    |
| HC-ARC-REC-006 | Keep the administrator interface as an API client of the same guarded application services used by other trusted clients.                                          | A documented use case requires a distinct administrative application boundary, without bypassing authorization or audit controls. |

## Architecture Assumptions

| ID             | Assumption                                                                                               | Consequence if false                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| HC-ARC-ASM-001 | A single regional deployment can satisfy the initial meaning of “global.”                                | Data residency, latency, disaster recovery, provider selection, and deployment topology require redesign. |
| HC-ARC-ASM-002 | One owned warehouse is the only stock-holding location in the initial scope.                             | Inventory must add location-aware balances, allocation, transfers, and reservation rules.                 |
| HC-ARC-ASM-003 | The initial catalog size and discovery requirements fit PostgreSQL query and indexing capabilities.      | A dedicated search capability requires a reviewed architecture decision and synchronization design.       |
| HC-ARC-ASM-004 | The future storefront can rely on the REST/OpenAPI contract without backend-for-frontend infrastructure. | Client-specific orchestration or delivery requirements need a separate, justified boundary.               |
| HC-ARC-ASM-005 | The 10,000-daily-user planning figure does not imply a specific peak load or service-level objective.    | Capacity tests and production topology must be revised after HC-DEC-016.                                  |

## Quality and Review Gates

- Each feature specification must identify affected modules, ownership, authorization, failure
  states, observability, data migration impact, tests, and unresolved `HC-DEC-*` dependencies.
- Critical flows require Jest unit tests plus PostgreSQL-backed integration and end-to-end tests as
  applicable, including denial, concurrency, retry, duplicate-event, and recovery cases.
- Prisma migrations require production-like verification and a recovery plan for destructive,
  locking, or data-reinterpreting changes.
- OpenAPI changes, decision records, and operational telemetry must ship with the behavior they
  describe.
- An architecture proposal that adds a service, queue, cache, broker, or new source of truth must
  document the measured need, ownership, failure behavior, and simpler alternatives considered.
