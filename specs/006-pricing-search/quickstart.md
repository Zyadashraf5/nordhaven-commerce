# M06 local verification quickstart

A local walkthrough of the Milestone 06 search, filter, and discount behavior against a running
API. It uses only the public HTTP surface, so it proves the contract as a client sees it.

## Prerequisites

- PostgreSQL running: `pnpm db:up` and `pnpm db:wait`.
- The schema applied: `pnpm prisma:migrate:deploy`.
- The API running: `pnpm dev` (or `pnpm build && pnpm start`).

## 1. Sign in as an administrator

```
POST /api/v1/auth/login
{ "email": "<administrator email>", "password": "<administrator password>" }
```

Complete the second factor when the challenge is returned, then keep the `token` for the steps
below. Every administrative route below requires this bearer credential.

## 2. Create the catalog

```
POST /api/v1/admin/catalog/categories   { "name": "Living Room" }
POST /api/v1/admin/catalog/categories   { "name": "Sofas", "parentId": "<root id>" }
POST /api/v1/admin/catalog/brands       { "name": "Northwind" }
POST /api/v1/admin/catalog/brands       { "name": "Southwind" }
```

Create three products, one in the child category, one in the root category, and one in the root
category with a different brand:

```
POST /api/v1/admin/catalog/products
{
  "name": "Oak Sofa",
  "description": "A solid oak sofa.",
  "categoryId": "<child category id>",
  "brandId": "<northwind id>",
  "basePriceMinor": 100000,
  "baseCurrency": "GBP"
}
```

Give each product a sellable variant, because publishing requires one:

```
POST /api/v1/admin/catalog/products/{productId}/variants   { "sku": "OAK-SOFA-01" }
```

Add an attribute to the sofa:

```
PUT /api/v1/admin/catalog/products/{productId}/attributes
{ "attributes": [{ "name": "Colour", "value": "Blue", "position": 0 }] }
```

Publish each product:

```
PUT /api/v1/admin/catalog/products/{productId}/status   { "status": "PUBLISHED" }
```

## 3. Browse and filter anonymously

```
GET /api/v1/catalog/products
GET /api/v1/catalog/products?q=oak
GET /api/v1/catalog/products?category=living-room
GET /api/v1/catalog/products?brand=southwind
GET /api/v1/catalog/products?attribute=colour:blue
GET /api/v1/catalog/products?attribute=colour:blue&attribute=material:oak
GET /api/v1/catalog/products?maxPrice=60000&currency=GBP
```

Every response is a deterministic page ordered by name and identifier, and the `nextCursor` value
continues the same page. The price range compares the **effective** price, so a discounted product
is matched on what the customer pays.

Refusals to check:

- `GET /api/v1/catalog/products?minPrice=100` - a price range without a currency answers `400`.
- `GET /api/v1/catalog/products?minPrice=900&maxPrice=100&currency=GBP` - an inverted range answers
  `400`.
- `GET /api/v1/catalog/products?sort=price` - an unknown parameter answers `400`.
- `GET /api/v1/catalog/products?attribute=colour` - an attribute filter without a value answers
  `400`.

## 4. Apply a direct discount

```
PUT /api/v1/admin/catalog/products/{productId}/discount   { "basisPoints": 5000 }
```

The response is the full product, and it carries `discountBasisPoints: 5000` and the recomputed
`effectivePriceMinor`. A base price of 1999 with a half-off discount has an effective price of 999,
because 999.5 rounds half up to 1000.

Check that the customer sees the same price:

```
GET /api/v1/catalog/products/{slug}
```

Remove the discount again with `{ "basisPoints": 0 }`; the effective price returns to the base
price.

## 5. Check the authorization boundary

```
PUT /api/v1/admin/catalog/products/{productId}/discount   (no credential)   -> 401 UNAUTHENTICATED
PUT /api/v1/admin/catalog/products/{productId}/discount   (customer token)  -> 403 FORBIDDEN
```

Neither refusal changes the stored product.

## 6. Check the database refuses an inconsistent price

With a database client:

```sql
UPDATE products SET discount_basis_points = 2000, effective_price_minor = 1 WHERE id = '<id>';
```

The write is refused with `products_effective_price_consistent`. The storage layer, not the
application, is the authority on the stored effective price.

## 7. Run the automated suites

```
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm verify
pnpm prisma:migrate:status
```

The database-backed suites require `DATABASE_URL` to name an isolated test database whose name ends
with `_integration` or `_e2e`; the guard refuses anything else.
