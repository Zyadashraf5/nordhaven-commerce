# Deferred final acceptance — 2026-10-22

M14 is PARTIAL / BLOCKED. This checklist supersedes earlier migration counts and readiness claims. These are closing conditions, not authorization to perform a rollout.

## Original databases — operations and Product Owner

nordhaven, nordhaven_integration and nordhaven_e2e remain untouched:14 active migrations each; all-table row/content fingerprints match the previous audit. Current source has26 migrations. All12 pending migrations must be reviewed, including the four earlier M06–M10 corrective migrations and eight subsequent migrations:

- 20261021150000_audit_integrity
- 20261021153000_order_refund_projection
- 20261021160000_pending_refund_budget
- 20261021170000_configuration_audit
- 20261021190000_shipping_returns
- 20261021200000_order_shipping_snapshot
- 20261021210000_order_shipping_snapshot_withdrawn
- 20261021220000_stock_movement_reference
- 20261021230000_reviews_notifications
- 20261022010000_return_claim_integrity
- 20261022020000_shipping_configuration_history
- 20261022030000_notification_delivery_recovery

Before any separately authorized reconciliation: retain separately verified pg_dump archives off-host; restore into new controlled copies; review every SQL operation and preserve old-column business data. The pre-existing 20261021210000_order_shipping_snapshot_withdrawn migration DROPS columns. It was not executed in this batch and must not be called additive or blindly replayed. Review preservation of any historical shipping facts before approving its treatment. Never rewrite applied checksums or mark missing schema changes applied. Re-run source/stored checksums, migration status, zero drift, all-table data comparisons, inventory/reservation/refund invariants and full regression on controlled copies. Only subsequently approve a maintenance/restore/rollout plan. Runtime guard removal requires a separately reviewed reconciliation change; no bypass flag exists.

## Post-reconciliation regression — engineering

Retain full verify, integration, E2E, process, security and restore evidence on reconciled controlled copies. The isolated batch proofs do not certify the originals or production data. Legacy outstanding return claims with unknown per-line amounts require explicit reconciliation; current code fails closed instead of guessing.

## Hosted verification — engineering

CI definitions exist and now use separate nordhaven_ci_integration/nordhaven_ci_e2e targets. The full High-advisory audit gate remains enabled and currently fails. No hosted job was run, no history pushed and no branch protection configured here. Obtain actual hosted Linux and Windows results, including Linux SIGTERM handling, after separate publication authorization. A local Windows skip is not a Linux pass.

## Commercial and compliance scope — Product Owner, merchant and provider owners

Shipping options explicitly identify TEST scope and chargeCollected:false. Configured fees are informational/shipment records: no shipping fee is collected in quote/order totals. Original M11 fee-collection FR-004–FR-006/SC-001 remain deferred pending approved rates, shipping tax treatment and a reviewed pricing/module design. No exemption, VAT rate, destination eligibility, delivery promise or merchant return policy was invented.

Approve and implement real payment/refund and shipping adapters, provider verification and sandbox evidence; approve notification channels, templates, consent and retention. Production notification binding is inert. Approve tax registration, rules/effective dates, shipping taxability, invoicing and merchant return terms before activation. Review withdrawal of published reviews and order FULFILLED projection as explicit business-policy work; these are documented scope gaps, not silently implemented transitions.

## Security closure — security and engineering owners

Production dependency audit is clean; full development audit remains1 High braces advisory GHSA-vfj7-8cjw-p6xm/CVE-2026-93687. Registry still reports3.0.3 and no patched release. Existing local depth mitigation and consumer regressions reduce exposure but do not close the advisory. Obtain a verified upstream correction or a separately reviewed documented risk decision; no exception was approved here. Retain full audit failures. Retain and repeat runtime scans for releases; complete provenance/signing and deployment-target security review. Local image build and non-root smoke do not certify security.

## Operations acceptance — operations and Product Owner

Approve target environment, secret management/rotation, managed PostgreSQL, off-host encrypted backup retention, restore ownership, RPO/RTO, observability/alerts, incident response and capacity targets. Local small-data read latency is not a production SLA/load test. The retained local restore drill proves51 tables and 26 migration records with a non-delivering canary; it does not prove off-host disaster recovery or production cutover.

Final decision remains NO-GO for production activation. Continue only isolated development under these restrictions.

### Final local image evidence —2026-10-22

Local Docker Scout runtime scan completed with 0 detected vulnerabilities in 175 indexed packages after removing unused runtime npm/corepack/yarn and updating only zlib to1.3.2-r1. The durable readiness:image-smoke checks package absence, exact patched version, compression, uid 1000 and real isolated Prisma startup without a listener. Actual local Linux SIGTERM/process tests passed 5/5; Windows4 pass/1skip. Hosted CI, signing/provenance and production-target security acceptance remain unverified/deferred. Full development audit still 1 High braces, so no security exception or production readiness is implied.
