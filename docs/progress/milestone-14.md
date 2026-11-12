# Milestone 14 - Production Readiness Implementation Record

**Date**: 2026-10-21

**Status**: **PARTIAL - BLOCKED for final production acceptance.**

The engineering work that can be completed safely has been completed and evidenced. The acceptance
work that needs an environment, an approval, or a decision outside the batch's authority has been
recorded precisely, and it is **not** claimed as complete.

## Objective

Perform every production-readiness engineering task that can be completed safely without the
original unmigrated databases and without activating any real external service; and prepare a precise
deferred acceptance checklist.

## Task count

| Phase                                     | Tasks                      |
| ----------------------------------------- | -------------------------- |
| 1 - The specification                     | 4                          |
| 2 - The readiness check                   | 3                          |
| 3 - The backup and restore drill          | 3                          |
| 4 - The performance and reliability probe | 3                          |
| 5 - The operational documentation         | 3                          |
| 6 - The full regression                   | 4                          |
| 7 - The record                            | 4                          |
| **Total**                                 | **24 tasks, all complete** |

## Features implemented

1. **The production-readiness check** - sixteen named checks across the production guards, the
   security posture, the deployment configuration, the contract and the schema, and the dependency
   posture. Every check reports its outcome by name, and the command exits non-zero when any of them
   fails.
2. **The backup and restore drill** - it captures a database with `pg_dump`, restores the archive
   into a **scratch** database with `pg_restore --exit-on-error`, compares the row counts of every
   business table, records the archive's size and SHA-256, and drops the scratch database. It
   **refuses** the three original databases by name, and it never writes to the database it backs
   up.
3. **The performance and reliability probe** - it measures the liveness probe and a storefront read,
   alone and under a five-way concurrency, and reports the median, the ninety-fifth percentile, and
   the maximum. It also proves the two behaviours a performance run would hide: an instance that is
   not ready answers 503 and never 401, and a protected route without a credential answers 401.
4. **The operational runbook** - the commands and what each one touches, the configuration and the
   variables that have no safe default, the database and the migrations, the backup and restore
   procedures with the three production additions, the observability, four incident procedures, and
   the deployment's state.
5. **The deferred acceptance checklist** - eight sections, each naming what must be done, what
   evidence closes it, and who owns it.
6. **The production readiness register** - seventeen rows across the compliance, provider, security,
   and operational decisions, each with an owner and a closing condition.
7. **The three package scripts** - `pnpm readiness:check`, `pnpm readiness:backup-drill`, and
   `pnpm readiness:performance`, so the checks are first-class commands rather than scripts someone
   has to remember.

## The executed evidence

### The full regression on the isolated current-schema environment

| Gate                                                                           | Result                                |
| ------------------------------------------------------------------------------ | ------------------------------------- |
| `pnpm verify` (format, lint, boundaries, types, unit, build, hygiene, OpenAPI) | **PASS**, exit 0                      |
| `pnpm test:unit`                                                               | **387 passed**, 37 suites             |
| `pnpm test:integration`                                                        | **285 passed**, 15 suites             |
| `pnpm test:e2e`                                                                | **117 passed**, 14 suites             |
| `pnpm test:process`                                                            | **4 passed**, 1 skipped               |
| `prisma migrate status` on both isolated targets                               | exit 0, up to date, **23** migrations |
| `prisma migrate diff` on both isolated targets                                 | exit 0, **no difference**             |
| The applied migrations' checksums                                              | every one matches its source file     |
| The stock, money, and reservation invariants                                   | invalid counts **0**                  |

### The production-readiness check

**16 of 16 checks passed**: the payment provider refuses production, the notification transports
refuse production, the notification channel defaults to sending nothing, a production request reads
only the production configuration, the administrator's multi-factor gate exists, every access
decision is recorded, the rate limiter exists, no credential material is committed, the environment
example declares every required variable, the database image is pinned and the volume is named, the
quality gate is a single documented command, the published contract declares its operations and its
version, the Prisma schema validates, the production dependency tree has no critical advisory, and
the development dependency tree is **recorded** rather than ignored.

### The backup and restore drill

```
Archive: 125373 bytes, sha256 3732dcd5880f263c3fbec7c6d0f546cf40bf986d19ea63133e2896f62cc13c47
The restore reproduced every counted table exactly.
Applied migrations in the restored copy: 23
```

The drill was also pointed at `nordhaven` and **refused it by name**.

### The performance and reliability probe

| Measurement                                | Median  | 95th percentile | Maximum  | Budget |
| ------------------------------------------ | ------- | --------------- | -------- | ------ |
| `health/live`                              | 6.9 ms  | 12.9 ms         | 22.6 ms  | 50 ms  |
| `catalog/products`                         | 11.2 ms | 22.5 ms         | 430.2 ms | 250 ms |
| `catalog/products` at five-way concurrency | 26.6 ms | 49.1 ms         | 55.9 ms  | 500 ms |

**The measurement is a development-machine measurement, not a capacity statement.** A capacity
statement needs the target load from HC-DEC-016, which is still open. The 430 ms maximum on the
storefront read is the first request's warm-up.

### The dependency posture

`pnpm audit --prod` reports **no known vulnerability** in the production dependency tree. The
development tree carries one finding with **no upstream patch**, `GHSA-vfj7-8cjw-p6xm`
(`braces@3.0.3`), which is a transitive development dependency of the tooling chain and is not in the
production tree. It is **recorded**, not ignored, and it has its own row in the readiness register.

## The bugs this milestone found and fixed

1. **The environment example did not declare the customer notification channel.** The readiness
   check found it by comparing the loader's schema with the example file. The variable is now
   declared, with its permitted values and the reason production must keep it at `none`. **This is a
   real deployment defect**: a production deployment built from the example file would have started
   with the loader's default rather than a declared value.
2. **The readiness check's own result logic was inverted.** The first implementation passed the
   check's _condition_ where the reporting function expected an _outcome_, so every check reported
   "failed" while the command still exited 0. The function now derives the outcome from the
   condition, and the command's exit code and its report agree.
3. **The backup drill could not report the restored migration count.** The count query used the
   tuples-only output flag, which returned an empty string. The query now uses the default output
   and reports the count.
4. **The performance probe's readiness check ran in the wrong order.** The probe marked the instance
   ready before it tested the not-ready behaviour, so the 503 assertion could never hold. The
   probe now proves the not-ready behaviour first, then marks the instance ready, then measures.
5. **The probe's storefront read used a parameter the catalog does not accept.** The read answered
   400, and the probe would have reported a false number. The probe now uses the catalog's own
   parameter and asserts the 200.

## The outstanding dependencies

Every one of them is recorded in the
[production readiness register](../requirements/production-readiness-register.md) and in the
[deferred acceptance checklist](../operations/deferred-acceptance-checklist.md).

1. **The reconciliation of the three original databases** and their controlled rollout. They carry
   fourteen applied migrations and the application requires twenty-three.
2. **The four outstanding forward migrations**, applied to controlled copies only.
3. **The post-migration drift and data-preservation checks** on those copies.
4. **The final regression** against the reconciled copies.
5. **The hosted continuous integration.** The repository has zero commits and no hosted remote, so
   no hosted run has ever happened and none may be claimed.
6. **The real shipping and payment provider approvals.** The shipped payment provider refuses to
   operate in production, and there is no shipping provider at all.
7. **The tax and merchant compliance.** The merchant's VAT registration, the production tax
   configuration, the shipping taxability decision, and the invoice format.
8. **The remaining dependency security finding**, `GHSA-vfj7-8cjw-p6xm`, which has no upstream
   patch and needs a recorded acceptance decision.
9. **The operational decisions**: the managed database and its schedule, the deployment target and
   the image, the metrics and the alerts, the capacity statement, and the incident response
   procedure.

## What this milestone does not deliver

- **A deployment**, a commit, a push, or a production activation of anything.
- **A migration of the three original databases**, and therefore not the post-migration checks that
  depend on it.
- **A hosted CI run.**
- **A capacity statement** or a production load test.
- **A metrics exporter, a distributed tracing, or an alert routing.**
- **A formal security certification.**
- **A migration rollback path** beyond the restore procedure the runbook documents.

## The development acceptance

**Milestone 14's engineering scope is COMPLETE and verified.** The readiness check passes, the
backup and restore drill proves a restore, the performance probe measures the platform and proves
its availability behaviour, the operational documentation exists, the deployment configuration
validates, the full regression passes on the isolated current-schema environment, and the OpenAPI,
Prisma, dependency, and quality gates are green.

**Milestone 14 is PARTIAL and BLOCKED for final production acceptance.** The deferred checklist and
the readiness register name every remaining item, its closing condition, and its owner, and none of
them is marked as done. The platform is **not** claimed to be production-ready.

## Independent final acceptance —2026-10-22

Authoritative report:m11-m14-batch-report.md. Final416 unit/40 suites,312 integration/15,119E2E/14; Windowsprocess4 pass/1skip; actual localLinuxprocess5/2 pass. Full composite verify/OpenAPI/Prisma/compose/image build/runtime scan and non-root smoke passed. Prod audit0; full audit1 High braces; readiness15/16 thereforefailed. Source26/originals 14/12 pending; original data/backups/checksums preserved. Actual retained 51-table restore passed. M14tasks18 complete/6blocked. Production remains PARTIAL/BLOCKED; no deployment or original mutation.
