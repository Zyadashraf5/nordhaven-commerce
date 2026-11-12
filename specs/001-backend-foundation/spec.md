# Feature Specification: Milestone 01 - Backend Foundation

**Feature Branch**: Not created; no `before_specify` branch hook is configured

**Created**: 2026-10-13

**Status**: Approved

**Approval**: Product Owner approval recorded 2026-10-18 for Milestone 01 only. This approval does
not resolve or approve HC-DEC-001 through HC-DEC-017.

**Input**: User description: "Create the specification for Milestone 01: Backend Foundation for
Nordhaven Commerce."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Start a Consistent Backend Workspace (Priority: P1)

As a developer, I can obtain the repository, follow one documented setup path, and use consistent
commands to validate and run the backend foundation so that future teams begin from the same safe,
maintainable baseline.

**Why this priority**: Every later milestone depends on a reproducible workspace, strict quality
controls, and module boundaries that prevent accidental coupling.

**Independent Test**: On a clean supported development machine, follow only the repository setup
guide, run each documented developer command, and confirm the empty application builds, starts,
passes static checks, and contains no business-feature implementation.

**Acceptance Scenarios**:

1. **Given** a clean repository checkout and documented prerequisites, **When** a developer follows
   the setup guide, **Then** the application reaches a running state without undocumented manual
   changes.
2. **Given** the initialized workspace, **When** the developer runs the documented formatting,
   linting, type-checking, build, and test commands, **Then** every command completes successfully
   and reports failures with a non-zero exit status.
3. **Given** a proposed module that imports another module's private implementation, **When** the
   repository checks run, **Then** the boundary violation is detected or the documented review gate
   identifies it before merge.
4. **Given** the completed milestone, **When** its application modules and persisted models are
   inspected, **Then** no customer, authentication, product, inventory, checkout, payment, shipping,
   or other commerce feature has been implemented.

---

### User Story 2 - Run Safely Against a Local Database (Priority: P1)

As a developer, I can start an isolated local database, provide validated configuration, verify
connectivity, and use a documented migration workflow so that database changes begin from a safe
and repeatable foundation.

**Why this priority**: Database connectivity and migration safety are prerequisites for future
features and are constitutional data-protection obligations.

**Independent Test**: Start the documented local database from a clean state, configure the
application using only the example configuration, apply the baseline migration workflow, verify
readiness, and repeat the workflow without drift or destructive behavior.

**Acceptance Scenarios**:

1. **Given** the documented container prerequisite, **When** a developer starts the local database,
   **Then** a pinned database service starts with a health check and persists development data in a
   named local volume.
2. **Given** valid local configuration and a reachable database, **When** the application starts,
   **Then** it establishes database connectivity and reports ready status.
3. **Given** a required configuration value is missing or malformed, **When** startup is attempted,
   **Then** startup fails with a clear non-sensitive diagnostic and a non-zero process exit status.
4. **Given** the application previously started successfully and the database later becomes
   unavailable, **When** health is checked, **Then** liveness remains healthy and readiness reports
   service unavailable without exposing connection credentials or internal exception details.
5. **Given** the database is unavailable during initial startup, **When** startup is attempted,
   **Then** the process exits non-zero before binding an HTTP listener and reports the failure
   without exposing connection credentials or internal exception details.
6. **Given** committed migrations have already been applied, **When** the safe migration command is
   repeated, **Then** it completes without resetting or losing data.

---

### User Story 3 - Observe and Integrate with the Application Safely (Priority: P2)

As an API consumer or operator, I can discover the versioned service contract, distinguish process
health from dependency readiness, correlate requests with structured logs, and receive consistent
safe errors so that the foundation is diagnosable without exposing secrets.

**Why this priority**: Future features need a stable external contract and operators need safe,
machine-readable evidence when the service or database is unhealthy.

**Independent Test**: Start the application, inspect its API contract, exercise liveness,
readiness, unknown-route, validation, and controlled-error paths, then verify responses and logs
against the documented conventions.

**Acceptance Scenarios**:

1. **Given** a running application, **When** an API consumer obtains the service contract, **Then**
   it describes the versioning convention, health endpoints, response schemas, and expected status
   outcomes accurately.
2. **Given** a running process with a healthy database, **When** liveness and readiness are checked,
   **Then** both report success using minimal machine-readable responses.
3. **Given** a running process whose database is unavailable, **When** health is checked, **Then**
   liveness remains successful while readiness reports service unavailable within its bounded
   timeout.
4. **Given** an unknown route or controlled application failure, **When** the request completes,
   **Then** the client receives the standard non-sensitive error shape and the logs contain the same
   correlation identifier.
5. **Given** a termination request, **When** graceful shutdown begins, **Then** the application
   stops accepting new work, closes database resources, and exits within the configured bound.

---

### User Story 4 - Verify Every Change Before Merge (Priority: P2)

As a maintainer, I can rely on separated unit, integration, and end-to-end test foundations plus
automated repository checks so that regressions, unsafe migrations, inconsistent formatting, and
invalid builds are rejected before merge.

**Why this priority**: The foundation is only reusable if its promises are continuously enforced
and failures are reproducible locally.

**Independent Test**: Run the complete automated check set on a clean revision, then introduce one
controlled failure in each check category and confirm the relevant local command and continuous
integration check both reject it.

**Acceptance Scenarios**:

1. **Given** a clean baseline revision, **When** continuous integration runs, **Then** formatting,
   linting, strict type checking, build, unit tests, database-backed integration tests, end-to-end
   tests, and migration validation all pass.
2. **Given** a failing test, type error, lint error, formatting difference, invalid migration, or
   build error, **When** continuous integration runs, **Then** the change is rejected and the failed
   check is identifiable.
3. **Given** an integration or end-to-end test run, **When** it completes or fails, **Then** its test
   database state is isolated from developer and production data and can be recreated reliably.
4. **Given** a service startup, error, shutdown, or readiness path, **When** the applicable automated
   suite runs, **Then** both its successful and failing outcomes are verified.

---

### User Story 5 - Follow Safe Repository Practices (Priority: P3)

As a developer or reviewer, I can identify generated files, local secrets, destructive database
operations, and the supported workflow from repository documentation so that accidental exposure
or unsafe local practices are less likely.

**Why this priority**: Clear hygiene and recovery instructions protect the project as its team and
configuration surface grow.

**Independent Test**: Follow the setup and workflow documentation from a clean checkout, inspect
tracked and ignored files, and verify that no real secret or local/generated artifact is required
in version control.

**Acceptance Scenarios**:

1. **Given** local dependencies, build output, coverage output, logs, editor files, or environment
   secrets, **When** repository status is inspected, **Then** the documented ignore policy prevents
   them from being included by default.
2. **Given** the example environment configuration, **When** a developer inspects it, **Then** it
   contains every supported variable and safe placeholder values but no usable credential.
3. **Given** a developer needs to reset local database data, **When** the workflow is followed,
   **Then** the documentation clearly identifies the operation as destructive and limits it to the
   local development environment.

### Edge Cases

- A configured service port is malformed, outside the valid range, or already in use.
- A database connection value is syntactically valid but points to an unreachable host, rejects
  credentials, or exceeds the readiness timeout.
- The database becomes unavailable after startup and later recovers without an application restart.
- The database container is running but its health check has not yet passed.
- A migration is malformed, already applied, partially fails, or does not match the committed
  migration history.
- A developer invokes a destructive reset command outside the explicitly documented local test or
  development context.
- A request arrives during graceful shutdown or remains in flight when the shutdown bound expires.
- An unexpected error contains a database address, stack trace, environment value, or other secret
  that must not reach the client or structured log fields.
- A caller supplies its own correlation identifier that is missing, malformed, or excessively long.
- API documentation generation and runtime routing disagree about the version prefix or health
  response.
- A test process exits unexpectedly and leaves database state that could affect a later run.
- A new module bypasses its public contract by importing private files or accessing another
  module's persistence implementation.

## Requirements *(mandatory)*

### Scope Boundaries

This milestone establishes an executable backend foundation only. It does not deliver any
customer-facing commerce capability. Customers, customer authentication, administrator identity or
MFA implementation, products, catalog, bundles, inventory, carts, checkout, orders, payments,
pre-orders, tax, shipping, fulfillment, reviews, wishlists, notifications, and other business
features are explicitly out of scope.

HC-DEC-001 through HC-DEC-017 remain open and MUST NOT be resolved, encoded, or assumed by this
milestone. The foundation may establish generic extension points and conventions, but it MUST NOT
create speculative domain models, tables, routes, policies, or provider integrations.

### Functional Requirements

- **M01-FR-001**: The workspace MUST provide a runnable backend application using the approved
  Node.js 22, strict TypeScript, and NestJS constraints.
- **M01-FR-002**: Strict type checking MUST be enabled for application and test code. Any required
  type escape MUST be narrowly scoped, documented, and justified.
- **M01-FR-003**: The repository MUST select and pin one package-management workflow and expose
  consistent commands for dependency installation, development startup, build, type checking,
  linting, formatting, unit tests, integration tests, end-to-end tests, and all-check execution.
- **M01-FR-004**: Linting and formatting rules MUST be deterministic, runnable locally, and enforced
  by continuous integration without silently rewriting files during a check.
- **M01-FR-005**: The application structure MUST establish business-aligned module boundaries with
  separate API, application, domain, and persistence responsibilities where applicable, deliberate
  public module contracts, and a rule against cross-module private imports or repository access.
- **M01-FR-006**: The root application composition MUST be limited to wiring modules and shared
  platform concerns; it MUST NOT contain business rules.
- **M01-FR-007**: This milestone MUST NOT add business-feature modules, business database models,
  business routes, or placeholder implementations for any excluded domain.
- **M01-FR-008**: Local development MUST provide a Docker Compose definition for only the required
  PostgreSQL service, using a pinned supported version, a health check, a persistent named volume,
  and development-only credentials that can be overridden through environment configuration.
- **M01-FR-009**: The application MUST connect to PostgreSQL through Prisma and expose one owned
  lifecycle for establishing, checking, and closing database connections.
- **M01-FR-010**: Prisma configuration MUST separate schema and migration artifacts from runtime
  application behavior and MUST NOT define speculative business entities in this milestone.
- **M01-FR-011**: The repository MUST provide distinct, documented workflows for creating and
  applying development migrations, validating committed migration history, and applying committed
  migrations in a non-development environment.
- **M01-FR-012**: Application startup MUST NOT automatically create, reset, or destructively alter
  the database schema. Destructive reset operations MUST be explicitly named, documented as local
  only, and guarded against accidental non-local use.
- **M01-FR-013**: Every migration change MUST be committed, reviewable, repeatable, and accompanied
  by guidance for validation and recovery; destructive or locking changes remain subject to the
  constitution's expand-and-contract and recovery requirements.
- **M01-FR-014**: Environment configuration MUST be validated before the application begins
  listening for requests. Missing, malformed, out-of-range, or internally inconsistent critical
  values MUST stop startup with a non-zero exit result.
- **M01-FR-015**: The supported configuration contract MUST document each variable's purpose,
  requirement status, safe example, allowed format, and secret classification without including a
  usable secret.
- **M01-FR-016**: Configuration diagnostics MUST identify the invalid variable and expected form
  without printing its secret value, database credentials, or complete connection string.
- **M01-FR-017**: The application MUST expose a stable liveness endpoint that reports whether the
  process can serve requests without depending on database availability.
- **M01-FR-018**: The application MUST expose a stable readiness endpoint that performs a bounded
  database connectivity check, reports success only when critical dependencies are usable, and
  returns a service-unavailable result otherwise.
- **M01-FR-019**: Health responses MUST be machine-readable and MUST NOT reveal credentials,
  internal hostnames, stack traces, raw exceptions, or unnecessary implementation details.
- **M01-FR-020**: Health endpoints MUST be reachable by infrastructure checks without customer or
  administrator authentication; their response content MUST remain limited to operational status.
- **M01-FR-021**: Application REST routes MUST follow a documented URL-based versioning convention
  beginning with `/api/v1`; unversioned business API routes MUST be rejected.
- **M01-FR-022**: The application MUST produce an accurate OpenAPI document for all exposed REST
  routes and response schemas, and MUST provide a documented way to inspect both human-readable and
  machine-readable forms in development.
- **M01-FR-023**: External input MUST be validated and normalized at the server boundary. The
  foundation MUST provide a convention for validation errors that future modules can use without
  exposing rejected sensitive values.
- **M01-FR-024**: Error responses MUST use one documented machine-readable envelope containing a
  stable error code, safe message, request correlation identifier, and optional non-sensitive
  validation details. Stack traces and raw internal exceptions MUST NOT be returned.
- **M01-FR-025**: Unknown routes and unsupported API versions MUST use the standard error envelope
  and an appropriate non-success status.
- **M01-FR-026**: Application logs MUST be structured and machine-parseable, with timestamp,
  severity, service/environment identity, event name or message, and correlation information where
  a request or operation exists.
- **M01-FR-027**: Each incoming request MUST receive a server-controlled correlation identifier.
  A valid caller-supplied identifier MAY be propagated according to a documented length and
  character policy; invalid input MUST be replaced safely.
- **M01-FR-028**: Logs and error handling MUST redact or omit passwords, connection credentials,
  tokens, cookies, authorization values, complete environment dumps, and other configured secrets.
- **M01-FR-029**: Unexpected errors MUST be recorded with enough internal context for diagnosis
  while returning only the standard safe error response to callers.
- **M01-FR-030**: On a supported termination signal, the application MUST stop accepting new work,
  allow in-flight requests to finish within a documented bound, close database resources, flush
  pending logs where supported, and exit with an outcome that distinguishes orderly shutdown from
  failure.
- **M01-FR-031**: The test foundation MUST provide independently runnable Jest unit, integration,
  and end-to-end suites with clear naming and location conventions.
- **M01-FR-032**: Integration tests MUST exercise real PostgreSQL and Prisma behavior against an
  isolated, reproducibly initialized test database rather than relying solely on mocks.
- **M01-FR-033**: End-to-end tests MUST start the application through its normal composition and
  verify at least startup, liveness, readiness, safe errors, correlation, API versioning, OpenAPI,
  database-unavailable behavior, and graceful shutdown where the test environment supports signals.
- **M01-FR-034**: Test setup and teardown MUST prevent one run from depending on or contaminating
  another run and MUST never target an unapproved shared or production database.
- **M01-FR-035**: Continuous integration MUST run on proposed changes and execute clean dependency
  installation, formatting check, lint, strict type check, build, unit tests, PostgreSQL-backed
  integration tests, end-to-end tests, and migration validation.
- **M01-FR-036**: Continuous integration MUST fail when any required check fails and MUST retain
  enough non-sensitive output to identify the failing command or test.
- **M01-FR-037**: The repository MUST document prerequisites, initial setup, configuration, local
  database start and stop, migration operations, application startup, every quality command,
  troubleshooting, graceful shutdown, and local cleanup or reset.
- **M01-FR-038**: The repository MUST contain a `.gitignore` that excludes dependencies, build and
  coverage output, logs, editor and operating-system artifacts, local database state, environment
  files, and common secret-bearing files while allowing a safe example configuration to be tracked.
- **M01-FR-039**: A documented secrets-exclusion policy MUST prohibit committing credentials,
  tokens, private keys, production configuration, or usable connection strings and MUST state the
  response procedure for accidental exposure, including revocation and history remediation.
- **M01-FR-040**: The milestone MUST NOT introduce Redis, BullMQ, a message broker, a separate
  service, a search engine, or any other infrastructure beyond the application and local
  PostgreSQL because no approved requirement justifies it.
- **M01-FR-041**: Dependency versions and the package lockfile MUST be committed and reproducible;
  known critical dependency vulnerabilities detected by the selected standard check MUST fail the
  baseline quality gate or be covered by a documented, time-bound exception under the constitution.
- **M01-FR-042**: All foundation behavior and commands MUST work without requiring any decision from
  HC-DEC-001 through HC-DEC-017, and no requirement in this specification closes those decisions.

### Failure Cases and Required Outcomes

| Failure | Required outcome |
| --- | --- |
| Invalid critical configuration | Startup stops before accepting requests; the process reports the variable safely and exits non-zero. |
| Service port unavailable | Startup fails clearly, releases any acquired resources, and exits non-zero. |
| Database unavailable at startup | Startup fails before binding an HTTP listener; the failure is logged without credentials and the process exits non-zero within the configured startup bound. |
| Database lost after startup | Liveness remains independent; readiness becomes unavailable within its timeout and can recover after connectivity returns. |
| Migration validation failure | Migration execution or continuous integration stops; no later deployment-oriented step is reported successful. |
| Unexpected request error | The caller receives the safe standard envelope and correlation identifier; diagnostic context is retained only in protected logs. |
| Termination during an in-flight request | New work is refused, bounded drain behavior applies, resources close, and timeout behavior is observable. |
| Test database safety check fails | Database-backed tests refuse to run rather than risking a shared or production database. |
| Required repository check fails | Continuous integration rejects the revision and identifies the failed category. |

### Testing Requirements

- Unit tests MUST cover configuration parsing and redaction, error mapping, correlation identifier
  acceptance/replacement, versioning conventions, and any boundary enforcement logic.
- PostgreSQL-backed integration tests MUST cover successful and failed connection checks, migration
  application and repeat application, readiness transitions, and isolated test-state cleanup.
- End-to-end tests MUST cover the documented liveness, readiness, OpenAPI, unknown-route, invalid
  input, controlled internal-error, and graceful-shutdown behavior.
- Contract assertions MUST verify that documented routes, statuses, schemas, and error envelopes
  match observed behavior.
- Negative-path tests MUST verify that secrets, connection strings, stack traces, and raw exceptions
  do not appear in responses or captured logs.
- Continuous integration MUST exercise the same commands documented for local use; CI-only behavior
  that developers cannot reproduce locally is not acceptable.

### Operational Expectations

- Liveness and readiness are distinct signals and have bounded execution time.
- Readiness reflects current database usability and recovers when the database recovers.
- Logs are structured from startup through shutdown and allow request-to-error correlation without
  disclosing protected values.
- Graceful shutdown has a documented maximum drain duration and deterministic exit behavior.
- Local PostgreSQL is reproducible and disposable, but destructive cleanup is explicit and guarded.
- This milestone does not establish production deployment topology, capacity, availability,
  recovery-point, recovery-time, or infrastructure-cost commitments; those remain under HC-DEC-016.

### Constitution Compliance

| Constitutional obligation | Milestone evidence required |
| --- | --- |
| Modular architecture and separation of concerns | Module layout, public-boundary rule, and a check or review gate that rejects private cross-module access |
| Server-side validation and authorization | Global validation and safe error conventions; business authorization is deferred with the excluded identity features |
| Safe database evolution | Reviewable migration commands, repeat-application tests, no automatic destructive startup migration, and documented recovery expectations |
| Automated tests | Separate unit, PostgreSQL-backed integration, and end-to-end suites enforced in continuous integration |
| Observability and secrets protection | Structured correlated logs, readiness and liveness, redaction tests, ignore rules, and secrets-response policy |
| Documented decisions and open requirements | HC-DEC-001 through HC-DEC-017 remain open and no dependent business behavior is encoded |
| Simplicity before distribution | One modular application and local PostgreSQL only; no Redis, BullMQ, microservice, broker, or speculative infrastructure |

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **M01-SC-001**: A developer with the documented prerequisites can take a clean checkout to a
  running, ready application in 15 minutes or less, excluding network download time, using only the
  setup guide.
- **M01-SC-002**: 100% of documented developer and quality commands work from a clean checkout,
  return success on the accepted baseline, and return non-zero when their controlled failure is
  introduced.
- **M01-SC-003**: Every tested missing, malformed, out-of-range, or inconsistent critical
  configuration case prevents request acceptance and produces a useful diagnostic containing zero
  secret values.
- **M01-SC-004**: Operational checks distinguish a live process from database readiness in 100% of
  healthy, unavailable, and recovered-database test scenarios, with each check completing within
  two seconds in the local and continuous-integration environments.
- **M01-SC-005**: For 100% of tested unknown-route, invalid-input, and controlled internal-error
  requests, the response follows the documented safe envelope, contains a correlation identifier,
  and exposes no stack trace, credential, connection string, or raw internal exception.
- **M01-SC-006**: The generated service contract describes 100% of exposed routes and tested
  response schemas, and automated contract assertions find no difference between the document and
  observed behavior.
- **M01-SC-007**: A graceful shutdown test completes within 10 seconds, refuses new requests after
  shutdown starts, closes database resources, and reports the documented exit outcome.
- **M01-SC-008**: The complete continuous-integration check set passes three consecutive times on
  the accepted baseline, completes within 15 minutes per run under normal hosted-runner conditions,
  and rejects each seeded check-category failure.
- **M01-SC-009**: Repository and captured-output inspection finds zero usable secrets in tracked
  files, API responses, or logs across the defined security test fixtures.
- **M01-SC-010**: A reviewer can trace every acceptance scenario to at least one requirement and
  automated test category, with no excluded commerce module, route, or data model present.
- **M01-SC-011**: A developer unfamiliar with the repository completes setup, database start,
  migration validation, application start, all checks, shutdown, and local cleanup without an
  undocumented command or maintainer intervention.

## Assumptions

- The milestone targets local development and continuous integration, not a production deployment
  or production service-level agreement.
- Developers have a supported host capable of running Node.js 22 and Docker Compose. Exact supported
  host operating systems and container runtime versions will be selected and documented during
  planning without changing business scope.
- A supported PostgreSQL major version will be selected, pinned, and documented during planning;
  no project source currently mandates a specific major version.
- The `/api/v1` URL prefix is the initial API versioning convention. A later compatibility policy
  may add versions but cannot create unversioned business routes.
- Health endpoints are unauthenticated for infrastructure use but expose only minimal operational
  status and no sensitive dependency details.
- Local and test databases contain disposable non-production data. Production backup, restore,
  topology, and migration rollout procedures require later operational specifications.
- The continuous-integration provider and package manager may be selected during planning as
  reversible tooling choices, provided all requirements and local reproducibility guarantees hold.
- No Redis, BullMQ, queue, cache, microservice, external provider, or business-domain dependency is
  needed for this foundation milestone.
- HC-DEC-016 remains the authority for future production performance and operational budgets; the
  local and continuous-integration timings in this specification are milestone acceptance bounds,
  not production SLOs.
