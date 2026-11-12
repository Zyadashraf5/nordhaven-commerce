# API Contract: Milestone 09 - Orders and Pre-orders (Implemented)

**Date**: 2026-10-21

**Status**: **Implemented and verified.** Every route below is served by the running application and
is asserted against the committed OpenAPI document by the end-to-end suite.

**Version**: the published contract is `0.9.0`.

## The customer order routes

Every route below requires the `CUSTOMER` role. An anonymous caller receives
`401 UNAUTHENTICATED`; an administrator receives `403 FORBIDDEN`.

### `POST /api/v1/orders`

Places an order from the current cart.

**Headers.**

```
Idempotency-Key: <a stable business key, at least eight characters>
```

The key is **scoped to the customer**. A repeated or a concurrent request with the same key returns
the order the first one created and holds the stock **once**.

**Request.**

```json
{ "destinationCountryCode": "EG", "expectedFingerprint": "9c1d..." }
```

The schema is **strict**, so an unexpected field is refused with `400 VALIDATION_ERROR`. In
particular a request that carries a price, a tax amount, or a total is rejected before the
calculation runs, because the platform never accepts an amount from a client.

`expectedFingerprint` is the fingerprint of the quote the customer confirmed. It is a **token** that
says "this is what I saw", not an amount. When it differs from the recomputed quote, the price moved
and the order is refused with `409 ORDER_QUOTE_CHANGED` so the customer confirms the new figure. A
`null` fingerprint means the customer did not confirm a specific quote, and the order uses the
recomputed one.

**Response `201`.**

```json
{
  "id": "8f2c...",
  "status": "PENDING_PAYMENT",
  "currency": "EGP",
  "subtotalMinor": 259800,
  "taxTotalMinor": 36372,
  "totalMinor": 296172,
  "destinationCountryCode": "EG",
  "taxJurisdiction": "EG",
  "quoteFingerprint": "9c1d...",
  "reservationId": "3a1b...",
  "statusReason": null,
  "expiresAt": "2026-10-21T10:15:00.000Z",
  "createdAt": "2026-10-21T10:00:00.000Z",
  "updatedAt": "2026-10-21T10:00:00.000Z",
  "paidAt": null,
  "cancelledAt": null,
  "lines": [
    {
      "id": "7d8e...",
      "variantId": "3a1b...",
      "bundleId": null,
      "sku": "SKU-Oak-Dining-Table",
      "productId": "5c9d...",
      "productName": "Oak Dining Table",
      "quantity": 2,
      "unitPriceMinor": 129900,
      "unitCurrency": "EGP",
      "discountBasisPoints": 0,
      "taxRateBasisPoints": 1400,
      "taxInclusive": false,
      "taxClassification": "STANDARD",
      "netMinor": 259800,
      "taxMinor": 36372,
      "totalMinor": 296172,
      "composition": []
    }
  ]
}
```

**Every amount is an exact integer count of minor units in one explicit currency**, and
`subtotalMinor + taxTotalMinor` equals `totalMinor` exactly.

**The snapshot is immutable.** The order stores the price, the discount, the tax rate, the tax
amount, the currency, and the bundle composition, so a later catalog change cannot alter the
purchase.

**The ordered cart lines are removed** once the order exists, through the Cart capability's own
published contract. A failure to remove a line leaves the cart unchanged, which is harmless: the
order's reservation already holds the stock.

**Errors.**

| Code                   | Status | Meaning                                                            |
| ---------------------- | ------ | ------------------------------------------------------------------ |
| `VALIDATION_ERROR`     | 400    | A malformed body, or a missing or short `Idempotency-Key`.         |
| `ORDER_NOT_READY`      | 409    | The cart cannot be checked out; the reasons are named in `details`. |
| `ORDER_QUOTE_CHANGED`  | 409    | The price moved after the confirmation.                            |
| `INVENTORY_CONFLICT`   | 409    | The stock could not be held.                                        |

### `GET /api/v1/orders`

Lists the customer's orders, newest first. Every order reports its own immutable snapshot.

### `GET /api/v1/orders/{orderId}`

Reads one owned order. An order that belongs to another customer is answered with
`404 ORDER_NOT_FOUND`, exactly like one that never existed, so the API never discloses whether an
order exists.

### `DELETE /api/v1/orders/{orderId}`

Cancels an order that has not been paid.

- The held stock is released.
- The cancellation is **idempotent** for an order that is already cancelled or expired.
- It is **refused** with `409 ORDER_NOT_CANCELLABLE` for an order that has already been paid,
  because a paid order needs the refund workflow of Milestone 10. The refusal is recorded as an
  event.

**Response `200`.** The cancelled order.

## The customer pre-order routes

### `POST /api/v1/orders/pre-orders`

Records a pre-order for what the customer intends to buy.

**Request.** `{ "destinationCountryCode": "EG" }`

**Response `201`.** The pre-order, in `AWAITING_STOCK`.

A pre-order records what was intended and what it would cost. **Nothing is charged, no stock is
held, and the customer is not asked to pay** while it awaits stock.

### `GET /api/v1/orders/pre-orders`

Lists the customer's pre-orders, newest first.

### `GET /api/v1/orders/pre-orders/{preOrderId}`

Reads one owned pre-order. The read also evaluates whether the stock has become available, so a
pre-order that is ready says so without the customer having to ask twice. The evaluation is a
**read**, so a pre-order whose stock is still unavailable simply stays `AWAITING_STOCK`.

### `DELETE /api/v1/orders/pre-orders/{preOrderId}`

Cancels a pre-order. The cancellation is idempotent.

## The administrative order routes

Every route below requires the `ADMIN` role. The administrative surface **reads** orders and never
changes one, because every state change is a customer action or a payment outcome, and a hand-edited
order would break the audit trail the order's own event log provides.

| Method | Path                                  | Purpose                          |
| ------ | ------------------------------------- | -------------------------------- |
| `GET`  | `/api/v1/admin/orders`                 | List every order, newest first   |
| `GET`  | `/api/v1/admin/orders/pre-orders`      | List every pre-order, newest first |
| `GET`  | `/api/v1/admin/orders/{orderId}`       | Read one order of any customer   |

## The order states

| State                    | Meaning                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `PENDING_PAYMENT`        | The order exists, its stock is held, and the customer has not paid.                      |
| `PAID`                   | The payment was recorded and the stock was confirmed as allocated.                        |
| `PAID_PENDING_ALLOCATION`| The payment arrived but the reservation was already gone, so the stock was **not** allocated. |
| `PAYMENT_FAILED`         | The payment attempt failed and the hold was released.                                     |
| `CANCELLED`              | The customer or an administrator cancelled the order.                                     |
| `EXPIRED`                | The payment window lapsed before the customer paid.                                       |
| `FULFILLED`              | The order was fulfilled.                                                                   |

The pre-order's states are `AWAITING_STOCK`, `STOCK_RESERVED`, `AWAITING_PAYMENT`, `CONVERTED`,
`CANCELLED`, and `EXPIRED`.

## The error catalogue

The milestone adds four codes to the closed set of application error codes:

| Code                      | Status | Meaning                                                      |
| ------------------------- | ------ | ------------------------------------------------------------ |
| `ORDER_NOT_FOUND`         | 404    | No such order, or it belongs to another customer.            |
| `PRE_ORDER_NOT_FOUND`     | 404    | No such pre-order, or it belongs to another customer.         |
| `ORDER_NOT_READY`         | 409    | The cart cannot be checked out; the reasons are named.        |
| `ORDER_QUOTE_CHANGED`     | 409    | The price moved and must be confirmed again.                  |
| `ORDER_NOT_CANCELLABLE`   | 409    | The order can no longer be cancelled.                         |

## The published contracts

| Contract                                     | Owner   | Purpose                                                                             |
| -------------------------------------------- | ------- | ----------------------------------------------------------------------------------- |
| `CHECKOUT_QUOTER` / `CheckoutQuoter`         | Checkout| The quote the Orders capability creates an order from.                                |
| `CART_READER` / `CartReader`                 | Cart    | Reads a customer's cart.                                                              |
| `CART_WRITER` / `CartWriter`                 | Cart    | Removes the cart lines an order covers.                                              |
| `INVENTORY_RESERVATION` / `InventoryReservation` | Inventory | Holds, confirms, and releases stock.                                              |
| `INVENTORY_BUNDLES` / `InventoryBundles`     | Inventory | A bundle's resolved composition.                                                  |
| `ORDER_LEDGER` / `OrderLedger`               | Orders  | The Milestone 10 Payments capability records a verified payment through it.           |

**The dependency direction is one way.** The Payments capability depends on the Orders contract,
and the Orders capability does not depend on the Payments capability, so the two do not form a
cycle.

## Independent remediation contract addendum — 2026-10-21

See [the remediation design](../../../docs/audits/m06-m10-remediation-design.md) for the authenticated pre-order conversion, exact amount/currency checks, full/partial order refund projection, AMOUNT_UNSUPPORTED blocker, 200-character idempotency bound and corrected local raw-body/metadata signing protocol. Existing operation identities remain stable; the new conversion operation is explicitly inventoried. Production provider/tax activation remains blocked.
