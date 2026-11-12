# Contract: Milestone 04 - Product Catalog API

**Feature**: [spec.md](../spec.md) | **Data model**: [data-model.md](../data-model.md) | **Date**: 2026-10-20

This document is the reviewed public contract of the Product Catalog capability. The committed
`openapi/openapi.json` is generated from the code and asserted against this contract by
`pnpm openapi:check` and by the end-to-end suite. A route, status, identifier, or field that is not
recorded here must not exist.

## Authorization model

- **Anonymous** — reachable with no credential. Only the browsing routes are anonymous, because
  HC-IAM-002 requires authentication for a cart or checkout, not for browsing.
- **`ADMIN`** — requires an administrator session. Every administrative route is `ADMIN`-only. The
  required role is read from the server-resolved principal; no client value participates.
- Administrators and customers are deliberately not required to browse, and a customer is deliberately
  refused every administrative route.
- Every administrative grant and denial is recorded through the platform authorization audit boundary
  (`RolesGuard` → `AuthorizationAuditPort`), which the Identity module persists as a security event.

## Shared response metadata

Every response carries `X-Correlation-ID` (a UUID) and `Cache-Control: no-store`. Rate-limited
responses add `Retry-After`. These are applied centrally by the OpenAPI post-processing and the HTTP
layer; no controller sets them individually beyond the explicit `@Header('Cache-Control', 'no-store')`
the platform requires per route.

## Error codes

| Code | Status | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | The request body, path, or query failed the boundary schema. |
| `UNAUTHENTICATED` | 401 | No usable session credential was presented. |
| `FORBIDDEN` | 403 | The resolved principal lacks the required role. |
| `CATEGORY_NOT_FOUND` | 404 | No category matches the identifier. |
| `BRAND_NOT_FOUND` | 404 | No brand matches the identifier. |
| `PRODUCT_NOT_FOUND` | 404 | No visible product matches the identifier. |
| `VARIANT_NOT_FOUND` | 404 | No variant matches the identifier. |
| `CATALOG_CONFLICT` | 409 | The change conflicts with existing catalog state. |
| `RATE_LIMITED` | 429 | A declared rate-limit policy was exceeded. |

`CATALOG_CONFLICT` is used uniformly for a duplicate category or brand public identifier, a duplicate
SKU, a deletion refused because something depends on the record, and an invalid hierarchy change. It
never contains database text, a table name, or a constraint name. The catalog milestone adds only
these five codes to the closed `AppErrorCode` union.

## Rate-limit policies

| Policy | Limit | Window | Key dimension | Applies to |
| --- | --- | --- | --- | --- |
| `catalog.read` | 300 | 300 s | `client` | Anonymous browsing and administrative reads. |
| `catalog.write` | 60 | 900 s | `client` | Every administrative create, update, and delete. |

The key dimension is `client` because the global rate-limit guard runs **before** session
authentication, so the principal is not yet resolved. The state is process-local and resets on restart,
exactly as recorded for Milestone 02.

## Administrative routes (`@Roles('ADMIN')`)

### Categories

| Method | Path | Operation | Success | Documented failures |
| --- | --- | --- | --- | --- |
| `POST` | `/api/v1/admin/catalog/categories` | `createAdminCategory` | 201 | 400, 401, 403, 409, 429, 500, 503 |
| `GET` | `/api/v1/admin/catalog/categories` | `listAdminCategories` | 200 | 400, 401, 403, 429, 500, 503 |
| `PATCH` | `/api/v1/admin/catalog/categories/{categoryId}` | `updateAdminCategory` | 200 | 400, 401, 403, 404, 409, 429, 500, 503 |
| `DELETE` | `/api/v1/admin/catalog/categories/{categoryId}` | `deleteAdminCategory` | 204 | 400, 401, 403, 404, 409, 429, 500, 503 |

- Create body: `name` (required), `slug` (optional; derived from the name when omitted), `parentId`
  (optional UUID), `position` (optional non-negative integer).
- The two-level rule is enforced: a supplied `parentId` must reference a root category, and a category
  that has children cannot be given a parent. A violation is `409 CATALOG_CONFLICT`.
- Delete is refused with `409 CATALOG_CONFLICT` when the category has children or products.

### Brands

| Method | Path | Operation | Success | Documented failures |
| --- | --- | --- | --- | --- |
| `POST` | `/api/v1/admin/catalog/brands` | `createAdminBrand` | 201 | 400, 401, 403, 409, 429, 500, 503 |
| `GET` | `/api/v1/admin/catalog/brands` | `listAdminBrands` | 200 | 400, 401, 403, 429, 500, 503 |
| `PATCH` | `/api/v1/admin/catalog/brands/{brandId}` | `updateAdminBrand` | 200 | 400, 401, 403, 404, 409, 429, 500, 503 |
| `DELETE` | `/api/v1/admin/catalog/brands/{brandId}` | `deleteAdminBrand` | 204 | 400, 401, 403, 404, 409, 429, 500, 503 |

- Delete is refused with `409 CATALOG_CONFLICT` when a product references the brand.

### Products

| Method | Path | Operation | Success | Documented failures |
| --- | --- | --- | --- | --- |
| `POST` | `/api/v1/admin/catalog/products` | `createAdminProduct` | 201 | 400, 401, 403, 404, 409, 429, 500, 503 |
| `GET` | `/api/v1/admin/catalog/products` | `listAdminProducts` | 200 | 400, 401, 403, 429, 500, 503 |
| `GET` | `/api/v1/admin/catalog/products/{productId}` | `getAdminProduct` | 200 | 400, 401, 403, 404, 429, 500, 503 |
| `PATCH` | `/api/v1/admin/catalog/products/{productId}` | `updateAdminProduct` | 200 | 400, 401, 403, 404, 409, 429, 500, 503 |
| `DELETE` | `/api/v1/admin/catalog/products/{productId}` | `deleteAdminProduct` | 204 | 400, 401, 403, 404, 429, 500, 503 |
| `PUT` | `/api/v1/admin/catalog/products/{productId}/images` | `replaceAdminProductImages` | 200 | 400, 401, 403, 404, 429, 500, 503 |
| `PUT` | `/api/v1/admin/catalog/products/{productId}/attributes` | `replaceAdminProductAttributes` | 200 | 400, 401, 403, 404, 409, 429, 500, 503 |
| `PUT` | `/api/v1/admin/catalog/products/{productId}/status` | `setAdminProductStatus` | 200 | 400, 401, 403, 404, 409, 429, 500, 503 |
| `POST` | `/api/v1/admin/catalog/products/{productId}/variants` | `createAdminProductVariant` | 201 | 400, 401, 403, 404, 409, 429, 500, 503 |
| `PATCH` | `/api/v1/admin/catalog/variants/{variantId}` | `updateAdminVariant` | 200 | 400, 401, 403, 404, 409, 429, 500, 503 |
| `DELETE` | `/api/v1/admin/catalog/variants/{variantId}` | `deleteAdminVariant` | 204 | 400, 401, 403, 404, 409, 429, 500, 503 |

- Create product body: `name`, `description`, `categoryId`, `brandId`, `basePriceMinor`
  (non-negative integer), `baseCurrency` (3 ASCII letters, normalized to upper case), optional `slug`.
  A new product is `DRAFT`.
- `PATCH` applies only the supplied attributes; `status` is never accepted here.
- `PUT .../images` replaces the whole image set atomically; positions must be unique and the count is
  bounded. `PUT .../attributes` replaces the whole attribute set; names must be unique.
- `PUT .../status` accepts `PUBLISHED` or `ARCHIVED` or `DRAFT`. Publishing a product that has no
  variant is refused with `409 CATALOG_CONFLICT`.
- A variant carries `sku` (required, globally unique), and optional `color`, `size`, `material`,
  `position`. A duplicate SKU is `409 CATALOG_CONFLICT`.
- Deleting a variant that Milestone 05 inventory references is refused with `409 CATALOG_CONFLICT`.

## Anonymous routes

| Method | Path | Operation | Success | Documented failures |
| --- | --- | --- | --- | --- |
| `GET` | `/api/v1/catalog/categories` | `listCatalogCategories` | 200 | 400, 429, 500, 503 |
| `GET` | `/api/v1/catalog/brands` | `listCatalogBrands` | 200 | 400, 429, 500, 503 |
| `GET` | `/api/v1/catalog/products` | `listCatalogProducts` | 200 | 400, 429, 500, 503 |
| `GET` | `/api/v1/catalog/products/{slug}` | `getCatalogProduct` | 200 | 400, 404, 429, 500, 503 |

- Browsing exposes only `PUBLISHED` products. A product that is not published answers exactly the same
  `404 PRODUCT_NOT_FOUND` envelope as a product that never existed.
- The public product listing accepts `limit` (bounded) and an opaque `cursor`, and returns
  `items` plus a nullable `nextCursor`. Ordering is deterministic by `(name, id)`.
- The category listing returns the two-level tree: each node carries its `children`. The brand listing
  returns the brands.
- No search, filter, or sort parameter exists in this milestone (HC-CAT-008 is Milestone 06).

## Response shapes

- `CategoryResponse`: `id`, `name`, `slug`, `parentId`, `position`, `children[]`, `createdAt`,
  `updatedAt`.
- `CategoriesResponse`: `categories: CategoryResponse[]`.
- `BrandResponse`: `id`, `name`, `slug`, `createdAt`, `updatedAt`.
- `BrandsResponse`: `brands: BrandResponse[]`.
- `CategoryRefResponse`: `id`, `name`, `slug`. `BrandRefResponse`: `id`, `name`, `slug`.
- `ImageResponse`: `url`, `altText`, `position`.
- `AttributeResponse`: `name`, `value`, `position`.
- `VariantResponse`: `id`, `sku`, `color`, `size`, `material`, `position`, `createdAt`, `updatedAt`.
- `ProductSummaryResponse`: `id`, `name`, `slug`, `status`, `basePriceMinor`, `baseCurrency`,
  `category`, `brand`, `createdAt`, `updatedAt`.
- `ProductDetailResponse`: the summary fields plus `description`, `images`, `attributes`, `variants`.
- `ProductsResponse`: `items: ProductSummaryResponse[]`, `nextCursor: string | null`.

No response exposes another module's data, an internal-only column, or an echo of a rejected value.
