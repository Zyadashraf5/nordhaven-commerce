# Data Model: Milestone 05 - Inventory and Bundles

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-20

This document describes the tables the `inventory` module owns, the invariants they must hold, and the
migration that creates them.

## Ownership

- **Owning module**: `inventory`.
- **Tables**: `inventory_items`, `stock_movements`, `reservations`, `reservation_lines`, `bundles`,
  `bundle_components`.
- **Cross-module references (deliberate, recorded - research R2)**: every stock and component reference is
  a foreign key to `product_variants(id)` (owned by the `catalog` module) with `ON DELETE RESTRICT`. The
  inventory module imports no catalog code; it only stores the catalog SKU identity, exactly as the
  catalog stores a category identity. No other module's data is referenced.

## Enums

### `ReservationStatus`

`ACTIVE`, `CONFIRMED`, `RELEASED`, `EXPIRED`.

### `StockMovementReason`

`ADJUSTMENT` (administrative on-hand change), `RESERVATION_CREATED` (`reserved` increases),
`RESERVATION_RELEASED` (`reserved` decreases), `RESERVATION_EXPIRED` (`reserved` decreases),
`RESERVATION_CONFIRMED` (`on_hand` decreases and `reserved` decreases).

### `BundleKind`

`FIXED`, `DYNAMIC`.

## Tables

### `inventory_items`

Stock for exactly one catalog variant or one FIXED bundle. Exactly one of variant_id/bundle_id is non-null, each unique.

| Column       | Type          | Rules                                                                   |
| ------------ | ------------- | ----------------------------------------------------------------------- |
| `id`         | `uuid`        | Primary key, `uuid(4)`.                                                  |
| `variant_id` | `uuid` | Nullable, unique, references product_variants.id ON DELETE RESTRICT. |
| `bundle_id` | `uuid` | Nullable, unique, references bundles.id ON DELETE RESTRICT. |
| `on_hand`    | `integer`     | Required, default 0, `CHECK (on_hand >= 0)`.                             |
| `reserved`   | `integer`     | Required, default 0, `CHECK (reserved >= 0)`.                            |
| `created_at` | `timestamptz` | Default now.                                                             |
| `updated_at` | `timestamptz` | Auto-updated.                                                            |

Invariants: `on_hand >= 0`, `reserved >= 0`, `reserved <= on_hand` at rest; `available = on_hand -
reserved` is never negative. `reserved <= on_hand` is enforced by the reservation transaction (the
conditional update checks `on_hand - reserved >= qty`) and asserted by the concurrency test; the two
non-negative `CHECK`s are the database-level backstop.

Indexes: unique `variant_id`.

### `stock_movements`

Append-only audit of every quantity change (research R12).

| Column             | Type                   | Rules                                                          |
| ------------------ | ---------------------- | -------------------------------------------------------------- |
| `id`               | `uuid`                 | Primary key, `uuid(4)`.                                         |
| `inventory_id`     | `uuid`                 | Required, references `inventory_items.id` `ON DELETE RESTRICT`. |
| `reason`           | `StockMovementReason`  | Required.                                                       |
| `note`             | `text`                 | Nullable. The optional label supplied with an `ADJUSTMENT`.      |
| `on_hand_delta`    | `integer`              | Required (may be negative or zero).                             |
| `reserved_delta`   | `integer`              | Required (may be negative or zero).                             |
| `on_hand_after`    | `integer`              | Required, `>= 0`.                                               |
| `reserved_after`   | `integer`              | Required, `>= 0`.                                               |
| `reservation_id`   | `uuid`                 | Nullable, references `reservations.id` `ON DELETE SET NULL`.    |
| `created_at`       | `timestamptz`          | Default now.                                                    |

Invariant: a movement is never updated or deleted by application code. It records the reason and the
resulting quantities so any current quantity can be explained.

Indexes: index on `inventory_id`, index on `created_at`.

### `reservations`

| Column            | Type                | Rules                                             |
| ----------------- | ------------------- | ------------------------------------------------- |
| `id`              | `uuid`              | Primary key, `uuid(4)`.                            |
| `status`          | `ReservationStatus` | Required, default `ACTIVE`.                        |
| `idempotency_key` | `text`              | Required, unique, bounded at the boundary.         |
| `expires_at`      | `timestamptz`       | Required; the authoritative expiry (research R5).  |
| `created_at`      | `timestamptz`       | Default now.                                       |
| `updated_at`      | `timestamptz`       | Auto-updated.                                      |

Invariants: a terminal reservation (`CONFIRMED`, `RELEASED`, `EXPIRED`) never returns to `ACTIVE`; its
lines never change after it leaves `ACTIVE`.

Indexes: unique `idempotency_key`; index on `(status, expires_at)` for lazy expiry.

### `reservation_lines`

| Column           | Type      | Rules                                                                   |
| ---------------- | --------- | ----------------------------------------------------------------------- |
| `id`             | `uuid`    | Primary key, `uuid(4)`.                                                  |
| `reservation_id` | `uuid`    | Required, references `reservations.id` `ON DELETE CASCADE`.              |
| `inventory_id`   | `uuid`    | Required, references `inventory_items.id` `ON DELETE RESTRICT`.          |
| `quantity`       | `integer` | Required, `CHECK (quantity > 0)`.                                        |

Invariants: one line per SKU per reservation: unique `(reservation_id, inventory_id)`; a reservation has at
least one line.

Indexes: unique `(reservation_id, inventory_id)`.

### `bundles`

| Column        | Type         | Rules                                                        |
| ------------- | ------------ | ------------------------------------------------------------ |
| `id`          | `uuid`       | Primary key, `uuid(4)`.                                       |
| `product_id`  | `uuid`       | Required, unique, references `products.id` `ON DELETE RESTRICT`. The bundle is presented as a catalog product. |
| `kind`        | `BundleKind` | Required, default `FIXED`.                                    |
| `name`        | `text`       | Required, bounded at the boundary.                            |
| `description` | `text`       | Nullable.                                                     |
| `created_at`  | `timestamptz`| Default now.                                                  |
| `updated_at`  | `timestamptz`| Auto-updated.                                                 |

Invariants: FIXED bundles hold independently assembled finished stock (HC-DEC-017); DYNAMIC bundles derive stock from components; a bundle has at least one component; a
bundle's components are catalog variants, never another bundle (research R8).

Indexes: unique `product_id`.

### `bundle_components`

| Column              | Type      | Rules                                                                  |
| ------------------- | --------- | ---------------------------------------------------------------------- |
| `id`                | `uuid`    | Primary key, `uuid(4)`.                                                 |
| `bundle_id`         | `uuid`    | Required, references `bundles.id` `ON DELETE CASCADE`.                  |
| `variant_id`        | `uuid`    | Required, references `product_variants.id` `ON DELETE RESTRICT`.       |
| `quantity`          | `integer` | Required for `FIXED`, `CHECK (quantity > 0)`.                           |
| `min_quantity`      | `integer` | Required for `DYNAMIC`, `CHECK (min_quantity >= 0)`.                    |
| `max_quantity`      | `integer` | Required for `DYNAMIC`, `CHECK (max_quantity >= min_quantity)`.         |
| `position`          | `integer` | Non-negative display order, default 0.                                  |

Invariants: one row per SKU per bundle: unique `(bundle_id, variant_id)`; for a `FIXED` bundle only
`quantity` is meaningful, for a `DYNAMIC` bundle only `min_quantity`/`max_quantity` are; the kind rule is
enforced in the service and asserted by test.

Indexes: unique `(bundle_id, variant_id)`.

## Migration

`prisma/migrations/<timestamp>_inventory_bundles/migration.sql` is additive and create-only. It creates the
three enums and six tables above. The non-negative and positivity `CHECK` constraints are added by hand
because Prisma does not model `CHECK`s (the same technique used in Milestone 04). The migration drops no
column, rewrites no row, and touches no Milestone 01-04 object, so it is safe to apply forward with
`pnpm prisma:migrate:deploy`; there is no down migration and no rollback step in the accepted procedure.


## HC-DEC-017 verification amendment

Owner XOR and reserved <= on_hand are enforced by database CHECK constraints in 20261020150000_reconcile_fixed_bundle_stock. FIXED assembly/disassembly writes every affected inventory and movement in one transaction; finished reservations reference that inventory row. Historical research statements describing all bundles as component-derived are superseded by the approved decision and amended Principle V.
