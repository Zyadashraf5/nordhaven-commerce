# Feature Specification: Milestone 06 - Pricing and Search

**Feature Branch**: Not created; the repository has no commits yet and no `before_specify` branch hook
is configured

**Created**: 2026-10-20

**Status**: Draft for Product Owner review; implementation authorized by the autonomous development
instruction of 2026-10-20

**Approval**: This specification implements the approved product facts **HC-CAT-008** (search and filter by
price, category, brand, and product attributes) and **HC-CAT-009** (direct product discounts are
supported; no broader promotion model is approved). It implements the base-currency half of
**HC-COM-002** only. **HC-DEC-009** (exchange-rate policy) and **HC-DEC-008** (settlement currency)
remain open, so no display-currency conversion and no settlement behaviour are introduced.
**HC-DEC-004** (checkout and reservation timing), **HC-DEC-006** (tax), and **HC-DEC-010** through
**HC-DEC-015** remain open and untouched. Hosted continuous integration remains deferred and NOT
VERIFIED.

**Input**: User description: "Milestone 06: Pricing and Search for Nordhaven Commerce - customer-facing
product search and filtering by price, category, brand, and product attributes over indexed PostgreSQL
queries, direct product discounts applied to the base price with exact integer money and an explicit
rounding rule, an effective price that is always consistent with the base price and the discount, and
a versioned REST/OpenAPI surface that extends the existing catalog, with validation, migrations, unit,
integration, and end-to-end tests."

## Scope Boundaries and Open Decisions

- **HC-CAT-008 (Approved)** - customers can search and filter products by price, category, brand, and
  product attributes. This milestone delivers that on the existing anonymous product listing.
- **HC-CAT-009 (Approved)** - direct product discounts are supported. No broader promotion model
  (coupons, tiers, campaigns, stacking, schedules) is approved, and none is invented here.
- **HC-COM-002 (Partially approved)** - one base currency and converted display currencies. The base
  currency is implemented; **display-currency conversion is deferred** because **HC-DEC-009** has not
  defined the rate provider, refresh cadence, effective timestamp, spread, rounding, caching, quote
  expiry, failure behaviour, or customer disclosure, and **HC-DEC-008** has not defined the settlement
  currency. No exchange rate is fetched, stored, or displayed by this milestone.
- **HC-DEC-004 (Open)** - the checkout state machine, reservation timing, and order-creation boundary
  are unresolved. This milestone therefore creates **no cart, checkout, order, payment, reservation,
  or tax behaviour**, and it never reserves stock.
- **HC-DEC-018 (Open, recorded by this milestone)** - the form, window, and stacking rules of a direct
  product discount are not approved. This milestone implements the conservative interpretation
  recorded in `docs/requirements/open-decisions.md`: a single percentage discount per product, in
  basis points, with no time window, no stacking, and no other discount form.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find a product by searching and filtering (Priority: P1)

A customer browsing the storefront wants to narrow the published catalog down to the products they
want. They can type words to search for, and they can filter by category, by brand, by product
attributes, and by a price range. The result set is ordered deterministically and paged with an
opaque cursor, so a caller can walk the whole result set without seeing a product twice or skipping
one. A request that names no filter behaves exactly as it did before this milestone.

**Why this priority**: Search and filtering is the approved customer-facing discovery capability
(HC-CAT-008). It is what makes a catalog of any size usable, and it is independently testable on its
own.

**Independent Test**: Publish a set of products across two categories, two brands, and several
attributes; then search by word, filter by each dimension in turn and in combination, page through the
result set with the returned cursor, and confirm the same product never appears twice and no matching
product is skipped.

**Acceptance Scenarios**:

1. **Given** published products with distinct names and descriptions, **When** the customer searches
   for a word that occurs in one of them, **Then** only the matching products are returned, matched
   case-insensitively as a substring of the name, the description, or an attribute name or value.
2. **Given** a category with one child category, **When** the customer filters by the parent
   category, **Then** the products of the parent and of its direct child are returned.
3. **Given** products of several brands, **When** the customer filters by one brand slug, **Then** only
   that brand's products are returned.
4. **Given** products that carry a `color` attribute, **When** the customer filters by
   `color=blue`, **Then** only the products carrying that attribute pair are returned, and the pair is
   matched case-insensitively.
5. **Given** a price range and a currency, **When** the customer filters by that range, **Then** only
   products whose **effective** price lies within the range and whose base currency is the named
   currency are returned.
6. **Given** a filtered result set that is larger than one page, **When** the customer follows the
   returned cursor, **Then** the next page continues the same ordering and does not repeat or skip a
   product.
7. **Given** a product that is not published, **When** the customer searches or filters, **Then** that
   product is never returned.
8. **Given** a request with no filter, **When** the customer lists products, **Then** the page is
   identical to the page the listing returned before this milestone.

---

### User Story 2 - Sell a product at a direct discount (Priority: P1)

An administrator marks a product as being on a direct discount, expressed as a percentage. The
customer then sees the price the product actually costs, which is the base price reduced by the
discount and rounded to a whole minor unit. The administrator can change the discount or remove it
again, and the customer-facing price follows immediately. No customer can create or change a discount.

**Why this priority**: HC-CAT-009 approves direct product discounts, and a discount that is not
reflected in the price the customer sees is not a discount at all. It is independently testable
without search.

**Independent Test**: Set a direct discount on one published product; read the product through the
anonymous catalog; confirm the effective price equals the base price reduced by the documented
rounded rule; change the discount and confirm the price follows; clear the discount and confirm the
effective price returns to the base price; then attempt the same write as an anonymous caller and as
a customer and confirm both are refused.

**Acceptance Scenarios**:

1. **Given** a product with a base price of 1999 minor units and a discount of 5000 basis points,
   **When** the effective price is computed, **Then** the discounted amount is 1000 minor units
   (999.5 rounded half up) and the effective price is 999 minor units.
2. **Given** a product with no discount, **When** the effective price is read, **Then** it equals the
   base price exactly.
3. **Given** a discount of 10000 basis points, **When** the effective price is computed, **Then** it
   is 0 minor units and never negative.
4. **Given** an administrator, **When** the discount is set, changed, or removed, **Then** the
   persisted product reflects exactly one discount and the effective price is recomputed in the same
   transaction.
5. **Given** an anonymous caller or a customer, **When** a discount write is attempted, **Then** the
   request is refused with the documented authorization error and nothing is persisted.
6. **Given** a base price that changes while a discount exists, **When** the product is saved,
   **Then** the effective price is recomputed from the new base price and the same discount.

---

### User Story 3 - Keep every money value exact and self-consistent (Priority: P1)

Every amount in the platform is an exact integer count of minor units in an explicit currency. The
effective price is never allowed to disagree with the base price and the discount, and no
floating-point arithmetic is used anywhere in the money path. A change that would make the product
inconsistent is rejected by the database itself rather than being stored.

**Why this priority**: Constitution principle VIII requires exact money and explicit, tested rounding
rules. A price that can drift from its own inputs is a financial defect regardless of how the feature
is used.

**Independent Test**: Attempt to persist a product whose stored effective price does not match the
base price and the discount, and confirm the database refuses the write; then compute the effective
price over a matrix of boundary base prices and discounts in the application and confirm every value
matches the documented rule.

**Acceptance Scenarios**:

1. **Given** a base price and a discount, **When** the effective price is stored, **Then** the
   database accepts the row only when the effective price equals the base price reduced by the
   documented rounded rule.
2. **Given** an inconsistent effective price, **When** the write is attempted, **Then** the database
   rejects it and the row is not changed.
3. **Given** a fractional discount result, **When** the effective price is computed, **Then** the
   rounding is half up to the nearest whole minor unit, applied once, at the effective-price boundary.
4. **Given** any money computation, **When** it is executed, **Then** it uses exact integer arithmetic
   and no binary floating-point value is used for the amount.

---

### Edge Cases

- A search term that matches nothing returns an empty page, not an error.
- A search term containing only punctuation, or only whitespace, is rejected as invalid input rather
  than silently treated as "match everything" or "match nothing".
- A filter naming an unknown category or brand slug returns an empty page rather than an error, so a
  caller cannot use the filter surface to probe for identifiers.
- Price bounds given without a currency are rejected, because comparing minor units of two different
  currencies is meaningless.
- A price range whose minimum is greater than its maximum is rejected as invalid input.
- A discount of zero basis points is accepted and means "no discount"; a discount above 10000 basis
  points, or a negative discount, is rejected.
- A discount set on a product that does not exist is refused with the documented not-found error.
- A product with a discount is deleted together with its discount.
- A base price of zero minor units with a discount stays at zero and never becomes negative.
- An extremely large base price with a large discount still produces a whole minor unit and never
  overflows.
- A cursor supplied with a different filter set than the one that produced it is still honoured as an
  opaque position, and the result stays deterministic for the filters in force.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The anonymous product listing MUST accept an optional text search term that matches,
  case-insensitively, as a substring of the product name, the product description, an attribute name,
  or an attribute value.
- **FR-002**: The anonymous product listing MUST accept an optional category filter that matches a
  category and its direct children.
- **FR-003**: The anonymous product listing MUST accept an optional brand filter that matches exactly
  one brand.
- **FR-004**: The anonymous product listing MUST accept one or more attribute filters, each naming an
  attribute name and value that must both be present on the product; several filters are combined with
  AND.
- **FR-005**: The anonymous product listing MUST accept an optional price range expressed as exact
  integer minor units, applied to the **effective** price, and MUST require an explicit currency for
  that range; products whose base currency differs are not matched by the range.
- **FR-006**: The anonymous product listing MUST combine every supplied filter with AND, and MUST
  return only products in the published state.
- **FR-007**: A filtered listing MUST preserve the existing deterministic ordering by product name and
  identifier, and MUST page with the existing opaque cursor so that no product is repeated or skipped.
- **FR-008**: A listing request that supplies no filter MUST return exactly the page the listing
  returned before this milestone.
- **FR-009**: The product projection MUST expose the base price, the base currency, the direct
  discount in basis points, and the effective price.
- **FR-010**: An administrator MUST be able to set, replace, and remove a product's direct discount.
- **FR-011**: The effective price MUST be the base price reduced by the discounted amount, where the
  discounted amount is `round_half_up(base_price_minor * discount_basis_points / 10000)` computed with
  exact integer arithmetic, and the effective price MUST never be negative.
- **FR-012**: The database MUST refuse to store an effective price that does not equal the value
  derived from the base price and the discount, and the effective price MUST be recomputed inside the
  same transaction as any change to the base price or the discount.
- **FR-013**: No binary floating-point arithmetic MUST be used to compute a monetary amount.
- **FR-014**: Discount administration MUST require the administrator role, and MUST be refused for an
  anonymous caller and for a customer.
- **FR-015**: The platform MUST continue to use a single base currency per product and MUST NOT fetch,
  store, or display a converted amount, because the exchange-rate and settlement-currency decisions
  remain open.
- **FR-016**: The search term, filters, price range, and discount values MUST be validated and
  normalized at the request boundary, and an invalid value MUST be refused with the stable validation
  error.
- **FR-017**: The existing catalog rate-limit policies MUST continue to apply to the search and
  discount routes, and the discount routes MUST be bounded by the administrative write policy.
- **FR-018**: The capability MUST add no new runtime or development dependency, no new configuration
  key, and no new infrastructure, and MUST NOT add a cart, checkout, order, payment, reservation,
  tax, or currency-conversion behaviour.
- **FR-019**: The public REST contract MUST be described in the OpenAPI document, and the documented
  operation inventory, authorization metadata, and excluded-domain scan MUST remain enforced.
- **FR-020**: No customer, administrator, or other personal data is introduced by this capability, so
  no new log-redaction path is required; the assessment MUST be recorded.

### Key Entities

- **Direct discount**: the discount attached to one product, expressed as a whole number of basis
  points of the product's base price, with no time window and no stacking.
- **Effective price**: the price a customer pays for a product, derived from the base price and the
  direct discount, stored on the product row and constrained by the database to equal the derived
  value.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A search or filtered listing over the approved catalog size of fewer than 1,000
  products answers within 300 ms at the ninety-fifth percentile on the reference development
  database.
- **SC-002**: The effective price computed by the application matches the documented rounding rule
  for every case in the boundary matrix, and every stored effective price is accepted by the database
  constraint, so no inconsistent price is ever persisted.
- **SC-003**: A product is never returned twice and never skipped across the pages of a filtered
  listing.
- **SC-004**: Every documented discount and search behaviour is proven by an automated test at the
  narrowest useful level, including the denial paths and the database constraint.
- **SC-005**: The complete quality gate passes, and the previous milestones' behaviour is unchanged.

## Assumptions

- **M06-ASM-001**: "Price" in HC-CAT-008 is the price the customer pays, so the price filter and
  the price filter's bounds apply to the **effective** price, not to the pre-discount base price.
- **M06-ASM-002**: A direct product discount is a percentage of the base price. The approved fact
  does not fix the form, and the percentage form is currency-agnostic, survives a base-price change
  without becoming invalid, and needs no exchange rate. This interpretation is recorded as
  HC-DEC-018 for the Product Owner.
- **M06-ASM-003**: A product carries at most one direct discount. No stacking, no coupon, no tier, no
  campaign, and no scheduled pricing exists, because no broader promotion model is approved.
- **M06-ASM-004**: The rounding rule is applied once, at the effective-price boundary: the discounted
  amount is rounded half up to the nearest whole minor unit, and the effective price is the base price
  minus that amount.
- **M06-ASM-005**: A category filter on a parent category also matches the products of its direct
  children, because the approved hierarchy has at most two levels (HC-CAT-002).
- **M06-ASM-006**: Attribute filters match the attribute name and value case-insensitively, because
  an administrator types free text into both fields.
- **M06-ASM-007**: The customer-facing search and filtering live in the Catalog capability, which
  already owns the products, categories, brands, and attributes that are searched. A separate
  discovery module would either duplicate that data or read another module's tables, both of which the
  architecture rules forbid. The refinement is recorded in the milestone research.
- **M06-ASM-008**: The free-text search uses a case-insensitive substring match. The catalog is
  smaller than 1,000 products (HC-CAT-001), so the approved architecture's own trigger for a
  dedicated search index - a measured relevance, language, latency, or catalog-growth requirement -
  has not been met, and the filter dimensions are indexed.
