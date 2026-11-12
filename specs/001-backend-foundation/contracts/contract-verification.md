# OpenAPI Contract Verification

## Source of Truth and Derived Artifact

Application route/response metadata is the executable source of truth. The planning contract in
`contracts/openapi.yaml` defines the required outcome. Implementation generates
`openapi/openapi.json` from the same configured application factory used by runtime and E2E tests.
The generated JSON is a committed, reviewable derivative and MUST NOT be edited by hand.

The application factory MUST configure the `/api` global prefix and URI version `1` before calling
OpenAPI document generation. This prevents generated paths from losing their version prefix.

## Allowed Path Inventory

Milestone 01 permits exactly:

- `GET /api/v1/health/live`
- `GET /api/v1/health/ready`

The documentation UI and raw-document delivery path are operational presentation routes and are not
themselves listed as API operations. No customer, authentication, administrator, product,
inventory, bundle, cart, checkout, order, payment, pre-order, tax, shipping, review, wishlist, or
notification operation is allowed.

## Automated CI Gate

`pnpm openapi:check` MUST perform all of these steps:

1. Start the application through the shared factory without binding a public port.
2. Generate the OpenAPI object after global prefix and versioning configuration.
3. Serialize keys deterministically and write only to a temporary location.
4. Validate the temporary document as OpenAPI 3.0 using the dev-only
   `@apidevtools/swagger-parser` validator.
5. Compare the canonical temporary document byte-for-byte with committed
   `openapi/openapi.json`; any drift fails the check and prints the regeneration command.
6. Assert that the path/method set equals the allowed inventory above and scan path names,
   operation IDs, tags, and schema component names for excluded commerce-domain terms.
7. Run observed-response checks through Supertest and validate response status, headers, and body
   against the generated response schema using the dev-only `openapi-response-validator` package.
8. Close the Nest application and database client even when a check fails.

Both validator packages are development-only and exist solely for this constitutional contract
gate.

## Observed-Response Matrix

| Case | Setup | Request | Expected | Contract assertion |
| --- | --- | --- | --- | --- |
| Live | Process initialized | `GET /api/v1/health/live` | 200 | Body matches `LivenessResponse`; `Cache-Control: no-store`; valid correlation header |
| Ready contract | Database probe replaced with deterministic success | `GET /api/v1/health/ready` | 200 | Body matches `ReadinessResponse`; database is `up`; no extra fields. Real PostgreSQL is covered by the integration suite. |
| Database unavailable | Database probe provider forced to timeout/fail or test DB stopped | `GET /api/v1/health/ready` | 503 | Body matches `ErrorResponse`; code is `SERVICE_UNAVAILABLE`; no cause/host/URL/stack |
| Unknown route | Normal app, guaranteed absent path | `GET /api/v1/__contract-test-missing` | 404 | Body matches `ErrorResponse`; code is `ROUTE_NOT_FOUND`; no fake route is added |
| Unsupported version | Normal app | `GET /api/v2/health/live` | 404 | Same safe 404 contract |
| Controlled internal failure | Test-instrumented normal composition | `GET /api/v1/health/live` | 500 | Body matches `ErrorResponse`; response and captured structured logs share a correlation ID and omit the injected secret |

For error cases, the `X-Correlation-ID` response header MUST equal the body's `correlationId`.
Seeded canary secrets in injected exceptions MUST be absent from responses and captured structured
logs. Jest E2E owns the controlled `500` and captured-log assertion; the OpenAPI gate owns contract
structure, drift, name inventory, and observed `200`, `404`, and `503` responses.

## Initial Startup Failure Contract

The HTTP response matrix applies only after a successful initial startup. If PostgreSQL is
unavailable during initial startup, the bounded startup probe MUST fail before the HTTP listener is
bound and the process MUST exit non-zero. No liveness or readiness response is expected in that
state. The `200` liveness plus `503` readiness behavior applies only when PostgreSQL becomes
unavailable after the application has reached the ready state.

## Readiness Routing Contract

Deployment infrastructure is outside Milestone 01, but any later deployment MUST satisfy all of
these rules before it can be approved:

- Route traffic only after `/api/v1/health/ready` returns 200.
- Remove an instance from routing when readiness returns 503; never use liveness as the route gate.
- Use liveness only to decide whether the process is responsive enough to keep running.
- Allow enough graceful-drain time after readiness turns 503 before terminating the process.

Milestone 01 verifies application-side statuses and state transitions. It MUST NOT claim that an
external router or production probe configuration has already been implemented.
