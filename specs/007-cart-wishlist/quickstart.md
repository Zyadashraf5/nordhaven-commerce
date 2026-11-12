# M07 local verification quickstart

A local walkthrough of the Milestone 07 cart and wishlist behavior against a running API. It uses
only the public HTTP surface, so it proves the contract as a client sees it.

## Prerequisites

- PostgreSQL running: `pnpm db:up` and `pnpm db:wait`.
- The schema applied: `pnpm prisma:migrate:deploy`.
- The API running: `pnpm dev` (or `pnpm build && pnpm start`).

## 1. Register a customer

```
POST /api/v1/auth/register
{ "email": "<customer email>", "password": "<customer password>" }
```

```
POST /api/v1/auth/login
{ "email": "<customer email>", "password": "<customer password>" }
```

Keep the `token` for the steps below. Every cart and wishlist route requires this bearer credential.

## 2. Sign in as an administrator and publish a product

The administrator sign-in needs a second factor; follow the Milestone 02 quickstart.

```
POST /api/v1/admin/catalog/categories   { "name": "Living Room" }
POST /api/v1/admin/catalog/brands       { "name": "Northwind" }
POST /api/v1/admin/catalog/products
{
  "name": "Oak Dining Table",
  "description": "A solid oak dining table.",
  "categoryId": "<category id>",
  "brandId": "<brand id>",
  "basePriceMinor": 129900,
  "baseCurrency": "GBP"
}
POST /api/v1/admin/catalog/products/{productId}/variants   { "sku": "OAK-TABLE-01" }
PUT  /api/v1/admin/catalog/products/{productId}/status      { "status": "PUBLISHED" }
```

## 3. Use the cart

```
GET  /api/v1/cart
POST /api/v1/cart/items    { "variantId": "<variant id>", "quantity": 2 }
GET  /api/v1/cart
```

The cart reports, per line, the price the customer last agreed to, the current effective price, and
whether the two differ. Adding the same SKU again increases the line rather than creating a second
one.

```
PATCH  /api/v1/cart/items/{itemId}   { "quantity": 7 }
DELETE /api/v1/cart/items/{itemId}
```

Refusals to check:

- `POST /api/v1/cart/items` with `quantity: 0` answers `400`.
- `POST /api/v1/cart/items` with `quantity: 1.5` answers `400`.
- `POST /api/v1/cart/items` with an extra field answers `400`.
- `PATCH /api/v1/cart/items/{unknownId}` answers `404 CART_ITEM_NOT_FOUND`.
- `POST /api/v1/cart/items` for a SKU whose product is not published answers `404
  VARIANT_NOT_FOUND`.
- Every route without a credential answers `401`.
- Every route with an **administrator** credential answers `403`.

## 4. See a price change

With a line in the cart, change the price in the catalog:

```
PUT /api/v1/admin/catalog/products/{productId}/discount   { "basisPoints": 5000 }
GET /api/v1/cart
```

The line now reports the old price as `lastKnownUnitPriceMinor`, the discounted price as
`currentUnitPriceMinor`, and `priceChanged: true`. Changing the quantity refreshes the last-known
price, because the customer has just made a fresh decision about the item.

## 5. Use the wishlist

```
GET  /api/v1/customers/me/wishlist
POST /api/v1/customers/me/wishlist   { "productId": "<product id>" }
GET  /api/v1/customers/me/wishlist
DELETE /api/v1/customers/me/wishlist/{itemId}
```

Saving the same product twice leaves it in the wishlist exactly once. Removing an item that is not
there answers `404 WISHLIST_ITEM_NOT_FOUND`.

## 6. Check that a cart holds no stock

With a database client:

```sql
SELECT on_hand, reserved FROM inventory_items WHERE variant_id = '<variant id>';
SELECT count(*) FROM reservations;
```

Both are unchanged by any cart operation. A cart is an intent record, not a commitment: the
reservation timing stays open under HC-DEC-004.

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
