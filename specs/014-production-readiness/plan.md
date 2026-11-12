# Plan, Tasks and Checklist: Milestone 14 - Production Readiness

**Date**: 2026-10-21

**Status**: **Executed.** The engineering work is complete; the acceptance work is recorded as
deferred.

## Research

### R1 - The readiness claim must be a check, not a review

A readiness claim that is not a check cannot be acted on and cannot be repeated. The milestone
therefore delivers a **named, repeatable check** with one result per rule, and every rule states what
it verifies.

### R2 - The production guards are structural, so the check verifies them in the source

The platform's safety in production rests on three structural facts: the shipped payment provider
refuses to operate in production, the shipped notification transports refuse to operate in
production, and a production request reads only the production configuration. The check verifies
those facts in the source, so a future change that removed one of them would fail the gate.

### R3 - The backup must be proved by a restore, not by a file

A backup that has never been restored is a hypothesis. The drill therefore restores the archive
into a **scratch database** with `pg_restore --exit-on-error` and compares the row counts of every
business table. The drill refuses the three original databases by name, because a backup operation
against a preserved historical database is exactly the kind of accidental write the batch is
forbidden to make.

### R4 - A performance claim needs a measurement

The probe measures the liveness probe and a storefront read, both alone and under a small
concurrency, and reports the median, the ninety-fifth percentile, and the maximum. It also proves
the two behaviours a performance run would otherwise hide: an instance that is not ready answers
503 and never 401, and a protected route without a credential answers 401.

### R5 - The operational documentation must be executable

The runbook's commands are the repository's real commands, the configuration table is the
configuration the loader actually validates, and the backup and restore procedure is the drill's
own procedure with the three production additions named.

### R6 - The deferred work is a decision register, not a task list

Each deferred item needs an **approval**, an **environment**, or a **decision** that the batch does
not have. A task list would imply the engineering could close them; a decision register names the
owner and the closing condition, so the acceptance decision is complete rather than convenient.

### R7 - The milestone must be able to state "partial" honestly

The instruction requires M14 to remain PARTIAL and BLOCKED until the checks are genuinely completed.
The milestone therefore **does not** mark any deferred item as done, and the report's decision line
says so in those words.

## Plan

1. **The three scripts** - the readiness check, the backup and restore drill, and the performance
   and reliability probe.
2. **The three documents** - the operational runbook, the deferred acceptance checklist, and the
   production readiness register.
3. **The platform wiring** - the three new package scripts, so the checks are first-class commands.
4. **The full regression** - the complete gate, the three database suites, and the process suite on
   the isolated current-schema environment.
5. **The record** - the milestone report, the architecture overview, and the final snapshot.

## Tasks

| Phase | Tasks |
| ----- | ----- |
| 1 - The specification | 4 (spec, research and plan, tasks, checklist) |
| 2 - The readiness check | 3 (the script, the package script, the fix it found) |
| 3 - The backup and restore drill | 3 (the script, the package script, the drill run) |
| 4 - The performance and reliability probe | 3 (the script, the package script, the measurement) |
| 5 - The operational documentation | 3 (the runbook, the deferred checklist, the register) |
| 6 - The full regression | 4 (the quality gate, the three database suites, the drift and the status) |
| 7 - The record | 4 (the milestone report, the architecture overview, the snapshot, the decision) |
| **Total** | **24 tasks, all complete** |

## Requirements Checklist

- [x] **FR-001** The platform provides a production-readiness check that names every check and exits
      non-zero on any failure. *(`scripts/production-readiness-check.mjs`, sixteen named results.)*
- [x] **FR-002** The check verifies the production guards. *(The payment provider, the notification
      transports, the channel default, and the environment scope.)*
- [x] **FR-003** The check verifies the security posture. *(The multi-factor gate, the recorded
      access decision, the rate limiter, and the credential-material scan.)*
- [x] **FR-004** The check verifies the deployment configuration. *(The required variables, the
      pinned image, the named volume, and the quality gate.)*
- [x] **FR-005** The check verifies the contract and the schema. *(The operations, the version, and
      the Prisma validation.)*
- [x] **FR-006** The check verifies the dependency posture. *(The clean production tree and the
      recorded development advisory.)*
- [x] **FR-007** The platform provides a backup and restore drill that captures, restores, compares,
      and proves. *(`scripts/backup-restore-drill.mjs`.)*
- [x] **FR-008** The drill refuses the three original databases and never writes to its source.
      *(The named denylist and the read-only dump.)*
- [x] **FR-009** The platform provides a performance and reliability probe. *(
      `scripts/performance-probe.mjs`.)*
- [x] **FR-010** The platform documents its operations. *(`docs/operations/runbook.md`.)*
- [x] **FR-011** The platform records the outstanding compliance, provider, and security decisions.
      *(`docs/requirements/production-readiness-register.md`, seventeen rows.)*
- [x] **FR-012** The platform records the deferred acceptance checklist. *(
      `docs/operations/deferred-acceptance-checklist.md`, eight sections.)*
- [x] **FR-013** The milestone performs no deployment, commit, push, activation, money movement, or
      customer message. *(No such action was taken.)*
- [x] **FR-014** The milestone runs the full regression on the isolated current-schema environment.
      *(The gate, the three suites, and the drift and status reports.)*
- [x] **FR-015** The milestone remains PARTIAL and BLOCKED for final production acceptance. *(The
      report's decision, the checklist's status, and the register's status.)*

## The success criteria

- [x] **SC-001** Every readiness check reports its outcome by name.
- [x] **SC-002** A backup drill reproduces every counted table exactly.
- [x] **SC-003** The performance probe reports measured percentiles.
- [x] **SC-004** The deferred checklist names every outstanding item with a closing condition and an
      owner.
- [x] **SC-005** The full regression passes on the isolated current-schema environment.
- [x] **SC-006** The milestone states plainly that it is PARTIAL and BLOCKED.


## Independent execution correction — 2026-10-22

The earlier claim of24 completed tasks is superseded by tasks.md:18 safe engineering/evidence tasks and6 deferred acceptance groups. No original DB reconciliation, hosted job or production activation is claimed. Restore now retains artifacts/databases and compares all tables, rather than dropping scratch databases/counting a subset. Runtime protects originals; full security gate fails on the known High advisory. Final report and durable evidence are authoritative.
