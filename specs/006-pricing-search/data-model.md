# Data Model: Milestone 06 - Pricing and Search

**Date**: 2026-10-20

## Ownership

The Milestone 06 changes are owned exclusively by the **Catalog** module, which already owns
`products`, `categories`, `brands`, `product_images`, `product_attributes`, and
`product_variants`. No other module's tables are read or written, and no new module is introduced
(research R1, R10).

The Money arithmetic is a pure function of two columns on the same row, so no cross-module
coordination is needed to keep the effective price consistent.

## Enums

None. A percentage discount in basis points is an exact integer column, not an enum, so no
PostgreSQL type is added.

## Tables

### `products` (two columns added)

The table is otherwise unchanged. Both new columns live on the product row because the base price,
the discount, and the effective price are one fact (research R4).

| Column                | Type      | Null | Default | Meaning                                                                 |
| --------------------- | --------- | ---- | ------- | ----------------------------------------------------------------------- |
| `discount_basis_points` | `INTEGER` | no   | `0`     | The direct product discount in basis points; `0` means no discount.    |
| `effective_price_minor`  | `INTEGER` | no   | `0`     | The price the customer pays, in minor units of the product's base currency. |

`discount_basis_points` values:

- `0` - no discount; the effective price equals the base price.
- `1` to `9999` - a discount of one hundredth of a percent up to just under one hundred percent.
- `10000` - a full discount; the effective price is `0`.

**Check constraints** (added by hand in the migration, because Prisma does not model `CHECK`):

```sql
CONSTRAINT "products_discount_basis_points_range"
  CHECK ("discount_basis_points" >= 0 AND "discount_basis_points" <= 10000),

CONSTRAINT "products_effective_price_consistent"
  CHECK (
    "effective_price_minor" = "base_price_minor"
    - (("base_price_minor" * "discount_basis_points" + 5000) / 10000)
  ),

CONSTRAINT "products_effective_price_nonnegative"
  CHECK ("effective_price_minor" >= 0)
```

The `products_effective_price_consistent` constraint is the arithmetic of research R3 expressed in
PostgreSQL integer arithmetic: `(base * bps + 5000) / 10000` is the half-up rounded discounted
amount, and the effective price is the base price minus that amount. Because both operands are
`INTEGER` and the product is at most 2 * 10^13, the multiplication is performed in the database's
64-bit integer arithmetic, so the constraint cannot overflow.

The constraint is what makes the storage layer, not the application, the authority on consistency
(FR-012). Any writer - the application, a manual `UPDATE`, a future migration - that stores an
effective price that does not match its base price and discount is refused by PostgreSQL.

**Backfill.** The migration adds `effective_price_minor` with the default `0` and then sets it to
the existing `base_price_minor` for every existing row, because every existing product has no
discount. Without that step the consistency constraint would be violated by every pre-existing row
and the migration would fail. The backfill rewrites one derived column of one table; no base price,
product, or any other application row is changed.

**Indexes.** Two indexes are added so the new filters are index-backed rather than sequential scans
(research R6, R7):

| Index                                   | Columns                                    | Serves                                          |
| --------------------------------------- | ------------------------------------------ | ----------------------------------------------- |
| `products_discount_idx`                 | `discount_basis_points`                    | The discount projection and any future discount ordering. |
| `products_status_effective_price_idx`   | `status`, `effective_price_minor`           | The price-range filter over published products. |

The existing `products_status_name_id_idx` already serves the deterministic listing order, and the
existing `products_category_id_idx` and `products_brand_id_idx` already serve the category and
brand filters, so no index is added for those.

The free-text search is matched with `LOWER()` on `name` and `description` and on the joined
attribute `name` and `value`. Those columns are not indexed for the substring match, because a
substring match over a `TEXT` column cannot use a B-tree index and the alternative - a trigram index
- requires a PostgreSQL extension that the milestone does not add (research R13). At the approved
catalog size of fewer than 1,000 products (HC-CAT-001) the search is a bounded scan over a table
that is already small, and the filter dimensions that narrow the set first - category, brand, price
- are indexed. The approved architecture's own trigger for a dedicated search capability is a
measured relevance, language, latency, or catalog-growth requirement (HC-ARC-REC-002), which has
not occurred.

## Enumerations and projections

No new entity is introduced. The product projection gains two fields:

- `discountBasisPoints` - the direct discount in basis points; `0` means no discount.
- `effectivePriceMinor` - the price the customer pays, in minor units of the base currency.

Both are stored columns, not computed at read time, so the projection is a direct read.

## Migration

`prisma/migrations/20261020XXXXXX_pricing_search/migration.sql`, created with
`pnpm prisma:migrate:create --name pricing_search` and then reviewed and amended by hand.

The migration is **additive**: it adds two columns and their constraints and two indexes, and
backfills one derived column. It drops no column, drops no table, renames nothing, and rewrites no
business row. It is therefore safe to apply forward with `pnpm prisma:migrate:deploy` to
`nordhaven`, `nordhaven_integration`, and `nordhaven_e2e`, with no down migration and no rollback step
in the accepted procedure - the same procedure the previous three milestones used.

The `CHECK` constraints are hand-added because Prisma does not model them, exactly as
`products_base_price_minor_nonnegative` was hand-added in Milestone 04. The shadow database derives
from the applied migration history, so no drift is expected; `prisma migrate status` and a schema
diff are both run afterwards on all three databases to prove it.
