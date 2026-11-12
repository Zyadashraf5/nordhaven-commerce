# Nordhaven Commerce Project Overview

## Document Status

This document is the initial requirements knowledge base for Nordhaven Commerce. It records known
project facts without finalizing the unresolved business rules listed in
[Open Decisions](./open-decisions.md). The
[project constitution](../../.specify/memory/constitution.md) governs security, data integrity,
testing, observability, and architecture decisions.

The terms in this document have these meanings:

- **Approved fact**: supplied project direction that may be used as a requirement baseline.
- **Recommendation**: proposed guidance that requires review before it becomes a requirement.
- **Assumption**: a temporary planning premise that must not silently become a business rule.
- **Open decision**: an unresolved choice tracked by a stable `HC-DEC-*` identifier.

## Approved Product Facts

### Product and Operating Model

| ID         | Approved fact                                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| HC-PRJ-001 | Nordhaven Commerce is a global, single-vendor B2C e-commerce platform for kitchen and household products.                                            |
| HC-PRJ-002 | The customer channel is a website. A React/Next.js storefront is planned for the future but is not established as part of the current backend scope. |
| HC-PRJ-003 | The launch operating model has one owned warehouse and one administrator.                                                                            |
| HC-PRJ-004 | Capacity planning uses 10,000 daily users, not 10,000 concurrent users.                                                                              |
| HC-PRJ-005 | V1 must be commercially complete, but its exact release scope is not yet approved; see HC-DEC-001.                                                   |

### Catalog, Products, and Discovery

| ID         | Approved fact                                                                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HC-CAT-001 | The initial catalog contains fewer than 1,000 products.                                                                                                  |
| HC-CAT-002 | Each product belongs to one category, and the category hierarchy has no more than two levels.                                                            |
| HC-CAT-003 | Products can vary by color, size, and material. Each sellable variant is represented by a SKU.                                                           |
| HC-CAT-004 | Inventory is tracked per sellable SKU.                                                                                                                   |
| HC-CAT-005 | The catalog supports multiple brands and multiple images per product.                                                                                    |
| HC-CAT-006 | Basic product data includes name, description, images, and price. Technical identifiers may be added when required for stable integration or operations. |
| HC-CAT-007 | Catalog administration is manual.                                                                                                                        |
| HC-CAT-008 | Customers can search and filter products by price, category, brand, and product attributes.                                                              |
| HC-CAT-009 | Direct product discounts are supported. No broader promotion model is approved by this fact.                                                             |

### Bundles and Inventory

| ID         | Approved fact                                                                                                                                         |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| HC-INV-001 | The platform supports fixed ready-stock bundles and dynamic component-based bundles.                                                                  |
| HC-INV-002 | Inventory reservations must be atomic per SKU and follow the lifecycle and concurrency rules in the constitution.                                     |
| HC-INV-003 | Dynamic bundle availability and reservation are derived from the selected component SKUs and quantities.                                              |
| HC-INV-004 | The stock model for fixed ready-stock bundles is unresolved; see HC-DEC-017. No implementation may double-count fixed-bundle and component inventory. |

### Customers, Identity, and Accounts

| ID         | Approved fact                                                                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HC-IAM-001 | Customer registration uses email and password.                                                                                                                    |
| HC-IAM-002 | An authenticated customer account is required to use a cart or checkout. Guest carts and guest checkout are not supported.                                        |
| HC-IAM-003 | Registered customers can maintain a wishlist.                                                                                                                     |
| HC-IAM-004 | Registered customers can save multiple shipping addresses and select one default address.                                                                         |
| HC-IAM-005 | Customer accounts can have simultaneous sessions on multiple devices.                                                                                             |
| HC-IAM-006 | Customer profile management and an account-deletion request capability are intended product features. The compliance workflow is not yet defined; see HC-DEC-003. |
| HC-IAM-007 | Every administrator must use MFA and all administrative authorization must follow the constitution.                                                               |
| HC-IAM-008 | Customer email verification is not approved or rejected as a final policy; see HC-DEC-002.                                                                        |

### Cart, Pricing, Reviews, and Pre-Orders

| ID         | Approved fact                                                                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HC-COM-001 | Before checkout, the server revalidates cart pricing and availability and informs the customer of any changes.                                                                   |
| HC-COM-002 | The platform has one base currency and may show converted display currencies. Exchange-rate sourcing, timing, rounding, and quote validity remain unresolved under HC-DEC-009.   |
| HC-COM-003 | Customers can submit product reviews containing a star rating, comment, and images. Reviews are subject to administrator moderation.                                             |
| HC-COM-004 | A pre-order cannot be charged, captured, or settled before its stock is available and atomically reserved. No advance payment collection is permitted.                           |
| HC-COM-005 | Checkout, tax, payment, cancellation, refund, return, exchange, shipping, notification, and pre-order deadline policies remain open and must not be inferred from this overview. |

### Implementation status

| Capability                             | State                                                                                                                                                                                                     | Evidence                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Catalog and pricing                    | Implemented. Search, filtering, direct product discounts, and the effective price.                                                                                                                        | [Milestone 06](progress/milestone-06.md)            |
| Cart and wishlist                      | Implemented. A customer cart of SKUs or bundles with a last-known and a current price, and a wishlist of products.                                                                                        | [Milestone 07](progress/milestone-07.md)            |
| Checkout and tax                       | Implemented. A configurable tax engine and a checkout quote with exact totals, named readiness blockers, and a deterministic fingerprint.                                                                 | [Milestone 08](progress/milestone-08.md)            |
| Orders and pre-orders                  | Implemented. An order with immutable price and tax snapshots, an explicit state machine, idempotent creation, a bounded stock hold, and a distinct pre-order lifecycle.                                   | [Milestone 09](progress/milestone-09.md)            |
| Currency conversion and display quotes | **Not implemented.** Blocked by HC-DEC-009 and HC-DEC-008.                                                                                                                                                | [decision register](requirements/open-decisions.md) |
| Payments and refunds                   | Implemented for development. A provider abstraction, a deterministic non-production provider, a verified event intake, and full and partial refunds with a cumulative limit. No real payment is possible. | [Milestone 10](progress/milestone-10.md)            |
| Reviews, shipping, notifications       | **Not implemented.** Each is blocked by its own open decision.                                                                                                                                            | [decision register](requirements/open-decisions.md) |

## Approved Technical Direction

| ID         | Approved direction                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| HC-TEC-001 | The backend runtime is Node.js 22 with strict TypeScript and NestJS.                                                                             |
| HC-TEC-002 | The architecture is a modular monolith with business-aligned boundaries and deliberate public module contracts.                                  |
| HC-TEC-003 | PostgreSQL is the durable system of record and Prisma is the default data-access and migration tool.                                             |
| HC-TEC-004 | Public application APIs use versioned REST semantics and an accurate OpenAPI contract.                                                           |
| HC-TEC-005 | Docker provides reproducible development and deployable builds.                                                                                  |
| HC-TEC-006 | Redis and BullMQ are optional and may be introduced only for a justified workload with documented durability, retry, idempotency, and ownership. |
| HC-TEC-007 | Automated tests use Jest and cover unit, integration, and end-to-end behavior at the appropriate boundaries.                                     |
| HC-TEC-008 | Security, database consistency, money handling, observability, secrets, migrations, and quality gates are governed by the constitution.          |

## Recommendations

Recommendations are not approved requirements.

| ID         | Recommendation                                                                                                                   | Reason                                                                                                                                              |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| HC-REC-001 | Begin product search and filtering with PostgreSQL-backed queries and indexes.                                                   | The initial catalog is below 1,000 products; a separate search service would add unjustified operational cost until measured needs prove otherwise. |
| HC-REC-002 | Keep the backend as one deployable modular-monolith application at launch.                                                       | The known load and operating team do not justify distributed services.                                                                              |
| HC-REC-003 | Keep Redis and BullMQ out of the baseline design until a specific synchronous or asynchronous workload is measured and approved. | This preserves PostgreSQL as the source of truth and follows the constitution's simplicity rule.                                                    |
| HC-REC-004 | Treat converted prices as display quotes until HC-DEC-009 defines the FX policy and HC-DEC-008 defines settlement currency.      | This avoids implying that an unapproved display conversion is the contractual charge amount.                                                        |
| HC-REC-005 | Expose all administrative actions through authenticated application services and audit them.                                     | This prevents the administration surface from bypassing validation, authorization, or module boundaries.                                            |

## Planning Assumptions

Assumptions are temporary and require validation.

| ID         | Assumption                                                                                                                           | Validation needed                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| HC-ASM-001 | The future React/Next.js storefront will consume the versioned REST API rather than access the database or module internals.         | Confirm during storefront specification.                                              |
| HC-ASM-002 | One warehouse means multi-warehouse allocation and transfer workflows are outside the initial planning baseline.                     | Confirm when V1 scope is finalized under HC-DEC-001.                                  |
| HC-ASM-003 | One launch administrator does not remove the need for role-aware authorization, auditability, or mandatory MFA.                      | Confirm the minimum launch role model during identity design.                         |
| HC-ASM-004 | The 10,000-daily-user figure is a capacity-planning input only, not an availability, latency, throughput, or concurrency commitment. | Replace with approved goals under HC-DEC-016.                                         |
| HC-ASM-005 | The exact list of countries marketed as “global” is not yet established.                                                             | Resolve HC-DEC-005 before country-dependent checkout, tax, privacy, or shipping work. |

## Scope Dependencies

Implementation of a dependent feature must wait for the relevant decision in
[Open Decisions](./open-decisions.md). In particular:

- Checkout depends on HC-DEC-004 through HC-DEC-015 and HC-DEC-017 where bundles are involved.
- Customer lifecycle and security depend on HC-DEC-002 and HC-DEC-003.
- Production capacity and operational design depend on HC-DEC-016.
- Fixed-bundle inventory design depends on HC-DEC-017 and must remain consistent with the
  constitution.
