# Contract: Milestone 05 - Inventory and Bundles API

**Feature**: [spec.md](../spec.md) | **Data model**: [data-model.md](../data-model.md) | **Date**: 2026-10-20

This document is the reviewed public contract of the Inventory and Bundles capability. The committed
`openapi/openapi.json` is generated from the code and asserted against this contract by
`pnpm openapi:check` and by the end-to-end suite. A route, status, identifier, or field that is not
recorded here must not exist.

## Authorization model

- **`ADMIN`** — every inventory, bundle, and reservation route requires an administrator session. There
  is **no** anonymous or customer route in this milestone: availability and reservation are operational
  primitives because HC-DEC-004 (checkout/reservation timing) remains Open (research R9).
- The required role is read from the server-resolved principal; no client value participates.
- Every grant and denial is recorded through the platform authorization audit boundary, which the
  Identity module persists as a security event.

## Shared response metadata

Every response carries `X-Correlation-ID` (a UUID) and `Cache-Control: no-store`. Rate-limited responses
add `Retry-After`. These are applied centrally by the OpenAPI post-processing and the HTTP layer.

## Error codes

| Code | Status | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | The request body, path, or query failed the boundary schema. |
| `UNAUTHENTICATED` | 401 | No usable session credential was presented. |
| `FORBIDDEN` | 403 | The resolved principal lacks the `ADMIN` role. |
| `INVENTORY_NOT_FOUND` | 404 | No inventory item matches the identifier or SKU. |
| `RESERVATION_NOT_FOUND` | 404 | No reservation matches the identifier. |
| `BUNDLE_NOT_FOUND` | 404 | No bundle matches the identifier. |
| `INVENTORY_CONFLICT` | 409 | The change conflicts with existing inventory state (a duplicate item, a reservation that would oversell, a terminal reservation transitioned again, or a quantity below what is reserved). |
| `RATE_LIMITED` | 429 | A declared rate-limit policy was exceeded. |

`INVENTORY_CONFLICT` is used uniformly for a duplicate inventory item for one SKU, an unavailable
reservation (insufficient available stock, for any SKU or bundle component), a transition of a terminal
reservation, and an on-hand change that would drop on-hand below the reserved quantity. It never contains
database text, a table name, or a constraint name. This milestone adds **only** these four codes
(`INVENTORY_NOT_FOUND`, `RESERVATION_NOT_FOUND`, `BUNDLE_NOT_FOUND` 404; `INVENTORY_CONFLICT` 409) to the
closed `AppErrorCode` union.

## Rate-limit policies

| Policy | Limit | Window | Key dimension | Applies to |
| --- | --- | --- | --- | --- |
| `inventory.read` | 300 | 300 s | `client` | Every administrative inventory, bundle, and reservation read. |
| `inventory.write` | 120 | 900 s | `client` | Every stock change, bundle change, and reservation transition. |

The key dimension is `client` because the global rate-limit guard runs **before** session
authentication, so the principal is not yet resolved. The state is process-local and resets on restart,
exactly as recorded for Milestone 02.

## Inventory routes (`@Roles('ADMIN')`)

| Method | Path | Purpose | Statuses |
| --- | --- | --- | --- |
| `GET` | `/api/v1/admin/inventory` | List inventory (optionally filtered by `productId`) | 200, 400, 401, 403, 429 |
| `GET` | `/api/v1/admin/inventory/{inventoryId}` | Read one inventory item | 200, 400, 401, 403, 404, 429 |
| `GET` | `/api/v1/admin/inventory/variants/{variantId}` | Read the inventory item for one SKU | 200, 400, 401, 403, 404, 429 |
| `PUT` | `/api/v1/admin/inventory/variants/{variantId}` | Set the on-hand quantity for one SKU (idempotent) | 200, 400, 401, 403, 404, 409, 429 |
| `GET` | `/api/v1/admin/inventory/{inventoryId}/movements` | List the stock-movement history | 200, 400, 401, 403, 404, 429 |

### `PUT` inventory body

```json
{ "onHand": 25, "reason": "Goods received" }
```

`onHand` is a non-negative integer. `reason` is an optional bounded free-text label recorded on the
resulting `ADJUSTMENT` movement. Setting `onHand` below the current reserved quantity is `409
INVENTORY_CONFLICT`.

### Inventory projection

```json
{
  "id": "uuid",
  "variantId": "uuid",
  "sku": "OAK-TABLE-01",
  "productId": "uuid",
  "productName": "Oak Dining Table",
  "onHand": 25,
  "reserved": 4,
  "available": 21,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

`available` is always `onHand - reserved` and is never negative.

### Stock-movement projection

```json
{
  "id": "uuid",
  "reason": "RESERVATION_CREATED",
  "onHandDelta": 0,
  "note": "Goods received",
  "reservedDelta": 4,
  "onHandAfter": 25,
  "reservedAfter": 4,
  "reservationId": "uuid",
  "createdAt": "ISO-8601"
}
```

`note` is the optional label recorded with an `ADJUSTMENT` and is `null` for every other reason.

## Bundle routes (`@Roles('ADMIN')`)

| Method | Path | Purpose | Statuses |
| --- | --- | --- | --- |
| `POST` | `/api/v1/admin/bundles` | Create a bundle with its components (`201`) | 201, 400, 401, 403, 409, 429 |
| `GET` | `/api/v1/admin/bundles` | List bundles | 200, 400, 401, 403, 429 |
| `GET` | `/api/v1/admin/bundles/{bundleId}` | Read one bundle with its components and availability | 200, 400, 401, 403, 404, 429 |
| `PATCH` | `/api/v1/admin/bundles/{bundleId}` | Update the bundle metadata and replace its components | 200, 400, 401, 403, 404, 409, 429 |
| `DELETE` | `/api/v1/admin/bundles/{bundleId}` | Delete a bundle (`204`) | 204, 400, 401, 403, 404, 429 |

### Bundle request body

```json
{
  "productId": "uuid",
  "kind": "FIXED",
  "name": "Table and chairs set",
  "components": [
    { "variantId": "uuid", "quantity": 2, "position": 0 },
    { "variantId": "uuid", "quantity": 1, "position": 1 }
  ]
}
```

For a `DYNAMIC` bundle each component carries `minQuantity` and `maxQuantity` instead of `quantity`. A
`FIXED` component with no positive `quantity`, a `DYNAMIC` component with `maxQuantity < minQuantity`, a
component that references a nonexistent SKU, a component that references the bundle's own product, or a
duplicate component is `400 VALIDATION_ERROR`; a bundle for a product that already has one is `409
INVENTORY_CONFLICT`.

### Bundle projection

```json
{
  "id": "uuid",
  "productId": "uuid",
  "kind": "FIXED",
  "name": "Table and chairs set",
  "description": null,
  "components": [
    { "id": "uuid", "variantId": "uuid", "sku": "OAK-CHAIR-01", "quantity": 2, "minQuantity": null, "maxQuantity": null, "position": 0 }
  ],
  "available": 7,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

FIXED `available` is finished onHand minus reserved. DYNAMIC capacity is the minimum of floor(componentAvailable / minQuantity). FIXED goods start empty and require tracked assembly.

## Reservation routes (`@Roles('ADMIN')`)

| Method | Path | Purpose | Statuses |
| --- | --- | --- | --- |
| `POST` | `/api/v1/admin/reservations` | Create a reservation for SKUs or a bundle (`201`) | 201, 400, 401, 403, 404, 409, 429 |
| `GET` | `/api/v1/admin/reservations` | List reservations, optionally filtered by `status` | 200, 400, 401, 403, 429 |
| `GET` | `/api/v1/admin/reservations/{reservationId}` | Read one reservation | 200, 400, 401, 403, 404, 429 |
| `PATCH` | `/api/v1/admin/reservations/{reservationId}` | Extend the expiry of an active reservation | 200, 400, 401, 403, 404, 409, 429 |
| `POST` | `/api/v1/admin/reservations/{reservationId}/confirmation` | Confirm and deduct stock | 200, 400, 401, 403, 404, 409, 429 |
| `POST` | `/api/v1/admin/reservations/{reservationId}/release` | Release the hold | 200, 400, 401, 403, 404, 409, 429 |

### Reservation create body

```json
{
  "idempotencyKey": "checkout-42c1",
  "expiresInSeconds": 900,
  "lines": [{ "sku": "OAK-TABLE-01", "quantity": 2 }]
}
```

or, for a bundle:

```json
{
  "idempotencyKey": "checkout-42c2",
  "expiresInSeconds": 900,
  "bundleId": "uuid",
  "quantity": 3
}
```

Exactly one of `lines` or (`bundleId` + `quantity`) is present. A repeated `idempotencyKey` returns the
original reservation and holds no additional stock. An insufficient available quantity for any SKU or
component is `409 INVENTORY_CONFLICT` and leaves **no** partial hold (all-or-nothing).

### Reservation projection

```json
{
  "id": "uuid",
  "status": "ACTIVE",
  "idempotencyKey": "checkout-42c1",
  "expiresAt": "ISO-8601",
  "lines": [{ "id": "uuid", "sku": "OAK-TABLE-01", "quantity": 2 }],
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

`status` is one of `ACTIVE`, `CONFIRMED`, `RELEASED`, `EXPIRED`. Confirming or releasing a terminal
reservation is an idempotent no-op that returns the same state; extending a terminal reservation is `409
INVENTORY_CONFLICT`. Confirming an already-expired reservation is refused rather than silently
succeeding.


## Approved fixed-bundle operations (HC-DEC-017)

ADMIN-only POST /api/v1/admin/bundles/{bundleId}/assemble and /disassemble accept { quantity: positive integer <= 10000, note?: string }. Success is HTTP 200 with BundleResponse. Both preserve authentication, MFA, rate limiting and error contracts. Insufficient component/finished stock, reserved disassembly, DYNAMIC operation and stocked composition changes return 409. Invalid quantity returns 400; unknown bundle returns 404. Reservations on FIXED bundles hold finished inventory only. Quantity-only DYNAMIC reservations return 409; explicit SKU selection uses existing reservation lines. Bundle deletion with inventory history returns 409. OpenAPI is the executable contract.
