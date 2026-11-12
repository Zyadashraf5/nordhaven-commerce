# Data Model: Milestone 08 - Checkout and Tax (Implemented)

**Date**: 2026-10-21

**Status**: **Implemented and verified.** Every structure below exists in `prisma/schema.prisma` and
was created by the additive migration
[`20261021090000_checkout_tax`](../../prisma/migrations/20261021090000_checkout_tax/migration.sql).

## What already exists

The checkout and the tax calculation build on facts the platform already stored, and this section
records them so the new structures are read against reality.

| Existing fact                                    | Where it lives                                                                     | Owner    |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- | -------- |
| The customer and their saved shipping addresses   | `customer_profiles`, `customer_addresses`                                          | Customers |
| The product, its SKU, its price, and its discount | `products`, `product_variants`                                                     | Catalog  |
| The effective price the customer pays            | `products.effective_price_minor`                                                   | Catalog  |
| The cart, its lines, and the last-known price    | `carts`, `cart_items`                                                              | Cart     |
| The per-SKU stock and the reservation lifecycle   | `inventory_items`, `reservations`, `reservation_lines`                            | Inventory |
| The stock movement audit trail                   | `stock_movements`                                                                  | Inventory |
| The bundle composition and its selection ranges  | `bundles`, `bundle_components`                                                    | Inventory |

## New structures

### The tax rule

A tax rule is **configuration data, not code**, because the approved decision forbids hardcoding a
rate as a universal rate. Every rate lives in a row.

```
tax_rules
  id                    the rule identifier
  environment           the scope the rule belongs to: TEST or PRODUCTION
  jurisdiction          the country whose rules this is, as a two-letter code
  classification        the product classification the rate applies to
  rate_basis_points     the rate as an exact integer count of basis points
  tax_inclusive         true when the configured price already includes the tax
  effective_from        when the rule starts applying
  effective_to          when the rule stops applying, or null when it never does
  priority              the tie-break weight when several rules match
  created_by_user_id    the administrator who created the rule
  updated_by_user_id    the administrator who last changed the rule
  created_at, updated_at
```

**Why the environment scope exists.** A production request looks only for `PRODUCTION` rules, so a
`TEST` rule can never apply to it, and a production request finds no rule until a production rule is
approved and configured. That makes "no production tax without an approved configuration"
**structural** rather than a convention that a deployment could forget.

**Why the rate is an exact integer.** The rate is a count of basis points, so no rounding happens
before the calculation and every monetary value stays an exact integer count of minor units.

**The database constraints.**

- `tax_rules_rate_basis_points_range` refuses a rate outside zero and one hundred percent.
- `tax_rules_effective_window` refuses a window that ends before it starts.
- The unique key on `(environment, jurisdiction, classification, effective_from)` refuses a duplicate.

### The product tax classification

```
tax_classifications
  product_id            the catalog product, as the primary key
  classification        the classification the product is taxed under
  created_at, updated_at
```

The Tax capability owns the classification, because the classification is tax data. The Catalog
capability is not modified, and the Tax capability references the catalog's product through a
**deliberate cross-module foreign key** with `ON DELETE CASCADE`, the same pattern the Cart and the
Wishlist capabilities use. A classification therefore never outlives its product.

A product with **no** row uses the `STANDARD` classification. The absence of a row is the signal, so
there is no database default that could hide an unset classification.

### The checkout destination

```
checkout_destinations
  country_code          the destination country, as part of the primary key
  environment           the scope the approval belongs to: TEST or PRODUCTION
  enabled               whether the destination may be checked out at all
  tax_jurisdiction      the jurisdiction whose tax rules apply to this destination
  shipping_approved     whether an approved shipping rule covers this destination
  label                 the administrator's label for the destination
  updated_by_user_id    the administrator who last changed the destination
  created_at, updated_at
```

The primary key is the **pair** `(country_code, environment)`, so a country may be approved for the
test environment and, later and separately, for production.

**Why both approvals are required.** The approved decision says a destination needs **both** an
approved shipping rule and an approved tax rule before a customer may check out. The row therefore
carries both facts, and the quote refuses a destination that lacks either.

**The database constraint.** `checkout_destinations_tax_jurisdiction_present` refuses a destination
with no jurisdiction, so a destination can never be enabled without a jurisdiction to look its tax
rules up under.

### The cart line's owner

The Milestone 07 milestone deferred a bundle cart line. The approved decision on the dynamic bundle
selection rule unblocks it, so the cart line now names either a catalog SKU or a bundle.

```
cart_items
  id                    the line identifier
  cart_id               the owning cart
  variant_id            the catalog SKU, when the line names one
  bundle_id             the bundle, when the line names one
  quantity              the units
  unit_price_minor      the price the customer last agreed to
  unit_currency         the currency of that price
  created_at, updated_at
```

**The database constraints.**

- `cart_items_exactly_one_owner` refuses a line that names both a SKU and a bundle, and a line that
  names neither. It is hand-added, exactly as `inventory_items` carries one, because Prisma cannot
  express a check over a nullable pair.
- The unique key on `(cart_id, variant_id)` refuses two lines for the same SKU in one cart.
- The unique key on `(cart_id, bundle_id)` refuses two lines for the same bundle in one cart.

**Why a bundle is sellable as one line.** A FIXED bundle is an independently stocked finished good
and a DYNAMIC bundle resolves to its approved component composition, so both are sold as one unit
priced by the product that names the bundle.

## The quote

**The quote is not stored.** It is a deterministic function of the cart, the destination, and the
server's own configuration, so it is recomputed rather than persisted. A stored quote would need an
expiry and a cleanup policy that no approved decision defines, and it would risk a customer being
shown a figure the server could no longer reproduce.

The quote's **fingerprint** is a SHA-256 digest over the quote's material content: the destination,
the currency, and every line's identity, quantity, unit price, net amount, tax amount, and total,
plus the totals. A later step compares the fingerprint it holds against a recomputed one, so a stale
price is detected rather than silently applied.

## The order aggregate

**The order belongs to Milestone 09, not to this milestone.** The Milestone 09 milestone owns the
order aggregate, its immutable commercial snapshots, its states, and its links to the payment state.
The Checkout capability publishes the quote contract that the Orders capability consumes, so the
order's price snapshot and the customer's confirmation always refer to the same figures, and the two
capabilities do not depend on each other.

## Data ownership

| Capability | Owns                                    | Depends on, through a published contract            |
| ---------- | --------------------------------------- | --------------------------------------------------- |
| Tax       | `tax_rules`, `tax_classifications`      | Nothing; it references the catalog's product by a declared foreign key |
| Checkout  | `checkout_destinations`                 | The Cart's reader contract, the Inventory's availability contract, the Tax's assessor contract |
| Cart      | `carts`, `cart_items`                   | Nothing; it references the catalog's SKU and the inventory's bundle by declared foreign keys |
| Inventory | the existing inventory tables           | Nothing; it references the catalog's SKU by a declared foreign key |

No capability reaches into another capability's tables. The `boundaries:check` gate enforces that the
only cross-module imports are the published contracts, and the check passed for this milestone.

## The migration

**Additive.** The migration creates three tables and their constraints, alters one column to be
nullable, and adds one column with a foreign key. No table is dropped, no column is dropped, no
business row is deleted, and no existing row is rewritten.

The row counts of the three canonical databases were captured before and after the migration and were
**identical** in every table, and the migration count advanced from eleven to twelve.
