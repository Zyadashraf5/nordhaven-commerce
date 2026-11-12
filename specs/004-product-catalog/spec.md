# Feature Specification: Milestone 04 - Product Catalog

**Feature Branch**: Not created; the repository has no commits yet and no `before_specify` branch hook
is configured

**Created**: 2026-10-20

**Status**: Draft for Product Owner review; implementation authorized by the overnight autonomous
development instruction of 2026-10-20

**Approval**: The Product Owner accepted Milestones 01, 02, and 03 for local development. This
specification implements the approved catalog facts HC-CAT-001 through HC-CAT-007 and HC-CAT-009's
data prerequisites. It does not resolve or approve HC-DEC-001 through HC-DEC-017. Hosted continuous
integration remains deferred and NOT VERIFIED.

**Input**: User description: "Milestone 04: Product Catalog for Nordhaven Commerce - a manually
administered catalog of categories, brands, products, images, attributes, and sellable variants
(SKUs) exposed through versioned REST and OpenAPI, securely integrated with the existing Identity and
Access module, with validation, migrations, unit, integration, E2E, and authorization tests."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Administer the Catalog Manually (Priority: P1)

A signed-in administrator creates the catalog structure their storefront sells from: a two-level
category tree, the brands they carry, and the products that belong to one category and one brand,
each with a description, an ordered set of images, attribute pairs, and at least one sellable variant
identified by a SKU. The administrator corrects mistakes, retires products they no longer sell, and
decides when a product becomes visible to shoppers. Catalog administration is manual (HC-CAT-007):
there is no bulk import, no feed, and no preview environment in this milestone.

**Why this priority**: Everything the storefront displays and everything later milestones price,
stock, or sell depends on the catalog. It is the first milestone that adds a commerce-domain module
to the accepted foundation, so it also proves that the module-boundary, audit, and OpenAPI
discipline scales beyond identity and customer data.

**Independent Test**: With a real administrator session, create a category tree, a brand, and a
product with images, attributes, and two variants; update the product; publish it; confirm a customer
session and an anonymous caller are refused every administrative route; and confirm every created
record is readable back through the administrator routes.

**Acceptance Scenarios**:

1. **Given** an authenticated administrator, **When** the administrator creates a root category and a
   child category beneath it, **Then** both exist, both are returned by the administrator category
   listing, and the hierarchy has two levels.
2. **Given** an authenticated administrator, **When** the administrator attempts to create a third
   level, **Then** the request is refused with a stable conflict error and no category is created.
3. **Given** an authenticated administrator, **When** the administrator creates a product with a
   name, description, category, brand, base price, images, attributes, and variants, **Then** the
   product is persisted in a non-public state and returned with all of its parts.
4. **Given** a product that exists, **When** the administrator adds a variant whose SKU duplicates an
   existing SKU, **Then** the request is refused with a stable conflict error and no variant is added.
5. **Given** a category or brand that is referenced by a product, **When** the administrator deletes
   it, **Then** the request is refused and the referenced records are unchanged.
6. **Given** an authenticated administrator, **When** the administrator changes a product's lifecycle
   state, **Then** the state changes and is returned.
7. **Given** a customer session or an anonymous caller, **When** any administrative catalog route is
   called, **Then** the request is refused and no catalog data is read or written.

---

### User Story 2 - Browse the Published Catalog (Priority: P1)

An anonymous shopper opens the storefront and can list the published products the store sells, open
one product to see its description, images, attributes, price, brand, category, and sellable
variants, and list the category tree and the available brands. Products that the administrator has not
published are never shown.

**Why this priority**: A catalog nobody can read provides no customer value. Browsing is deliberately
anonymous because only a cart or checkout requires an authenticated customer (HC-IAM-002); the
storefront a shopper has not signed in to must still show products.

**Independent Test**: Publish two products, keep a third unpublished, then list and open products
anonymously and confirm the unpublished product is absent from the listing and its slug answers the
same not-found response as a slug that never existed, while the category tree and brand listing
reflect exactly the published catalog.

**Acceptance Scenarios**:

1. **Given** at least one published product, **When** an anonymous caller lists products, **Then** the
   response contains only published products, in a deterministic order, with a bounded page size.
2. **Given** a published product, **When** an anonymous caller requests it by its public identifier,
   **Then** the response contains its description, images, attributes, price, brand, category, and
   variants.
3. **Given** a product that is not published, **When** an anonymous caller requests it by its public
   identifier, **Then** the response is the same not-found response an unknown identifier receives.
4. **Given** the catalog, **When** an anonymous caller lists categories and brands, **Then** the
   response reflects only the published catalog: the two-level category tree and the brands that are
   visible.

---

### User Story 3 - Trust the Catalog Data (Priority: P1)

An operator trusts that what the catalog stores is what the catalog says. Prices are exact and
currency-qualified (HC-CAT-006, constitution principle VIII). Identifiers are stable and unique
(HC-CAT-003). Nothing in this milestone invents an unapproved rule: where a business rule is still
open, the milestone stores the data a later milestone needs and refuses to guess the behavior.

**Why this priority**: The catalog is the source of truth for price, identity, and availability of
everything the platform later sells. A silent catalog defect propagates into pricing, inventory,
checkout, and orders.

**Independent Test**: Inspect a stored product and confirm the price is an exact integer minor unit
paired with a 3-letter currency, that no floating-point value is used, that every variant SKU is
unique across the whole catalog, and that an input violating a documented rule is refused with the
standard safe error envelope that never echoes the submitted value.

**Acceptance Scenarios**:

1. **Given** a product priced in a currency, **When** the price is stored and returned, **Then** it is
   an exact integer minor unit with an explicit 3-letter ISO currency and no rounding loss.
2. **Given** any catalog write, **When** a value violates a documented rule, **Then** the request is
   refused with the standard safe error envelope and the response never echoes the rejected value.
3. **Given** a catalog write that conflicts with existing state, **When** it is refused, **Then** the
   error code is stable and contains no database text, table name, or constraint name.

### Edge Cases

- Two administrators create a category with the same slug, or a product with the same SKU, at the same
  time: exactly one succeeds and the other receives the stable conflict error.
- A category is moved beneath its own child, or a root that has children is given a parent: refused,
  and no partial write survives.
- A product is published with no variants, or with variants that carry no SKU: refused.
- An update sends an unknown field, a client-supplied status, or a client-supplied identifier: refused
  at the boundary before any storage work.
- A price is supplied as a decimal, as a negative number, with more precision than the currency
  allows, or with a currency that is not three ASCII letters: refused.
- An image list is empty, contains duplicate positions, or exceeds the documented bound: refused.
- The database is unavailable during a catalog write: the request fails with the documented
  unavailable response, never a partial catalog record.
- A page is requested beyond the last page: an empty page is returned, never an error.

## Requirements *(mandatory)*

### Scope Boundaries

This milestone delivers the Product Catalog capability only: the manual administration and the
anonymous browsing of categories, brands, products, product images, product attributes, and sellable
variants (SKUs), including their exact base price.

Explicitly out of scope and deliberately not implemented here: product search, filtering, and sorting
by price, category, brand, or attributes (HC-CAT-008, Milestone 06); direct product discounts
(HC-CAT-009, Milestone 06); currency conversion and display currencies (HC-COM-002, HC-DEC-009,
Milestone 06); inventory quantities, stock rules, availability, and reservations (HC-INV-001 through
HC-INV-004, Milestone 05); bundles (Milestone 05); cart, checkout, orders, payments, pre-orders,
shipping, tax, reviews, and wishlists. Account deletion, export, retention, email verification, and
notification delivery remain governed by HC-DEC-002, HC-DEC-003, and HC-DEC-014 and are not addressed.

This milestone MUST NOT resolve, imply, or partially implement any HC-DEC-* decision.

### Functional Requirements

- **M04-FR-001**: An authenticated administrator MUST be able to create a category with a name and a
  unique public identifier (slug).
- **M04-FR-002**: The category hierarchy MUST have no more than two levels (HC-CAT-002). A category
  that has a parent MUST have a root parent, and a category that has children MUST NOT be given a
  parent.
- **M04-FR-003**: An authenticated administrator MUST be able to list, update, and delete categories.
  Deleting a category that still has children or products MUST be refused.
- **M04-FR-004**: An authenticated administrator MUST be able to create, list, update, and delete
  brands (HC-CAT-005). Brand names and public identifiers MUST be unique. Deleting a brand that is
  referenced by a product MUST be refused.
- **M04-FR-005**: An authenticated administrator MUST be able to create, list, read, update, and delete
  products. Each product MUST belong to exactly one category and exactly one brand (HC-CAT-002,
  HC-CAT-005) and MUST carry a name, a description, and a public identifier.
- **M04-FR-006**: Basic product data MUST include a price (HC-CAT-006), represented as an exact
  integer minor unit paired with an explicit 3-letter ISO 4217-style currency. Binary floating-point
  MUST NOT be used for any price value, and the milestone MUST NOT perform conversion, discounting, or
  rounding beyond normalizing the entered minor units.
- **M04-FR-007**: A product MUST support multiple ordered images, each with a URL and optional
  alternate text (HC-CAT-005). The administrator MUST be able to replace a product's image set
  atomically.
- **M04-FR-008**: A product MUST support attribute name/value pairs used by later discovery
  (HC-CAT-008). Attribute names MUST be unique within a product, and the administrator MUST be able to
  replace a product's attributes atomically.
- **M04-FR-009**: A product MUST support one or more sellable variants, each representing a SKU
  (HC-CAT-003). A variant MUST carry a SKU that is unique across the whole catalog and MAY carry a
  color, a size, and a material (HC-CAT-003).
- **M04-FR-010**: An authenticated administrator MUST be able to create a variant for a product, update
  a variant, and delete a variant that nothing depends on.
- **M04-FR-011**: A product MUST have a lifecycle state such that a product the administrator has not
  made visible is never returned by the public browsing surface.
- **M04-FR-012**: An anonymous caller MUST be able to list the published products, bounded by
  pagination, in a deterministic order.
- **M04-FR-013**: An anonymous caller MUST be able to read one published product by its public
  identifier, including its description, images, attributes, price, brand, category, and variants.
- **M04-FR-014**: An anonymous caller MUST be able to list the category tree and the brands.
- **M04-FR-015**: A request for a product that is not published, or for an identifier that does not
  exist, MUST be answered identically, so the public surface never discloses the existence of an
  unpublished product.
- **M04-FR-016**: Every administrative catalog route MUST require the `ADMIN` role and MUST be refused
  for anonymous callers and customers. Every administrative grant and denial MUST be recorded through
  the existing authorization audit boundary.
- **M04-FR-017**: This milestone MUST NOT store, expose, or accept inventory quantity, availability,
  reservation, stock, bundle, cart, order, payment, or shipping data.
- **M04-FR-018**: Every externally supplied value MUST be validated and normalized at the API boundary,
  and an unexpected field MUST be rejected rather than ignored.
- **M04-FR-019**: A duplicate public identifier, a duplicate SKU, an in-use deletion, and an invalid
  hierarchy change MUST be answered with a stable, non-sensitive conflict error that contains no
  database text, table name, or constraint name.
- **M04-FR-020**: Every catalog response MUST expose only documented fields: no internal-only column,
  no other module's data, and no echo of a rejected value.
- **M04-FR-021**: Every catalog route MUST appear in the versioned OpenAPI contract with its documented
  responses and authorization metadata.
- **M04-FR-022**: Administrative writes MUST be bounded by a declared rate-limit policy, and anonymous
  reads MUST be bounded by a declared rate-limit policy. The policies MUST be recorded in the
  milestone contract.
- **M04-FR-023**: The milestone MUST NOT implement search, filtering, sorting by price, discounting, or
  currency conversion (HC-CAT-008, HC-CAT-009, HC-COM-002).
- **M04-FR-024**: A deletion that would orphan or destroy data another record depends on MUST be
  refused rather than cascading silently.

### Entities *(data the milestone owns)*

- **Category**: a named grouping with a unique public identifier, an optional parent, and a display
  order. Owns at most a two-level tree.
- **Brand**: a named manufacturer or label with a unique public identifier.
- **Product**: a named, described sellable item belonging to exactly one category and one brand, with
  an exact base price, a lifecycle state, and a unique public identifier.
- **ProductImage**: a URL and optional alternate text belonging to a product, at a unique position.
- **ProductAttribute**: a name/value pair belonging to a product, with the name unique within the
  product.
- **ProductVariant**: a sellable SKU of a product, with a globally unique SKU and optional color, size,
  and material attributes.

### Failure Cases

- Invalid or unexpected input, an out-of-range price, an unknown currency shape, or an empty required
  value: refused at the boundary with the standard safe error envelope.
- Duplicate slug or SKU, an in-use deletion, or an invalid hierarchy change: a stable conflict error.
- An unknown category, brand, product, or variant identifier: a stable not-found error, answered
  identically whether the identifier is unknown or simply not visible to the caller.
- An unauthenticated or under-privileged caller: the documented authentication or authorization
  error, with the required role taken only from the server-resolved principal.
- A database dependency failure: the documented unavailable response; no partial catalog record
  survives.

### Testing Requirements

- Unit tests for the catalog domain rules: identifier and SKU normalization, price validation, hierarchy
  validation, lifecycle transitions, and the boundary schemas.
- Integration tests against PostgreSQL for persistence, uniqueness, referential integrity, atomic
  replacement of images and attributes, hierarchy constraints, and concurrent creation of a duplicate
  identifier.
- End-to-end tests for the administrator journey, anonymous browsing, the unpublished-product
  non-disclosure, validation and conflict paths, authorization denial with the recorded audit, and the
  documented response metadata, with every response body validated against the committed OpenAPI
  document.
- The OpenAPI inventory, authorization metadata, and excluded-domain guard MUST be updated in the same
  change.

### Operational Requirements

- Every catalog response MUST carry the platform correlation header and a cache directive that
  prevents retention of catalog data that depends on the caller's view. Public catalog reads MAY be
  cacheable only if the contract states it; by default the milestone reuses the platform `no-store`
  directive so behavior stays uniform.
- Structured logs MUST NOT contain catalog content that could carry personal data; the existing
  redaction guardrail MUST cover any new response field name that could.
- Catalog writes MUST be attributable to the acting administrator through the existing authorization
  audit boundary.

### Constitution Compliance

- **Principle I (Modular Monolith Boundaries)**: The catalog is one new module that owns its tables and
  exposes no internals; it imports no other feature module and uses only the platform authorization
  and persistence contracts.
- **Principle III (Server-Side Trust)**: All values are validated and normalized at the boundary;
  authorization is enforced on the server from the resolved principal; negative paths are tested.
- **Principle VIII (Exact Money and Safe Database Evolution)**: Price uses integer minor units plus an
  explicit currency; the migration is additive and reviewable; no destructive change.
- **Principle IX (Automated Testing at Every Boundary)**: Unit, integration, and end-to-end suites are
  added, including concurrency and authorization coverage.
- **Principle XI (Recorded Decisions and Open Requirements)**: Open decisions are cited and not
  resolved; assumptions are stated explicitly.
- **Principle XII (Simplicity Before Distribution)**: No new dependency, no new infrastructure, no new
  configuration key.

## Success Criteria *(mandatory)*

- **M04-SC-001**: An administrator can create a two-level category tree, a brand, and a complete
  product with images, attributes, and variants in one session, and read every created record back.
- **M04-SC-002**: 100% of attempted third-level categories, duplicate slugs, duplicate SKUs, and in-use
  deletions are refused with a stable conflict error and leave the catalog unchanged.
- **M04-SC-003**: An anonymous caller sees 100% of the published catalog and 0% of the unpublished
  catalog, and an unpublished product's identifier is indistinguishable from an unknown one.
- **M04-SC-004**: Every stored price round-trips exactly, with no floating-point representation and no
  implicit rounding.
- **M04-SC-005**: 100% of administrative routes refuse anonymous callers and customers, and every
  outcome is recorded through the authorization audit boundary.
- **M04-SC-006**: 0 catalog responses expose an undocumented field or another module's data.
- **M04-SC-007**: The committed OpenAPI document lists every catalog route with its statuses and
  authorization metadata, and the generated document matches it exactly.
- **M04-SC-008**: The full composite verification gate passes on the finished tree, and a seeded
  contract or hygiene failure is still rejected by the gate.
- **M04-SC-009**: No new runtime or development dependency is added, and no HC-DEC-* decision is
  resolved or implied.
- **M04-SC-010**: The migration is additive and create-only, and applying it leaves every Milestone 01,
  02, and 03 object unchanged.

## Assumptions

- **M04-ASM-001**: A product carries a lifecycle state and a newly created product is not publicly
  visible until an administrator publishes it. This fails closed for a manual-administration catalog
  and is trivially reversible; if the Product Owner prefers immediate visibility, the default state can
  be changed without a data migration.
- **M04-ASM-002**: The catalog base price is stored on the product, because HC-CAT-006 names price as
  basic product data and no approved fact defines variant-level pricing. Variant-level price overrides
  are deferred to Milestone 06 (Pricing & Search).
- **M04-ASM-003**: The variant dimensions are exactly the three HC-CAT-003 names (color, size,
  material). Additional dimensions are deferred.
- **M04-ASM-004**: Images are external URLs. No object-storage or upload subsystem is approved, so the
  catalog stores references only.
- **M04-ASM-005**: Product attributes are open name/value pairs for later filtering. Their allowed
  names, value types, and facet behavior are a Milestone 06 decision.
- **M04-ASM-006**: A product may only be published with at least one variant, because a product with no
  SKU is not sellable (HC-CAT-003, HC-CAT-004).

## Open Dependencies

| Open item | Effect on this milestone | Review trigger |
| --- | --- | --- |
| HC-CAT-008 search and filter | Deferred; this milestone stores attributes but implements no search or filter. | Milestone 06. |
| HC-CAT-009 direct product discounts | Deferred; no discount field or behavior is added. | Milestone 06. |
| HC-COM-002, HC-DEC-009 currency conversion | Deferred; one base price per product, no conversion. | Milestone 06. |
| HC-DEC-005 supported countries | Not required by the catalog. | Before country-dependent work. |
| HC-DEC-006 tax | Not required by the catalog; no tax field is added. | Before checkout totals. |
| HC-INV-001 through HC-INV-004 inventory and bundles | Out of scope; the catalog stores no quantity and exposes no availability. | Milestone 05. |
| HC-DEC-003 account deletion and retention | Unchanged; the catalog relates to no customer data. | Before customer-data lifecycle work. |
