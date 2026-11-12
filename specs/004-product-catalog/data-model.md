# Data Model: Milestone 04 - Product Catalog

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-20

This document describes the tables the `catalog` module owns, the invariants they must hold, and the
migration that creates them. The catalog owns no other module's data and holds no foreign key to
another module's tables.

## Ownership

- **Owning module**: `catalog`.
- **Tables**: `categories`, `brands`, `products`, `product_images`, `product_attributes`,
  `product_variants`.
- **No cross-module foreign keys**: the catalog references neither Identity nor Customers data, so no
  module-boundary key exists.

## Tables

### `categories`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `uuid` | Primary key, `uuid(4)`. |
| `name` | `text` | Required, bounded at the boundary. |
| `slug` | `text` | Required, unique, normalized to lower kebab case. |
| `parent_id` | `uuid` | Nullable, references `categories.id` with `ON DELETE RESTRICT`. |
| `position` | `integer` | Non-negative display order, default 0. |
| `created_at` | `timestamptz` | Default now. |
| `updated_at` | `timestamptz` | Auto-updated. |

Invariants: a category's parent is a root (two levels); a category with children has no parent; a
category with products or children cannot be deleted.

Indexes: unique `slug`; index on `parent_id`.

### `brands`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `uuid` | Primary key, `uuid(4)`. |
| `name` | `text` | Required. |
| `slug` | `text` | Required, unique, normalized. |
| `created_at` | `timestamptz` | Default now. |
| `updated_at` | `timestamptz` | Auto-updated. |

Invariant: a brand referenced by a product cannot be deleted.

Indexes: unique `slug`.

### `products`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `uuid` | Primary key, `uuid(4)`. |
| `name` | `text` | Required. |
| `slug` | `text` | Required, unique, normalized. |
| `description` | `text` | Required. |
| `status` | `product_status` enum | `DRAFT` (default), `PUBLISHED`, `ARCHIVED`. |
| `category_id` | `uuid` | Required, references `categories.id` with `ON DELETE RESTRICT`. |
| `brand_id` | `uuid` | Required, references `brands.id` with `ON DELETE RESTRICT`. |
| `base_price_minor` | `integer` | Required, non-negative, exact minor units. |
| `base_currency` | `char(3)` | Required, upper-case ASCII letters. |
| `created_at` | `timestamptz` | Default now. |
| `updated_at` | `timestamptz` | Auto-updated. |

Invariants: exactly one category and one brand; price is exact integer minor units; a `PUBLISHED`
product has at least one variant.

Indexes: unique `slug`; index on `category_id`, `brand_id`, `status`, and (`name`, `id`) for the public
ordering.

### `product_images`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `uuid` | Primary key, `uuid(4)`. |
| `product_id` | `uuid` | Required, references `products.id` with `ON DELETE CASCADE`. |
| `url` | `text` | Required, absolute `http`/`https` URL. |
| `alt_text` | `text` | Nullable. |
| `position` | `integer` | Non-negative; unique within the product. |
| `created_at` | `timestamptz` | Default now. |

Invariant: positions are unique within a product, so image order is deterministic.

### `product_attributes`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `uuid` | Primary key, `uuid(4)`. |
| `product_id` | `uuid` | Required, references `products.id` with `ON DELETE CASCADE`. |
| `name` | `text` | Required; unique within the product. |
| `value` | `text` | Required. |
| `position` | `integer` | Non-negative display order. |
| `created_at` | `timestamptz` | Default now. |

Invariant: attribute names are unique within a product.

### `product_variants`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `uuid` | Primary key, `uuid(4)`. |
| `product_id` | `uuid` | Required, references `products.id` with `ON DELETE CASCADE`. |
| `sku` | `text` | Required, globally unique. |
| `color` | `text` | Nullable. |
| `size` | `text` | Nullable. |
| `material` | `text` | Nullable. |
| `position` | `integer` | Non-negative display order. |
| `created_at` | `timestamptz` | Default now. |
| `updated_at` | `timestamptz` | Auto-updated. |

Invariants: the SKU is unique across the whole catalog (HC-CAT-003); a variant is always owned by one
product; a variant cannot be deleted while Milestone 05 inventory references it (enforced later by the
inventory foreign key with `ON DELETE RESTRICT`, mapped to a stable conflict error).

Indexes: unique `sku`; index on `product_id`.

## Relationships

```
categories 1 ── * categories (parent/child, RESTRICT)
categories 1 ── * products        (RESTRICT)
brands     1 ── * products        (RESTRICT)
products   1 ── * product_images  (CASCADE)
products   1 ── * product_attributes (CASCADE)
products   1 ── * product_variants   (CASCADE)
```

## Migration

One additive, create-only migration named `product_catalog`:

- Creates the `product_status` enum and the six tables.
- Adds the unique constraints, indexes, and foreign keys after all referenced tables exist.
- Drops nothing, rewrites no row, and touches no Milestone 01, 02, or 03 object.

Applied to `nordhaven`, `nordhaven_integration`, and `nordhaven_e2e`, then `prisma migrate status` must
report the database up to date on all three.

## Deliberate Omissions

- No inventory quantity, reservation, or availability column (Milestone 05).
- No discount, converted price, or tax column (Milestone 06 and HC-DEC-006).
- No bundle table (Milestone 05).
- No search index beyond the ordering index the public pagination needs (Milestone 06).
