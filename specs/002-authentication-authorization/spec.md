# Feature Specification: Milestone 02 - Authentication & Authorization

**Feature Branch**: Not created; no `before_specify` branch hook is configured and the repository has
no commits yet

**Created**: 2026-10-19

**Status**: Draft for review; Product Owner authorized Milestone 02 implementation on 2026-10-19

**Approval**: Product Owner authorization on 2026-10-19 covers starting and implementing Milestone
02. It does not resolve or approve HC-DEC-001 through HC-DEC-017. One scoped decision was recorded
on 2026-10-19: password-reset delivery uses a provider-agnostic notification boundary with
non-production transports only, leaving HC-DEC-014 Open.

**Input**: User description: "Milestone 02: Authentication & Authorization for Nordhaven Commerce —
secure customer registration and email/password authentication, credential handling, login/logout
and session management, multiple concurrent device sessions, secure password reset, customer versus
administrator authorization, protected endpoints and guards, rate limiting, input validation, safe
error responses, security logging, migrations, and automated tests."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Register and Sign In as a Customer (Priority: P1)

A new customer registers with an email address and password, signs in, receives an authenticated
session that works independently on each device, and can sign out. The same credentials work from
any client that speaks the versioned REST API.

**Why this priority**: Authenticated customers are a constitutional prerequisite for every later
commerce capability (cart, checkout, orders). Until identity exists, no customer-scoped feature can
be built.

**Independent Test**: Register a new account, sign in twice from independent clients, confirm both
sessions work simultaneously, sign out of one, and confirm the other remains valid and the signed-out
session is rejected.

**Acceptance Scenarios**:

1. **Given** a valid, unused email address and a policy-compliant password, **When** a customer
   registers, **Then** an active customer account exists and no credential material is exposed in the
   response.
2. **Given** a registered customer, **When** the customer signs in with correct credentials from two
   different clients, **Then** both clients receive independent valid sessions that can be used at
   the same time.
3. **Given** a signed-in customer, **When** the customer signs out on one client, **Then** that
   session is immediately rejected while every other session continues to work.
4. **Given** an account that must resist guessing, **When** a sign-in attempt uses a wrong password or
   an unknown email address, **Then** the response is indistinguishable and contains no hint about
   which accounts exist.
5. **Given** a customer who wants proof of access, **When** the customer requests their own
   principal and active sessions, **Then** only their own identity, role, and session metadata are
   returned and never another account's data.

---

### User Story 2 - Protect Administrative Access with Mandatory MFA (Priority: P1)

An administrator signs in with a password and must complete multi-factor authentication before any
administrative capability is available. On first access the administrator enrolls an authenticator
and receives one-time recovery codes. Customers can never perform administrative actions.

**Why this priority**: The constitution mandates MFA for every administrative account and
least-privilege authorization. Administrator compromise exposes customers, money, and inventory.

**Independent Test**: Provision an administrator, enroll MFA, verify a correct and an incorrect code,
reach one administrative endpoint with a verified session, and confirm a customer session is denied
on the same endpoint and cannot bypass MFA.

**Acceptance Scenarios**:

1. **Given** an administrator account without confirmed MFA, **When** the administrator signs in with
   a correct password, **Then** no session with administrative capability is issued until MFA
   enrollment and verification succeed.
2. **Given** an administrator with confirmed MFA, **When** the administrator signs in, **Then**
   administrative access requires a valid, unexpired MFA code (or a single-use recovery code) in
   addition to the password.
3. **Given** any authenticated non-administrator, **When** an administrative operation is attempted,
   **Then** the server denies it with the standard safe authorization error and records the denial.
4. **Given** a valid MFA code already used in its time window, **When** it is replayed, **Then** the
   attempt is rejected.
5. **Given** an administrator who lost their authenticator, **When** a valid unused recovery code is
   presented, **Then** access is granted and that code can never be reused.

---

### User Story 3 - Recover a Lost Password Safely (Priority: P2)

A customer who forgot a password requests a reset, receives a single-use expiring recovery token
through the notification boundary, and sets a new password. After the reset, every previously issued
session is revoked.

**Why this priority**: Recovery is a core identity capability and a common attack surface; a weak
recovery path would undermine otherwise strong authentication.

**Independent Test**: Request a reset for an existing and a non-existing address, confirm identical
responses, complete a reset with a valid token, reject reuse and expired tokens, and confirm all prior
sessions are invalid afterwards.

**Acceptance Scenarios**:

1. **Given** any email address supplied to the reset request, **When** the request completes, **Then**
   the response is identical whether or not the account exists and never contains recovery material.
2. **Given an issued recovery token, **When** the customer submits it with a policy-compliant new
   password, **Then** the password changes, the token cannot be used again, and all existing sessions
   are revoked.
3. **Given an expired, already-used, or foreign recovery token, **When** it is submitted, **Then** the
   request is rejected with the standard safe error and no password change occurs.
4. **Given a signed-in customer, **When the customer changes their password by supplying the current
   password, **Then** the change succeeds, other sessions are revoked, and the current reauthenticated
   session remains usable.

---

### User Story 4 - Control Sessions Across Devices (Priority: P2)

A signed-in customer can see their active sessions, understand where each came from at a coarse level,
revoke a single session, or sign out everywhere.

**Why this priority**: Multiple concurrent device sessions are an approved product fact, and
revocation is a constitutional requirement for session management.

**Independent Test**: Create three sessions, list them, revoke one by its identifier, sign out
everywhere, and confirm each state transition is reflected immediately in authentication attempts.

**Acceptance Scenarios**:

1. **Given several active sessions, **When** the customer lists sessions, **Then** each entry exposes
   only non-sensitive metadata and never the session secret itself.
2. **Given a listed session, **When** the customer revokes it, **Then** that session is rejected
   immediately and the customer's other sessions are unaffected.
3. **Given an active customer, **When** the customer signs out everywhere, **Then** every session for
   that account is rejected, including the current one.
4. **Given a session revoked by a password reset, **When** it is reused, **Then** it is rejected as if
   it never existed.

---

### User Story 5 - Resist Abuse and Produce Safe Security Evidence (Priority: P3)

Operators and reviewers can rely on rate limiting and durable lockout, uniform responses that do not
leak account existence, safe error envelopes, and structured security records that contain no secrets.

**Why this priority**: Brute-force resistance, non-sensitive errors, and redacted observability are
constitutional obligations that make the identity surface defensible in production.

**Independent Test**: Drive repeated failed sign-ins and reset requests past the documented limits,
inspect responses for uniformity, restart the application to confirm lockout persistence, and inspect
captured logs and durable records for secrets.

**Acceptance Scenarios**:

1. **Given repeated failed authentication attempts, **When** the documented threshold is exceeded,
   **Then** further attempts receive a bounded, safe rejection and the event is recorded.
2. **Given durable lockout state, **When** the application restarts, **Then** lockout enforcement is
   unchanged and still expires as documented.
3. **Given any authentication, recovery, or authorization event, **When** it is logged and persisted,
   **Then** the record is structured, correlated, and contains no password, token, session secret,
   MFA secret, recovery code, or connection string.
4. **Given any rejected identity request, **When** the response is inspected, **Then** it uses the
   standard safe error envelope with a stable code and no internal detail.

---

### Edge Cases

- An email address differs only by letter case or surrounding whitespace from an existing account.
- A password contains leading/trailing whitespace, non-ASCII characters, or an extreme length.
- Two registrations for the same email address arrive concurrently.
- A sign-in succeeds while the account is simultaneously locked out by failed attempts.
- A session token is used after expiry, after revocation, after password reset, or with a modified
  value.
- An administrator's MFA code is correct but falls outside the accepted time window, is replayed, or is
  used before enrollment is confirmed.
- A recovery code is used twice, after the MFA secret is re-enrolled, or for a different account.
- A reset token is requested multiple times in a row; only the most recent state must be defined and
  consistent.
- A password reset token is presented for an account that is locked out or whose sessions were already
  revoked.
- The database is temporarily unavailable during sign-in, session validation, or reset completion.
- A caller attempts to list or revoke another customer's session by guessing an identifier.
- A request arrives during graceful shutdown, or an audit record cannot be written.
- Rate-limit state is process-local and the process restarts (customer experience must remain defined).
- The notification boundary has no configured transport (must fail safely without exposing material).
- An unexpected error contains a password, token, or connection string that must never reach a response
  or a log field.

## Requirements *(mandatory)*

### Scope Boundaries

This milestone delivers the Identity and Access capability only: customer registration and
email/password authentication, credential and session handling, password recovery token lifecycle,
administrator authentication with mandatory MFA, customer/administrator authorization primitives,
protected endpoints and guards, abuse resistance, safe errors, security logging and durable security
records, migrations, and automated tests.

Explicitly out of scope: customer profile management, saved addresses, wishlists, account deletion or
data-export workflows (HC-DEC-003), email verification (HC-DEC-002), real notification delivery
(HC-DEC-014), carts, checkout, orders, payments, inventory, catalog, bundles, shipping, tax, reviews,
pre-orders, and any commerce module. No new infrastructure, external provider, or paid service is
introduced.

HC-DEC-001 through HC-DEC-017 MUST NOT be resolved, encoded, or assumed. Where a requirement depends
on an open decision, this specification records the dependency and its review trigger instead of
selecting behavior silently.

### Functional Requirements

**Registration and credentials**

- **M02-FR-001**: Customers MUST be able to register with an email address and password. No other
  registration channel is offered in this milestone.
- **M02-FR-002**: Email addresses MUST be normalized (trimmed, canonicalized case) and unique; the
  system MUST reject a duplicate registration with the standard safe envelope and MUST rate-limit the
  endpoint.
- **M02-FR-003**: Passwords MUST be subject to a documented policy (minimum length, maximum length,
  rejection of the email address and of empty/whitespace-only values); policy violations MUST be
  rejected with non-sensitive validation detail that never echoes the submitted value.
- **M02-FR-004**: Credentials MUST be stored using a memory-hard, salted password hash with documented
  parameters. Recoverable or reversible password storage MUST NOT be possible, and hashing parameters
  MUST be verifiable by test.
- **M02-FR-005**: Passwords MUST NEVER appear in API responses, error bodies, structured logs, audit
  records, telemetry, or thrown error messages.

**Authentication and sessions**

- **M02-FR-006**: A customer MUST be able to authenticate with email address and password and receive
  a session credential that is presented to the service on subsequent requests.
- **M02-FR-007**: Session credentials MUST be high-entropy and MUST be stored only in a non-reversible
  form; the raw value MUST be returned to the client once and never persisted or logged.
- **M02-FR-008**: Sessions MUST have a documented absolute lifetime and idle expiry, MUST be
  revocable, and MUST be rejected immediately after expiry or revocation.
- **M02-FR-009**: Multiple simultaneous sessions for one customer MUST be supported and MUST be
  independent, so revoking or expiring one session does not affect another (HC-IAM-005).
- **M02-FR-010**: A customer MUST be able to sign out of the current session and to sign out of all
  sessions at once.
- **M02-FR-011**: A customer MUST be able to list their own active sessions with non-sensitive
  metadata and revoke an individual session by identifier. Attempting to access another account's
  session MUST be denied with the standard safe error.
- **M02-FR-012**: Sign-in outcomes MUST be indistinguishable between an unknown account and a wrong
  password, using the same status, code, message, and a bounded comparable response time.
- **M02-FR-013**: Repeated failed authentication attempts MUST trigger durable, expiring lockout and
  rate limiting. Lockout state MUST survive an application restart and MUST be observable.
- **M02-FR-014**: An authenticated customer MUST be able to change their password only by supplying
  the current password, and the change MUST revoke all other sessions (constitutional
  reauthentication for a high-risk change).

**Authorization**

- **M02-FR-015**: Every protected operation MUST be authorized on the server against the current
  principal, the required permission, and the target resource scope (Constitution III).
- **M02-FR-016**: The service MUST distinguish at least a customer role and an administrator role,
  and administrative capabilities MUST require the administrator role.
- **M02-FR-017**: All application routes MUST require authentication by default. Routes that are
  intentionally public (health checks and the unauthenticated authentication entry points) MUST be
  explicitly marked, and the set of public routes MUST remain minimal and reviewable.
- **M02-FR-018**: A non-administrator MUST NOT perform administrative operations, and no customer MUST
  access another customer's private resources; every denial MUST use the standard safe authorization
  error and MUST be covered by negative-path tests.
- **M02-FR-019**: Administrative authorization decisions MUST be enforced by the server on every
  request and MUST NOT rely on client-supplied role information.

**Administrator MFA (constitutional mandate)**

- **M02-FR-020**: Every administrator MUST enroll in and successfully complete multi-factor
  authentication before any administrative capability is granted. A correct password alone MUST NOT
  produce an administratively capable session.
- **M02-FR-021**: MFA MUST use a time-based one-time password mechanism compatible with standard
  authenticator applications, with documented accepted time-step tolerance.
- **M02-FR-022**: An MFA secret MUST be encrypted at rest with a key provided through configuration,
  MUST never be logged, and MUST be returned to the enrolling administrator once, only during
  confirmed enrollment.
- **M02-FR-023**: MFA codes MUST be rejected when invalid, expired, or replayed within their accepted
  time window. Rejection MUST use the same safe error as any other failed verification.
- **M02-FR-024**: Administrators MUST receive single-use recovery codes at enrollment. Recovery codes
  MUST be stored only in a non-reversible form, MUST be displayed once, and MUST be single-use.
- **M02-FR-025**: Administrator accounts MUST be provisionable only through a documented, guarded
  operational path; public administrator self-registration MUST NOT exist.

**Password recovery (HC-DEC-014 constrained)**

- **M02-FR-026**: A password-reset request MUST return one identical response whether or not the
  account exists, and MUST never include recovery material in the response.
- **M02-FR-027**: Recovery tokens MUST be high-entropy, single-use, time-limited, bound to one account,
  stored only in a non-reversible form, and invalidated on use or on a superseding request.
- **M02-FR-028**: Completing a reset MUST apply the same credential policy and hashing rules as
  registration and MUST revoke all sessions for that account.
- **M02-FR-029**: Recovery material MUST be delivered only through a notification boundary. In this
  milestone the boundary supports non-production transports (in-memory for tests, local file for
  development) only; no production channel is approved while HC-DEC-014 remains Open. An unconfigured
  transport MUST fail safely without exposing or logging recovery material.
- **M02-FR-030**: Recovery endpoints MUST be rate-limited and MUST NOT reveal account existence,
  session validity, or lockout state beyond the standard safe response.

**Abuse resistance, validation, and safe errors**

- **M02-FR-031**: Documented rate limits MUST apply to authentication, registration, and recovery
  endpoints, both per client and per account where the account is known, and MUST return a safe,
  bounded response when exceeded.
- **M02-FR-032**: All externally supplied values MUST be validated and normalized at the API boundary;
  unknown or unexpected fields MUST NOT enable mass assignment.
- **M02-FR-033**: Identity responses and failures MUST use the existing standard safe error envelope
  with stable machine-readable codes and MUST NOT expose stack traces, internal identifiers,
  credentials, tokens, or database error text.
- **M02-FR-034**: No identity error or response MAY disclose whether an account exists, whether MFA is
  enrolled (except to the authenticated principal managing their own enrollment), or whether a
  presented session or recovery token was ever valid.

**Observability and audit**

- **M02-FR-035**: Security-relevant events — registration, sign-in success and failure, lockout,
  MFA enrollment and verification, recovery request and completion, session revocation, and
  authorization denial on administrative routes — MUST be emitted as structured, correlated records.
- **M02-FR-036**: Privileged and administrative security events MUST be durably persisted as
  module-owned security records so that administrative actions are auditable; the records MUST NOT
  contain secrets.
- **M02-FR-037**: Logs and persistent security records MUST redact passwords, session credentials,
  MFA secrets and codes, recovery codes and tokens, authorization headers, and connection strings,
  consistent with the existing redaction convention.

**Data ownership and evolution**

- **M02-FR-038**: Identity persistence MUST be owned by the Identity and Access module and accessed
  only through Prisma within that module; no other module may read or write its tables, and the
  module MUST expose deliberate public contracts only.
- **M02-FR-039**: Schema changes MUST ship as reviewed, repeatable, non-destructive Prisma migrations
  that are safe for existing data. Application startup MUST NOT create, reset, or destructively alter
  the schema.
- **M02-FR-040**: Personal data stored for identity MUST be minimized to what authentication,
  authorization, recovery, and audit require. Email-verification status MUST NOT be recorded or
  presented as verified while HC-DEC-002 is open.

**API and contract**

- **M02-FR-041**: Identity endpoints MUST be versioned REST under the existing `/api/v1` convention and
  MUST be accurately described in the OpenAPI contract, including the authentication scheme, request
  and response schemas, statuses, and error envelope.
- **M02-FR-042**: The OpenAPI contract gate MUST be updated to cover the identity surface while
  continuing to reject drift, excluded domains, and unversioned business routes.

**Platform and dependencies**

- **M02-FR-043**: This milestone MUST NOT introduce Redis, BullMQ, a broker, a microservice, a search
  engine, an external identity provider, or any paid service. Rate-limit state MAY be process-local
  where durability is not required; account lockout state MUST be durable.
- **M02-FR-044**: Any new dependency MUST be pinned, license-compatible, justified against a simpler
  alternative, and MUST NOT weaken the existing supply-chain and audit gates.
- **M02-FR-045**: Existing foundation behavior — configuration validation, liveness/readiness,
  structured correlated logging, safe errors, graceful shutdown, and module boundaries — MUST continue
  to hold after this milestone.

### Key Entities

- **Customer account**: A person who can authenticate; owns one credential record, zero or more
  sessions, and recovery state. Distinguished from an administrator account by role.
- **Administrator account**: An account with administrative authorization that also requires an
  enrolled MFA factor and recovery codes before administrative access.
- **Credential**: The non-reversible password representation and its hashing metadata for one account.
- **Session**: One authenticated device/client session: non-reversible credential reference, issuance
  and expiry timing, last-use time, coarse client metadata, and revocation state.
- **Recovery request**: A single-use, time-limited password-reset token state bound to one account.
- **MFA enrollment**: The per-administrator authenticator secret (encrypted) and confirmation state,
  plus the set of single-use recovery codes (non-reversible).
- **Security record**: A durable, non-sensitive audit fact about a privileged or security-relevant
  identity event.
- **Principal**: The authenticated actor (identity, role, session reference) resolved from a session
  credential for authorization decisions.

### Failure Cases and Required Outcomes

| Failure | Required outcome |
| --- | --- |
| Duplicate registration | Standard safe envelope; attempt rate-limited; no credential material returned. |
| Weak or non-compliant password | Validation failure with non-sensitive detail; the submitted value is never echoed or logged. |
| Wrong password or unknown account | Identical safe response and comparable timing; failure recorded without account-existence detail. |
| Repeated authentication failures | Durable, expiring lockout and rate limiting; further attempts receive the standard safe rejection. |
| Expired, revoked, or malformed session credential | Request rejected as unauthenticated with the standard safe envelope. |
| Non-administrator attempts an administrative operation | Denied with the standard safe authorization error and audited. |
| Administrator without confirmed MFA | No administratively capable session is issued; enrollment path only. |
| Invalid, expired, or replayed MFA code | Same safe failure as any other verification failure; no partial access. |
| Reused or expired recovery code | Rejected safely; no access and no reuse. |
| Recovery token reuse, expiry, or cross-account use | Rejected safely; no password change and no disclosure. |
| Reset completed | All existing sessions revoked; subsequent use of those sessions is rejected. |
| Rate limit or lockout threshold exceeded | Bounded safe rejection; event recorded; state expires as documented. |
| Notification transport not configured | Reset still returns the uniform response; recovery material is neither delivered nor logged. |
| Database unavailable during an identity operation | Standard safe service-unavailable behavior; no partial credential or session state is asserted. |
| Secret-bearing unexpected error | Standard safe envelope to the caller; protected, redacted detail retained internally only. |

### Testing Requirements

- Unit tests MUST cover password policy and hashing/verification, session credential generation and
  non-reversible storage, session expiry and revocation logic, recovery-token lifecycle, MFA
  enrollment/verification/replay rejection, recovery-code handling, authorization guard decisions, and
  response-uniformity logic.
- PostgreSQL-backed integration tests MUST cover unique-email constraints and concurrent registration,
  session persistence across restarts, expiry and revocation, durable lockout, recovery-token
  single-use and expiry, and encrypted MFA material at rest.
- End-to-end tests MUST cover registration, sign-in from multiple clients, sign-out and sign-out-all,
  session listing and revocation, the full administrator MFA journey including denial paths, the
  password-recovery journey including reuse rejection, rate limiting, and safe error envelopes.
- Negative-path tests MUST verify that passwords, session credentials, MFA secrets and codes, recovery
  codes and tokens, and connection strings never appear in responses, structured logs, or durable
  records.
- Contract assertions MUST verify that the OpenAPI document and observed identity behavior agree on
  routes, statuses, schemas, and the authentication scheme.
- Tests MUST use isolated databases and MUST NOT depend on or contaminate developer or production data,
  consistent with the existing database guard.

### Operational Expectations

- Lockout and rate-limit thresholds, session lifetimes, recovery-token lifetime, and MFA time-step
  tolerance have documented defaults and are configurable through validated configuration.
- Durable security records and structured logs allow an operator to trace an authentication or
  authorization decision using the request correlation identifier without seeing secrets.
- Sessions are stored durably, so a process restart preserves signed-in state; process-local rate-limit
  counters MAY reset on restart and that behavior MUST be documented.
- This milestone does not establish production capacity, availability, or infrastructure topology;
  those remain under HC-DEC-016.
- Notification delivery to real channels is intentionally absent until HC-DEC-014 is resolved; the
  service must remain safe and correct while that decision is open.

### Constitution Compliance

| Constitutional obligation | Milestone evidence required |
| --- | --- |
| Modular architecture and separation of concerns (I) | Identity and Access module owns its model and persistence; deliberate public contract; boundary check continues to pass. |
| Secure identity, expiry, revocation, brute-force and enumeration resistance, mandatory admin MFA, no plaintext secrets (II) | Memory-hard password hashing; expiring revocable sessions; durable lockout and rate limiting; uniform responses; enforced TOTP MFA with encrypted secrets and hashed recovery codes. |
| Server-side trust enforcement (III) | Boundary validation, secure-by-default route protection, role and scope authorization with negative-path coverage. |
| Exact money and safe database evolution (VIII) | Not applicable to money; reviewed, non-destructive, repeatable migrations with no startup schema changes. |
| Automated testing at every boundary (IX) | Unit, PostgreSQL-backed integration, and end-to-end suites for success, denial, replay, concurrency, and recovery paths. |
| Observable operations and protected secrets (X) | Structured correlated security logs, durable audit records, and redaction tests proving zero secret leakage. |
| Recorded decisions and open requirements (XI) | HC-DEC-002, HC-DEC-003, and HC-DEC-014 recorded as unresolved dependencies with review triggers; OpenAPI kept accurate. |
| Simplicity before distribution (XII) | One modular application and PostgreSQL only; no Redis, queue, broker, or external identity provider; dependencies minimized and justified. |

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **M02-SC-001**: A customer can register and sign in from two independent clients, and both sessions
  function simultaneously, in 100% of tested runs.
- **M02-SC-002**: Revoking or expiring one session never affects another session in 100% of tested
  multi-device scenarios.
- **M02-SC-003**: 100% of tested wrong-password, unknown-account, duplicate-registration, and reset
  scenarios return responses that do not disclose account existence, with comparable response status,
  code, and timing.
- **M02-SC-004**: 100% of tested attempts to reach administrative operations without a verified MFA
  administrator session are denied with the standard safe authorization error and recorded.
- **M02-SC-005**: 100% of tested recovery-token reuse, expiry, and cross-account attempts are rejected,
  and every completed reset revokes all pre-existing sessions.
- **M02-SC-006**: Credential storage inspection and tests find zero recoverable passwords, and
  verification of a stored password succeeds while the plaintext is absent from all storage, responses,
  and logs.
- **M02-SC-007**: After the documented threshold of failed attempts, further attempts are rejected, the
  lockout is observable and durable across an application restart, and it expires as documented.
- **M02-SC-008**: 100% of exercised security events produce structured, correlated records, and captured
  output inspection finds zero secrets in responses, logs, or durable records.
- **M02-SC-009**: The OpenAPI document and observed behavior agree for 100% of identity endpoints, and
  the contract gate rejects drift and excluded domains.
- **M02-SC-010**: The complete quality and test gate set passes on the accepted baseline and rejects
  each seeded failure category, without requiring repeated identical full verification passes.

## Assumptions

- Session credentials are presented as bearer credentials in the `Authorization` header for this
  API-first milestone. Browser cookie and cross-site request-forgery handling will be decided with the
  storefront milestone; bearer transport avoids introducing a half-specified cookie flow now.
- A time-based one-time password mechanism is the administrator MFA factor, chosen because it is
  compatible with common authenticator applications, needs no external service, and satisfies the
  constitutional MFA mandate.
- Administrator accounts are provisioned through a documented, guarded operational command because the
  launch operating model has one administrator (HC-PRJ-003) and no administrative self-registration.
- Passwords are checked against a policy and a small local deny-list only. Breach-corpus or compromise
  checking would require an approved external service and is therefore deferred.
- Email verification is not implemented and accounts are usable immediately; HC-DEC-002 remains Open and
  is recorded as a review trigger, not resolved silently (HC-IAM-008).
- Customer profile management, addresses, wishlists, and account-deletion/export workflows belong to the
  Customers module and later milestones; HC-DEC-003 remains Open.
- Password-reset delivery uses a notification boundary with non-production transports only; real
  delivery remains blocked by HC-DEC-014.
- Rate-limit counters may be process-local for single-instance operation, while lockout state is durable;
  multi-instance coordination would require a documented decision under the constitution.
- The milestone targets local and continuous-integration operation, not production topology or a
  service-level agreement (HC-DEC-016 remains the authority).

## Open Dependencies

| Decision | Status | Effect on this milestone | Review trigger |
| --- | --- | --- | --- |
| HC-DEC-002 Customer email verification policy | Open | No verification is implemented; accounts are usable immediately and verification status is never asserted. | Before release of identity flows or any abuse-control change. |
| HC-DEC-003 Privacy export, deletion, retention | Open | No profile, export, or deletion workflow is implemented. | Before customer-data-lifecycle work. |
| HC-DEC-014 Notification channels for recovery | Open | Recovery token lifecycle is implemented, but only non-production transports are permitted; production delivery is deferred. | Before real recovery delivery or any transactional message. |
| HC-DEC-001 V1 release scope | Open | This milestone is authorized as one slice; it does not define overall V1 scope. | At V1 release planning. |
| HC-DEC-016 Capacity and operational targets | Open | No production throughput, availability, or topology commitment is made. | Before capacity or load planning. |
