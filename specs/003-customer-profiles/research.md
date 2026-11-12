# Phase 0 Research: Milestone 03 - Customer Profiles

## Research Scope

This document resolves the technical choices required by the reviewed specification
([spec.md](./spec.md)). Decisions stay inside the Customer Profiles capability and do not resolve
HC-DEC-001 through HC-DEC-017. Every dependency decision is evaluated against the constitution's
Simplicity Before Distribution principle and the requirement to justify each dependency against a
simpler alternative.

## Decision 1: Identity Integration and Module Boundary

**Decision**: The Customers module integrates with Identity and Access exclusively through the
accepted **platform authorization contract** — the global guard chain, `@Roles('CUSTOMER')`,
`@CurrentPrincipal()`, and the `AuthenticatedPrincipal` type in `platform/security`. It imports nothing
from `modules/identity`, and it stores the customer's identity identifier as a plain foreign identifier
with **no** database foreign key to `users`.

**Rationale**: Constitution I permits a module to retain stable foreign identifiers while forbidding it
from querying or mutating another module's tables. The accepted session guard already resolves and
cryptographically verifies a principal that carries the user identifier, the role, and the session
identifier, so a second identity lookup would add a cross-module call and a failure mode without
adding trust. Refusing administrators at the role boundary also stops the MFA-protected administrative
role from reaching storefront data through this module. A cross-module foreign key was rejected because
it would couple the two modules' schema evolution, and because the only behavior that would exercise it
(account deletion) is explicitly unresolved under HC-DEC-003; the residual orphan risk is recorded as
M03-TECH-001 with that review trigger.

**Alternatives considered**:

- Import a published identity read contract to re-verify the account on every request: rejected as
  redundant work that duplicates the session guard's guarantee and creates a feature-to-feature
  dependency the boundary checker exists to prevent.
- A foreign key from `customer_profiles.user_id` to `users.id` with `ON DELETE CASCADE`: rejected for
  this milestone because it would silently encode a deletion/retention policy while HC-DEC-003 is Open,
  and because it makes one module's migrations depend on another module's table.
- Putting the profile on the `users` table: rejected; it would put storefront personal data inside the
  Identity and Access module and break the ownership rule that milestone established.

## Decision 2: Resource Addressing — `/customers/me/...`

**Decision**: Customer routes are addressed relative to the authenticated principal:
`/api/v1/customers/me/profile` and `/api/v1/customers/me/addresses[/{addressId}][/default]`. No route
accepts a customer identifier.

**Rationale**: Constitution III requires authorization against the target resource scope, and M03-SC-003
requires that cross-customer access be denied. If the client cannot name a customer, cross-customer
access is not merely denied but structurally unreachable, which is a stronger property than a
correctly-written ownership check. Address identifiers remain in the path because they are sub-resources,
and every statement that resolves one also filters by the principal's profile, so a foreign or unknown
identifier produces the same standard safe not-found answer and nothing is disclosed.

**Alternatives considered**:

- `/customers/{customerId}/addresses` with an ownership check: rejected because it invites an
  identifier-tampering class of defect and requires every future handler to remember the scope check.
- An administrative `/admin/customers/{id}/...` surface: rejected as out of scope; no approved
  administrator customer-management requirement exists.

## Decision 3: Default Address Representation

**Decision**: The default is a single nullable reference column on the profile,
`customer_profiles.default_address_id`, pointing at one owned address with `ON DELETE SET NULL`. The
address projection exposes a derived `isDefault` boolean.

**Rationale**: "At most one default per customer" (`M03-FR-014`) is then **structural**: a single column
cannot hold two values, so two concurrent designations cannot produce two defaults
(`M03-FR-015`), and no application-level transaction discipline is load-bearing. It also gives deletion a
defined outcome for free: removing the default address nulls the reference, which is exactly the
documented HC-ASM-M03-001 behavior.

**Alternatives considered**:

- A boolean `is_default` column on the address: rejected because the required uniqueness
  (`customer_id` where `is_default`) is not expressible in the Prisma schema, so the invariant would be
  application-maintained and could be violated by two concurrent transactions.
- A separate "default address" table: rejected as unnecessary structure for a single nullable value.
- Deriving the default as "the most recently created address": rejected because it makes the default an
  implicit consequence of unrelated writes instead of an explicit customer choice.

## Decision 4: Profile Creation on First Access

**Decision**: A profile row is created lazily by an atomic upsert keyed by the identity identifier
(`M03-FR-002`, HC-ASM-M03-005), so a customer never needs a creation step and Milestone 02 registration
is untouched.

**Rationale**: Registration lives in another module, and making registration write customers data would
either create a cross-module write or require a published identity event that does not exist. Lazy
creation also avoids a data backfill for accounts that already exist. The upsert makes concurrent first
requests safe (`M03-TECH-007`).

**Alternatives considered**:

- Create the profile during registration: rejected; it crosses the module boundary in the write
  direction and couples a stable identity flow to a new module's schema.
- A one-time backfill migration for existing accounts: rejected as unnecessary when creation is lazy and
  idempotent.
- Return `404` until the customer "creates" a profile: rejected because it adds a step with no value and
  leaks no information either way.

## Decision 5: Attribute Validation and Normalization

**Decision**: Every request body is a Zod **strict** object, so an unknown field is a validation failure
rather than an ignored input (`M03-FR-004`, `M03-FR-020`). Strings are trimmed; an empty or
whitespace-only value for an optional attribute is stored as "not provided"; a country is normalized to
upper case and validated only for its ISO 3166-1 alpha-2 **shape** (`^[A-Za-z]{2}$`); lengths are bounded
per attribute; control characters are rejected. Required attributes are the recipient name, the address
first line, the city, and the country. Optional attributes are the second line, the region, the postal
code, and the phone.

**Rationale**: HC-DEC-005 is Open, so country-specific formatting and mandatory-ness (including whether a
postal code is required) must not be invented (M03-FR-013, HC-ASM-M03-003). Making the optional set
permissive keeps the stored data usable once the decision lands, while the shape checks still reject
nonsense and the bounds keep storage predictable. Strict objects satisfy the mass-assignment rule.

**Alternatives considered**:

- A country allow-list of the launch markets: rejected; it would silently encode HC-DEC-005.
- A postal-code regular expression or a locale-aware validator: rejected for the same reason, and it
  would require a new dependency.
- Accepting and ignoring unknown fields: rejected; it defeats mass-assignment protection and hides client
  mistakes.
- Requiring a postal code: rejected because some destinations have none and the decision is unresolved.

## Decision 6: Error Contract for Customer Failures

**Decision**: Add exactly one code to the closed `AppErrorCode` union: `ADDRESS_NOT_FOUND` (status
`404`). Ownership failures, unknown identifiers, and malformed-but-well-formed identifiers all return it,
with the same status, code, and message, so the response cannot distinguish "exists but not yours" from
"does not exist" (`M03-FR-010`).

**Rationale**: Milestone 02 established a closed union so that an unreviewed code cannot be published;
adding one code is a deliberate, reviewable contract change recorded in
[contracts/customer-api.md](./contracts/customer-api.md). A distinct "forbidden" answer for a foreign
address would confirm the identifier exists, which is the cross-tenant leak the milestone must prevent.
An identifier that fails UUID validation is a boundary `400 VALIDATION_ERROR` (consistent with the
accepted session-identifier route); a well-formed identifier that matches nothing is a uniform `404`.

**Alternatives considered**:

- Returning `403 FORBIDDEN` for a foreign address: rejected; it discloses existence.
- Returning `404 ROUTE_NOT_FOUND`: rejected; it is a routing-layer code and would misdescribe a resolved
  route with a missing resource.
- Removing a resource describing it only with a generic code: rejected; a precise, stable code is more
  useful to a client and equally non-disclosing.

## Decision 7: Abuse Resistance

**Decision**: Two declared policies using the accepted project-owned fixed-window limiter with the
`client` key dimension: a read policy and a write policy applied to every customer route
(`M03-FR-022`). The write policy is the tighter one.

**Rationale**: The limiter runs before session authentication, so the principal is not yet available and
the `client-and-account` dimension used by the identity flows cannot be used here; the `client`
dimension still bounds a single caller's load before any credential or storage work. One read and one
write policy keep the declaration surface small and reviewable. The process-local limitation recorded for
Milestone 02 is unchanged and is recorded again in the spec's operational expectations.

**Alternatives considered**:

- Keying by the authenticated principal: rejected because the guard order makes the principal
  unavailable at limiter time; changing the global guard order would alter an accepted contract.
- No read limit: rejected; `M03-FR-022` requires the customer endpoints to be rate-limited.
- A per-address limit: rejected as unnecessary granularity for a single-instance limiter.

## Decision 8: Personal Data and Observability

**Decision**: Extend the accepted `REDACT_PATHS` with the personal-attribute field names this
capability uses, log only non-sensitive identifiers (profile identifier, address identifier,
correlation identifier), and reuse the accepted `AUTHORIZATION_AUDIT_PORT` for the administrator-denial
decision instead of owning an audit store.

**Rationale**: Constitution X requires observable operations with protected secrets, and personal data
here is sensitive by nature (`M03-FR-024`, M03-SC-006). The authorization-audit port already records
`ADMIN_ACCESS_DENIED` for role failures, which covers the one privileged decision this capability makes,
so adding a parallel audit store would duplicate identity-owned machinery (Decision 1). No domain-level
audit table is introduced because the accepted security-event store is identity-owned and no published
contract for domain events exists; the structured request log plus the authorization audit are the
evidence, and the redaction paths are the guardrail against accidental leakage.

**Alternatives considered**:

- A customers-owned audit table: rejected as a duplicate of identity's audit capability and an
  unattributed new store.
- Publishing a new identity contract so customers can write security events: rejected as scope creep
  beyond this milestone with no approved requirement.
- Logging the submitted address for debugging: rejected outright; it would leak personal data.

## Decision 9: Data Model Ownership and Migration

**Decision**: One create-only migration named `customer_profiles` creates the two Customers-owned tables
and their indexes. Foreign keys are **intra-module only**: `customer_addresses.customer_id` →
`customer_profiles.id` (`ON DELETE CASCADE`) and `customer_profiles.default_address_id` →
`customer_addresses.id` (`ON DELETE SET NULL`).

**Rationale**: Constitution VIII requires reviewed, non-destructive, repeatable migrations with no
startup schema change, which is exactly what a create-only migration reviewed before application
provides. Both foreign keys stay inside the module that owns both tables, so referential integrity is
enforced without a cross-module coupling (`M03-FR-026`, `M03-FR-029`). The cyclic relationship is
expressible because the migration adds constraints after both tables exist, and Prisma names the two
relations explicitly.

**Alternatives considered**:

- A cross-module foreign key to `users`: rejected in Decision 1.
- Storing addresses without integrity constraints and relying on the service: rejected; the database can
  enforce this cheaply.
- A single table holding both profile and address columns: rejected; it would force a false cardinality
  and duplicate profile data per address.

## Decision 10: OpenAPI and Contract-Gate Update

**Decision**: Grow the reviewed operation inventory by the eight customer operations and remove the
`customer` term from the excluded-domain scan in `scripts/openapi-check.mjs`, exactly as `auth` was
removed for Milestone 02. Every other commerce term remains excluded, and the operation-inventory and
authorization-metadata assertions stay exact.

**Rationale**: `M03-FR-031` requires the gate to cover the new surface while still rejecting commerce
domains and drift. Removing one explicitly approved term keeps the guard meaningful for the terms that
are still unapproved, and the exact-inventory assertion ensures the new routes are reviewed rather than
merely tolerated. The gate remains database-free, so CI does not gain a database dependency
(`M03-FR-033`).

**Alternatives considered**:

- Weakening the excluded-domain scan to a warning: rejected; it would remove the guard entirely.
- Adding a separate customer-only allow-list: rejected as unnecessary complexity when the existing list
  is already explicit per term.
- Keeping the `customer` term and renaming the routes to avoid it: rejected; it would produce a
  deliberately obscure API to satisfy a check that exists to describe intent.

## Decision 11: Testing Approach

**Decision**: Extend the existing test projects rather than add new categories: unit specs beside the
code, one consolidated PostgreSQL integration suite, and one consolidated E2E suite, following the
Milestone 02 consolidation that is recorded in the progress record.

**Rationale**: Each Jest file builds its own application and database connection, so one integration
suite and one E2E suite keep the run time and the connection churn bounded while asserting every named
behavior (`M03-FR-...` testing requirements). The rate-limit proof uses a dedicated application
instance in its own `describe` block so that in-memory counters are not polluted by earlier tests and
the assertion does not depend on test ordering.

**Alternatives considered**:

- One spec file per user story: rejected for the same connection-churn reason recorded for Milestone 02.
- Driving the rate limit through the shared application instance: rejected as order-dependent and
  fragile.

## Decision 12: Dependency-Minimization Review

**Decision**: Introduce **no** new runtime or development dependency, no new configuration key, and no
new infrastructure. The capability uses NestJS, Prisma, and Zod as already accepted.

**Rationale**: Every behavior required by the specification — scoped repository queries, a structural
single-default invariant, strict boundary validation, decorator-driven OpenAPI, and the accepted
redaction and rate-limit primitives — is composable from what the repository already depends on.
Constitution XII and `M03-FR-032` require a justified simpler alternative before any dependency is added.

**Alternatives considered**:

- A validation library for addresses (for example a postal-address validator): rejected; it would encode
  HC-DEC-005 and add a dependency for behavior the specification explicitly defers.
- A pagination or serialization helper: rejected; the address set is small and deterministic ordering is
  sufficient.
- A separate audit library: rejected; the accepted structured logging and audit port are sufficient
  (Decision 8).
