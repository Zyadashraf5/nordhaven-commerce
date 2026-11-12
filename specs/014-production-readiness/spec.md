# Feature Specification: Milestone 14 - Production Readiness

**Created**: 2026-10-21

**Status**: **PARTIAL / BLOCKED for final production acceptance.** The engineering work that can be
done safely has been done and evidenced; the acceptance work that needs an environment, an
approval, or a decision outside the batch's authority has been recorded as a checklist and a
register, and it is **not** claimed as complete.

**Input**: "Perform all production-readiness engineering work that can safely be completed without
using the original unmigrated databases or activating real external services. Include: security and
architecture checks, performance and reliability verification, logging and monitoring readiness,
backup and recovery procedures, operational documentation, deployment configuration validation, full
regression on the isolated current-schema environment, OpenAPI, Prisma, dependency, and quality-gate
verification, and an outstanding compliance/provider/security decision register. Prepare a precise
deferred acceptance checklist. M14 must remain PARTIAL/BLOCKED for final production acceptance until
these checks are genuinely completed."

## Scope Boundaries

**In scope**: the engineering work that is safe, local, and reversible.

**Out of scope, and recorded as deferred**: the reconciliation of the three original databases, the
four outstanding forward migrations on them, the post-migration drift and data-preservation checks
on them, the final regression against them, the hosted continuous integration, the real shipping and
payment provider approvals, the tax and merchant compliance, and the remaining dependency security
findings.

**Never in scope**: a deployment, a real financial transaction, a production tax, payment, or
shipping activation, an unapproved external notification, a commit, or a push.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Know the platform is safe to operate (Priority: P1)

An operator runs one command and learns whether the platform's production guards, its security
posture, its deployment configuration, its contract, its schema, and its dependencies are in the
state the runbook describes.

**Why this priority**: A readiness claim that is not a check is an opinion, and an opinion cannot be
acted on.

**Independent Test**: Run the readiness check and read its sixteen named results.

**Acceptance Scenarios**:

1. **Given** the repository, **When** the readiness check runs, **Then** every named check reports
   its outcome and the command exits 0 only when all of them pass.
2. **Given** a missing deployment variable, **When** the readiness check runs, **Then** it names the
   missing variable and fails.

### User Story 2 - Know the platform is fast enough (Priority: P2)

An operator measures the platform's own response times instead of guessing.

**Why this priority**: A performance claim without a measurement is not a claim.

**Independent Test**: Run the performance probe and read the percentiles it reports.

**Acceptance Scenarios**:

1. **Given** a running instance, **When** the probe runs, **Then** it reports the median, the
   ninety-fifth percentile, and the maximum of the liveness probe and of a storefront read.
2. **Given** an instance that is not ready, **When** the probe runs, **Then** it proves the
   instance answers 503 and never 401.

### User Story 3 - Know the data can be restored (Priority: P1)

An operator proves that the platform's database can be captured and restored, and that the restored
copy holds the same data.

**Why this priority**: A backup that has never been restored is a hypothesis.

**Independent Test**: Run the backup drill and read its comparison.

**Acceptance Scenarios**:

1. **Given** an isolated database, **When** the drill runs, **Then** it restores the archive into a
   scratch database and compares every counted table.
2. **Given** one of the three original databases, **When** the drill is asked to run against it,
   **Then** it refuses by name.

### User Story 4 - Know exactly what is still missing (Priority: P1)

The Product Owner reads a precise list of what must still happen before a production acceptance.

**Why this priority**: The milestone's honesty is the deliverable. A partial result that is stated
as partial is more valuable than a complete-sounding one that is not.

**Independent Test**: Read the deferred acceptance checklist and the production readiness register,
and check that every row names what closes it and who owns it.

## Edge Cases

- The readiness check is run without a reachable database; the schema validation fails and the
  command exits non-zero.
- The backup drill is pointed at a database that does not exist; it refuses and names it.
- The performance probe runs against a database that is not on the current schema; the read fails
  and the probe exits non-zero rather than reporting a false number.
- A dependency advisory appears in the production tree; the readiness check fails.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The platform MUST provide a **production-readiness check** that names every check it
      performs and exits non-zero when any of them fails.
- **FR-002**: The check MUST verify the **production guards**: the shipped payment provider refuses
      to operate in production, the shipped notification transports refuse to operate in production,
      the customer notification channel defaults to sending nothing, and a production request reads
      only the production configuration.
- **FR-003**: The check MUST verify the **security posture**: the administrator's multi-factor gate,
      the recorded access decision, the rate limiter, and the absence of committed credential
      material.
- **FR-004**: The check MUST verify the **deployment configuration**: every required environment
      variable, the pinned database image, the named volume, and the quality gate.
- **FR-005**: The check MUST verify the **contract and the schema**: the published contract's
      operations and version, and the Prisma schema's validity.
- **FR-006**: The check MUST verify the **dependency posture**: a clean production dependency tree,
      and that a development advisory is **recorded** rather than ignored.
- **FR-007**: The platform MUST provide a **backup and restore drill** that captures a database,
      restores it into a scratch database, compares the row counts, and proves the restore.
- **FR-008**: The drill MUST **refuse** the three original databases by name, and MUST never write
      to the database it backs up.
- **FR-009**: The platform MUST provide a **performance and reliability probe** that measures the
      response times and proves the availability and authentication behaviour.
- **FR-010**: The platform MUST document its **operations**: the commands, the configuration, the
      database, the backup and restore procedure, the observability, the incident procedures, and
      the deployment.
- **FR-011**: The platform MUST record an **outstanding compliance, provider, and security decision
      register**, with an owner and a closing condition for every row.
- **FR-012**: The platform MUST record a **deferred acceptance checklist** for the reconciliation of
      the three original databases, the outstanding forward migrations, the post-migration drift and
      data-preservation checks, the final regression, the hosted continuous integration, the real
      provider approvals, the tax and merchant compliance, and the remaining dependency findings.
- **FR-013**: The milestone MUST NOT deploy, commit, push, activate a provider, move money, or send
      a customer message.
- **FR-014**: The milestone MUST run the **full regression** on the isolated current-schema
      environment, and MUST record the result.
- **FR-015**: The milestone MUST remain **PARTIAL and BLOCKED** for final production acceptance
      while any deferred item is open.

### Key Entities

The milestone adds **no** business entity. It adds three **scripts** and three **documents**.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every readiness check reports its outcome by name.
- **SC-002**: A backup drill reproduces every counted table exactly.
- **SC-003**: The performance probe reports measured percentiles, not estimates.
- **SC-004**: The deferred checklist names every outstanding item with a closing condition and an
      owner.
- **SC-005**: The full regression passes on the isolated current-schema environment.
- **SC-006**: The milestone states plainly that it is **PARTIAL and BLOCKED**.

## Assumptions

- **M14-ASM-001**: A readiness check that reads the repository and validates the configuration is
      the form of readiness verification that can be completed safely in a development environment.
- **M14-ASM-002**: The backup drill's procedure is the production procedure's core, and the
      production additions are the off-host copy, the retention schedule, and the restore cadence.
- **M14-ASM-003**: The performance probe's numbers are a **development-machine measurement**, not a
      capacity statement. A capacity statement needs the target load from HC-DEC-016.
- **M14-ASM-004**: The deferred checklist is a **decision register**, not a task list, because each
      item needs an approval or an environment that the batch does not have.


## Independent scope/evidence correction — 2026-10-22

Current source26 migrations and originals14:12 pending, including the original four M06–M10 forward migrations. The pre-existing shipping-column DROP requires explicit preservation review before any future reconciliation. Production remains PARTIAL/BLOCKED. Safe engineering task completion does not assert a clean full dependency audit, hosted CI, production SLA, shipping charge collection or external acceptance. See tasks.md and the final batch report.
