# OpenAPI Contract Verification: Milestone 02

## Source of Truth and Derived Artifact

Controller and DTO decorators are the executable source of truth. `createOpenApiDocument` generates
the document from the configured application after the `/api` global prefix and URI version `1` are
applied, then post-processes it deterministically. The generated JSON at `openapi/openapi.json` is a
committed, reviewable derivative and MUST NOT be edited by hand.

Milestone 01 insisted on a hand-authored document because there were only two operations. Milestone 02
raises the surface to sixteen operations with typed request bodies, so generation is derived from the
decorators and the deterministic guarantees are enforced by post-processing instead
(see [research.md](../research.md) Decision 9).

## Deterministic Post-Processing

`createOpenApiDocument` MUST apply all of the following before returning:

1. Assert that the discovered path inventory equals the explicit allowed inventory below.
2. Replace every `4xx` and `5xx` response schema with the shared `ErrorResponse` component.
3. Add the `X-Correlation-ID` header to every response.
4. Set `additionalProperties: false` on every generated schema, including nested objects, so the
   contract rejects unexpected fields.
5. Keep the security scheme `session` (HTTP bearer) and the `Health` and `Authentication` and
   `Administration` tags.

## Allowed Operation Inventory

Exactly these operations are permitted:

```text
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/login/mfa
POST   /api/v1/auth/login/mfa/enrollment
POST   /api/v1/auth/login/mfa/enrollment/confirmation
GET    /api/v1/auth/principal
GET    /api/v1/auth/sessions
DELETE /api/v1/auth/sessions
DELETE /api/v1/auth/sessions/current
DELETE /api/v1/auth/sessions/{sessionId}
POST   /api/v1/auth/password
POST   /api/v1/auth/password-reset/requests
POST   /api/v1/auth/password-reset/confirmations
GET    /api/v1/admin/users
GET    /api/v1/health/live
GET    /api/v1/health/ready
```

The documentation UI and raw-document delivery path are operational presentation routes and are not
listed as API operations.

## Excluded Domains

The excluded-domain scan still rejects `product`, `inventory`, `bundle`, `cart`, `checkout`, `order`,
`payment`, `preorder`, `shipping`, `review`, `wishlist`, `notification`, and `tax` in path names,
operation identifiers, tags, and schema component names.

`authentication`, `administrator`, and `customer` were removed from the exclusion list by the
Milestone 02 Product Owner authorization. Removing them is a deliberate, recorded scope change; the
commerce terms remain enforced, and the repository hygiene check continues to reject commerce module
directories.

## Automated Gate

`pnpm openapi:check` MUST perform all of these steps and MUST NOT require a database:

1. Build the application and generate the document through the shared factory without binding a public
   port and without initializing the database.
2. Serialize keys deterministically into a temporary file.
3. Validate the temporary document as OpenAPI 3.0 with `@apidevtools/swagger-parser`.
4. Compare the canonical temporary document with committed `openapi/openapi.json` byte for byte; any
   drift fails the check and prints the regeneration command.
5. Assert the exact operation inventory above.
6. Scan path names, operation identifiers, tags, and schema names for the excluded domains.
7. Run observed-response checks through Supertest using `openapi-response-validator`, with the identity
   service replaced by deterministic stubs so the gate stays database-free, and validate:
   - health liveness `200`, readiness `200`, and injected readiness failure `503`;
   - a protected identity route without a credential returning `401` matching the shared error
     component;
   - a malformed identity request returning `400` with safe details;
   - registration `201`, sign-in `200` (all three status shapes), and reset request `202` matching
     their declared schemas;
   - an intentionally absent path and an unsupported version returning the safe `404`.
8. Close the application even when a check fails.

## Observed-Response Matrix

| Case | Setup | Request | Expected | Contract assertion |
| --- | --- | --- | --- | --- |
| Live | Initialized process | `GET /api/v1/health/live` | 200 | `LivenessResponse`; `Cache-Control: no-store` |
| Ready | Database probe stubbed to succeed | `GET /api/v1/health/ready` | 200 | `ReadinessResponse` |
| Unready | Database probe stubbed to fail | `GET /api/v1/health/ready` | 503 | `ErrorResponse`; `SERVICE_UNAVAILABLE`; no cause or stack |
| Unauthenticated | Identity service stubbed | `GET /api/v1/auth/principal` | 401 | `ErrorResponse`; `UNAUTHENTICATED` |
| Validation | Identity service stubbed | `POST /api/v1/auth/login` with a malformed body | 400 | `ErrorResponse`; safe detail only |
| Registered | Identity service stubbed | `POST /api/v1/auth/register` | 201 | `RegisterResponse` |
| Authenticated | Identity service stubbed | `POST /api/v1/auth/login` | 200 | `LoginResponse` with `AUTHENTICATED` |
| MFA required | Identity service stubbed | `POST /api/v1/auth/login` | 200 | `LoginResponse` with `MFA_REQUIRED` and a challenge |
| Reset requested | Identity service stubbed | `POST /api/v1/auth/password-reset/requests` | 202 | `ResetAcceptedResponse` |
| Unknown route | Normal application | `GET /api/v1/__contract-test-missing` | 404 | `ErrorResponse`; `ROUTE_NOT_FOUND` |
| Unsupported version | Normal application | `GET /api/v2/health/live` | 404 | Same safe 404 contract |

For error cases the `X-Correlation-ID` header MUST equal the body `correlationId`, and seeded canary
secrets MUST be absent from responses and captured logs.

## End-to-End Contract Spec

Because the automated gate is database-free, `test/e2e/identity.contract.e2e.spec.ts` validates real
database-backed identity responses (registration, sign-in, principal, sessions, administrative listing,
and each identity error code) against the committed `openapi/openapi.json` using the same
response-validator package. This spec requires the real database and runs inside the existing E2E
project, so the contract is proven both structurally and against observed behavior.

## Not Claimed

The contract does not claim production capacity, availability, notification delivery, email
verification, or account-deletion behavior. Those remain under HC-DEC-016, HC-DEC-014, HC-DEC-002, and
HC-DEC-003 respectively.
