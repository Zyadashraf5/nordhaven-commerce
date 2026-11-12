# Feature Specification: Milestone 03 - Customer Profiles

**Feature Branch**: Not created; no `before_specify` branch hook is configured and the repository has
no commits yet

**Created**: 2026-10-19

**Status**: Draft for review; Product Owner authorized Milestone 03 implementation on 2026-10-19

**Approval**: Product Owner authorization on 2026-10-19 covers starting and implementing Milestone
03. It does not resolve or approve HC-DEC-001 through HC-DEC-017. Milestone 01 (Foundation) and
Milestone 02 (Authentication & Authorization) are accepted for local development; hosted continuous
integration remains deferred and NOT VERIFIED.

**Input**: User description: "Milestone 03: Customer Profiles for Nordhaven Commerce - authenticated
customers manage their own profile and save multiple shipping addresses with one default address,
securely integrated with the existing Identity and Access module, with validation, migrations, unit,
integration, E2E, and authorization/security tests."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Maintain My Own Profile (Priority: P1)

A signed-in customer opens their profile and sees the delivery details the storefront holds for them
(name and contact phone), and can correct or complete them at any time. The profile is private: the
customer only ever sees and changes their own.

**Why this priority**: A reusable customer profile is the minimum customer-scoped data the storefront
and the later checkout journey need, and it is the first capability that must reuse the accepted
Identity and Access authorization model for a resource other than identity itself.

**Independent Test**: Sign in as a customer, read the profile, change the mutable attributes, re-read
to confirm they persisted, and confirm a second customer sees only their own profile and that an
administrator and an anonymous caller are refused.

**Acceptance Scenarios**:

1. **Given** an authenticated customer who has never opened a profile, **When** the customer retrieves
   their profile, **Then** the response describes an existing, empty profile that belongs to them and
   no error is required to "create" it first.
2. **Given** an authenticated customer, **When** the customer updates supported profile attributes,
   **Then** the change is persisted and returned, and unsupported or unknown fields are rejected.
3. **Given** an authenticated customer, **When** the customer retrieves or updates their profile,
   **Then** the operation never reads or writes another customer's profile.
4. **Given** a customer who supplies a value that violates a documented rule, **When** the request is
   rejected, **Then** the response uses the standard safe error envelope and never echoes the rejected
   value.

---

### User Story 2 - Save and Manage Shipping Addresses (Priority: P1)

A customer saves one or more shipping addresses, reviews the saved set, corrects an address, and
removes an address they no longer need. Every operation is limited to the customer's own addresses.

**Why this priority**: HC-IAM-004 approves multiple saved shipping addresses as a product fact, and a
shipping address is a prerequisite for the cart, checkout, and order capabilities that follow.

**Independent Test**: Create three addresses for one customer, list them, read one by its identifier,
update one, delete one, and confirm a second customer cannot read, update, delete, or claim any of the
first customer's addresses.

**Acceptance Scenarios**:

1. **Given** an authenticated customer, **When** the customer saves an address with the documented
   required attributes, **Then** the address is stored against that customer only and returned with a
   stable identifier.
2. **Given** a customer with saved addresses, **When** the customer lists their addresses, **Then**
   only their own addresses are returned, ordered deterministically, and never another customer's.
3. **Given** an address that belongs to another customer, **When** it is requested, updated, deleted,
   or claimed as default, **Then** the operation is denied with the standard safe not-found error and
   the response does not disclose that the address exists.
4. **Given** a customer who supplies an incomplete or malformed address, **When** the request is
   rejected, **Then** the response uses the standard safe error envelope and never echoes the value.

---

### User Story 3 - Select a Default Shipping Address (Priority: P2)

A customer with more than one saved address designates exactly one as the default, and can change that
choice at any time.

**Why this priority**: HC-IAM-004 explicitly requires a selectable default address; it removes an
avoidable decision from the later checkout journey.

**Independent Test**: Create several addresses, set different ones as default in turn, confirm exactly
one default is reported at every step, and confirm deleting the default leaves a defined, consistent
state.

**Acceptance Scenarios**:

1. **Given** a customer whose first saved address is the default, **When** the customer designates a
   different address as default, **Then** exactly one address is reported as default afterwards.
2. **Given** a customer with no saved addresses, **When** the customer saves the first address, **Then**
   that address becomes the default automatically (recorded assumption HC-ASM-M03-001).
3. **Given** a customer, **When** the current default address is deleted, **Then** the default selection
   is cleared and no other address is silently promoted.
4. **Given** two concurrent requests that each set a different address as default, **When** both
   complete, **Then** the customer still has exactly one default.

---

### User Story 4 - Private by Construction and Auditable (Priority: P2)

Operators and reviewers can demonstrate that customer data is private by construction: the API never
accepts a customer identifier from a caller, every query is scoped to the authenticated principal,
denials are uniform, and personal data never leaks into logs or error bodies.

**Why this priority**: The constitution (III, X, XI) requires server-side trust enforcement and
non-sensitive observability; cross-tenant leakage is the highest-severity defect this milestone could
ship.

**Independent Test**: Attempt every operation anonymous, as an administrator, and as a second customer
against the first customer's resources; inspect responses for uniformity and captured logs for personal
data; drive the documented rate limits past their threshold.

**Acceptance Scenarios**:

1. **Given** an anonymous caller, **When** any customer operation is attempted, **Then** it is refused
   as unauthenticated with the standard safe envelope.
2. **Given** an authenticated administrator, **When** any customer-scoped operation is attempted,
   **Then** it is refused with the standard safe authorization error and recorded as an authorization
   decision.
3. **Given** any customer operation, **When** the server resolves the target resource, **Then** it uses
   the authenticated principal's identity only, and no customer-supplied identifier can widen access.
4. **Given** any customer request that is logged or rejected, **Then** personal attributes (name, phone,
   and address lines) never appear in structured logs, error bodies, or durable records.
5. **Given** repeated customer requests, **When** the documented limit is exceeded, **Then** the caller
   receives a bounded safe rejection with a retry hint.

---

### Edge Cases

- Two requests retrieve the profile of a customer who has never had a profile row; only one profile is
  created.
- An attribute is cleared by sending an explicit null or an empty/whitespace-only string.
- A name or address line is at the minimum or maximum documented length, contains non-ASCII characters,
  or contains control characters.
- An address declares a country code that is shaped correctly but not in any locally configured list.
- An address omits every optional attribute.
- A customer supplies an unknown field, a duplicate field, or a nested value where a scalar is expected.
- A session is valid when the request begins but the customer is no longer resolvable.
- The database is temporarily unavailable during a customer read or write.
- A caller guesses the identifier of another customer's address, or of an address that never existed.
- Two requests set two different defaults for the same customer concurrently.
- A request arrives during graceful shutdown.
- An unexpected error contains a personal attribute that must never reach a response or a log field.

## Requirements *(mandatory)*

### Scope Boundaries

This milestone delivers the Customer Profiles capability only: self-service reads and updates of an
authenticated customer's own profile, and self-service create, list, read, update, delete, and default
selection of that customer's own saved shipping addresses. It reuses the accepted Identity and Access
authorization model without changing it.

Explicitly out of scope: account deletion, data export, retention and compliance workflows (HC-DEC-003);
email verification (HC-DEC-002); real notification delivery (HC-DEC-014); wishlist ownership; catalog,
products, inventory, bundles, cart, checkout, orders, payments, pre-orders, shipping-rate calculation,
reviews, tax, and every other commerce module. No new infrastructure, external provider, paid service,
or dependency is introduced.

HC-DEC-001 through HC-DEC-017 MUST NOT be resolved, encoded, or assumed. Where a requirement depends
on an open decision, this specification records the dependency and its review trigger instead of
selecting behavior silently.

### Functional Requirements

**Profile**

- **M03-FR-001**: An authenticated customer MUST be able to retrieve their own customer profile.
- **M03-FR-002**: A customer profile MUST exist for any authenticated customer who reaches the
  capability, without requiring a separate creation step, and MUST be unique per customer.
- **M03-FR-003**: An authenticated customer MUST be able to update the supported mutable profile
  attributes (a display name and a contact phone) while attributes the customer does not own — role,
  account identity, and any future administrative field — MUST NOT be settable through this capability.
- **M03-FR-004**: Profile attributes MUST be validated and normalized at the API boundary; unsupported
  or unknown fields MUST be rejected rather than ignored, and an explicitly empty value MUST be stored
  as "not provided" rather than as an empty string.
- **M03-FR-005**: Profile reads and writes MUST be available to the customer role only; administrator
  principals MUST be refused with the standard safe authorization error.

**Saved shipping addresses (HC-IAM-004)**

- **M03-FR-006**: An authenticated customer MUST be able to save more than one shipping address.
- **M03-FR-007**: Saving an address MUST require the documented required attributes and MUST accept the
  documented optional attributes as absent.
- **M03-FR-008**: An authenticated customer MUST be able to list their own saved addresses in a
  deterministic order, and the list MUST never contain another customer's address.
- **M03-FR-009**: An authenticated customer MUST be able to retrieve one of their own saved addresses by
  its identifier.
- **M03-FR-010**: A request for an address that does not exist, or that belongs to another customer,
  MUST be refused with the same standard safe not-found error, so the response never discloses another
  customer's data or whether a guessed identifier exists.
- **M03-FR-011**: An authenticated customer MUST be able to update an address they own; a partial update
  MUST leave omitted attributes unchanged and MUST be able to clear an optional attribute.
- **M03-FR-012**: An authenticated customer MUST be able to delete an address they own, and deleting an
  address that is the current default MUST leave the documented, consistent default state.
- **M03-FR-013**: A country MUST be stored as an ISO 3166-1 alpha-2-shaped code. The set of supported
  countries MUST NOT be restricted to a locally approved list while HC-DEC-005 remains Open, and
  country-specific address validation MUST NOT be invented.

**Default address selection (HC-IAM-004)**

- **M03-FR-014**: At most one saved address per customer MUST be the default, and the customer MUST be
  able to designate any address they own as the default at any time.
- **M03-FR-015**: The default selection MUST be enforced so that two concurrent designations cannot
  leave two defaults for one customer.
- **M03-FR-016**: The documented default-selection behavior — the first address a customer saves becomes
  the default, and deleting the default clears the selection rather than promoting another address —
  MUST be recorded as an explicit assumption (HC-ASM-M03-001) with a review trigger.

**Authorization and isolation**

- **M03-FR-017**: Every customer operation MUST be authorized on the server against the authenticated
  principal and the resource scope, with no customer identifier accepted from the caller; the resource
  scope MUST be derived from the principal only (Constitution III).
- **M03-FR-018**: No customer MUST be able to read, change, delete, or claim another customer's profile
  or addresses; every such attempt MUST use the standard safe error and MUST be covered by
  negative-path tests.
- **M03-FR-019**: Authorization decisions for this capability MUST be enforced by the platform guards
  and MUST NOT rely on any client-supplied role or identifier.

**Validation, abuse resistance, and safe errors**

- **M03-FR-020**: Every externally supplied value MUST be validated and normalized at the API boundary
  with strict object schemas, so an unexpected field cannot enable mass assignment.
- **M03-FR-021**: All customer responses and failures MUST use the existing standard safe error
  envelope with stable machine-readable codes, and MUST NOT expose stack traces, internal identifiers,
  or database error text.
- **M03-FR-022**: Customer endpoints MUST be rate-limited, returning a bounded safe rejection with a
  retry hint when a documented limit is exceeded.

**Personal data and observability**

- **M03-FR-023**: Stored customer data MUST be minimized to what the profile and saved addresses
  require; account identity attributes remain owned by Identity and Access and MUST NOT be duplicated.
- **M03-FR-024**: Personal attributes (names, phone numbers, address lines, postal code, and city) MUST
  NOT appear in structured logs, error bodies, or durable records, consistent with the existing
  redaction convention; only non-sensitive identifiers may be recorded.
- **M03-FR-025**: No deletion-request, export, retention, or compliance behavior MUST be implemented or
  asserted while HC-DEC-003 remains Open.

**Data ownership and evolution**

- **M03-FR-026**: Customer persistence MUST be owned by the Customers module and accessed only through
  Prisma within that module; no other module may read or write its tables, and the module MUST expose
  deliberate public contracts only.
- **M03-FR-027**: The module MUST retain the authenticated customer's stable identity reference as a
  foreign identifier only, and MUST NOT query or mutate the Identity and Access tables.
- **M03-FR-028**: Schema changes MUST ship as reviewed, repeatable, non-destructive Prisma migrations
  that are safe for existing data; application startup MUST NOT create, reset, or destructively alter
  the schema.
- **M03-FR-029**: Customer-owned data MUST be removed when its owning customer profile is removed, so
  no address can outlive its profile; no customer-initiated removal workflow is introduced.

**API and contract**

- **M03-FR-030**: Customer endpoints MUST be versioned REST under the existing `/api/v1` convention and
  MUST be accurately described in the OpenAPI contract, including the authentication scheme, request
  and response schemas, statuses, and error envelope.
- **M03-FR-031**: The OpenAPI contract gate MUST be updated to cover the customer surface while
  continuing to reject drift, unversioned business routes, and still-excluded commerce domains.

**Platform and dependencies**

- **M03-FR-032**: This milestone MUST NOT introduce Redis, a queue, a broker, a microservice, a search
  engine, an external service, or any new runtime or development dependency.
- **M03-FR-033**: Existing foundation behavior — configuration validation, liveness/readiness,
  structured correlated logging, safe errors, graceful shutdown, module boundaries, and the Identity
  and Access behavior — MUST continue to hold after this milestone.

### Key Entities

- **Customer profile**: The storefront-facing data one authenticated customer maintains about themselves
  (a display name and a contact phone), owned by the Customers module and associated one-to-one with an
  identity reference.
- **Shipping address**: One saved delivery location belonging to exactly one customer profile, with
  required attributes (recipient name, first line, city, country) and optional attributes (second line,
  region, postal code, phone).
- **Default address reference**: The single saved address a customer has designated as their default, or
  no selection at all.
- **Identity reference**: The stable identifier of the authenticated customer, retained as a foreign
  identifier by the Customers module and never used to read or write Identity and Access tables.

### Failure Cases and Required Outcomes

| Failure | Required outcome |
| --- | --- |
| Anonymous access to a customer operation | Refused as unauthenticated with the standard safe envelope. |
| Administrator access to a customer operation | Refused with the standard safe authorization error and recorded as an authorization decision. |
| Address identifier belongs to another customer | Standard safe not-found error, identical to an unknown identifier; no disclosure. |
| Unknown or malformed address identifier | Standard safe not-found or validation error; never a database error. |
| Missing or malformed required address attribute | Validation failure with non-sensitive detail; the submitted value is never echoed or logged. |
| Unknown or unsupported field | Request rejected; no partial write. |
| Customer saves the first address | The saved address becomes the default (HC-ASM-M03-001). |
| Customer sets a new default | Exactly one address is default afterwards, under concurrent designations too. |
| Customer deletes the default address | The default selection is cleared; no address is silently promoted. |
| Profile already exists for the customer | The existing profile is reused; no duplicate and no error. |
| Database unavailable during a customer operation | Standard safe service-unavailable behavior; no partial state is asserted. |
| Rate limit exceeded | Bounded safe rejection with a retry hint; state expires as documented. |
| Unexpected error carries a personal attribute | Standard safe envelope to the caller; protected, redacted detail retained internally only. |

### Testing Requirements

- Unit tests MUST cover profile and address validation and normalization, the address-ownership and
  authorization decisions, the default-selection rules, and the response projections.
- PostgreSQL-backed integration tests MUST cover profile uniqueness and concurrent first access, address
  create/read/update/delete, ownership isolation, the single-default invariant under concurrent
  designation, cascade removal of addresses with their profile, and the absence of any cross-module
  table access.
- End-to-end tests MUST cover the full HTTP journey for a customer (profile read/update and address
  lifecycle including default selection), the anonymous and administrator denial paths, a second
  customer's denied access to the first customer's resources, boundary validation, rate limiting, and
  the standard safe error envelope.
- Negative-path tests MUST verify that names, phone numbers, address lines, postal codes, and cities
  never appear in responses, structured logs, or durable records.
- Contract assertions MUST verify that the OpenAPI document and observed behavior agree on routes,
  statuses, schemas, and the authentication scheme.
- Tests MUST use isolated databases and MUST NOT depend on or contaminate developer or production data,
  consistent with the existing database guard.

### Operational Expectations

- The capability adds no new configuration key, background job, or external dependency; it operates
  inside the existing application process and database.
- Rate-limit counters remain process-local and MAY reset on restart, as recorded for Milestone 02.
- No production capacity, availability, or topology commitment is made (HC-DEC-016 remains the
  authority).
- Customers cannot initiate deletion, export, or retention behavior until HC-DEC-003 is resolved.

### Constitution Compliance

| Constitutional obligation | Milestone evidence required |
| --- | --- |
| Modular architecture and separation of concerns (I) | Customers module owns its models and persistence, exposes a deliberate public contract, and does not read or write Identity tables; the boundary check continues to pass. |
| Secure identity and no plaintext secrets (II) | Reuses the accepted session/role enforcement; adds no credential material and stores no secret. |
| Server-side trust enforcement (III) | No customer identifier accepted from callers; scope derived from the authenticated principal; negative-path authorization coverage. |
| Safe database evolution (VIII) | Reviewed, additive, non-destructive migrations with no startup schema changes. |
| Automated testing at every boundary (IX) | Unit, PostgreSQL-backed integration, and end-to-end suites covering success, denial, isolation, concurrency, and validation paths. |
| Observable operations and protected secrets (X) | Correlated structured logs, authorization-decision audit, and redaction tests proving zero personal-data leakage. |
| Recorded decisions and open requirements (XI) | HC-DEC-002, HC-DEC-003, HC-DEC-005, HC-DEC-014, and HC-DEC-016 recorded as unresolved dependencies with review triggers. |
| Simplicity before distribution (XII) | One modular application and PostgreSQL only; no new dependency or infrastructure. |

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **M03-SC-001**: 100% of tested profile reads and updates return and persist only the authenticated
  customer's own data, in every run.
- **M03-SC-002**: A customer can save, list, read, update, delete, and select a default among multiple
  addresses in 100% of tested runs, with the API describing the result consistently with the stored
  state.
- **M03-SC-003**: 100% of tested cross-customer access attempts (read, update, delete, default) are
  denied with a response identical to the unknown-resource case, and no test observes another
  customer's data.
- **M03-SC-004**: 100% of tested anonymous and administrator access attempts on customer operations are
  denied with the standard safe envelope, and administrative denials are recorded.
- **M03-SC-005**: After the documented limit, further customer requests are rejected with a bounded safe
  response carrying a retry hint.
- **M03-SC-006**: Inspection of responses, structured logs, and durable records finds zero occurrences of
  exercised personal attributes.
- **M03-SC-007**: 100% of tested invalid or incomplete requests are rejected with non-sensitive detail
  that never echoes the submitted value.
- **M03-SC-008**: At most one default address is observed for a customer in 100% of the sequential and
  concurrent designation scenarios tested.
- **M03-SC-009**: The OpenAPI document and observed behavior agree for 100% of customer endpoints, and
  the contract gate rejects drift and still-excluded commerce domains.
- **M03-SC-010**: The complete quality and test gate set passes on the accepted baseline and rejects each
  seeded failure category, and the Milestone 01 and Milestone 02 suites continue to pass unchanged.

## Assumptions

- **HC-ASM-M03-001**: The first address a customer saves becomes the default automatically, and deleting
  the default clears the selection instead of promoting another address. This is a deterministic,
  reversible convenience rule inside the approved capability (HC-IAM-004); confirm before any checkout
  journey depends on a default always existing.
- **HC-ASM-M03-002**: The mutable profile attributes are a display name and a contact phone. No further
  profile attribute is invented, because additional attributes would depend on product decisions that
  are not yet made.
- **HC-ASM-M03-003**: Address attributes are validated generically (presence, length, character safety,
  and an ISO 3166-1 alpha-2-shaped country code). Country-specific formatting and mandatory-ness
  (including whether a postal code is required) depend on HC-DEC-005 and are not encoded.
- **HC-ASM-M03-004**: The customer's account email is Identity-owned data that remains available through
  the accepted Identity and Access principal contract; the customer profile does not duplicate or
  re-expose it.
- **HC-ASM-M03-005**: One customer identity owns exactly one profile, and a profile is created on first
  access rather than at registration, so Milestone 02 registration behavior is unchanged and no backfill
  is required.
- **HC-ASM-M03-006**: The capability is available to the customer role only; administrators do not hold
  storefront profiles in this milestone.

## Open Dependencies

| Decision | Status | Effect on this milestone | Review trigger |
| --- | --- | --- | --- |
| HC-DEC-003 Privacy export, deletion, retention | Open | No deletion, export, or retention workflow is implemented; addresses are only removed with their owning profile. | Before any customer-data-lifecycle work. |
| HC-DEC-005 Supported countries and address rules | Open | Country is stored as a shaped code only; no supported-country list and no country-specific validation. | Before checkout validates a destination country. |
| HC-DEC-002 Customer email verification policy | Open | The profile asserts no verification status and exposes no identity attribute. | Before any verification-dependent profile behavior. |
| HC-DEC-014 Notification channels | Open | No notification is sent by this capability. | Before any transactional message about customer data. |
| HC-DEC-016 Capacity and operational targets | Open | No production throughput, availability, or topology commitment is made. | Before capacity or load planning. |
| HC-DEC-001 V1 release scope | Open | This milestone is authorized as one slice; it does not define overall V1 scope. | At V1 release planning. |
