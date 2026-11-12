# API Contract: Milestone 08 - Checkout and Tax (Implemented)

**Date**: 2026-10-21

**Status**: **Implemented and verified.** Every route below is served by the running application and
is asserted against the committed OpenAPI document by the end-to-end suite.

**Version**: the published contract is `0.8.0`.

## The customer quote

### `POST /api/v1/checkout/quotes`

Prices the authenticated customer's cart for one destination.

**Authorization.** The `CUSTOMER` role. An anonymous caller receives `401 UNAUTHENTICATED`; an
administrator receives `403 FORBIDDEN`.

**Request.**

```json
{ "destinationCountryCode": "EG" }
```

The schema is **strict**, so an unexpected field is refused with `400 VALIDATION_ERROR` rather than
ignored. In particular a client cannot submit a price, a tax amount, or a total: those fields do
not exist in the contract, so a request that carries one is rejected before the calculation runs.

**Response `201`.**

```json
{
  "currency": "EGP",
  "destinationCountryCode": "EG",
  "taxJurisdiction": "EG",
  "ready": true,
  "blockers": [],
  "lines": [
    {
      "lineId": "8f2c...",
      "targetKind": "VARIANT",
      "variantId": "3a1b...",
      "bundleId": null,
      "sku": "SKU-Oak-Dining-Table",
      "productId": "5c9d...",
      "productName": "Oak Dining Table",
      "quantity": 2,
      "unitPriceMinor": 129900,
      "unitCurrency": "EGP",
      "priceChanged": false,
      "taxClassification": "STANDARD",
      "taxRuleId": "1e2f...",
      "taxRateBasisPoints": 1400,
      "taxInclusive": false,
      "netMinor": 259800,
      "taxMinor": 36372,
      "totalMinor": 296172
    }
  ],
  "netSubtotalMinor": 259800,
  "taxTotalMinor": 36372,
  "totalMinor": 296172,
  "roundingRule": "half-up-per-line",
  "fingerprint": "9c1d..."
}
```

**Every amount is an exact integer count of minor units in one explicit currency.** No monetary value
passes through a binary floating-point representation, and `netSubtotalMinor + taxTotalMinor`
equals `totalMinor` exactly, in every configuration.

**The quote reserves nothing.** A quote holds no stock, creates no reservation, creates no order, and
takes no payment. The end-to-end suite proves the stock balance and the reserved count are unchanged
after a quote.

**The blockers.** A quote that cannot be completed is **not an error**. The response carries
`ready: false` and every reason at once, so a customer sees all of them rather than one per
attempt. The set is closed:

| Code                     | Meaning                                                                     |
| ------------------------ | --------------------------------------------------------------------------- |
| `CART_EMPTY`             | The customer has nothing in the cart.                                       |
| `PRODUCT_UNAVAILABLE`    | A line's product is no longer published.                                   |
| `QUANTITY_UNSUPPORTED`   | A line's quantity is outside the supported range.                           |
| `INSUFFICIENT_STOCK`     | A line asks for more than the warehouse can currently fulfil.              |
| `DESTINATION_NOT_SUPPORTED` | The destination is not approved for checkout in this environment.         |
| `SHIPPING_NOT_APPROVED`  | The destination is approved but no approved shipping rule covers it.        |
| `TAX_RULE_MISSING`       | No tax rule applies to a line's classification in the destination's jurisdiction. |
| `TAX_PRICING_MODE_MIXED` | The rules mix tax-inclusive and tax-exclusive treatment, so one subtotal would be ambiguous. |
| `CURRENCY_NOT_SETTLED`   | A line's price is not in the settlement currency, and no conversion is implemented. |

A blocker that belongs to one line carries that line's `lineId` and `sku`; a blocker that belongs to
the quote as a whole does not.

**The fingerprint.** A SHA-256 digest over the quote's material content. It changes when any
material amount, line, or destination changes, and it does not change otherwise. A later step
compares the fingerprint it holds against a recomputed one, so a stale price is detected rather than
silently applied.

## The cart bundle line

### `POST /api/v1/cart/bundle-items`

Adds a bundle to the cart as one sellable line.

**Authorization.** The `CUSTOMER` role.

**Request.**

```json
{ "bundleId": "7d8e...", "quantity": 1 }
```

**Response `201`.** The cart, whose line reports `targetKind: "BUNDLE"`, the `bundleId`, a `null`
`variantId`, and the bundle's product facts and effective price.

A bundle that is already in the cart has its quantity increased rather than a second line
appearing, exactly as a SKU does.

## The tax administration

Every route below requires the `ADMIN` role, so a customer receives `403 FORBIDDEN`.

### `GET /api/v1/admin/tax/rules`

Lists the configured tax rules of the current environment, in a deterministic order.

**Response `200`.** `{ "rules": [ ... ] }`, where each rule reports its identifier, environment,
jurisdiction, classification, rate in basis points, the inclusive or exclusive treatment, its
effective window, its priority, the administrators who changed it, and its timestamps.

### `POST /api/v1/admin/tax/rules`

Configures a tax rule.

**Request.**

```json
{
  "jurisdiction": "EG",
  "classification": "STANDARD",
  "rateBasisPoints": 1400,
  "taxInclusive": false,
  "effectiveFrom": "2026-01-01T00:00:00.000Z",
  "effectiveTo": null,
  "priority": 0
}
```

**Response `201`.** The persisted rule.

**Errors.** `400 VALIDATION_ERROR` for a malformed body, including a rate outside zero and one
hundred percent; `409 TAX_RULE_CONFLICT` for a rule that duplicates another for the same
jurisdiction, classification, and start date.

### `DELETE /api/v1/admin/tax/rules/{ruleId}`

Removes a tax rule. `204` on success, `404 TAX_RULE_NOT_FOUND` for an unknown identifier.

### `PUT /api/v1/admin/tax/products/{productId}/classification`

Sets the tax classification of a product. `204` on success, `404 PRODUCT_NOT_FOUND` for a product
that does not exist.

### `DELETE /api/v1/admin/tax/products/{productId}/classification`

Clears the classification, so the product returns to the `STANDARD` classification. `204` on success.

## The checkout destination administration

Every route below requires the `ADMIN` role.

### `GET /api/v1/admin/checkout/destinations`

Lists the approved destinations of the current environment. `200` with
`{ "destinations": [ ... ] }`.

### `PUT /api/v1/admin/checkout/destinations/{countryCode}`

Approves or changes a destination. It is an **idempotent upsert**: the first call creates the
destination and later calls replace its configuration.

**Request.**

```json
{
  "enabled": true,
  "taxJurisdiction": "EG",
  "shippingApproved": true,
  "label": "Egypt"
}
```

**Response `200`.** The persisted destination.

## The error catalogue

The milestone adds three codes to the closed set of application error codes:

| Code                          | Status | Meaning                                                        |
| ----------------------------- | ------ | -------------------------------------------------------------- |
| `TAX_RULE_NOT_FOUND`          | 404    | No tax rule with that identifier.                              |
| `CHECKOUT_DESTINATION_NOT_FOUND` | 404 | No checkout destination with that identifier.                |
| `TAX_RULE_CONFLICT`           | 409    | The rule duplicates an existing one.                           |

Every other failure uses the existing envelope: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`,
`403 FORBIDDEN`, `404`, `409`, `429 RATE_LIMITED`, `500`, and `503`.

## The published contracts

The milestone publishes three contracts, each exported from the owning capability's module index, so
another capability depends on the contract and never on the implementation.

| Contract                                | Owner     | Purpose                                                                  |
| --------------------------------------- | --------- | ------------------------------------------------------------------------ |
| `CART_READER` / `CartReader`            | Cart      | Reads a customer's cart: the lines, the quantities, and the two prices.   |
| `INVENTORY_AVAILABILITY` / `InventoryAvailability` | Inventory | Reads what can be reserved now, for a SKU or a bundle.        |
| `TAX_ASSESSOR` / `TaxAssessor`          | Tax       | Assesses the tax on priced lines, and resolves a product's classification. |
| `CheckoutQuoter` / `CheckoutQuote`      | Checkout  | The quote the Orders capability consumes when it creates an order.       |

**Why availability is a contract and not a table read.** Availability is not a column. It is
`on_hand - reserved` after the lapsed reservations have been released, and for a DYNAMIC bundle it
is derived from the component composition. Both are the Inventory capability's rules, so the
Checkout capability asks for availability rather than reading the inventory rows and re-implementing
the rules.

## Independent remediation contract addendum — 2026-10-21

See [the remediation design](../../../docs/audits/m06-m10-remediation-design.md) for the authenticated pre-order conversion, exact amount/currency checks, full/partial order refund projection, AMOUNT_UNSUPPORTED blocker, 200-character idempotency bound and corrected local raw-body/metadata signing protocol. Existing operation identities remain stable; the new conversion operation is explicitly inventoried. Production provider/tax activation remains blocked.
