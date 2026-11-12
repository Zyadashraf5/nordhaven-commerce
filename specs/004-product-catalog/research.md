# Research: Milestone 04 - Product Catalog

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-20

This document records the decisions taken while turning the approved catalog facts (HC-CAT-001
through HC-CAT-009) into a bounded, testable capability. Each decision states the alternatives that
were considered and why the selected option is the smallest reversible one that satisfies the
constitution.

## Findings

### R1 - One new module, `catalog`

**Decision**: Add exactly one module directory, `apps/api/src/modules/catalog`, with the same internal
shape as the accepted modules (`api/`, `application/`, `persistence/`).

**Alternatives**: (a) extend the Customers module; (b) split categories/brands/products into three
modules.

**Rationale**: The catalog is a distinct business capability with its own tables and no dependency on
customer data; principle I requires business-aligned boundaries, and principle XII prefers the
smallest structure that keeps ownership clear. Categories, brands, and products share one transaction
boundary (a product references both), so splitting them would create cross-module write coupling for
no benefit.

### R2 - Exact money as integer minor units plus currency

**Decision**: Store the product base price as a non-negative integer count of minor units
(`base_price_minor`, PostgreSQL `INTEGER`) together with a 3-letter currency code
(`base_currency`, `CHAR(3)`).

**Alternatives**: (a) PostgreSQL `numeric(12,2)`; (b) decimal string; (c) floating point.

**Rationale**: Principle VIII forbids binary floating point and requires an exact type paired with an
explicit currency. Integer minor units is the representation the later pricing, tax, and payment
milestones can sum without rounding ambiguity. `INTEGER` bounds the stored price at 2,147,483,647 minor
units, which is far above any household-goods price and is asserted at the boundary. Prisma's `Decimal`
type would require a runtime library and string handling across the whole stack for no present benefit
(principle XII).

### R3 - Two-level hierarchy enforced in the service on top of a self-referencing foreign key

**Decision**: `categories.parent_id` is a nullable self-referencing key. The service enforces the
two-level rule: a category's parent must itself be a root, and a category that already has children may
not be given a parent.

**Alternatives**: (a) enforce with a database trigger or check constraint; (b) store a materialized
level column; (c) allow arbitrary depth and truncate on read.

**Rationale**: A pure SQL constraint cannot express "my parent is a root" without a trigger, which adds
database logic outside Prisma's reviewed migration story and is harder to test in isolation. The rule
is a domain rule with clear unit and integration coverage; a partial write is impossible because the
check runs inside the same transaction as the write. The tree is tiny (well under 1,000 products), so
reading both levels to validate is cheap.

### R4 - Product lifecycle state, defaulting to non-public

**Decision**: `products.status` is an enum with `DRAFT`, `PUBLISHED`, and `ARCHIVED`; a new product is
`DRAFT`. Only `PUBLISHED` products are returned by the public surface.

**Alternatives**: (a) everything is immediately public; (b) a boolean `published` flag; (c) separate
draft tables.

**Rationale**: A manually administered catalog needs a state in which a half-entered product is not
sold. A three-state enum costs nothing over a boolean and leaves room for a retired-but-referenced
product (`ARCHIVED`) without deleting history. Defaulting to non-public fails closed. Recorded as
assumption M04-ASM-001 because the Product Owner has not stated the default explicitly.

### R5 - Unpublished products are indistinguishable from unknown ones

**Decision**: A public read of a product that is not `PUBLISHED` returns exactly the same not-found
response as an identifier that never existed.

**Alternatives**: return a different "not published" error.

**Rationale**: Principle III requires non-sensitive, stable errors; disclosing that a draft exists
leaks the catalog's commercial pipeline. This mirrors the accepted Customer Profiles decision to answer
foreign and unknown identifiers identically.

### R6 - Collections (images, attributes) are replaced atomically; variants are managed individually

**Decision**: A product's images and attributes are written with a `PUT` that replaces the whole
collection inside one transaction. Variants are created, updated, and deleted individually.

**Alternatives**: (a) per-item sub-resource routes for images and attributes; (b) `PUT` for variants
too.

**Rationale**: Images and attributes are pure value data with no cross-milestone references, so a
whole-collection replace is the smallest correct API and cannot half-apply. A variant, by contrast, is
the SKU that Milestone 05 tracks inventory against: a whole-collection replace would silently delete
stock for a removed SKU. Individual variant routes keep that deletion explicit and refuse it when
something depends on the SKU (M04-FR-024).

### R7 - Error codes are added to the closed union, not improvised

**Decision**: Add `CATEGORY_NOT_FOUND` (404), `BRAND_NOT_FOUND` (404), `PRODUCT_NOT_FOUND` (404),
`VARIANT_NOT_FOUND` (404), and `CATALOG_CONFLICT` (409) to the closed `AppErrorCode` union, each with
one constant, non-sensitive message.

**Alternatives**: (a) reuse `FORBIDDEN`/generic 400 responses; (b) add one code per conflict reason.

**Rationale**: The union compiles exhaustively over status and message maps, so a new code cannot be
published without a status and a message. One generic conflict code keeps the public contract small
while a raw database error (`P2002`, `P2003`) is never surfaced (M04-FR-019). Distinguishing individual
conflict reasons would publish more of the schema than the client needs.

### R8 - Pagination for the public product list

**Decision**: The public product listing takes a bounded `limit` (default and maximum fixed) and an
opaque `cursor`, and returns the items plus a nullable `nextCursor`.

**Alternatives**: (a) offset pagination; (b) return the whole catalog (fewer than 1,000 products).

**Rationale**: The catalog is small today, but an unbounded response is an availability risk and a
shape change later. Cursor pagination over a stable ordering (`name`, `id`) avoids skipped or repeated
items while administrators add products. Offset paging was rejected because concurrent inserts shift
the window. The limit is capped so no caller can force an unbounded query.

### R9 - Anonymous browsing is authorized, not accidental

**Decision**: The browsing routes are the only catalog routes marked `@Public()`; everything under
`/api/v1/admin/catalog` is `@Roles('ADMIN')`.

**Rationale**: HC-IAM-002 requires authentication for a cart or checkout, not for browsing. The
platform defaults to protected routes, so each browsing route must opt out explicitly, which keeps the
authorization surface reviewable. An administrator is deliberately not required to browse, and a
customer is deliberately not required either, because the storefront is public.

### R10 - No new dependency, configuration key, or infrastructure

**Decision**: The milestone adds no package, no environment variable, and no service. Slugs are
normalized with a small shared helper; the tree is assembled in memory.

**Rationale**: Principle XII and the standing instruction. Nothing in the approved facts requires a
search engine, a cache, or a background job at fewer than 1,000 products (HC-REC-001, HC-REC-003).

### R11 - Search, filtering, discounts, and conversion are explicitly excluded

**Decision**: This milestone implements no search endpoint, no filter or sort parameter, no discount
field, and no converted price.

**Rationale**: HC-CAT-008 and HC-CAT-009 are approved facts assigned to Milestone 06 (Pricing &
Search) by the milestone plan, and currency conversion is unresolved (HC-COM-002, HC-DEC-009).
Implementing any of them here would pre-empt an approved decision. The catalog stores the attribute
data those features will need, which is exactly the prerequisite HC-CAT-008 implies.

## Open Questions Carried Forward

- M04-ASM-001 (default lifecycle state) needs Product Owner confirmation; it is reversible.
- M04-ASM-002 (product-level price) needs Product Owner confirmation before Milestone 06 adds
  variant-level pricing.
- Whether attributes should have typed values is a Milestone 06 decision (HC-CAT-008).
