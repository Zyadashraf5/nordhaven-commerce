# OpenAPI Contract Verification: Milestone 03

## Source of Truth and Derived Artifact

Controller and DTO decorators are the source of truth. `scripts/openapi-generate.mjs` builds the
application from the same factory used at runtime and writes `openapi/openapi.json`. The committed
document MUST NOT be edited by hand; `scripts/openapi-check.mjs` regenerates it into a temporary file,
validates it structurally with `SwaggerParser`, validates observed live responses with
`openapi-response-validator`, and fails on any drift.

## Deterministic Post-Processing

`createOpenApiDocument` post-processes the decorator-derived document so that the committed artifact and
the asserted contract cannot disagree:

- The operation inventory is asserted against the reviewed `OPERATIONS` table (exact route, method,
  `operationId`, anonymous/protected classification, and the full documented status set).
- Object schemas that declare `properties` are closed with `additionalProperties: false`.
- The shared `ErrorResponse` component backs every error status.
- Every response gains `X-Correlation-ID` and `Cache-Control: no-store`; `429` and `503` also gain
  `Retry-After`.

## Allowed Operation Inventory

Twenty-four operations are allowed after this milestone: the sixteen accepted from Milestone 02 plus the
eight customer operations listed in [customer-api.md](./customer-api.md). The full set is asserted by
`scripts/openapi-check.mjs`, which fails if any operation is added, removed, or renamed.

| Group | Count | Operations |
| --- | --- | --- |
| Health | 2 | `GET /api/v1/health/live`, `GET /api/v1/health/ready` |
| Identity (accepted) | 14 | The Milestone 02 surface, unchanged |
| Customer (this milestone) | 8 | `GET`/`PATCH profile`; `GET`/`POST addresses`; `GET`/`PATCH`/`DELETE addresses/{addressId}`; `PUT addresses/{addressId}/default` |

The `OperationContract.method` union in `apps/api/src/platform/openapi/openapi.ts` is extended with `put`
and `patch` so the inventory can assert the new methods; this is a contract-tooling change only.

## Excluded Domains

The excluded-domain scan keeps rejecting still-unapproved commerce terms: `product`, `inventory`,
`bundle`, `cart`, `checkout`, `order`, `payment`, `preorder`, `shipping`, `review`, `wishlist`, and
`notification`. The `customer` term is deliberately removed from the excluded list because the
capability is now approved, exactly as `auth` was removed for Milestone 02. The scan still fails if a
future operation or schema name introduces an unapproved commerce domain.

## Authorization Metadata

`assertAuthorizationMetadata` treats an operation with no `security` block as protected, so a new route
that forgets to declare protection fails the gate. It requires the bearer `session` scheme in
`components.securitySchemes` and verifies that the only anonymous operations are the accepted health and
unauthenticated identity entry points. All eight customer operations therefore must declare the session
scheme; none is added to the public set.

## Automated Gate

`pnpm openapi:check` must:

1. Generate and structurally validate the document.
2. Assert the exact operation inventory, the authorization metadata, and the excluded-domain rules.
3. Detect drift against the committed `openapi/openapi.json`.
4. Against a live application built with database initialization disabled, assert the accepted platform
   behavior that frames the new surface: liveness `200`, readiness `200`, readiness `503` on probe
   failure without leaking the injected canary, unknown-route `404`, an unready business route answering
   `503` before `401`, an authenticated route answering `401` without a credential, a malformed body
   answering `400`, and the register rate limit answering `429` with a numeric `Retry-After`.

The gate remains database-free: customer success responses are validated against the committed document
by the E2E contract spec, which runs against the isolated test database.

## Observed-Response Matrix

The E2E suite validates these observed responses against the committed document using the real
application and the isolated `nordhaven_e2e` database:

| Observation | Route | Status | Asserted |
| --- | --- | --- | --- |
| Profile read for a real session | `GET /customers/me/profile` | `200` | Body matches `CustomerProfileResponse`; `no-store`; correlation header |
| Profile update | `PATCH /customers/me/profile` | `200` | Body matches `CustomerProfileResponse` |
| Address list | `GET /customers/me/addresses` | `200` | Body matches `CustomerAddressesResponse` |
| Address create | `POST /customers/me/addresses` | `201` | Body matches `CustomerAddressResponse` |
| Owned address read | `GET /customers/me/addresses/{id}` | `200` | Body matches `CustomerAddressResponse` |
| Unknown/foreign address | `GET/PATCH/DELETE .../{id}`, `PUT .../{id}/default` | `404` | `ADDRESS_NOT_FOUND` envelope |
| Malformed identifier | `DELETE .../not-a-uuid` | `400` | `VALIDATION_ERROR` envelope |
| Invalid body | `POST /customers/me/addresses` | `400` | `VALIDATION_ERROR` envelope; the submitted value is absent |
| Anonymous access | any customer route | `401` | `UNAUTHENTICATED` envelope |
| Administrator access | any customer route | `403` | `FORBIDDEN` envelope; denial audited |
| Rate limit exceeded | `PATCH /customers/me/profile` | `429` | `RATE_LIMITED` envelope with numeric `Retry-After` |

## End-to-End Contract Spec

`test/e2e/customer.e2e.spec.ts` performs the observed-response matrix above over HTTP and asserts the
response metadata (`X-Correlation-ID`, `Cache-Control: no-store`) on each response. The Milestone 02
contract spec continues to pass unchanged.

## Not Claimed

- Hosted continuous integration remains **deferred and NOT VERIFIED**; the gates are proven locally on
  the accepted host only.
- No production topology, capacity, or availability is claimed (HC-DEC-016).
- Country-specific address validation and any supported-country restriction are **not** claimed
  (HC-DEC-005).
- No account deletion, export, or retention behavior is claimed (HC-DEC-003).
