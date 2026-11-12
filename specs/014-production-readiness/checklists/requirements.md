# Requirements Checklist: Milestone 14 - Production Readiness

**Date**: 2026-10-21

**Status**: **The engineering scope is complete. The acceptance scope is OPEN**, and every deferred
item is recorded in `docs/operations/deferred-acceptance-checklist.md` and
`docs/requirements/production-readiness-register.md`.

## The engineering scope

- [x] **FR-001** A production-readiness check names every check it performs and exits non-zero on
      any failure. *(`pnpm readiness:check`, sixteen named results.)*
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
- [x] **FR-007** A backup and restore drill captures, restores, compares, and proves. *(
      `pnpm readiness:backup-drill`.)*
- [x] **FR-008** The drill refuses the three original databases and never writes to its source.
      *(The named denylist and the read-only dump.)*
- [x] **FR-009** A performance and reliability probe measures the response times and proves the
      availability and authentication behaviour. *(`pnpm readiness:performance`.)*
- [x] **FR-010** The operations are documented. *(`docs/operations/runbook.md`.)*
- [x] **FR-011** The outstanding compliance, provider, and security decisions are recorded, with an
      owner and a closing condition. *(`docs/requirements/production-readiness-register.md`.)*
- [x] **FR-012** The deferred acceptance checklist is precise. *(
      `docs/operations/deferred-acceptance-checklist.md`.)*
- [x] **FR-013** No deployment, commit, push, activation, money movement, or customer message
      happened. *(The repository still has zero commits and no deployment was made.)*
- [x] **FR-014** The full regression ran on the isolated current-schema environment. *(The gate, the
      three suites, and the drift and status reports.)*
- [x] **FR-015** The milestone remains **PARTIAL and BLOCKED**. *(`docs/progress/milestone-14.md`.)*

## The acceptance scope - OPEN

- [ ] **A** The reconciliation of the three original databases, with the backup, the row and content
      comparison, and the signed rollout plan.
- [ ] **B** The four outstanding forward migrations, applied to the controlled copies.
- [ ] **C** The post-migration drift and data-preservation checks on those copies.
- [ ] **D** The final regression against the reconciled copies.
- [ ] **E** The hosted continuous integration, with a green run and the branch protection.
- [ ] **F** The real shipping and payment provider approvals, and the activation of the shipping
      charge.
- [ ] **G** The tax and merchant compliance.
- [ ] **H** The acceptance decision for the remaining dependency security finding.

## The success criteria

- [x] **SC-001** Every readiness check reports its outcome by name.
- [x] **SC-002** A backup drill reproduces every counted table exactly.
- [x] **SC-003** The performance probe reports measured percentiles.
- [x] **SC-004** The deferred checklist names every outstanding item with a closing condition and an
      owner.
- [x] **SC-005** The full regression passes on the isolated current-schema environment.
- [x] **SC-006** The milestone states plainly that it is PARTIAL and BLOCKED.
