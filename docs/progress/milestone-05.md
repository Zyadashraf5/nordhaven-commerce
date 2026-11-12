# Milestone 05 - HC-DEC-017 verification checkpoint

**Date**: 2026-10-20 (Africa/Cairo). **Status**: functional verification complete; security follow-up and Product Owner acceptance remain open. No M06 work.

## Scope and decisions

HC-DEC-017 was approved on 2026-10-20. Constitution Principle V distinguishes independently stocked FIXED finished goods from component-derived DYNAMIC bundles. The amendment and approval are preserved. HC-DEC-004 remains open: all inventory, bundle operations and reservation routes are ADMIN-only; no checkout/customer reservation route was added.

FIXED bundles start at zero. Assembly consumes component quantities and produces finished goods in one transaction; disassembly reverses it. Reservations hold finished inventory once. DYNAMIC availability is component-derived at minimum quantities; whole-bundle quantity reservations remain ambiguous and return 409. Explicit SKU selections use the existing SKU reservation primitive; a customer selection/checkout flow is outside this milestone.

## Repairs and evidence

- The malformed unit spec contained literal PowerShell replacement code in two constructor expressions. Restored typed constructors, added the nullable bundle identity to its inventory fixture, and retained the existing failure assertions. Old component-derived FIXED assertions were updated to the approved model; equivalent component conservation/availability assertions were added to PostgreSQL and HTTP tests.
- Assembly had created finished inventory outside its transaction and returned availability through the outer client before commit. Assembly/disassembly now lock the bundle composition, use transaction-local writes/reads, conditionally change stock, lock inventory in a stable order, and audit all deltas with bundle ID, operation and quantity. Partial failure rolls back stock creation, component changes and audit.
- Prevented composition replacement while finished stock/reservations exist. Bundle deletion with inventory history returns 409, preserving audit references; unused bundles can still be deleted. Reservation code no longer uses an untyped optional hold method or produces zero DYNAMIC holds.
- Corrected finished-goods pagination through null SKU rows, bundle-product filtering, and expiry before bundle availability/disassembly. Added database owner XOR and reserved-within-on-hand constraints.
- Added explicit HTTP 200 for assemble/disassemble, matching OpenAPI; added both operations to drift/authorization checks. Anonymous/customer denials cover both operations.
- Applied available security patches through version-scoped workspace overrides (webpack, AJV 8, picomatch 4, deepmerge-ts and mysql2). Existing major versions outside those selectors are unchanged. Full verification was rerun after dependency updates.

## Actual verification

- Unit: **235 passed / 26 suites**, including existing M01-M04 coverage and hygiene negative canaries.
- Integration: **76 passed / 5 suites**, including M01-M04 regression suites.
- Inventory invariants: successful assembly/final availability, stock conservation, finished-only reservations, insufficient-component rollback (including inventory creation/audit), reserved-stock disassembly denial, 12 concurrent assembly attempts for 5 units, 12 concurrent finished reservations for 5 units, concurrent disassembly, distinct bundles competing for shared components, immutable stocked composition, expiry, owner/availability SQL constraints, null-SKU pagination and product filtering.
- E2E: **40 passed / 6 suites** on the final runtime/dependency tree; the evidence log is authoritative. Includes assembly/disassembly, contract responses, failure cases, reservation lifecycle, anonymous/customer denials and rate limits, plus M01-M04 suites.
- Composite `pnpm verify`: passed (format, lint, boundaries, types, unit, build, repository hygiene, OpenAPI validation/drift). Final log is authoritative after the documentation pass.
- Negative contract proof: an isolated fixture with a seeded valid-but-different OpenAPI title was rejected with `OpenAPI drift detected`; restoring its contract passed. Source contract was untouched. Hygiene rejection is exercised by the passing unit canary tests.
- Prisma schema validation and client generation: passed after security dependency updates.
- Process lifecycle: **4 passed, 1 skipped**. The existing graceful-shutdown signal test is skipped on Windows and remains **unverified on this host**; startup/configuration/port failure tests passed. The composite gate excludes process/integration/E2E.
- Production dependency audit: zero advisories in the executed production audit. Full development-inclusive audit initially reported 9 advisories (4 high, 3 moderate, 2 low); patched versions reduced it to **one high**, `braces@3.0.3`, GHSA-vfj7-8cjw-p6xm. No patched release is published according to the advisory. It is a transitive development glob dependency; it is not suppressed or called a clean audit. Full security sign-off remains open.
- Hosted CI, deployment, performance/load testing, manual warehouse acceptance and Product Owner acceptance: **not run/not claimed**.

## Non-destructive database reconciliation

Initial `prisma migrate status` misleadingly returned up-to-date for all three existing databases. A real schema diff returned exit 2: `bundle_id`, its unique index/FK and nullable `variant_id` were missing. All three contained a failed/rolled-back record followed by a successful record for the BOM-bearing migration, despite missing DDL. Fresh isolated replay failed at the BOM before any SQL executed.

The historical SQL file was corrected only for BOM/newlines. A new additive migration, `20261020150000_reconcile_fixed_bundle_stock`, creates the missing column/index/FK if absent, makes variant_id nullable, and adds owner XOR and reserved <= on_hand checks. It drops no table/column and rewrites no application rows.

The user explicitly approved scoped schema/history reconciliation after automatic review initially rejected it. Before modifying any existing database, separate custom-format pg_dump backups were completed for all three and each archive was checked using pg_restore --list. The repair then:

1. Confirmed the exact missing-column/history mismatch.
2. Applied the real additive DDL through Prisma; no unapplied DDL was merely marked applied.
3. Verified an empty schema diff and validated inventory constraints.
4. Compared counts and sorted row-content hashes for every public application table; all were identical before/after.
5. Changed only the successful HC-DEC-017 migration entry's checksum from the backed-up BOM file to the verified BOM/newline-normalized SQL checksum. The prior failed/rolled-back record was retained unchanged.
6. Rechecked migration status (8 migrations) and schema diff on nordhaven, nordhaven_integration and nordhaven_e2e: all passed, no drift. Active successful checksums match; the retained rolled-back record intentionally still has its historical checksum.

Old checksum: `d21885d18859ac8ece81d555d81c3a7c04b6ed10c712f78e3d8844c08bee44a0`.
Corrected checksum: `af1190e9cc1d79d1c4453cae5023831872cacadeec33a900be31ad8b29a14ce8`.

## Backup and log locations

Source backup before edits: `C:/Users/zyad/Documents/ChatGPT/zyad ashraf/nordhaven-backup-20261020` (source, docs, migrations and contracts; excludes generated/dependency/cache/Git directories).

Evidence directory: `C:/Users/zyad/Documents/ChatGPT/zyad ashraf/nordhaven-evidence`.
Separate database backups there: `nordhaven-before-reconciliation.dump`, `nordhaven_integration-before-reconciliation.dump`, `nordhaven_e2e-before-reconciliation.dump`. Corresponding backup-contents files prove archive readability; restore itself was not performed. `database-reconciliation.json` records backup SHA-256, application table counts/hashes, commands and checksum remediation. `existing-databases.json` contains the final read-only inspection.

Database-backed tests ran only on newly created `hc017_verify_20261020_integration` and `hc017_verify_20261020_e2e`. Existing fixture cleanup deleted test-created rows only on these new isolated databases. The three original databases were never reset and no existing application rows were deleted. The isolated databases are retained.

## Readiness

The HC-DEC-017 behavior is ready for functional Product Owner review based on executed local tests. Full security approval remains open for the unpatched development dependency; this record does not waive it. No commits, pushes, deployments or database resets occurred. M01-M04 source modules and approved decisions were preserved; M06 was not started.

## Failures observed and resolved

The initial source parse failure was repaired before the first unit run. The first composite run failed formatting and was corrected without changing gate rules. Fresh migration replay failed on BOM (P3018/42601); corrected SQL replay passed. The first integration run had 71 passes and one new fixture failure because two seeded products shared the default name/slug; giving the second fixture its own name resolved it. An E2E rerun had 39 passes and one stale component-stock expectation; updated the assertion to the exact HC-DEC-017 arithmetic (12 tables minus 5 assembled leaves 7; reservation confirmation does not consume those components again). Final reruns passed. Full audit remains nonzero solely for the unpatched braces advisory; it has not been waived.

## Independent audit follow-up — 2026-10-20

The subsequent source audit found and repaired six High application defects and related concurrency/limiter issues. See [audit remediation](independent-audit-m01-m05.md) for the newer verification evidence and remaining findings. The original functional verification above is historical evidence, not a waiver of the independent audit. M06 remains NO-GO pending disposition of the recorded open items.

## Verification repair pass — 2026-10-20

A local verification pass against the delivered tree found and repaired two defects. Both repairs are
recorded here because they change the meaning of the earlier evidence.

**Composite gate blocker.** `pnpm verify` failed in its first category: `tsconfig.base.json` carried a
single CRLF line ending, so `prettier --check .` rejected the file and the gate stopped before any
code was exercised. The file was re-formatted with the repository's own Prettier configuration. No
gate rule, configuration value, or source file was changed to make the check pass.

**E2E rate-limit budget exhaustion.** The inventory journey suite failed one test with
`429 Too Many Requests` on an administrator sign-in. Root cause: the suite created one application in
`beforeAll` and shared it across every scenario, while the limiter is process-local. The `auth.sign-in`
policy allows 10 sign-ins per 300 seconds per client and per account, and the guard consumes the
client bucket before authentication, so the shared instance accumulated eleven sign-ins from the
loopback address and the eleventh was refused. The repair gives each scenario its own application
lifetime (`beforeEach` creates and `afterEach` closes it, with both database resets in `beforeEach`),
which is the pattern the catalog, identity, and customer journeys already use, and the dedicated
rate-limit proof keeps its own instance. No production policy, limit, assertion, or contract was
changed or relaxed.

**Verification after the repairs.** `pnpm verify` exits 0 across all eight categories (format, lint,
boundaries, types, unit, build, repository hygiene, OpenAPI validation and drift). Unit: 248 passed
across 28 suites. Integration: 97 passed across 7 suites. E2E: 42 passed across 6 suites. Process: 4
passed and 1 skipped, the pre-existing Windows graceful-shutdown signal test that remains unverified
on this host. `prisma migrate status` reports 9 migrations and an up-to-date schema on `nordhaven`,
`nordhaven_integration`, and `nordhaven_e2e`. The application boots, and `/api/v1/health/live`,
`/api/v1/health/ready`, and `/api/docs-json` answer 200.

**Audit findings M04–M07.** The four catalog and inventory defects left open by the independent audit
are remediated in the current source and covered by regression tests: variant removal locks the
product row and refuses to strip a published product of its last SKU, hierarchy writes serialize
under a transaction-scoped advisory lock and revalidate ancestry before the write, bundle deletion
translates a missing record into the documented 404, and inventory cursors are validated as strict
UUIDs. The formal disposition of those findings remains with the Product Owner and security owner;
this record does not claim their sign-off.

**Still open.** The development-only `braces@3.0.3` advisory (GHSA-vfj7-8cjw-p6xm) has no upstream
patch and remains unwaived. The production dependency audit is clean. The M06 NO-GO assessment in the
audit record is unchanged by this pass.

## Milestone 06 disposition

The M06 NO-GO assessment was carried by two conditions: the recorded open security findings and the
unwaived development advisory. The catalog and inventory findings were remediated in the source and
covered by regression tests before this milestone began, and the Milestone 06 verification pass
confirmed the full composite gate green again (exit 0, all eight categories) with 278 unit, 116
integration, 47 end-to-end, and 4 process tests passing.

The unwaived `braces@3.0.3` development advisory is unchanged and remains a security-review item
for the Product Owner and the security owner; it is not a production dependency, and the production
audit is clean. This milestone therefore does not claim a security sign-off, and no
`HC-DEC-*` decision was resolved by it. See [Milestone 06](milestone-06.md) for the executed
evidence.
