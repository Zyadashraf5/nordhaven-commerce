# Contract: Milestone 07 - Cart and Wishlist API

**Contract version**: 0.7.0
**Base**: the Milestone 06 contract. Every existing route, operation identifier, status code, and
response shape is unchanged except the seven documented additions below.

## Authorization model

| Surface                                        | Requirement | Denials                                                                     |
| ---------------------------------------------- | ----------- | --------------------------------------------------------------------------- |
| `GET /api/v1/cart`                            | `CUSTOMER`  | `401 UNAUTHENTICATED` anonymous, `403 FORBIDDEN` for an administrator       |
| `POST /api/v1/cart/items`                     | `CUSTOMER`  | `401 UNAUTHENTICATED` anonymous, `403 FORBIDDEN` for an administrator       |
| `PATCH /api/v1/cart/items/{itemId}`           | `CUSTOMER`  | `401 UNAUTHENTICATED` anonymous, `403 FORBIDDEN` for an administrator       |
| `DELETE /api/v1/cart/items/{itemId}`         | `CUSTOMER`  | `401 UNAUTHENTICATED` anonymous, `403 FORBIDDEN` for an administrator       |
| `GET /api/v1/customers/me/wishlist`           | `CUSTOMER`  | `401 UNAUTHENTICATED` anonymous, `403 FORBIDDEN` for an administrator       |
| `POST /api/v1/customers/me/wishlist`          | `CUSTOMER`  | `401 UNAUTHENTICATED` anonymous, `403 FORBIDDEN` for an administrator       |
| `DELETE /api/v1/customers/me/wishlist/{itemId}` | `CUSTOMER` | `401 UNAUTHENTICATED` anonymous, `403 FORBIDDEN` for an administrator      |

Every route is scoped to the presented session's principal. No route, body, or query parameter can
name a customer, a cart, or a wishlist, so there is no identifier to guess and no cross-customer
access to test for.

An **administrator is refused**, because HC-IAM-002 requires a customer account and the
administrator role is a different capability. This is a privacy property, not a convenience.

## Shared response metadata

Every response keeps `Cache-Control: no-store` and the correlation header, exactly as in the
Milestone 01 to 06 contract. The new fields carry no personal data, so no redaction path is added.

## Error codes

Two codes are **added**; every other outcome reuses an existing code.

| Code                        | Status | Meaning                                          |
| --------------------------- | ------ | ------------------------------------------------ |
| `CART_ITEM_NOT_FOUND`       | 404    | The cart does not hold that line.                |
| `WISHLIST_ITEM_NOT_FOUND`   | 404    | The wishlist does not hold that item.            |

| Condition                                      | Status | Code                |
| ---------------------------------------------- | ------ | ------------------- |
| An invalid quantity, identifier, or body       | 400    | `VALIDATION_ERROR`  |
| A cart line or wishlist item that is not held  | 404    | the new not-found codes |
| A SKU or product that does not exist, or is not published | 404 | `VARIANT_NOT_FOUND` / `PRODUCT_NOT_FOUND` |
| An anonymous caller                            | 401    | `UNAUTHENTICATED`  |
| An administrator on a customer route           | 403    | `FORBIDDEN`         |
| A rate limit exceeded                         | 429    | `RATE_LIMITED`      |

## Rate-limit policies

The new `cart.read` and `cart.write` policies apply to the cart routes. The wishlist routes reuse
the existing `customers.read` and `customers.write` policies, because the wishlist is part of the
Customers capability.

## The cart routes

### `GET /api/v1/cart`

Returns the authenticated customer's cart. A customer who has never had a cart receives an **empty**
cart, not an error.

### `POST /api/v1/cart/items`

| Field       | Type    | Meaning                                                    |
| ----------- | ------- | ---------------------------------------------------------- |
| `variantId` | UUID    | The catalog SKU to add.                                    |
| `quantity`  | integer | How many units, from 1 to 999.                            |

Adding a SKU that is already in the cart **increases that line's quantity** rather than creating a
second line. The request body is strict, so an unexpected field is refused.

### `PATCH /api/v1/cart/items/{itemId}`

| Field      | Type    | Meaning                       |
| ---------- | ------- | ----------------------------- |
| `quantity` | integer | The new quantity, from 1 to 999. |

### `DELETE /api/v1/cart/items/{itemId}`

Removes the line. Removing a line the cart does not hold is refused with
`404 CART_ITEM_NOT_FOUND`.

### The cart projection

| Field                       | Type    | Meaning                                                                    |
| --------------------------- | ------- | -------------------------------------------------------------------------- |
| `id`                        | UUID    | The line identifier.                                                        |
| `variantId`                 | UUID    | The catalog SKU.                                                            |
| `sku`                       | string  | The SKU.                                                                    |
| `productId`                 | UUID    | The product the SKU belongs to.                                             |
| `productName`               | string  | The product name.                                                           |
| `productSlug`               | string  | The product slug.                                                           |
| `quantity`                  | integer | The units the customer intends to buy.                                      |
| `lastKnownUnitPriceMinor`  | integer | The price the customer last agreed to, in exact integer minor units.        |
| `lastKnownUnitCurrency`     | string  | The currency of the last-known price.                                       |
| `currentUnitPriceMinor`     | integer | The price the customer would pay now, in exact integer minor units.        |
| `currentUnitCurrency`       | string  | The currency of the current price.                                          |
| `priceChanged`              | boolean | True when the current price differs from the price the customer agreed to. |
| `purchasable`               | boolean | False when the product is no longer published.                             |

The cart response carries `lines` and `updatedAt`.

**The last-known price is refreshed on every write to a line**, so it always means "the price at the
customer's most recent decision about this line". A read never writes, so a price change stays
visible until the customer acts on the line.

A cart never reserves or holds stock, creates no reservation, and performs no checkout.

## The wishlist routes

### `GET /api/v1/customers/me/wishlist`

Returns the authenticated customer's saved products. A customer who has never saved anything
receives an **empty** list.

### `POST /api/v1/customers/me/wishlist`

| Field      | Type | Meaning                        |
| ---------- | ---- | ------------------------------ |
| `productId` | UUID | The catalog product to save.  |

Saving a product that is already saved leaves the wishlist holding it **exactly once**.

### `DELETE /api/v1/customers/me/wishlist/{itemId}`

Removes the saved product. Removing an item the wishlist does not hold is refused with
`404 WISHLIST_ITEM_NOT_FOUND`.

### The wishlist projection

| Field              | Type    | Meaning                                                                 |
| ------------------ | ------- | ----------------------------------------------------------------------- |
| `id`               | UUID    | The item identifier.                                                     |
| `productId`        | UUID    | The catalog product.                                                     |
| `productName`      | string  | The product name.                                                        |
| `productSlug`      | string  | The product slug.                                                        |
| `currentPriceMinor` | integer | The current effective price, in exact integer minor units.              |
| `currentCurrency`  | string  | The currency of the current price.                                       |
| `purchasable`      | boolean | False when the product is no longer published.                          |
| `savedAt`          | string  | When the product was saved.                                              |

The wishlist response carries `items`.

## What this contract does not contain

- No reservation, stock hold, availability check, checkout, order, payment, tax, or shipping
  behavior: HC-DEC-004 is open.
- No converted amount or display quote: HC-DEC-009 and HC-DEC-008 are open.
- No bundle cart line: a bundle line needs the bundle selection rule and the bundle availability
  contract, and is deferred to the Milestone 08 plan.
- No new public path beyond the seven listed above.
