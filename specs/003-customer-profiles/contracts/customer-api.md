# Customer API Contract: Milestone 03

## Authority and Derived Artifact

Controller and DTO decorators are the executable source of truth. The committed `openapi/openapi.json`
is generated deterministically from the same application factory used by runtime and E2E tests and MUST
NOT be edited by hand. This document is the reviewed planning contract: it fixes the operation
inventory, the authentication scheme, the request and response shapes, the rate-limit declarations, and
the error codes that the generated document and the observed HTTP behavior must match.

## Authentication Scheme

Every route in this contract requires a usable **customer** session using the accepted Milestone 02
scheme:

| Property | Value |
| --- | --- |
| Type | HTTP bearer |
| Scheme name | `session` |
| Credential | Opaque 256-bit session credential, base64url, issued by the accepted sign-in flows |
| Header | `Authorization: Bearer <credential>` |
| Required role | `CUSTOMER` |
| Scope | The authenticated principal only; no route accepts a customer identifier |

An anonymous caller receives `401 UNAUTHENTICATED`. An authenticated administrator receives
`403 FORBIDDEN`, which is recorded as an authorization decision through the accepted audit port.

## Operation Inventory

The milestone adds eight operations. All are session-protected and `CUSTOMER`-scoped. The prefix is
`/api/v1`.

| # | Method and path | Access | Success | operationId | Summary |
| --- | --- | --- | --- | --- | --- |
| 1 | `GET /customers/me/profile` | Session + `CUSTOMER` | `200` | `getCustomerProfile` | Read the principal's own profile |
| 2 | `PATCH /customers/me/profile` | Session + `CUSTOMER` | `200` | `updateCustomerProfile` | Update the principal's own profile |
| 3 | `GET /customers/me/addresses` | Session + `CUSTOMER` | `200` | `listCustomerAddresses` | List the principal's own addresses |
| 4 | `POST /customers/me/addresses` | Session + `CUSTOMER` | `201` | `createCustomerAddress` | Save a new address |
| 5 | `GET /customers/me/addresses/{addressId}` | Session + `CUSTOMER` | `200` | `getCustomerAddress` | Read one owned address |
| 6 | `PATCH /customers/me/addresses/{addressId}` | Session + `CUSTOMER` | `200` | `updateCustomerAddress` | Update one owned address |
| 7 | `DELETE /customers/me/addresses/{addressId}` | Session + `CUSTOMER` | `204` | `deleteCustomerAddress` | Remove one owned address |
| 8 | `PUT /customers/me/addresses/{addressId}/default` | Session + `CUSTOMER` | `200` | `setDefaultCustomerAddress` | Select one owned address as the default |

Documented failure statuses:

| Operation | Statuses |
| --- | --- |
| 1 Profile read | `200`, `401`, `403`, `429`, `500`, `503` |
| 2 Profile update | `200`, `400`, `401`, `403`, `429`, `500`, `503` |
| 3 Address list | `200`, `401`, `403`, `429`, `500`, `503` |
| 4 Address create | `201`, `400`, `401`, `403`, `429`, `500`, `503` |
| 5 Address read | `200`, `400`, `401`, `403`, `404`, `429`, `500`, `503` |
| 6 Address update | `200`, `400`, `401`, `403`, `404`, `429`, `500`, `503` |
| 7 Address delete | `204`, `400`, `401`, `403`, `404`, `429`, `500`, `503` |
| 8 Default selection | `200`, `400`, `401`, `403`, `404`, `429`, `500`, `503` |

`X-Correlation-ID` and `Cache-Control: no-store` are present on every response; `Retry-After` is present
on `429` and `503`.

## Rate-Limit Declarations

| Policy | Applies to | Limit | Window | Key dimension |
| --- | --- | --- | --- | --- |
| `customers.read` | Operations 1, 3, 5 | 300 | 300 s | `client` |
| `customers.write` | Operations 2, 4, 6, 7, 8 | 60 | 900 s | `client` |

The `client` dimension is used because the accepted limiter runs before session authentication and the
principal is not yet resolved. Counters are process-local and reset on restart, as recorded for
Milestone 02.

## Request and Response Shapes

### `GET /api/v1/customers/me/profile`

No request body. The profile row is created on first access if it does not exist.

Response `200 CustomerProfileResponse`

| Field | Type | Notes |
| --- | --- | --- |
| `displayName` | string \| null | `null` when not provided |
| `phone` | string \| null | `null` when not provided |
| `defaultAddressId` | string (uuid) \| null | The selected default address, or `null` |
| `createdAt` | string (date-time) | |
| `updatedAt` | string (date-time) | |

### `PATCH /api/v1/customers/me/profile`

Request `UpdateCustomerProfileRequest` — a strict object requiring at least one field.

| Field | Type | Rules |
| --- | --- | --- |
| `displayName` | string \| null, optional | Trimmed; 1 to 120 characters; `null` or an empty/whitespace-only string clears it |
| `phone` | string \| null, optional | Trimmed; 1 to 32 characters; `null` or an empty/whitespace-only string clears it |

Response `200 CustomerProfileResponse` with the persisted state.

Failures: `400 VALIDATION_ERROR` (unknown field, no field supplied, or a value that violates its rule).

### `GET /api/v1/customers/me/addresses`

No request body.

Response `200 CustomerAddressesResponse`: `{ "addresses": CustomerAddressResponse[] }`, ordered by
`createdAt` ascending and then by `id` ascending. The array is empty for a customer with no addresses.

### `POST /api/v1/customers/me/addresses`

Request `CreateCustomerAddressRequest`

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `recipientName` | string | yes | Trimmed; 1 to 120 characters; no control characters |
| `line1` | string | yes | Trimmed; 1 to 200 characters; no control characters |
| `line2` | string \| null | no | Trimmed; 1 to 200 characters when present |
| `city` | string | yes | Trimmed; 1 to 120 characters; no control characters |
| `region` | string \| null | no | Trimmed; 1 to 120 characters when present |
| `postalCode` | string \| null | no | Trimmed; 1 to 32 characters when present |
| `countryCode` | string | yes | Exactly two ASCII letters; stored upper case; the supported-country set is not restricted (HC-DEC-005) |
| `phone` | string \| null | no | Trimmed; 1 to 32 characters when present |

Response `201 CustomerAddressResponse`.

When the customer has no default address yet, the created address becomes the default
(HC-ASM-M03-001).

Failures: `400 VALIDATION_ERROR`.

### `GET /api/v1/customers/me/addresses/{addressId}`

Path parameter `addressId`: a UUID.

Response `200 CustomerAddressResponse`.

Failures: `400 VALIDATION_ERROR` (not a UUID), `404 ADDRESS_NOT_FOUND` (unknown, already deleted, or not
owned by the principal — identical in all three cases).

### `PATCH /api/v1/customers/me/addresses/{addressId}`

Path parameter `addressId`: a UUID.

Request `UpdateCustomerAddressRequest` — a strict object requiring at least one field. Every supplyable
field keeps the rule from the create contract, except that a required field
(`recipientName`, `line1`, `city`, `countryCode`) may not be `null` when supplied; an optional field may
be cleared with `null` or an empty/whitespace-only value. An omitted field is left unchanged.

Response `200 CustomerAddressResponse` with the persisted state.

Failures: `400 VALIDATION_ERROR`, `404 ADDRESS_NOT_FOUND`.

### `DELETE /api/v1/customers/me/addresses/{addressId}`

Path parameter `addressId`: a UUID.

Response `204` with an empty body. Deleting the address that is currently the default clears the
selection; no other address is promoted (HC-ASM-M03-001).

Failures: `400 VALIDATION_ERROR`, `404 ADDRESS_NOT_FOUND`.

### `PUT /api/v1/customers/me/addresses/{addressId}/default`

Path parameter `addressId`: a UUID.

No request body. Idempotent: selecting the address that is already the default succeeds and returns the
same representation. Exactly one address is the default afterwards, including under concurrent
selection.

Response `200 CustomerAddressResponse` for the selected address with `isDefault: true`.

Failures: `400 VALIDATION_ERROR`, `404 ADDRESS_NOT_FOUND`.

### `CustomerAddressResponse`

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string (uuid) | |
| `recipientName` | string | |
| `line1` | string | |
| `line2` | string \| null | |
| `city` | string | |
| `region` | string \| null | |
| `postalCode` | string \| null | |
| `countryCode` | string | Two upper-case letters |
| `phone` | string \| null | |
| `isDefault` | boolean | Derived from the profile's default reference |
| `createdAt` | string (date-time) | |
| `updatedAt` | string (date-time) | |

The response deliberately omits the owning identity identifier and every Identity-owned attribute.

## Error Codes

| Code | Status | Raised by |
| --- | --- | --- |
| `UNAUTHENTICATED` | `401` | Accepted platform session guard |
| `FORBIDDEN` | `403` | Accepted platform role guard |
| `VALIDATION_ERROR` | `400` | Accepted boundary validation pipe |
| `ADDRESS_NOT_FOUND` | `404` | **Added by this milestone** — one owned-address lookup failed |
| `RATE_LIMITED` | `429` | Accepted platform rate-limit guard |
| `INTERNAL_ERROR` | `500` | Accepted safe exception filter |
| `SERVICE_UNAVAILABLE` | `503` | Accepted platform availability guard |

`ADDRESS_NOT_FOUND` is the only addition to the closed `AppErrorCode` union, and it is deliberately
uniform so it cannot disclose whether an identifier exists or belongs to another customer.

## Response Headers

| Header | Applies to | Value |
| --- | --- | --- |
| `X-Correlation-ID` | Every response | The accepted or generated request correlation UUID |
| `Cache-Control` | Every response | `no-store` |
| `Retry-After` | `429`, `503` | Seconds to wait |

## Deliberate Exclusions

- Account deletion, data export, retention, and compliance workflows are excluded (HC-DEC-003).
- A supported-country list and any country-specific validation are excluded (HC-DEC-005).
- No verification status and no Identity-owned attribute is exposed or duplicated (HC-DEC-002,
  HC-ASM-M03-004).
- No administrator-facing customer-management route is defined.
- Wishlists and every other commerce capability remain excluded.
