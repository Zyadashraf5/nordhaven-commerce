# Identity API Contract: Milestone 02

## Authority and Derived Artifact

Controller and DTO decorators are the executable source of truth. `openapi/openapi.yaml`'s successor,
the committed `openapi/openapi.json`, is generated deterministically from the same application factory
used by runtime and E2E tests and MUST NOT be edited by hand. This document is the reviewed planning
contract: it fixes the operation inventory, the authentication scheme, the request and response
shapes, and the error codes that the generated document and the observed HTTP behavior must match.

## Authentication Scheme

| Property | Value |
| --- | --- |
| Type | HTTP bearer |
| Scheme name | `session` |
| Credential | Opaque 256-bit session credential, base64url, returned once at issuance |
| Header | `Authorization: Bearer <credential>` |
| Storage | Server stores only a SHA-256 hash in `sessions.token_hash` |
| Revocation | Immediate, per session or for all sessions |
| Expiry | Absolute lifetime plus idle lifetime |

Routes marked **Public** carry no security requirement. Every other route requires a usable session.

## Operation Inventory

| # | Method and path | Access | Success | Summary |
| --- | --- | --- | --- | --- |
| 1 | `POST /api/v1/auth/register` | Public | `201` | Register a customer with email and password |
| 2 | `POST /api/v1/auth/login` | Public | `200` | Authenticate, or start an administrator MFA step |
| 3 | `POST /api/v1/auth/login/mfa` | Public | `201` | Complete sign-in with a TOTP or recovery code |
| 4 | `POST /api/v1/auth/login/mfa/enrollment` | Public | `200` | Start administrator MFA enrollment |
| 5 | `POST /api/v1/auth/login/mfa/enrollment/confirmation` | Public | `201` | Confirm enrollment and receive recovery codes |
| 6 | `GET /api/v1/auth/principal` | Session | `200` | Report the authenticated principal |
| 7 | `GET /api/v1/auth/sessions` | Session | `200` | List the principal's sessions |
| 8 | `DELETE /api/v1/auth/sessions` | Session | `204` | Sign out everywhere |
| 9 | `DELETE /api/v1/auth/sessions/current` | Session | `204` | Sign out the current session |
| 10 | `DELETE /api/v1/auth/sessions/{sessionId}` | Session | `204` | Revoke one owned session |
| 11 | `POST /api/v1/auth/password` | Session | `204` | Change the password after reauthentication |
| 12 | `POST /api/v1/auth/password-reset/requests` | Public | `202` | Request a password reset |
| 13 | `POST /api/v1/auth/password-reset/confirmations` | Public | `204` | Complete a password reset |
| 14 | `GET /api/v1/admin/users` | Session + `ADMIN` | `200` | List accounts (administrative) |
| 15 | `GET /api/v1/health/live` | Public | `200` | Existing liveness probe |
| 16 | `GET /api/v1/health/ready` | Public | `200` | Existing readiness probe |

Every operation documents `400`, `401` (where authentication applies), `403` (administrative), `429`,
`503`, and `500` with the shared safe envelope. `X-Correlation-ID` is present on every response.

## Request and Response Shapes

### `POST /api/v1/auth/register`

Request `RegisterRequest`

| Field | Type | Rules |
| --- | --- | --- |
| `email` | string | Valid email, at most 254 characters, trimmed and lower-cased by the server |
| `password` | string | 12 to 256 characters, not equal to the email address |

Response `201 RegisterResponse`: `{ "user": UserSummary }`.

Failures: `400 VALIDATION_ERROR`, `409 REGISTRATION_NOT_ALLOWED`, `429 RATE_LIMITED`.

### `POST /api/v1/auth/login`

Request `LoginRequest`: `{ "email": string, "password": string }`.

Response `200 LoginResponse`

| Field | Type | Present when |
| --- | --- | --- |
| `status` | `AUTHENTICATED` \| `MFA_REQUIRED` \| `MFA_ENROLLMENT_REQUIRED` | Always |
| `session` | `SessionCredential` | `AUTHENTICATED` |
| `challenge` | `ChallengeCredential` | `MFA_REQUIRED` or `MFA_ENROLLMENT_REQUIRED` |
| `user` | `UserSummary` | `AUTHENTICATED` |

`SessionCredential`: `{ "token": string, "tokenType": "Bearer", "expiresAt": RFC3339 }`.
`ChallengeCredential`: `{ "token": string, "purpose": "MFA_VERIFICATION" | "MFA_ENROLLMENT", "expiresAt": RFC3339 }`.

Failures: `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`, `429 RATE_LIMITED`. A wrong password, an
unknown account, and a locked account all return `401 INVALID_CREDENTIALS` with the same message.

### `POST /api/v1/auth/login/mfa`

Request `LoginMfaRequest`: `{ "challengeToken": string, "code": string?, "recoveryCode": string? }`
with exactly one of `code` or `recoveryCode`.

Response `201 SessionResponse`: `{ "status": "AUTHENTICATED", "token", "tokenType", "expiresAt", "user" }`.

Failures: `400 VALIDATION_ERROR`, `401 INVALID_CHALLENGE`, `401 INVALID_MFA_CODE`, `429 RATE_LIMITED`.

### `POST /api/v1/auth/login/mfa/enrollment`

Request `EnrollmentRequest`: `{ "challengeToken": string }`.

Response `200 EnrollmentResponse`:
`{ "secret": string, "otpauthUri": string, "algorithm": "SHA1", "digits": 6, "period": 30, "issuer": string, "expiresAt": RFC3339 }`.

The secret is returned only while enrollment is pending and never again after confirmation.

Failures: `400 VALIDATION_ERROR`, `401 INVALID_CHALLENGE`, `409` enrollment already confirmed
(`REGISTRATION_NOT_ALLOWED` is not reused; a confirmed enrollment returns
`400 VALIDATION_ERROR` with a safe message), `429 RATE_LIMITED`.

### `POST /api/v1/auth/login/mfa/enrollment/confirmation`

Request `EnrollmentConfirmationRequest`: `{ "challengeToken": string, "code": string }` where `code` is
six digits.

Response `201 EnrollmentConfirmationResponse`:
`{ "status": "MFA_ENROLLED", "recoveryCodes": string[], "confirmedAt": RFC3339 }`.

Recovery codes are returned exactly once. Failures: `400 VALIDATION_ERROR`, `401 INVALID_CHALLENGE`,
`401 INVALID_MFA_CODE`, `429 RATE_LIMITED`.

### `GET /api/v1/auth/principal`

Response `200 PrincipalResponse`:
`{ "user": UserSummary, "role": string, "session": SessionSummary }`.

### `GET /api/v1/auth/sessions`

Response `200 SessionsResponse`: `{ "sessions": SessionSummary[] }`.

`SessionSummary`:
`{ "id": uuid, "createdAt": RFC3339, "lastUsedAt": RFC3339, "expiresAt": RFC3339, "clientLabel": string?,
"current": boolean }`. No session credential and no address are ever returned.

### `DELETE /api/v1/auth/sessions`

Revokes every session for the principal, including the current one. Response `204`.

### `DELETE /api/v1/auth/sessions/current`

Revokes the presented session only. Response `204`.

### `DELETE /api/v1/auth/sessions/{sessionId}`

Revokes one owned session. Response `204`. A session identifier that does not belong to the principal
returns `404 SESSION_NOT_FOUND`, so identifiers cannot be probed for existence.

### `POST /api/v1/auth/password`

Request `ChangePasswordRequest`: `{ "currentPassword": string, "newPassword": string }`.

Response `204`. Requires reauthentication through `currentPassword`; revokes every other session and
keeps the presented one.

Failures: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `401 INVALID_CREDENTIALS`, `429 RATE_LIMITED`.

### `POST /api/v1/auth/password-reset/requests`

Request `ResetRequestRequest`: `{ "email": string }`.

Response `202 ResetAcceptedResponse`: `{ "status": "ACCEPTED" }`.

The response is identical whether or not the account exists and never contains recovery material. When
no notification transport is configured, delivery is skipped and only a non-sensitive event is
recorded.

### `POST /api/v1/auth/password-reset/confirmations`

Request `ResetConfirmationRequest`: `{ "token": string, "newPassword": string }`.

Response `204`. On success the token is consumed and every session is revoked.

Failures: `400 VALIDATION_ERROR`, `400 INVALID_RECOVERY_TOKEN`, `429 RATE_LIMITED`.

### `GET /api/v1/admin/users`

Query `AdminUsersQuery`: `limit` (1–100, default 50) and `cursor` (uuid, optional).

Response `200 AdminUsersResponse`: `{ "users": UserSummary[], "nextCursor": string | null }` where
`UserSummary` is `{ "id": uuid, "email": string, "role": string, "createdAt": RFC3339 }`.

Failures: `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `429 RATE_LIMITED`. Every
grant and denial of administrative access is recorded as a durable security event.

### `UserSummary`

`{ "id": uuid, "email": string, "role": "CUSTOMER" | "ADMIN", "createdAt": RFC3339 }`. No hash, lock
state, MFA state, or session credential is ever included.

## Error Codes

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Boundary validation failed |
| 400 | `INVALID_RECOVERY_TOKEN` | Reset token unknown, consumed, expired, or invalidated |
| 401 | `UNAUTHENTICATED` | Missing or unusable session credential |
| 401 | `INVALID_CREDENTIALS` | Wrong password, unknown account, or locked account |
| 401 | `INVALID_CHALLENGE` | MFA challenge unknown, consumed, expired, or invalidated |
| 401 | `INVALID_MFA_CODE` | TOTP or recovery code wrong, expired, or replayed |
| 403 | `FORBIDDEN` | Authenticated principal lacks the required role |
| 404 | `SESSION_NOT_FOUND` | Session identifier not owned by the principal |
| 409 | `REGISTRATION_NOT_ALLOWED` | Email address already registered |
| 429 | `RATE_LIMITED` | Rate limit exceeded; `Retry-After` present |
| 503 | `SERVICE_UNAVAILABLE` | Instance not ready |
| 500 | `INTERNAL_ERROR` | Unclassified failure |

All codes and messages are constant and non-sensitive. Error bodies never echo a submitted value and
never disclose account existence, MFA enrollment state, lockout state, or whether a session or token
was ever valid.

## Response Headers

| Header | Requirement |
| --- | --- |
| `X-Correlation-ID` | Present on every response; equals the body `correlationId` on errors |
| `Cache-Control` | `no-store` on every identity response and every error response |
| `Retry-After` | Present on `429 RATE_LIMITED` and `503 SERVICE_UNAVAILABLE` |

## Deliberate Exclusions

- No email-verification operation or field (HC-DEC-002 open).
- No profile, address, wishlist, export, or deletion operation (HC-DEC-003 open).
- No real notification delivery, no SMTP configuration, and no provider selection (HC-DEC-014 open).
- No customer or commerce resource other than the administrative account listing, which exists solely
  to prove role-based authorization.
