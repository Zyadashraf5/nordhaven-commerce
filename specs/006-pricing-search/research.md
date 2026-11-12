# Research: Milestone 06 - Pricing and Search

**Date**: 2026-10-20

## Findings

### R1 - Search and filtering extend the Catalog capability rather than adding a module

The architecture overview names a candidate "Discovery" module that would own product search and
filters and would depend on published Catalog and Pricing read contracts. Two constraints make that
split actively harmful at this stage:

- The Catalog module already owns `products`, `categories`, `brands`, and `product_attributes`, and
  already publishes the anonymous product listing. A Discovery module that wants to filter the
  catalog would have to read Catalog's tables through a published contract, which means either
  duplicating the filter predicate in a second module or moving the query. Both are worse than
  extending the module that already owns the data.
- The product's price and its discount are two halves of one fact: the customer-visible price is a
  function of the base price and the discount on the same product row. A filter over "effective price
  between X and Y" cannot be answered by a module that cannot see both halves.

The milestone therefore extends the Catalog module with a search/filter capability and a pricing
capability, and the "Discovery" candidate boundary stays a candidate for a later milestone when a
read-optimized projection is actually justified. This is recorded as a refinement of the preliminary
architecture table, and the module is renamed in the milestone to describe what it delivers.

The public contract is unchanged in shape: the existing `GET /api/v1/catalog/products` listing gains
optional filter parameters, and the existing product projection gains the discount and the effective
price. No new public path is introduced, so no existing client breaks.

### R2 - A direct product discount is a percentage, stored in basis points

HC-CAT-009 approves "direct product discounts" without fixing their form. Three properties decide
the choice:

- **Currency-agnostic.** A percentage of the base price needs no currency and therefore no exchange
  rate. A fixed-amount discount would have to be stored in a currency, and a product whose base
  currency changed would leave that amount meaningless. Because HC-DEC-009 has not defined the
  exchange-rate policy, a percentage keeps the milestone free of an unresolved decision.
- **Survives a price change.** When the base price changes, a percentage discount stays valid. A
  fixed-amount discount larger than the new base price would either become invalid or silently clamp.
- **Exact.** Basis points are an exact integer. A percentage of an integer amount is not always an
  integer, so the rounding rule is the part that has to be decided and tested (R3).

The discount is therefore one nullable column, `discount_basis_points`, on the product row, with a
`0` value meaning "no discount". Only one discount exists per product: no stacking, no coupon, no
schedule, no other promotion form, because HC-CAT-009 approves no broader promotion model.

The remaining choice - the rounding rule - is recorded as the new open decision HC-DEC-018 with this
milestone's conservative interpretation recorded in the decision register.

### R3 - The rounding rule: half up, applied once, at the effective-price boundary

The effective price is the base price reduced by a percentage. The discounted amount is not always a
whole number of minor units, so the rule must be explicit (constitution principle VIII requires the
rounding rule and its application boundary to be explicit and tested).

The rule is: `discountAmount = round_half_up(basePriceMinor * discountBasisPoints / 10000)`, and
`effectivePriceMinor = basePriceMinor - discountAmount`.

- **Half up** is the commercial convention for reducing a price: the customer is never charged more
  than the exact fractional amount due, and a half case rounds to the customer's benefit.
- **Applied once**, at the effective-price boundary. The intermediate percentage multiplication is
  never itself rounded, and no other rounding happens anywhere in the money path. Rounding the
  discount and then subtracting gives the same result as subtracting the exact fraction and rounding
  once, but the former is implementable with integer arithmetic alone.
- **The discounted amount is clamped at the base price.** A 100% discount yields an effective price
  of `0`, never a negative one. A negative price is not representable, so the database `CHECK`
  constraint rejects it independently of the application.

The arithmetic is done entirely in integers. `basePriceMinor` is at most 2,000,000,000 and
`discountBasisPoints` at most 10,000, so the product is at most 2 * 10^13, which is far below
`Number.MAX_SAFE_INTEGER` (about 9 * 10^15) and therefore exactly representable as a JavaScript
number. `Math.floor((base * bps + 5000) / 10000)` implements half-up exactly for these bounds, and
the unit test proves the bound.

### R4 - The effective price is stored, not computed on read, and the database constrains it

The effective price could be computed in the response projection on every read. It is stored
instead, for three reasons:

- **It must be filterable.** "Filter products by price" means filtering by the price the customer
  pays. A computed column cannot be indexed, so a price filter would degrade into a full scan with
  a per-row computation.
- **The database must be able to refuse an inconsistent value.** The milestone requires the storage
  layer to reject an effective price that does not equal the derived value. That is only expressible
  if the value is stored.
- **It is written in the same transaction as the inputs.** The base price and the discount are both
  written on the product row, so the effective price is recomputed and written inside the same
  transaction. There is no window in which a reader can observe a stale effective price.

The `CHECK` constraint is written so the database, not the application, is the authority:
`effective_price_minor = base_price_minor - ((base_price_minor * discount_basis_points + 5000) / 10000)`
and `effective_price_minor >= 0`. Prisma does not model `CHECK` constraints, so the constraint is
added by hand in the migration, exactly as the existing `products_base_price_minor_nonnegative`
constraint was.

The column is `NOT NULL DEFAULT 0` and is backfilled from the existing base prices by the
migration, so no existing row is left with an inconsistent effective price. The default of `0` is
deliberate: a product created without a base price cannot exist (the base price is required), and the
`CHECK` constraint then refuses any row whose effective price does not match.

### R5 - The price filter is expressed in minor units and always names a currency

A price range without a currency is ambiguous: comparing 1,000 minor units of one currency with
1,000 minor units of another is meaningless, and different currencies have different minor-unit
exponents. The filter therefore requires the currency whenever a bound is supplied, and only matches
products whose base currency is that currency.

The bounds are exact integer minor units, matching every other monetary value in the platform. A
caller that wants major units converts them itself, so no rounding is introduced at the boundary.

### R6 - The free-text search is a case-insensitive substring over the product's own text

HC-CAT-008 names price, category, brand, and product attributes as the filter dimensions. It does
not name a full-text ranking behaviour, so none is invented. The search term matches
case-insensitively as a substring of the product name, the product description, or an attribute name
or value, which is the behaviour a shopper expects from a small catalog and needs no language-specific
stemming or ranking policy that would itself be an unresolved decision.

The search is implemented with indexed PostgreSQL predicates rather than a separate search service.
The approved catalog is smaller than 1,000 products (HC-CAT-001) and the approved architecture
recommends indexed PostgreSQL queries and projections before any dedicated capability
(HC-REC-001, HC-ARC-REC-002). A separate search engine would need a new dependency and new
infrastructure, and would be unjustified at this scale.

The implementation uses PostgreSQL's own `ILIKE` with a `pg_trgm`-free plan: the term is matched
against `name`, `description`, and the joined attribute name and value. To keep the query
indexable the searchable text is matched with a `LOWER(...)` expression and the supporting indexes
are added to the migration.

### R7 - The category filter matches a category and its direct children

The approved hierarchy has at most two levels (HC-CAT-002). A shopper who filters by "Furniture"
expects to see "Chairs", which is a child of "Furniture". The filter therefore resolves the named
category to itself plus its direct children, which is a complete set at two levels, and the
resolution is done with a single indexed query rather than a separate round trip.

Filtering by a slug rather than an identifier keeps the public surface consistent with the existing
public catalog, which is entirely slug- and identifier-free in its paths, and it means an unknown
slug yields an empty page instead of an error, so the filter surface cannot be used to probe for
identifiers.

### R8 - Attribute filters are name-and-value pairs, matched case-insensitively

An administrator types free text into both the attribute name and the attribute value, so the stored
text can be "Colour" and "Blue" while the shopper types "colour:blue". Both sides are therefore
compared case-insensitively. A filter that names only an attribute name, without a value, is not
accepted: an attribute with several values per name would make "name only" ambiguous.

Several attribute filters are combined with AND, so a shopper can require "colour:blue" and
"material:solid oak" together.

### R9 - Ordering and pagination are unchanged

The existing listing is a deterministic keyset page ordered by name and identifier, and the existing
opaque cursor encodes exactly that position. The search and filters are applied *within* the same
ordering, so the cursor keeps working unchanged and no product is repeated or skipped across pages.
Adding a sort parameter would introduce a second ordering, a second cursor shape, and an
unapproved decision about which ordering a shopper should prefer by default; none is added.

### R10 - Discount administration is an administrative route on the product

The discount is set, replaced, and removed through the existing administrative product surface, as a
`PUT` on the product's discount. It requires the `ADMIN` role, so it inherits the existing
administrator MFA requirement, and the administrative write rate limit. The customer-facing surface
is read-only for the discount: a customer sees the discount and the effective price, and can never
change either.

Because the product's price is the catalog's own data, the discount is administered next to it. This
avoids a second module whose only job would be to own one column, and it keeps the base price, the
discount, and the effective price in one transaction on one row.

### R11 - The new public filter parameters are optional and additive

The existing listing accepts `limit` and `cursor`. The milestone adds optional `q`, `category`,
`brand`, `attribute`, `minPrice`, `maxPrice`, and `currency` parameters. A request that supplies
none of them behaves exactly as before, so no existing client is affected and the milestone's
"no filter returns the previous page" requirement is directly testable.

The request schema stays strict: an unknown query parameter is still refused, so a typo in a filter
name is reported rather than silently ignored.

### R12 - Currency conversion and settlement remain out of scope

HC-COM-002 approves "one base currency and may show converted display currencies", but
HC-DEC-009 has not defined the exchange-rate provider, refresh cadence, effective timestamp, spread,
rounding, caching, quote expiry, failure behaviour, or customer disclosure, and HC-DEC-008 has not
defined the settlement currency. Any conversion implemented now would invent the policy that those
decisions exist to settle, so this milestone stores, filters, and displays one base currency only.

The decision register records the deferral, and the price projection continues to name the base
currency on every amount so that a later display-quote layer can be added without changing the
stored facts.

### R13 - No new dependency, configuration key, or infrastructure

The milestone uses the platform as it stands: the same global guard chain, the same Zod boundary
pipe, the same safe error envelope, the same authorization audit boundary, the same structured logger
and redaction, and the same OpenAPI inventory assertion. The search is a PostgreSQL query over
indexed columns, so no search service, queue, cache, or extension is introduced. The only new
persistent object is the discount column and the effective price column, added by one additive
migration.

### R14 - The error contract gains no new code

The milestone introduces no new failure kind. A missing product is the existing `PRODUCT_NOT_FOUND`,
a refused change is the existing `CATALOG_CONFLICT`, an invalid parameter is the existing
`VALIDATION_ERROR` envelope, and an unauthorized caller is the existing `UNAUTHENTICATED` or
`FORBIDDEN`. The closed `AppErrorCode` union therefore stays exactly as it is, and no client's error
handling needs to learn a new code.

### R15 - Recorded decisions and explicit blockers

- **HC-DEC-018 (Open, recorded by this milestone)** - the form, window, and stacking rules of a
  direct product discount are not approved. This milestone implements the conservative interpretation
  recorded in the decision register: one percentage discount per product, in basis points, with no
  time window, no stacking, and no other discount form. The Product Owner may widen or narrow it.
- **HC-DEC-009 and HC-DEC-008 (Open, carried)** - the exchange-rate policy and the settlement
  currency are not resolved, so no converted amount exists.
- **HC-DEC-004 (Open, carried)** - the checkout boundary is not resolved, so no reservation is
  created, no cart exists, and no order or payment behaviour is introduced.
- **HC-DEC-006 (Open, carried)** - the tax policy is not resolved, so no tax amount exists.
