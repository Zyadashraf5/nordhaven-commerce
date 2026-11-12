> Latest disposition: catalog/API findings M04–M07 are fixed, braces has a tested local mitigation, and all application gates pass. The original E2E fixture-preservation discrepancy remains open. See [the current remediation checkpoint](catalog-audit-remediation-20261020.md). The findings and counts below are historical.

# Independent M01–M05 audit and remediation

Date: 2026-10-20 (Africa/Cairo). **M06 assessment: NO-GO** pending disposition of the remaining confirmed catalog defects and the upstream development dependency advisory.

Six High application defects were fixed: stale-password session issuance during reset, concurrent stock movement ledger drift, expiry/extension races, concurrent MFA replay, missing aggregate client rate limits, and stale token consumption. Related lock ordering, incompatible terminal transitions and limiter memory bounds were fixed. The approved HC-DEC-017 finished-goods model and constitutional amendment remain unchanged; HC-DEC-004 stays open.

Verification: 237 unit tests, 90 integration tests and 41 E2E tests passed; process tests had 4 passes and one existing Windows skip. The full pnpm verify gate and OpenAPI drift passed. No failed check was waived. Fourteen new database regressions, two rate-limit units and one HTTP rate-limit regression were added. E2E scenario application lifetimes were isolated without relaxing production policies or assertions.

The additive credential-generation migration was backed up and applied on nordhaven, nordhaven_integration and nordhaven_e2e. All prior row contents/counts matched before and after; new generation values are zero. Nine migrations are current and schema diffs empty. No manual migration-history rewrite occurred in this phase.

Detailed defensive findings with baseline/current source references, evidence and fix rationale: C:/Users/zyad/Documents/ChatGPT/zyad ashraf/nordhaven-independent-audit/defensive-audit-report.md. Backup and gate evidence are alongside that report, including database-backups/ and auth-migration-evidence.json. The source backup is C:/Users/zyad/Documents/ChatGPT/zyad ashraf/nordhaven-before-audit-fixes-20261020.

Open: last-variant publication consistency; concurrent category hierarchy mutation; two documented inventory API error mappings; the development-only braces advisory. Production audit is clean; full audit still reports one upstream High advisory, assessed separately from remote API exploitability. No clean full-security audit or deployment readiness is claimed.

No resets, volume deletion, commits, pushes, deployments or M06 implementation.
