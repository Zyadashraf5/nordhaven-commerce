# Nordhaven Commerce M11–M14 — independent final development report

Date: 2026-10-22 (Cairo). Project: D:/projects/nordhaven-commerce. This report supersedes historical completion claims. Existing M11–M14 implementation was preserved, independently reviewed and corrected; it was not all authored in this session.

**Decision: CONDITIONAL GO for isolated development; NO-GO for production activation. M14 remains PARTIAL / BLOCKED.** M11 safe development mechanisms and M12–M13 development gates pass. Shipping charge collection/commercial acceptance remains explicitly deferred, so this is not an unconditional claim that every original M11 business requirement is satisfied.

## Verified baseline and safety

Final code/operational fingerprint: f9cf2f3ad8a1c3e082bcc8e346ff43a2d784a8fa4804cecd6418c84e6004a8db. Accepted gate metadata confirms the same fingerprint before and after each final run. This fingerprint includes source, tests, Prisma/SQL, manifests/lockfile, OpenAPI, Dockerfile, compose, CI and environment example; generated output and narrative documentation are excluded. Documentation receives separate formatting/hygiene checks after this report.

Pre-edit source backup: source-before/ and source-before.json, 549 files individually SHA-256 verified and stable during copying. Additional phase backups preserve changed files. Final verified recoverable source copy:source-final/ with source-final.json. Historical original pg_dump archives still match their existing size/SHA manifests. [Backup preservation evidence](<C:/Users/zyad/Documents/ChatGPT/zyad ashraf/nordhaven-m11-m14-final-20261021/historical-backups-preserved.json>).

The starting tree already contained a 23-migration M11–M14 batch, including 33 differences from the prior M01–M10 audit files. Historical reports were not accepted as verification. Three new owned databases were exact clones of a verified idle/current 23-migration isolated template, with matching all-table content hashes. This avoided replaying the pre-existing DROP-column migration. The three original databases were read only; the updated app and tests never targeted them.

Constitution, approved decision register including HC-DEC-017, lockfile, overrides, existing braces patch and all 23 pre-existing migration SQL files remain byte-identical to the pre-edit snapshot. [Protected source hashes](<C:/Users/zyad/Documents/ChatGPT/zyad ashraf/nordhaven-m11-m14-final-20261021/protected-source.json>). No reset, truncation, destructive migration, volume deletion, commit, push, deployment, real payment/refund, production activation or external customer notification occurred.

## Milestone acceptance and task accounting

- M11: 45 recorded task entries (38 legacy +7 independent corrections). Shipping destinations/methods and attributed configuration facts, shipment lifecycle/tracking, customer-isolated return claims, atomic inventory receipt and honest refund projection are implemented. Before M12, verify 387/37, full integration 296/15 and shipping HTTP 8/1 passed. Safe development mechanisms accepted; quote/order shipping-charge collection FR-004–FR-006 and associated SC-001 remain deferred pending rate/tax/module design decisions. Options explicitly label TEST and chargeCollected:false. No actual rate, provider, destination list or merchant policy was invented.

- M12: 43 task entries (35 actual legacy entries +8 corrections; the older claim 36 was inaccurate). Reviews use complete verified-purchase history, stable duplicate/moderation conflicts and ownership controls. Domain changes and durable notification intent share a transaction; dispatch follows commit, uses a durable lease/stable identity, and has audited ADMIN/MFA retry. Shipment and successful-return notices use safe local transports; production binds Noop. Before M13, verify 387/37, integration 307/15 and E2E 118/14 passed. Development accepted; real channels, templates/consent and policy-dependent review withdrawal remain deferred.

- M13: 37 task entries (31 legacy +6 corrections). Existing owner administration APIs remain; global owner state totals and account/customer activity counts are exact, account lookup works beyond 500, customer listing has bounded UUID pagination preserving orphan commerce identities, and bounded record-ID arrays declare recordsTruncated. Concurrent shipment refusals retain actor/facts. ADMIN/MFA/security boundaries and reviewed OpenAPI remain. Before M14, verify 387/37, integration 312/15 and admin HTTP 6/1 passed. Development accepted; no live financial operation activated.

- M14: 24 explicit tasks in tasks.md: 18 safe engineering/evidence tasks complete and 6 acceptance groups blocked. This corrects the earlier unsupported all 24-complete claim. Runtime original-target guard, safe config/CI names, retained restore, real-DB latency probe, packaging/security regression, final tests and operational documentation completed. Production acceptance remains PARTIAL/BLOCKED.

Counts describe actual task records and disposition, not a blanket assertion that deferred commercial/production features were implemented. Legacy implementation was retained; corrective task completion and actual gates are separately evidenced. [Task counts](<C:/Users/zyad/Documents/ChatGPT/zyad ashraf/nordhaven-m11-m14-final-20261021/task-counts.json>).

## Actual final verification

- Unit: 416 passed in 40 suites (inside accepted pnpm verify). Initial current-tree baseline was 387;29 new unit cases exercise database targeting, notification artifacts and operational target guards.

- Integration: 312 passed in 15 suites, including 27 additional cases over the285-case inherited batch. Inventory suite covers FIXED independent stock, assembly/disassembly conservation, rollback, reserved-goods protection and shared-component concurrency. Order/payment suites cover mixed-cart allocation, concurrent reservations and cumulative pending/succeeded refund budgets. Shipping tests cover cumulative claims, dynamic-component restoration, injected rollback, duplicate receipt and refund outcomes.

- E2E: 119 passed in 14 suites. ADMIN/MFA/ownership/error/contract boundaries remain exercised. The initial shipping-label E2E failed because Swagger inferred numeric type for an enum containing false; metadata was corrected to explicit Boolean, the assertion was retained, and the complete suite subsequently passed. Superseded/failing logs are retained. A separate E2E rerun hit the unchanged5-second inventory journey deadline while other verification/export work was active; the isolated inventory/full reruns passed without code, timeout or assertion changes. Contention is an inference from the timing, not a reproduced application logic failure.

- Windows process:4 passed,1 skipped in 2 suites. The skip is the POSIX SIGTERM case, not a passing Windows signal test. Local Linux container process:5 passed in 2 suites including actual SIGTERM. Hosted CI was not executed.

- pnpm verify:all 8 categories passed—format, lint, module boundaries, TypeScript, unit, build, repository hygiene and OpenAPI validation/drift. Deprecated node10/baseUrl warnings remain resolved through the tested existing Node16 module configuration; no unrelated compiler upgrade.

- Prisma source validates. All3 owned databases have26 applied/source-matching migrations, migrate status exit0 and drift exit0. The3 originals remain14/source-matching, status exit1 with 12 pending and drift exit2:expected deferred state, explicitly not a pass.

- Local multi-stage Docker build passed with frozen dependencies and patch files available. Final runtime image scan found0 detected vulnerabilities across175 indexed packages. Runtime regression proves uid 1000, unused package managers absent, exact zlib 1.3.2-r1, working compression, real26-migration Prisma startup and no opened listener. Compose configuration validation passed. No image was pushed or application deployed.

- Production dependency audit:0 advisories, exit0. Complete project dependency audit:1 High braces, exit1. Readiness static/config gate:15/16 pass, exit1 on that same High finding. These failed gates are retained and block production acceptance.

[Accepted gate logs](<C:/Users/zyad/Documents/ChatGPT/zyad ashraf/nordhaven-m11-m14-final-20261021/gates>); [Operational logs/metadata](<C:/Users/zyad/Documents/ChatGPT/zyad ashraf/nordhaven-m11-m14-final-20261021/operations>); [Owned schema proof](<C:/Users/zyad/Documents/ChatGPT/zyad ashraf/nordhaven-m11-m14-final-20261021/isolated-after.json>); [Original read-only proof](<C:/Users/zyad/Documents/ChatGPT/zyad ashraf/nordhaven-m11-m14-final-20261021/originals-after.json>).

## Confirmed defects corrected — defensive findings

### F01 — High — Cumulative return quantity and money claims

Location:[shipping.service.ts](D:/projects/nordhaven-commerce/apps/api/src/modules/shipping/application/shipping.service.ts:457).

Root cause/impact: Per-request validation ignored outstanding claims and independently rounded refunds. Concurrent claims could exceed purchased units; split returns could lose the final minor unit.

Implemented correction: Order-scoped transaction lock, complete outstanding claims, persisted exact BigInt cumulative allocation; cancelled/rejected claims release their units and money.

Evidence: shipping-returns.integration.spec.ts: cumulative claims, last-unit race, split-money allocation. Status:FIXED.

### F02 — High — Atomic receipt and inventory conservation

Location:[shipping.service.ts](D:/projects/nordhaven-commerce/apps/api/src/modules/shipping/application/shipping.service.ts:624).

Root cause/impact: Receipt, movements and restock flags crossed transaction boundaries; DYNAMIC bundle returns targeted finished-goods inventory.

Implemented correction: One receipt/restock/facts transaction; restore immutable component snapshots for DYNAMIC and independent finished goods for FIXED; reject ambiguous legacy kind.

Evidence: shipping-returns.integration.spec.ts: injected persistence rollback, DYNAMIC restoration and concurrent receipt; inventory.integration.spec.ts: FIXED conservation/reserved-goods protection. Status:FIXED.

### F03 — High — Restock replay identity and quantity validity

Location:[inventory-restock.service.ts](D:/projects/nordhaven-commerce/apps/api/src/modules/inventory/application/inventory-restock.service.ts:17).

Root cause/impact: A movement replay could accept a conflicting target/quantity payload without validating its existing business identity.

Implemented correction: Validate bounded whole quantities and exact movement payload, sort stock locks, refuse DYNAMIC finished-goods targets and conflicting references.

Evidence: shipping-returns.integration.spec.ts: conflicting key, invalid target and repeated physical receipt. Status:FIXED.

### F04 — High — Truthful return refund state

Location:[shipping.service.ts](D:/projects/nordhaven-commerce/apps/api/src/modules/shipping/application/shipping.service.ts:796).

Root cause/impact: PENDING or FAILED financial outcomes could project a return as REFUNDED.

Implemented correction: Only SUCCEEDED projects REFUNDED; retain RECEIVED with PENDING/FAILED/REFUSED/UNKNOWN outcomes; zero-money return invokes no provider.

Evidence: shipping-returns.integration.spec.ts: pending/failed outcomes, retry and single refund. Status:FIXED.

### F05 — High — Concurrent identical full-refund retry

Location:[payment.service.ts](D:/projects/nordhaven-commerce/apps/api/src/modules/payments/application/payment.service.ts:407).

Root cause/impact: An identical retry could hit the cumulative budget before unique-conflict recovery and be refused despite an existing valid claim.

Implemented correction: Claim the customer/idempotency key under a durable transaction lock before checking budgets; provider remains outside transaction; keep authoritative locked budget and rollback recovery.

Evidence: payment-refund.integration.spec.ts and shipping-returns.integration.spec.ts: same-key/different-payload and concurrent receipt. Status:FIXED.

### F06 — Medium — Return input and configuration history

Location:[shipping.service.ts](D:/projects/nordhaven-commerce/apps/api/src/modules/shipping/application/shipping.service.ts:649).

Root cause/impact: Unknown/duplicate physical-line identifiers and unaudited configuration writes could produce misleading administrative outcomes.

Implemented correction: Refuse unknown/duplicate IDs before state writes; atomically retain shipping configuration before/after/actor; production configuration remains refused.

Evidence: shipping-returns.integration.spec.ts: invalid IDs, configuration facts and production refusal. Status:FIXED.

### F07 — Medium — Complete verified-purchase eligibility

Location:[review.service.ts](D:/projects/nordhaven-commerce/apps/api/src/modules/review/application/review.service.ts:83).

Root cause/impact: Eligibility consulted only the latest100 paid orders, incorrectly rejecting an older valid purchase.

Implemented correction: Publish and use an exact owner query over complete eligible purchase history rather than expanding an arbitrary cap.

Evidence: review-notification.integration.spec.ts: eligible purchase beyond 100. Status:FIXED.

### F08 — Medium — Review concurrency error mapping

Location:[review.service.ts](D:/projects/nordhaven-commerce/apps/api/src/modules/review/application/review.service.ts:49).

Root cause/impact: Concurrent duplicate review creation exposed a persistence uniqueness failure instead of the stable domain conflict.

Implemented correction: Serialize customer/product creation and review decisions, preserve domain409 and refusal audit after rollback.

Evidence: review-notification.integration.spec.ts: duplicate race and stable error. Status:FIXED.

### F09 — High — Atomic moderation and notification intent

Location:[notification.service.ts](D:/projects/nordhaven-commerce/apps/api/src/modules/notification/application/notification.service.ts:34).

Root cause/impact: A moderation decision and notification could commit separately; delivery failure after commit could misreport a completed business action as failed.

Implemented correction: Persist intent in the domain unit of work; DatabaseService afterCommit executes outside transaction context, drops callbacks on rollback, and delivery failure leaves durable retryable state.

Evidence: review-notification.integration.spec.ts: rollback, failed provider after commit and recovery. Status:FIXED.

### F10 — High — Notification concurrency, replay and recovery

Location:[notification.service.ts](D:/projects/nordhaven-commerce/apps/api/src/modules/notification/application/notification.service.ts:77).

Root cause/impact: Concurrent business keys, recipient/content replay conflicts, failed/pending messages and lost post-provider outcomes lacked a safe durable recovery model.

Implemented correction: Serialize intent keys with payload validation; persist metadata; claim timestamp/token lease, finalize with token CAS and stable provider UUID; ADMIN/MFA audited retry; terminal records are not resent.

Evidence: review-notification.integration.spec.ts: concurrent keys, wrong-recipient replay, pending/failed/expired-lease recovery; notification HTTP retry. Status:FIXED.

### F11 — High — Production notification binding

Location:[notification.module.ts](D:/projects/nordhaven-commerce/apps/api/src/modules/notification/notification.module.ts:37).

Root cause/impact: A literal configuration object could select the memory customer transport in production despite environment parsing guards.

Implemented correction: Force Noop at the provider factory for production, independently of parsing; local adapters refuse production.

Evidence: review-notification.integration.spec.ts: literal production configuration; notification.providers.spec.ts: production refusal. Status:FIXED.

### F12 — Medium — Workflow notification omissions

Location:[shipping.service.ts](D:/projects/nordhaven-commerce/apps/api/src/modules/shipping/application/shipping.service.ts:373).

Root cause/impact: Shipment and successful return-refund workflow transitions did not consistently enqueue the corresponding approved local notices.

Implemented correction: Create stable keyed intents with transition facts, deliver only after commit, and send return-refund notice only after actual financial success.

Evidence: shipping-returns.integration.spec.ts and review-notification.integration.spec.ts: transition notices and rollback. Status:FIXED.

### F13 — Medium — Administrative facts beyond 500 records

Location:[administration.service.ts](D:/projects/nordhaven-commerce/apps/api/src/modules/administration/application/administration.service.ts:30).

Root cause/impact: Sampled500 rows were presented as global totals; direct account lookup could404 an existing account beyond the sample; activity totals silently truncated.

Implemented correction: Owner-published aggregates/exact counts, safe batch account projections, merged bounded UUID keyset pages preserving orphan commerce identities, direct account lookup and explicit recordsTruncated.

Evidence: administration.integration.spec.ts: >500 counts/account lookup/activity, orphan/customer pagination; administration.e2e.spec.ts: authorization/contract. Status:FIXED.

### F14 — Medium — Concurrent shipment refusal audit

Location:[shipping.service.ts](D:/projects/nordhaven-commerce/apps/api/src/modules/shipping/application/shipping.service.ts:396).

Root cause/impact: A CAS loser refused the transition without a durable refusal fact.

Implemented correction: Persist SHIPMENT_TRANSITION_REFUSED outside failed work with actor and fixed concurrency reason.

Evidence: shipping-returns.integration.spec.ts: concurrent transition refusal fact. Status:FIXED.

### F15 — Medium — Local notification artifact integrity

Location:[notification.providers.ts](D:/projects/nordhaven-commerce/apps/api/src/modules/notification/application/notification.providers.ts:46).

Root cause/impact: An exclusive direct write could leave a partial artifact, while EEXIST was accepted without verifying content.

Implemented correction: Flush a unique staging file, publish via exclusive same-directory atomic link, validate semantic content on replay including legacy pretty JSON; clean only the owned staging file.

Evidence: notification.providers.spec.ts: concurrent distinct messages, replay, corrupt/mismatched artifact, legacy formatting, production refusal. Status:FIXED.

### F16 — High — Protected original runtime targets

Location:[database-target.ts](D:/projects/nordhaven-commerce/apps/api/src/platform/config/database-target.ts:2).

Root cause/impact: Only test helpers protected the originals; normal startup or a literal DatabaseService configuration could still select an unmigrated original. This is a confirmed control gap, not evidence of an actual data mutation.

Implemented correction: Reject original names, encoded/ambiguous/missing database names and database query overrides before adapter construction; safe sample/CI names; no bypass flag.

Evidence: database-target.spec.ts and operational-tools.spec.ts: original/encoded target refusal before Docker/adapter. Status:FIXED.

### F17 — Medium — Restore proof and non-destructive operations

Location:[backup-restore-drill.mjs](D:/projects/nordhaven-commerce/scripts/backup-restore-drill.mjs:7).

Root cause/impact: The old psql helper could omit -c and count empty output as0, compared only a subset, used colliding archive paths and deleted the restored database/artifacts.

Implemented correction: Validate exact owned source, unique retained dump and restore database, list/decode archive and compare all table contents/counts/history plus unchanged source; require non-empty isolated business data.

Evidence: operational-tools.spec.ts; actual retained 51-table/26-migration restore manifest. Status:FIXED.

### F18 — Medium — Real positive readiness/performance probe

Location:[performance-probe.mjs](D:/projects/nordhaven-commerce/scripts/performance-probe.mjs:85).

Root cause/impact: The old positive probe was replaced with a no-op, so successful measurements did not prove actual DB readiness; old fallback selected a historical schema.

Implemented correction: Require the owned dev target and bounded sample parameters; restore real probe and connectAndProbe before measurements; label small read budgets honestly.

Evidence: operations/performance.log: actual DB probe,503/401 behavior and measured p95. Status:FIXED.

### F19 — Medium — Frozen container install patch availability

Location:[Dockerfile](D:/projects/nordhaven-commerce/apps/api/Dockerfile:5).

Root cause/impact: The Docker install referenced patchedDependencies before the patch directory was copied.

Implemented correction: Copy the reviewed braces patch before frozen installation; prove the actual multi-stage image build rather than relying on source inspection.

Evidence: operations/dockerbuild.log: frozen install, Prisma generation, build and production deploy packaging. Status:FIXED.

### F20 — Medium — Security gate thresholds and false readiness

Location:[production-readiness-check.mjs](D:/projects/nordhaven-commerce/scripts/production-readiness-check.mjs:231).

Root cause/impact: Production audit checked only Critical and the static readiness gate accepted exit1 from a High development audit.

Implemented correction: Check all production severities; make the full High advisory fail readiness and CI, retain the unresolved finding rather than suppressing it.

Evidence: auditprod exit0/full audit exit1; readiness15/16 exit1. Status:FIXED.

### F21 — High — Runtime base-image dependencies

Location:[Dockerfile](D:/projects/nordhaven-commerce/apps/api/Dockerfile:16).

Root cause/impact: The actual runtime image contained21 scanner advisories in 10 packages: unused base npm dependencies and the Alpine zlib revision, outside the application pnpm production tree. No exploitation is claimed.

Implemented correction: Remove exact unused npm/corepack/yarn runtime paths and apply only zlib 1.3.2-r1; keep Node/app dependency versions unchanged. Add durable non-root/tool-absence/version/compression/Prisma image regression and rescan without exclusions.

Evidence: Before SARIF21 CVEs; hardened runtime SARIF0 detected vulnerabilities; readiness:image-smoke actual runtime assertions. Status:FIXED.

## Database, inventory and recovery evidence

Owned targets:hc_batch_final_20261021_dev, hc_batch_final_20261021_integration and hc_batch_final_20261021_e2e. Only three new additive migrations were deployed to these targets:20261022010000_return_claim_integrity,20261022020000_shipping_configuration_history and 20261022030000_notification_delivery_recovery. Each deployment retained old-column content/checksum proof; no historical amount backfill was invented.

All3 originals retain exact previous-audit all-table row/content fingerprints and 14 active migration records. They each now have12 pending source migrations:the four earlier audit fixes, five inherited batch migrations and three new corrections. Existing20261021210000_order_shipping_snapshot_withdrawn DROPS columns; it was retained unchanged and not executed here. Future reconciliation requires reviewed controlled copies, retention of historical shipping facts and separately authorized rollout. Merely marking history applied is not acceptable.

Actual retained restore:51 public tables,26 active migrations; all table counts/content hashes, including migration history, match source and source-after. A SKIPPED local notification canary provides non-empty business-data evidence and was never dispatched. Archive:C:/Users/zyad/Documents/ChatGPT/zyad ashraf/nordhaven-m11-m14-final-20261021/restore-backups/16e90c722dfd4deba29aa99ecbaaaaa1.dump. SHA-256:1bc952b2b3de7fbf7395df045db986577b7b9bc07e7a208b530b1d58caa41a25. Restored database:hc_restore_16e90c722dfd4deba29aa99ecbaaaaa1. Archive, JSON manifest, container archive and restored database are retained; nothing was dropped. [Restore manifest](<C:/Users/zyad/Documents/ChatGPT/zyad ashraf/nordhaven-m11-m14-final-20261021/restore-backups/16e90c722dfd4deba29aa99ecbaaaaa1.json>).

Post-suite read-only invariant snapshots report0 violations for availability bounds, DYNAMIC finished-goods prohibition, active reservation projection, refund budgets/projections and cumulative return quantities. Test cleanup leaves sparse/empty inventory/financial tables; these snapshots are housekeeping evidence, not populated concurrency proof. The meaningful populated conservation/race/rollback evidence is in the integration suites. [Invariant counts and populations](<C:/Users/zyad/Documents/ChatGPT/zyad ashraf/nordhaven-m11-m14-final-20261021/final-invariants.json>).

## Performance and reliability scope

The local probe restores the actual database probe and requires connectAndProbe before positive measurements. Thirty samples per group with concurrency5 passed the 50/250/500ms p95 regression budgets. Measured details are preserved in operations/performance.log. Final measurements: health/live: n=30, p50=6.88ms, p95=14.25ms, max=17.13ms, budget=50ms; catalog/products: n=30, p50=12.61ms, p95=27.69ms, max=174.27ms, budget=250ms; catalog/products x5: n=30, p50=30.23ms, p95=53.40ms, max=76.00ms, budget=500ms.503-before-auth and 401-on-ready-anonymous protected requests passed. This is a small local read benchmark over sparse data, not production capacity, a contractual SLA or a financial idempotency test.

## Security results and remaining findings

No unresolved confirmed Critical application defect remains in this correction set. One High project development advisory remains:braces 3.0.3, GHSA-vfj7-8cjw-p6xm/CVE-2026-93687. Registry still reports3.0.3; the [reviewed upstream advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) lists no patched version. Actual chain is Jest29.7/ts-jest29.4.6/types → micromatch4.0.8 → braces 3.0.3. No application API usage was found, production tree is clean, and the final runtime scanner does not include it. Existing128-depth local patch and 10 consumer regressions are retained and pass; this is mitigation, not upstream closure or risk acceptance. No suppression, unrelated package upgrade or test weakening was used.

The actual image audit additionally found21 base-image advisories in 10 packages before hardening. Paths were bundled npm tooling plus Alpine zlib, rather than app lockfile packages. Runtime npm/corepack/yarn were removed and only the zlib security revision upgraded. Full final-runtime scan is clean without filters/exclusions. Historical images/build cache and development tool images are retained and are not production candidates; this runtime result does not certify all host/build tooling. Image signing/provenance/deployment-target review and ongoing scans remain deferred.

No known unresolved confirmed Medium application defect remains in the examined correction set. Future-scope/business dependencies are separate:shipping charge collection and taxability, real providers, merchant return terms, external notification consent/templates, review withdrawal/order fulfilment projection policy, shared multi-instance rate limiting/proxy topology, managed infrastructure, off-host RPO/RTO, observability and capacity objectives. They are not represented as reproduced exploits or silently approved features.

## Compatibility risks and explicit blockers

- Existing route IDs/statuses and business decisions are preserved, but strict clients must adopt the reviewed additive OpenAPI fields:shipping scope/chargeCollected, customer nextCursor/recordsTruncated and audited notification retry.

- Historical outstanding returns lacking allocated line money or an unambiguous bundle snapshot fail closed for reconciliation; no guessed refund or stock credit is issued.

- Original runtime names are deliberately blocked before reconciliation. Deployment/migration tooling must be separately planned; no configuration bypass exists. Runtime package managers are intentionally absent; use reviewed external build/migration jobs rather than installing tools in a running image.

- The long inventory HTTP journey passed in 4334ms against its unchanged5000ms default deadline after a contended run timed out. Keep heavy local gates sequential and verify hosted timing stability; this is a test-environment limitation, not evidence of a business assertion failure.

- Local file transport depends on same-directory atomic hard-link support and private filesystem permissions; it is not an approved external channel or a guarantee of off-host/power-loss recovery.

- The inherited destructive SQL history,12 original pending migrations, full High advisory gate, hosted CI/branch protection, approved shipping/payment/tax/merchant/channel configuration, image signing and production operations/capacity acceptance remain blockers. Local Linux success does not substitute for hosted verification.

**Final disposition: M11–M13 safe development accepted with explicit M11 commercial deferral; M14 safe engineering completed but final acceptance PARTIAL / BLOCKED. CONDITIONAL GO only for isolated development; NO-GO for production activation.** Exact owners and closing evidence are in docs/operations/deferred-acceptance-checklist.md and docs/requirements/production-readiness-register.md.
