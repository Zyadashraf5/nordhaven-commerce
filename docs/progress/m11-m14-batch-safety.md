# M11–M14 batch — safety preconditions and baseline

**Date**: 2026-10-21. **Project**: `D:/projects/nordhaven-commerce`.

This record states the mandatory safety preconditions that were verified **before** any Milestone 11
implementation, the isolated development/test targets this batch owns, and the baseline the batch
started from.

## The audit that was read

`C:\Users\zyad\Documents\ChatGPT\zyad ashraf\nordhaven-m06-m10-audit-20261021` — `PROGRESS.md`,
`findings.json`, `isolated-final-check.json`, and `final-report.md` were read.

The audit's decision is **CONDITIONAL GO for M11–M14 development using the verified isolated
databases**, and **NO-GO for running the current schema-dependent baseline against the three original
databases** until the four forward migrations are applied through a controlled rollout. It also records
**NO-GO for production payment/tax activation or deployment**.

## Precondition 1 — Codex is no longer modifying the project

- The `codex.exe`, `codex-code-mode-host.exe`, and `claude.exe` processes are still present, but the
  audit's own work finished at `2026-10-21T14:20:43Z` (`final-report.md`) and its last write to the
  project was `2026-10-21T14:12:25Z`.
- A **120-second continuous fingerprint watch** over every non-generated source file recorded
  **no source file changed** during the window.
- The audit's `source-fingerprint.cjs` was reused verbatim, so the comparison is exact.

## Precondition 2 — All audited source corrections are present

The audit's fingerprint algorithm was reproduced and the project's fingerprint computed:

|                   | Value                                                              |
| ----------------- | ------------------------------------------------------------------ |
| Audited baseline  | `656af621683c7c0c2b80a40c4f1f227dda5350e5496378581c680cdd4e264c83` |
| Project, measured | `656af621683c7c0c2b80a40c4f1f227dda5350e5496378581c680cdd4e264c83` |
| **Match**         | **YES — the project is the audited, remediated baseline**          |

The 18 applied source migrations are present, including the four forward migrations the audit added
(`20261021150000_audit_integrity`, `20261021153000_order_refund_projection`,
`20261021160000_pending_refund_budget`, `20261021170000_configuration_audit`).

## Precondition 3 — A durable, verified, recoverable source snapshot

`C:/Users/zyad/Documents/nordhaven-backup-20261021-m11-prework/` — **440 files**, every SHA-256
hash in `MANIFEST.sha256` re-verified, **0 mismatches**. The manifest records the audited source
fingerprint so a restore can be checked against the audit's baseline.

## Precondition 4 — Safe, separate development and test databases

The batch owns two **new** isolated databases, created from the current verified 18-migration source:

| Database                      | Purpose           | Migrations | `migrate status`   | Schema drift          | Invariants       |
| ----------------------------- | ----------------- | ---------- | ------------------ | --------------------- | ---------------- |
| `hc_m11_20261021_integration` | integration suite | 18         | exit 0, up to date | exit 0, no difference | invalid counts 0 |
| `hc_m11_20261021_e2e`         | end-to-end suite  | 18         | exit 0, up to date | exit 0, no difference | invalid counts 0 |

The check reproduces the audit's own `isolated-final-check.cjs` method exactly, including the
source-checksum comparison for every applied migration and the stock, money, and reservation
invariant counts. Its output is retained as
`nordhaven-m06-m10-audit-20261021/m11-m14-isolated-final-check.json`.

**The guard now refuses the originals by name.** `test/helpers/database-guard.ts` gained an explicit
denylist for `nordhaven`, `nordhaven_integration`, and `nordhaven_e2e`, because the suite-suffix rule
alone would have permitted `nordhaven_integration` and `nordhaven_e2e`. The protection is therefore
enforced by the guard itself and not only by the runner's configuration.
`test/unit/database-guard.spec.ts` proves each original is refused.

**The gate runner pins the URLs.** `m11-gate.cjs` sets `DATABASE_URL` and `DATABASE_URL_E2E` to the
batch's own targets for every gate, so no suite can resolve an original database from the
environment.

## Precondition 5 — The original databases, backups, and migration history are preserved

The three originals were **read only** during the preconditions. Nothing was written to them.

| Database                | Applied migrations | Public tables | Notes                                                         |
| ----------------------- | ------------------ | ------------- | ------------------------------------------------------------- |
| `nordhaven`             | **14**             | 34            | 5 products, 4 variants, 9 users; 0 orders, 0 payment attempts |
| `nordhaven_integration` | **14**             | 34            | 0 rows in every business table                                |
| `nordhaven_e2e`         | **14**             | 34            | 1 user; 0 rows in every business table                        |

These are exactly the counts the audit recorded as its preserved baseline
(`databases-before.json` / `databases-after.json`). The audit's three `pg_dump` archives under
`database-backups-pre-additive/` and their manifest are retained and were not restored, overwritten,
or deleted.

**They are not on the current schema.** The application requires eighteen migrations, and the four
forward migrations are unapplied to the originals. They are therefore **not** valid targets for the
current application and are excluded from every gate.

## Precondition 6 — No automated cleanup, migration, or integration test targets an original

- The gate runner pins both URLs to the batch's own targets.
- The database guard refuses the three originals by name before any connection.
- The guard still requires `NODE_ENV=test`, the PostgreSQL scheme, an allowlisted local host, and the
  suite suffix.

## The baseline this batch starts from

| Gate                                                                                 | Result                |
| ------------------------------------------------------------------------------------ | --------------------- |
| `verify` (format, lint, boundaries, types, unit, build, repository hygiene, OpenAPI) | **PASS**, exit 0      |
| `test:unit`                                                                          | 368 passed, 36 suites |
| `test:integration`                                                                   | 251 passed, 12 suites |
| `test:e2e`                                                                           | 98 passed, 11 suites  |
| `prisma:validate`                                                                    | PASS                  |
| `pnpm audit --prod`                                                                  | PASS, zero advisories |

The two changes this batch made to the audited baseline before Milestone 11 are the database guard's
denylist and its unit test, both of which exist to protect the originals.

## Standing restrictions for this batch

- Never mutate or migrate `nordhaven`, `nordhaven_integration`, or `nordhaven_e2e`.
- No database reset, no destructive migration, no Docker volume deletion.
- No commit, push, or deployment.
- No real financial transaction, and no production tax, payment, or shipping activation.
- No unapproved external notification.
- No bypassing a failed test.
- Milestone 14 must not be reported as production-ready while blockers remain.
