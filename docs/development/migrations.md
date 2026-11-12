# Migration Safety

Create a migration with `pnpm prisma:migrate:create --name descriptive_name`, inspect its SQL, and
only then apply it with `pnpm prisma:migrate:dev`. CI and deployment-like environments use only
`pnpm prisma:migrate:deploy` followed by `pnpm prisma:migrate:status`.

The application never migrates on startup. `prisma db push` is prohibited. A destructive, locking,
or data-reinterpreting change requires an expand/backfill/contract plan, a verified backup, an
approved recovery procedure, and a separately reviewed change before application. The Milestone 01
baseline created no business table.

## Milestone 02 migration

`prisma/migrations/20261019143155_identity_access/migration.sql` is additive and create-only. It
adds the four Identity enums (`UserRole`, `IdentityTokenPurpose`, `SecurityEventType`,
`SecurityEventOutcome`) and six tables (`users`, `sessions`, `identity_tokens`,
`admin_mfa_credentials`, `admin_mfa_recovery_codes`, `security_events`) with their unique
constraints and indexes. It drops no column, rewrites no row, and touches no Milestone 01 object, so
it is safe to apply forward with `pnpm prisma:migrate:deploy`; there is no down migration and no
rollback step in the accepted procedure.

Apply it to every target database and confirm the history afterwards:

```powershell
$env:DATABASE_URL = 'postgresql://nordhaven:local_only_change_me@localhost:5432/nordhaven'
pnpm prisma:migrate:deploy
pnpm prisma:migrate:status
```

Repeat for `nordhaven_integration` and `nordhaven_e2e` (with `NODE_ENV=test`). `status` must report
"Database schema is up to date!" on each. Migrations are applied explicitly and never by the
application, the test suites, or the admin provisioning script.

After any schema or migration edit, regenerate the client before building or testing: the
repositories use the generated Prisma client, and a stale client silently queries the wrong column
names. Run `pnpm prisma:generate` with `DATABASE_URL` exported (`prisma.config.ts` requires it, and
no root `.env` is permitted by the repository-hygiene gate).

## Milestone 03 migration

`prisma/migrations/20261019175814_customer_profiles/migration.sql` is additive and create-only. It
adds two tables and no enum:

- `customer_profiles` — one row per customer, keyed by a unique `user_id`. `user_id` is a stable
  foreign identifier only; there is no foreign key to the Identity `users` table, so the Customer
  Profiles module owns its own persistence and neither module can be joined by surprise. The nullable
  unique `default_address_id` is the single source of truth for the default-address selection.
- `customer_addresses` — saved shipping addresses, keyed by `customer_id` with `ON DELETE CASCADE`
  from `customer_profiles`, so removing a profile removes its addresses.

Both foreign keys are declared after both tables exist, which keeps the ordering valid for a
single create-only file. `default_address_id` uses `ON DELETE SET NULL`, so deleting the selected
default clears the selection rather than blocking the delete or promoting another address.

It drops no column, rewrites no row, and touches no Milestone 01 or Milestone 02 object, so it is
safe to apply forward with `pnpm prisma:migrate:deploy` on `nordhaven`, `nordhaven_integration`, and
`nordhaven_e2e`. There is no down migration and no rollback step in the accepted procedure. Both
tables were confirmed "up to date" on all three databases and the integration suite exercises the
cascade and set-null behavior directly.

## Milestone 04 migration

`prisma/migrations/20261019214516_product_catalog/migration.sql` is additive and create-only. It adds
the `ProductStatus` enum (`DRAFT`, `PUBLISHED`, `ARCHIVED`) and six tables:

- `categories` — the two-level tree. `parent_id` is a self-referencing foreign key with
  `ON DELETE RESTRICT`, so a category that still has children cannot be deleted. The maximum depth of
  two is not expressible as a table constraint, so it is enforced in `CategoryService` before any
  write.
- `brands` — the product brand.
- `products` — one row per product, referencing exactly one `category_id` and one `brand_id`
  (`ON DELETE RESTRICT`). `base_price_minor` is an exact integer of minor units and carries a
  hand-added `CHECK ("base_price_minor" >= 0)` constraint
  (`products_base_price_minor_nonnegative`); `base_currency` is a `CHAR(3)` code. The lifecycle state
  is the `ProductStatus` enum and defaults to `DRAFT`. `slug` is unique.
- `product_images` — the ordered image set, keyed by `product_id` with `ON DELETE CASCADE`.
- `product_attributes` — the ordered open name/value attribute set, keyed by `product_id` with
  `ON DELETE CASCADE`.
- `product_variants` — the sellable SKUs, keyed by `product_id` with `ON DELETE CASCADE`. `sku` is
  unique across the whole catalog. This is the identity that Milestone 05 will reference when it tracks
  inventory, which is why images and attributes are replaced as whole collections while variants are
  managed individually.

The generated migration was reviewed and then amended by hand to add the
`products_base_price_minor_nonnegative` check constraint, because Prisma does not model `CHECK`
constraints. The shadow database derives from the applied migration history, so no drift is expected.

It drops no column, rewrites no row, and touches no Milestone 01–03 object, so it is safe to apply
forward with `pnpm prisma:migrate:deploy` on `nordhaven`, `nordhaven_integration`, and `nordhaven_e2e`.
There is no down migration and no rollback step in the accepted procedure. All six tables and the enum
were confirmed "Database schema is up to date!" on all three databases (4 migrations found), and the
integration suite exercises the cascade, restrict, unique, and non-negative constraints directly.

## Milestone 05: fixed finished-goods inventory

The original 20261020060000_fixed_bundle_independent_stock SQL contained a BOM. Removing BOM/newlines enabled fresh replay. Existing nordhaven, nordhaven_integration and nordhaven_e2e had recorded that migration without its DDL: status alone failed to reveal drift. After explicit user approval, separate verified pg_dump archives preceded additive reconciliation by 20261020150000_reconcile_fixed_bundle_stock, then empty schema diffs and unchanged table fingerprints were verified. Only the successful historical checksum was normalized after DDL was actually applied; rolled-back history is retained. See docs/progress/milestone-05.md and its evidence locations for exact hashes and backups. Never infer schema correctness from status alone or mark unapplied SQL applied.

## Milestone 06: pricing and search

`prisma/migrations/20261020200000_pricing_search/migration.sql` is additive. It adds two columns to
`products`, three `CHECK` constraints, and one index, and it backfills one derived column:

- `discount_basis_points INTEGER NOT NULL DEFAULT 0` - the direct product discount in basis points.
  `0` means no discount; the value is bounded to `0..10000` by
  `products_discount_basis_points_range`.
- `effective_price_minor INTEGER NOT NULL DEFAULT 0` - the price the customer pays, in exact integer
  minor units of the product's base currency.
- `products_effective_price_consistent` - the effective price always equals
  `base_price_minor - ((base_price_minor * discount_basis_points + 5000) / 10000)`, which is the
  half-up rounded discount subtracted from the base price. The multiplication is evaluated in the
  database's 64-bit integer arithmetic, so it cannot overflow for the bounded amounts the platform
  stores.
- `products_effective_price_nonnegative` - a price is never negative, whatever the discount.
- `products_status_effective_price_idx` on `(status, effective_price_minor)` - serves the
  price-range filter over published products.

The three constraints are hand-added because Prisma does not model `CHECK` constraints, exactly as
`products_base_price_minor_nonnegative` was hand-added in Milestone 04. They make the **database**,
not the application, the authority on the stored effective price: any writer - the application, a
manual `UPDATE`, or a future migration - that stores an effective price disagreeing with its base
price and discount is refused by PostgreSQL.

The migration backfills `effective_price_minor` from the existing `base_price_minor` for every
pre-existing row, because every existing product has no discount. Without that step the
consistency constraint would be violated by every pre-existing row. The backfill rewrites one
derived column of one table; no base price, product, or any other application row is changed.

It drops no column, drops no table, renames nothing, and rewrites no business row, so it is safe to
apply forward with `pnpm prisma:migrate:deploy` on `nordhaven`, `nordhaven_integration`, and
`nordhaven_e2e`. There is no down migration and no rollback step in the accepted procedure. The row
counts of every application table were captured before and after and are identical, and
`prisma migrate status` reports "Database schema is up to date!" on all three databases with 10
migrations found. The integration suite exercises all three constraints directly.

## Milestone 07: cart and wishlist

`prisma/migrations/20261020210000_cart_wishlist/migration.sql` is additive. It creates three
tables, their foreign keys, their unique constraints, their indexes, and two `CHECK` constraints, and
it alters no existing table:

- `carts` - one row per customer, keyed by a unique `user_id`. The `user_id` is the Identity-owned
  customer as a **stable foreign identifier only**; there is deliberately no foreign key to the
  Identity `users` table, for the same reason the Customers module has none (HC-DEC-003 is open). The
  unique constraint makes "one cart per customer" structural.
- `cart_items` - one line per catalog SKU, keyed by `cart_id`. The `variant_id` is a **deliberate
  cross-module foreign key** to the catalog's `product_variants`, with `ON DELETE RESTRICT` so a SKU
  that is in someone's cart cannot be deleted out from under them; this is the same protection the
  Inventory module gives a SKU that still holds stock. `unit_price_minor` and `unit_currency` hold
  the last-known price the customer agreed to.
- `customer_wishlist_items` - one saved product per customer. The `product_id` is a **deliberate
  cross-module foreign key** to the catalog's `products`, with `ON DELETE CASCADE`, so a wishlist can
  never reference a product that no longer exists.

The two `CHECK` constraints are hand-added because Prisma does not model them:
`cart_items_unit_price_nonnegative` refuses a negative price, and `cart_items_quantity_in_range`
refuses a quantity outside 1..999. The same quantity bounds are asserted at the request boundary, so
a writer can never store a quantity outside the declared range.

It drops no column, drops no table, renames nothing, and rewrites no application row, so it is safe
to apply forward with `pnpm prisma:migrate:deploy` on `nordhaven`, `nordhaven_integration`, and
`nordhaven_e2e`. There is no down migration and no rollback step in the accepted procedure. The row
counts of every application table were captured before and after and are identical, and
`prisma migrate status` reports "Database schema is up to date!" on all three databases with 11
migrations found. The integration suite exercises both constraints and the deletion protection
directly.
