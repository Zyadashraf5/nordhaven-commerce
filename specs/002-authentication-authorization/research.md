# Phase 0 Research: Milestone 02 - Authentication & Authorization

## Research Scope

This document resolves the technical choices required by the reviewed specification
([spec.md](./spec.md)). Decisions stay inside the Identity and Access capability and do not resolve
HC-DEC-001 through HC-DEC-017. Every dependency decision is evaluated against the constitution's
Simplicity Before Distribution principle and the requirement to justify each dependency against a
simpler alternative.

## Decision 1: Session Mechanism and Credential Transport

**Decision**: Use opaque, high-entropy session credentials (256-bit random, base64url) stored
server-side in PostgreSQL as a SHA-256 hash, delivered to the client once in the JSON response and
presented afterwards as `Authorization: Bearer <token>`. Sessions carry both an absolute expiry and
an idle expiry, can be revoked individually or as a group, and are looked up by token hash under a
unique index. Rich client metadata is limited to a sanitized, truncated client label derived from
`User-Agent`; the client IP address is not persisted.

**Rationale**: The approved product fact HC-IAM-005 requires simultaneous sessions on multiple
devices, and Constitution II requires session expiry and revocation. A server-side session record
makes revocation authoritative and immediate, which a self-contained signed token cannot do without
an additional revocation store. Storing only a hash means a database disclosure does not yield usable
session credentials. Bearer transport avoids inventing a browser cookie and cross-site
request-forgery posture before the storefront milestone defines a browser client; it also keeps
Supertest and future native clients straightforward. Omitting the client IP keeps stored personal
data minimal (M02-FR-040).

**Alternatives considered**:

- Signed self-contained tokens (JWT) with a revocation list: rejected because it introduces a
  signing-key lifecycle, a second credential format, and a revocation store that duplicates what a
  session table already provides, with no benefit for a single modular-monolith instance.
- `HttpOnly` cookie sessions: rejected for this milestone because it forces a cookie/CSRF decision
  (SameSite, CSRF tokens, cross-site deployment topology) that depends on the unbuilt storefront;
  a half-specified cookie flow would be less safe than a well-specified bearer flow.
- Storing the raw session token: rejected; it fails the non-reversible-storage requirement.
- Stateless in-memory sessions: rejected; they cannot survive a restart and cannot be revoked
  authoritatively.

**Evidence**:

- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [Node.js `crypto.randomBytes`](https://nodejs.org/api/crypto.html#cryptorandombytessize-callback)

## Decision 2: Password Hashing

**Decision**: Hash passwords with the Node.js core `crypto.scrypt` key-derivation function using
`N = 2^15` (32768), `r = 8`, `p = 1`, a 16-byte random salt, a 64-byte derived key, an explicit
`maxmem` bound, and a versioned self-describing storage format
(`scrypt$v=1$N=32768,r=8,p=1$<salt-b64>$<hash-b64>`). Verification parses the stored parameters, so
future parameter increases remain backward compatible. Password inputs are bounded to 12–256
characters and compared in constant time. When an account does not exist, the service still performs
one dummy scrypt verification against a fixed embedded hash so failure timing does not reveal account
existence.

**Rationale**: `scrypt` is a memory-hard, salted KDF available in the Node.js standard library, so it
satisfies the "proven, maintained mechanism" requirement with **no new dependency** and therefore no
supply-chain addition. The parameters are memory-hard (about 32 MiB per verification) and were chosen
to keep a single verification near or below 250 ms on the accepted development host while remaining
above the OWASP-recommended scrypt floor. A versioned storage string allows a later parameter
increase without a flag day.

**Alternatives considered**:

- `argon2` / `@node-rs/argon2`: strong OWASP first choice, but adds a native or prebuilt binary
  dependency and its own release cadence; rejected against the dependency-minimization requirement
  when a memory-hard KDF already ships in the runtime.
- `bcrypt`/`bcryptjs`: accepted by OWASP, but `bcryptjs` is pure JavaScript and slow in a way that
  weakens the cost/throughput trade-off, and `bcrypt` adds a native dependency; no advantage over
  `scrypt`.
- `PBKDF2`: not memory-hard; weaker against GPU/ASIC attackers.
- Undocumented or unversioned parameters: rejected; they prevent safe future cost increases.

**Evidence**:

- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [Node.js `crypto.scrypt`](https://nodejs.org/api/crypto.html#cryptoscryptpassword-salt-keylen-options-callback)

## Decision 3: Time-Based One-Time Password (Administrator MFA)

**Decision**: Implement RFC 6238 TOTP with RFC 4226 HOTP truncation directly on Node.js core
`crypto` (HMAC-SHA-1, 30-second step, 6 digits) with a ±1 step acceptance window, RFC 4648 base32
secret encoding, and replay protection that persists the last accepted time step per administrator.
Correctness is proved with the official RFC 6238 Appendix B test vectors, including the
SHA-1 vectors used by common authenticator applications.

**Rationale**: Constitution II mandates multi-factor authentication for every administrative account.
TOTP is compatible with standard authenticator applications, requires no external service, and is a
small, fully specified algorithm. Implementing it against the published test vectors gives verifiable
conformance without adding a dependency, and replay protection is a requirement this project must own
anyway.

**Alternatives considered**:

- `otplib`: a maintained library that would also satisfy the requirement, but it would add a
  dependency for roughly seventy lines of well-specified, test-vector-verifiable code; rejected under
  dependency minimization.
- WebAuthn/passkeys: stronger against phishing, but requires a browser ceremony and relying-party
  decisions that belong to a later frontend milestone; not required by the constitution's wording.
- Email or SMS one-time codes: blocked by HC-DEC-014 and weaker than a possession factor.

**Evidence**:

- [RFC 6238 - TOTP](https://www.rfc-editor.org/rfc/rfc6238)
- [RFC 4226 - HOTP](https://www.rfc-editor.org/rfc/rfc4226)
- [RFC 4648 - Base32](https://www.rfc-editor.org/rfc/rfc4648)
- [OWASP Multifactor Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)

## Decision 4: Protection of MFA Secrets and Recovery Codes

**Decision**: Encrypt each TOTP secret at rest with AES-256-GCM using a 256-bit key supplied through
the validated `AUTH_ENCRYPTION_KEY` configuration value; store a versioned `v1:<iv>:<tag>:<ciphertext>`
representation. Never return the secret except once during enrollment confirmation, never log it, and
never include it in an error. Hash administrator recovery codes with SHA-256, store them non-reversibly,
display them exactly once at enrollment, and mark a code used on first success.

**Rationale**: Constitution II forbids storing authentication secrets or recovery material in
plaintext. GCM provides authenticated encryption from the standard library. Making the key a required
configuration value means the application cannot start in a state where it would persist an
unprotectable secret, and configuration diagnostics name the missing key without printing a value.

**Alternatives considered**:

- Plaintext or reversibly encoded secret: rejected by the constitution.
- Hashed TOTP secret: impossible; the server must recompute codes.
- A dedicated secrets manager or KMS: correct for a deployed environment but outside this milestone's
  local scope and blocked by HC-DEC-016.
- Deriving the key from `DATABASE_URL`: rejected; it ties two unrelated secrets together and weakens
  rotation.

## Decision 5: One-Time Token Mechanism

**Decision**: Use one Identity-owned `identity_tokens` table with a `purpose` column
(`PASSWORD_RESET`, `MFA_ENROLLMENT`, `MFA_VERIFICATION`) for every short-lived single-use token. Each
row stores only a SHA-256 token hash, an expiry, a consumption timestamp, and an invalidation
timestamp. Password-reset requests invalidate any outstanding token of the same purpose for the user
before issuing a new one.

**Rationale**: Password recovery, administrator MFA enrollment, and administrator MFA sign-in
challenge all need the same lifecycle: random token, hash-only storage, bounded lifetime, single use,
and explicit invalidation. One well-tested implementation satisfies M02-FR-027 without triplicating
mechanics, and the `purpose` discriminator prevents a token from being replayed against a different
flow.

**Alternatives considered**:

- Three near-identical tables: rejected as duplication with a higher chance of divergent bugs.
- Storing challenges in memory: rejected because an MFA or reset flow must survive a restart within
  its lifetime and because revocation/all-request invalidation must be authoritative.
- Reusing the session table for challenges: rejected; challenges carry no authentication authority
  and mixing them with authoritative sessions invites privilege confusion.

## Decision 6: Rate Limiting and Account Lockout

**Decision**: Implement a project-owned fixed-window in-memory limiter, exposed as a
`RateLimitGuard` with a per-route `@RateLimit(...)` declaration and a composite key of client address
plus, where supplied and known, the normalized account identifier. Separately, persist failed
sign-in counts and a `lockedUntil` bound on the account so lockout survives a restart. A locked
account is answered with exactly the same status, code, and message as an invalid credential, and the
service still performs a dummy hash verification, so lockout adds no account-existence or timing
signal. Exceeding the client rate limit returns a stable `429` with `Retry-After` that does not depend
on whether the account exists.

**Rationale**: Constitution II requires resistance to brute-force attacks. The two mechanisms cover
different attacks: the in-memory limiter bounds a single abusive client across all accounts, and the
durable account counter bounds a distributed attack against one account while remaining effective
across restarts. A project-owned limiter gives exact per-route and per-account semantics, bounded
memory with deterministic pruning, and no new dependency; single-instance scope is acceptable for the
approved modular monolith and is documented as a limitation.

**Alternatives considered**:

- `@nestjs/throttler`: the official Nest package and a reasonable choice, but it adds a dependency and
  still requires a custom key generator, durable lockout, and equivalent tests; rejected against the
  dependency-minimization requirement.
- Redis/`rate-limiter-flexible`: rejected; Redis is explicitly excluded by the constitution's
  simplicity principle for this milestone.
- Lockout only (no rate limit): rejected; it leaves an unauthenticated resource-exhaustion path and
  cannot bound distributed attempts.
- Returning a distinct "account locked" error: rejected because it discloses account existence.

## Decision 7: Error Contract for Identity Failures

**Decision**: Add a project-owned `AppError` class in `platform/http` carrying an HTTP status, a
code from a closed TypeScript union of identity/platform error codes, a short constant safe message,
optional non-sensitive validation details, and an optional `Retry-After` value. Extend the existing
`SafeExceptionFilter` so that `AppError` instances contribute their code, message, header, and details,
while every other exception keeps the Milestone 01 mapping. Extend the shared `ErrorResponse`
contract with the enumerated codes.

**Rationale**: The Milestone 01 filter deliberately maps by status only, so a `401` would otherwise be
published as `VALIDATION_ERROR`. A closed union makes unreviewed codes a compile error, keeps messages
out of request data, and preserves the existing behavior (and its tests) for unclassified failures.
Constitution III requires stable, non-sensitive, contract-declared errors.

**Alternatives considered**:

- Mapping codes inside the filter by status: cannot express `UNAUTHENTICATED` versus
  `INVALID_CREDENTIALS` versus `FORBIDDEN`, all of which are needed for correct client behavior.
- Accepting arbitrary `code`/`message` strings from exception bodies: rejected; it lets request-derived
  text reach error bodies and risks leaking internal detail.
- A new error taxonomy package: rejected; over-engineered for one module.

## Decision 8: Secure-by-Default Authorization Enforcement

**Decision**: Enforce authorization with global guards registered in explicit order in the root
composition: availability (reject business requests while not ready), then session authentication
(resolve and validate the bearer session, reject unauthenticated access unless the route is
`@Public()`), then role authorization (`@Roles('ADMIN')`). The shared decorators, the principal type,
the role vocabulary, and the session-authenticator interface live in `platform/security`; the Identity
module supplies the concrete authenticator. Health routes and the unauthenticated authentication entry
points are the only `@Public()` routes.

**Rationale**: Constitution III requires server-side enforcement for every protected operation.
Defaulting to protected means a newly added route is safe by omission rather than exposed by
forgetting a decorator. Registering the guards in one place in the root composition removes
cross-module ordering ambiguity and lets a test prove that an outage is reported as `503` before an
unauthenticated `401`. Keeping the vocabulary in `platform/security` lets the Health module mark
itself public without depending on the Identity module, preserving module boundaries.

**Alternatives considered**:

- Per-controller `@UseGuards`: rejected; a missing decorator silently exposes a route.
- Registering each guard in its owning feature module: rejected because global-guard order across
  modules is not explicit enough to guarantee the `503`-before-`401` requirement.
- Putting decorators and the principal type inside the Identity module: rejected; it would force the
  Health module to import another feature module's contract for an infrastructure concern.

## Decision 9: OpenAPI Generation Approach

**Decision**: Switch `createOpenApiDocument` from a hand-authored path object to decorator-driven
generation through `SwaggerModule.createDocument`, followed by deterministic post-processing that
(1) asserts the route inventory equals an explicit Milestone 02 allowlist, (2) normalizes every
schema with `additionalProperties: false`, (3) replaces every `4xx`/`5xx` schema with a shared
`ErrorResponse` component, and (4) adds the correlation header to every response. The drift gate and
observed-response validation remain unchanged, and the excluded-domain scan keeps rejecting every
commerce term while allowing the now-authorized identity terms.

**Rationale**: Sixteen operations with typed bodies make a hand-authored document a duplication
hazard: the decorators already exist on the Health DTOs and controller, and every identity DTO needs
`@ApiProperty` for generation anyway. Decorator-driven generation makes the application the single
executable source of truth, while the explicit inventory assertion and post-processing keep the
deterministic, tight contract that Milestone 01 relied on. Observed-response validation proves the
document still describes real behavior.

**Alternatives considered**:

- Hand-authoring twelve more paths in `platform/openapi`: rejected; the duplication cost grows with
  every endpoint and the document would drift from the DTOs silently.
- Pure decorator output with no post-processing: rejected; it would lose the `additionalProperties:
  false` strictness and the uniform error component.
- Splitting per-module contract fragments: rejected as unnecessary indirection for one application.

## Decision 10: Password Reset Delivery Boundary (HC-DEC-014 constrained)

**Decision**: Define a `NotificationPort` in the Identity module with a message type limited to
security notifications, plus two shipped transports: an in-memory transport used by tests, and a
file-system transport that writes a JSON artifact under the `tmp/` directory (already ignored by
version control) for local development. Configuration selects the transport, and the environment
schema refuses the file transport when `NODE_ENV=production`. When no transport is configured the
reset request still returns the uniform response, no recovery material is logged, and a single
non-sensitive warning event records that delivery was skipped.

**Rationale**: The Product Owner decided on 2026-10-19 that the complete token lifecycle ships now
while real delivery stays blocked by HC-DEC-014. A port keeps the future channel decision isolated to
one adapter, and refusing the file transport in production means the development convenience can never
become a production delivery path by accident. Logging only a delivery-skipped event protects
recovery material, which the constitution forbids storing or logging in plaintext.

**Alternatives considered**:

- Logging the reset token for local use: rejected outright; it violates the constitutional
  prohibition on logging recovery material.
- Direct SMTP integration: rejected; it would approve a channel that HC-DEC-014 leaves open.
- Deferring password reset entirely: rejected by the Product Owner's 2026-10-19 decision.

## Decision 11: Administrator Provisioning

**Decision**: Provide a guarded operational script, `pnpm identity:create-admin`, that creates an
administrator account with an unconfirmed MFA state. The password is read from a required environment
variable and never accepted as a command-line argument, never echoed, and never logged. The script
refuses to run against a production `NODE_ENV` without an explicit confirmation variable, refuses
duplicate email addresses, and prints only the created identifier and the next enrollment step.

**Rationale**: Public administrator self-registration must not exist (M02-FR-025), and the launch
operating model has exactly one administrator (HC-PRJ-003), so a documented, deliberate, auditable
provisioning path is the minimal correct capability. Avoiding the password on the command line keeps
it out of shell history and process listings.

**Alternatives considered**:

- Seeding an administrator in a migration: rejected; it embeds a credential in version control and
  cannot be safely rotated.
- An admin sign-up endpoint gated by invite codes: rejected; it adds an unauthenticated surface and an
  unapproved invitation policy.
- Manual SQL: rejected; it bypasses hashing, validation, and audit rules.

## Decision 12: Dependency-Minimization Review

**Decision**: Milestone 02 adds **no** new runtime or development dependency.

| Capability | Mechanism | Alternative rejected |
| --- | --- | --- |
| Password hashing | Node core `crypto.scrypt` | `argon2`, `bcrypt` |
| Session and reset tokens | Node core `crypto.randomBytes` + SHA-256 | `uuid` + JWT libraries |
| MFA secret protection | Node core `crypto` AES-256-GCM | KMS/secret manager |
| TOTP | Node core `crypto` HMAC-SHA-1 against RFC 6238 vectors | `otplib` |
| Rate limiting | Project-owned fixed-window limiter | `@nestjs/throttler`, Redis |
| Authorization | Project-owned guards and decorators | `passport`, `@nestjs/passport` |
| Validation and configuration | Existing Zod 4 integration | class-validator |

**Rationale**: Every capability above is either a small, fully specified algorithm or an
infrastructure concern that the project already owns, and each alternative adds a dependency whose
benefit is smaller than the cost under the Simplicity Before Distribution principle. The result is
that the existing supply-chain and audit gates remain unchanged.

## Decision 13: Data Model Ownership, Migration, and Test Isolation

**Decision**: Add the Identity-owned tables through a single reviewed create-only migration named
`identity_access`, applied with the documented development command and replayed with `migrate deploy`
against the isolated `nordhaven_integration` and `nordhaven_e2e` databases. Integration and E2E suites
continue to pass the existing environment/host/name guards, run serially, and clean only their own
identity rows. Business tables are documented as owned by the Identity module; no other module may
read or write them.

**Rationale**: Constitution VIII requires safe, reviewed, repeatable migration. A single additive
migration that creates new tables and types is non-destructive and safe to replay. Keeping the
existing test databases preserves the Milestone 01 isolation contract and the guard tests that
enforce it.

**Alternatives considered**:

- `prisma db push`: prohibited by the Milestone 01 decision and the constitution.
- One migration per table: unnecessary; the tables are introduced together and have no backfill.
- Sharing the development database with tests: rejected; it is unsafe and non-reproducible.

## Decision 14: Security Logging and Durable Audit Records

**Decision**: Emit every enumerated security event as a structured, correlated log line and persist
the same non-sensitive facts to an Identity-owned `security_events` table. Persistence failures are
caught, logged as a non-sensitive failure event, and never change the authentication outcome. Event
detail is a closed, non-sensitive shape; passwords, session credentials, MFA secrets and codes,
recovery codes and tokens, authorization headers, and connection strings are never included. Redaction
paths are extended to cover identity-specific secret field names.

**Rationale**: Constitution X requires observable operations and protected secrets, and Constitution
II requires privileged actions to be auditable. Structured logs alone would satisfy local diagnosis but
not a durable audit trail for administrative actions, and the Audit and Operations capability does not
exist yet. Recording the facts inside the module that owns them keeps the module boundary intact and
leaves a future Audit module free to consume or supersede the table.

**Alternatives considered**:

- Logs only: rejected; administrative actions would not be durably auditable.
- A new platform audit module now: rejected; it would invent a capability outside the approved
  Milestone 02 scope and duplicate the future Audit module.
- Recording full request bodies for audit: rejected; it would persist secrets and personal data.
