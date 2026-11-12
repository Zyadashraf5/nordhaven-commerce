# Local operational runbook — 2026-10-22

M14 remains PARTIAL / BLOCKED for final production acceptance. No deployment or original-database mutation is authorized by this document. See deferred-acceptance-checklist.md and ../progress/m11-m14-batch-report.md.

## Database targeting

Current application requires 26 matching migrations. Only batch-owned targets hc_batch_final_20261021_dev, hc_batch_final_20261021_integration and hc_batch_final_20261021_e2e were updated here. The three original nordhaven names remain14 and are rejected by both environment loading and DatabaseService before adapter creation. Existing local .env was not overwritten. Set an explicit safe URL for each command; never rely on a historical default. Integration/E2E suites mutate their own fixtures and must use their respective verified isolated suffixes.

Historical migrations are not all additive: the existing shipping-snapshot withdrawal drops columns and requires separate preservation review before any future controlled-copy reconciliation. This batch applied only three new additive migrations to the three owned targets. No original migrations or checksums were changed.

## Development verification

Run pnpm verify for format, lint, architecture boundaries, TypeScript, unit, build, hygiene and OpenAPI drift. Run integration, E2E and process suites separately with pinned isolated URLs. prisma validate validates source only; migrate status, migrate diff and source/stored migration checksums must independently match on each intended isolated database. A successful validate is not data-preservation evidence.

pnpm audit:prod checks all production severities. pnpm audit checks the complete tree. pnpm readiness:check is a static/configuration inspection plus audits; a failing High development advisory causes failure and cannot be relabeled green. Its substring checks complement behavioral tests and are not a security certification.

## Retained backup/restore drill

Provide an absolute durable NORDHAVEN_BACKUP_DIR environment variable, then run pnpm readiness:backup-drill hc_batch_final_20261021_dev. The source must be one of the three exact owned batch names. The existing local PostgreSQL container must be running. The source must contain a safe non-delivering canary or other isolated business row so an empty restore cannot masquerade as business-data proof.

The command verifies source identity; hashes every public table with counts; creates a unique custom pg*dump archive; retains a host copy with SHA-256; lists and decodes the archive; creates a brand-new hc_restore*<UUID> database; restores with exit-on-error; compares all 51 table contents and migration history; and verifies the source remained unchanged. It retains the archive, JSON manifest, container archive and restored database, including failures. It never drops/truncates a database or deletes a volume. Do not restore over any existing database. Do not run destructive cleanup as part of this drill.

The drill is explicitly local. Production recovery additionally needs approved off-host encrypted retention, access controls, independent checksum verification, actual RPO/RTO rehearsal and a reviewed cutover/rollback procedure. Do not equate local retained backup with disaster recovery.

## Performance and availability

After building, pin DATABASE_URL to the owned dev database and run pnpm readiness:performance. Defaults are30 samples and concurrency5; inputs are bounded. A simulated failed probe proves503; the real probe is restored and connectAndProbe must succeed before positive measurements. Health/live budgets50ms, catalog read250ms and five concurrent reads500ms are local regression budgets, not production objectives. No payment/refund/provider is invoked. A protected anonymous request must receive401 once ready. Financial idempotency and inventory conservation are covered by actual integration concurrency tests, not by this read-only latency probe.

## Packaging and local notifications

Dockerfile builds from pinned Node22.23.3, installs the frozen lockfile including the braces patch, generates Prisma and deploys production dependencies to a non-root runtime. Local docker build is packaging verification, not deployment. No ports or volumes are needed for the one-shot non-root Prisma smoke. The local runtime OS/package scan has completed; hosted CI, image signing and production environment validation remain deferred.

Customer notification dispatch persists an intent with domain state, runs only after commit and claims a durable delivery lease. ADMIN/MFA retry is audited. Memory/file adapters are local only; production binds Noop. File delivery flushes staging data, atomically publishes an exclusive UUID artifact and validates any existing content. Keep the local artifact directory private; the mechanism is not a production messaging durability guarantee or an approved external channel. Do not delete unknown/pending artifacts as a delivery shortcut.

## Observability and controls

Use correlation IDs, structured redacted logs, durable security/domain facts and health/live plus health/ready endpoints. Readiness failure precedes authentication work. Admin routes require role/MFA and rate policies. Rate limiting currently has per-instance counters; a multi-instance production design requires reviewed shared limiting/proxy topology and capacity decisions. Existing durable account lockout remains separate.

Configure no real merchant secrets, shipping/payment/tax policies or external customer channels until approvals and final acceptance are complete. Never commit secrets or logged customer content.

### Final local image evidence —2026-10-22

Local Docker Scout runtime scan completed with 0 detected vulnerabilities in 175 indexed packages after removing unused runtime npm/corepack/yarn and updating only zlib to1.3.2-r1. The durable readiness:image-smoke checks package absence, exact patched version, compression, uid 1000 and real isolated Prisma startup without a listener. Actual local Linux SIGTERM/process tests passed 5/5; Windows4 pass/1skip. Hosted CI, signing/provenance and production-target security acceptance remain unverified/deferred. Full development audit still 1 High braces, so no security exception or production readiness is implied.
