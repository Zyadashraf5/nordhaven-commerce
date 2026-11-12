# Contract: Milestone 06 - Pricing and Search API

**Contract version**: 0.6.0
**Base**: the Milestone 05 contract. Every existing route, operation identifier, status code, and
response shape is unchanged except the two documented additions below.

## Authorization model

| Surface                              | Requirement | Denials                                                                 |
| ------------------------------------ | ----------- | ----------------------------------------------------------------------- |
| `GET /api/v1/catalog/products`       | Anonymous   | -                                                                       |
| `GET /api/v1/catalog/products/{slug}` | Anonymous   | -                                                                       |
| `PUT /api/v1/admin/catalog/products/{productId}/discount` | `ADMIN` | `401 UNAUTHENTICATED` anonymous, `403 FORBIDDEN` for a customer, audited |

The discount route inherits the existing administrator MFA requirement, the principal-resolved
authorization, and the authorization audit boundary. No new role, scope, or principal capability is
introduced.

## Shared response metadata

Every response keeps `Cache-Control: no-store` and the correlation header, exactly as in the
Milestone 01 to 05 contract. The new fields carry no personal data, so no redaction path is added.

## Error codes

**No new error code is added.** The closed `AppErrorCode` union is unchanged.

| Condition                                   | Status | Code                |
| ------------------------------------------- | ------ | ------------------- |
| A malformed filter, price range, or discount | 400    | `VALIDATION_ERROR`  |
| A missing or unreadable cursor              | 400    | `VALIDATION_ERROR`  |
| An anonymous caller on the discount route   | 401    | `UNAUTHENTICATED`  |
| A customer on the discount route             | 403    | `FORBIDDEN`         |
| A discount on a product that does not exist | 404    | `PRODUCT_NOT_FOUND` |
| A rate limit exceeded                       | 429    | `RATE_LIMITED`      |

## Rate-limit policies

The existing `catalog.read` and `catalog.write` policies apply unchanged. The anonymous listing uses
`catalog.read`; the discount route uses `catalog.write`.

## The extended anonymous listing

`GET /api/v1/catalog/products`

Every parameter below is **optional**. A request that supplies none of them returns exactly the page
the listing returned before Milestone 06. The request schema is strict, so an unknown query
parameter is refused with `400 VALIDATION_ERROR` rather than ignored.

| Parameter  | Type            | Meaning                                                                                     |
| ---------- | --------------- | ------------------------------------------------------------------------------------------- |
| `limit`    | integer 1..50   | The page size.                                                                               |
| `cursor`   | string          | The opaque keyset position returned as `nextCursor`.                                          |
| `q`        | string <= 200   | A free-text term, matched case-insensitively as a substring of the product name, the product description, an attribute name, or an attribute value. It must contain at least one alphanumeric character. |
| `category` | slug            | The category and its direct children are matched. An unknown slug matches no product.        |
| `brand`    | slug            | Exactly that brand is matched. An unknown slug matches no product.                           |
| `attribute`| `name:value`    | Repeatable. The product must carry that attribute name and value, matched case-insensitively. Several filters are combined with AND. Both parts are required. |
| `minPrice` | integer >= 0    | The lowest **effective** price, in exact integer minor units. Requires `currency`.              |
| `maxPrice` | integer >= 0    | The highest **effective** price, in exact integer minor units. Requires `currency`.             |
| `currency` | 3-letter code   | The base currency a price range is expressed in. Required with `minPrice` or `maxPrice`. Only products in that currency are matched by the range. |

The criteria are combined with AND. The ordering is unchanged: a deterministic keyset page ordered
by product name and identifier, so a filtered page neither repeats nor skips a product.

A price range without a currency is refused, because comparing minor units of two different
currencies is meaningless. An inverted range is refused. A `minPrice` above `maxPrice` is refused.

## The product projection

Every product response gains two fields. The existing fields are unchanged.

| Field                  | Type    | Meaning                                                                                       |
| ---------------------- | ------- | --------------------------------------------------------------------------------------------- |
| `discountBasisPoints`  | integer | The direct product discount in basis points; one hundred is one percent. Zero means no discount. |
| `effectivePriceMinor`  | integer | The price the customer pays, in exact integer minor units of the product's base currency.        |

The effective price is the base price reduced by the discount:

```
discountedAmount = round_half_up(basePriceMinor * discountBasisPoints / 10000)
effectivePriceMinor = max(0, basePriceMinor - discountedAmount)
```

The rounding is half up, applied once, at the effective-price boundary, in exact integer
arithmetic. No floating-point value is used for any monetary amount. The stored value is constrained
by the database to this same expression, so the storage layer refuses any inconsistent price.

## The discount administration route

`PUT /api/v1/admin/catalog/products/{productId}/discount`

| Field         | Type    | Meaning                                                              |
| ------------- | ------- | -------------------------------------------------------------------- |
| `basisPoints` | integer | The direct discount in basis points, `0` to `10000`. Zero removes the discount. |

The body is strict: an unknown field is refused. The response is the full product projection, so the
caller sees the recomputed effective price. The effective price is recomputed from the current base
price in the same transaction as the discount, so a reader never observes a price that disagrees with
its own inputs.

Setting a discount on a product that does not exist answers `404 PRODUCT_NOT_FOUND`. The route
changes only the discount and the effective price; the base price, the currency, the lifecycle
state, the images, the attributes, and the variants are untouched.

## What this contract does not contain

- No converted amount, exchange rate, or display quote: HC-DEC-009 and HC-DEC-008 are open.
- No cart, checkout, order, payment, reservation, tax, shipping, or notification route.
- No promotion, coupon, tier, schedule, or stacking behavior: HC-DEC-018 is open.
- No new public path: the search and the discount extend the existing catalog surface.
