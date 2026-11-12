# Data Model: Milestone 07 - Cart and Wishlist

**Date**: 2026-10-20

## Ownership

Two capabilities are affected, and each owns its own tables:

| Capability  | Tables                                | Notes                                                          |
| ----------- | ------------------------------------- | -------------------------------------------------------------- |
| **Cart** (new module) | `carts`, `cart_items`         | Owned exclusively by the Cart module.                           |
| **Customers** (existing module) | `customer_wishlist_items` | Owned exclusively by the Customers module.               |

The Cart module references the Catalog's `product_variants` through a **declared foreign key**
(research R2), and the Customers module references the Catalog's `products` through a **declared
foreign key** (research R3). Neither module imports the Catalog's code, and neither queries the
Catalog's tables directly; each reads the referenced rows through its own relation. The
`boundaries:check` gate continues to pass.

## Enums

None. A cart's lifecycle and a wishlist's lifecycle are both single-state in this milestone, so no
PostgreSQL type is added.

## Tables

### `carts` (new, owned by the Cart module)

| Column       | Type      | Null | Default | Meaning                                                                 |
| ------------ | --------- | ---- | ------- | ----------------------------------------------------------------------- |
| `id`         | `UUID`    | no   | -       | The cart identifier.                                                   |
| `user_id`    | `UUID`    | no   | -       | The Identity-owned customer. A stable foreign identifier only; there is deliberately **no** foreign key to the Identity `users` table, for the same reason the Customers module has none (HC-DEC-003 is open). |
| `created_at` | `TIMESTAMP(3)` | no | `now()` | When the cart was created.                                        |
| `updated_at` | `TIMESTAMP(3)` | no | -     | When the cart was last written.                                        |

`user_id` is **unique**: a customer has exactly one cart (research R1, HC-DEC-019). The uniqueness
is what makes "one cart per customer" structural rather than a convention, and it is what lets two
concurrent first requests resolve to one cart.

### `cart_items` (new, owned by the Cart module)

| Column             | Type      | Null | Default | Meaning                                                                     |
| ------------------ | --------- | ---- | ------- | --------------------------------------------------------------------------- |
| `id`               | `UUID`    | no   | -       | The line identifier.                                                         |
| `cart_id`          | `UUID`    | no   | -       | The owning cart, `ON DELETE CASCADE`.                                       |
| `variant_id`       | `UUID`    | no   | -       | The catalog SKU, `ON DELETE RESTRICT` against `product_variants`.            |
| `quantity`         | `INTEGER` | no   | -       | The number of units the customer intends to buy.                             |
| `unit_price_minor` | `INTEGER` | no   | -       | The last-known unit price, in exact integer minor units.                     |
| `unit_currency`    | `CHAR(3)` | no   | -       | The currency of the last-known price.                                        |
| `created_at`       | `TIMESTAMP(3)` | no | `now()` | When the line was created.                                            |
| `updated_at`       | `TIMESTAMP(3)` | no | -     | When the line was last written.                                              |

**Check constraints** (hand-added, because Prisma does not model `CHECK`):

```sql
CONSTRAINT "cart_items_quantity_positive"  CHECK ("quantity" >= 1 AND "quantity" <= 999),
CONSTRAINT "cart_items_unit_price_nonnegative" CHECK ("unit_price_minor" >= 0)
```

The quantity bound is asserted at the request boundary **and** by the database, so no writer can
store a quantity outside the declared range.

**Uniqueness**: `UNIQUE ("cart_id", "variant_id")` - a cart holds at most one line per SKU
(research R12). Adding the same SKU again therefore increases the existing line.

**Indexes**:

| Index                       | Columns                  | Serves                                        |
| --------------------------- | ------------------------ | --------------------------------------------- |
| `carts_user_id_key`         | `user_id`                | The unique cart of a customer.                |
| `cart_items_cart_id_variant_id_key` | `cart_id`, `variant_id` | One line per SKU within a cart.  |
| `cart_items_variant_id_idx`  | `variant_id`             | The `ON DELETE RESTRICT` lookup.              |

### `customer_wishlist_items` (new, owned by the Customers module)

| Column        | Type      | Null | Default | Meaning                                                                 |
| ------------- | --------- | ---- | ------- | ----------------------------------------------------------------------- |
| `id`          | `UUID`    | no   | -       | The item identifier.                                                      |
| `customer_id` | `UUID`    | no   | -       | The owning customer profile, `ON DELETE CASCADE` from `customer_profiles`. |
| `product_id`  | `UUID`    | no   | -       | The catalog product, `ON DELETE CASCADE` from `products`.                  |
| `created_at`  | `TIMESTAMP(3)` | no | `now()` | When the item was saved.                                             |

**Uniqueness**: `UNIQUE ("customer_id", "product_id")` - a customer holds a product at most once.

**Indexes**:

| Index                                    | Columns                  | Serves                                   |
| ---------------------------------------- | ------------------------ | ---------------------------------------- |
| `customer_wishlist_items_customer_id_product_id_key` | `customer_id`, `product_id` | One entry per product. |
| `customer_wishlist_items_product_id_idx` | `product_id`             | The `ON DELETE CASCADE` lookup.           |

## Enumerations and projections

No new entity beyond the three tables. The cart line projection reports the last-known price, the
current effective price read through the relation, whether the two differ, and whether the product
is still published. The wishlist item projection reports the product's identity, its current
effective price, and whether it is still published.

## Migration

`prisma/migrations/20261020XXXXXX_cart_wishlist/migration.sql`, created with
`pnpm prisma:migrate:create --name cart_wishlist` and then reviewed and amended by hand.

The migration is **additive**: it creates two tables, their foreign keys, their unique
constraints, their indexes, and their `CHECK` constraints. It alters no existing table, drops no
column, and rewrites no application row, so it is safe to apply forward with
`pnpm prisma:migrate:deploy` to `nordhaven`, `nordhaven_integration`, and `nordhaven_e2e`, with no
down migration and no rollback step in the accepted procedure.

The `CHECK` constraints are hand-added because Prisma does not model them, exactly as the
`products_base_price_minor_nonnegative` constraint was hand-added in Milestone 04 and the three
Milestone 06 pricing constraints were hand-added.
