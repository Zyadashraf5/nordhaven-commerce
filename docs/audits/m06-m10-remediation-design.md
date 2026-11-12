# M06–M10 independent remediation design — 2026-10-21

This record supersedes implementation assumptions in the original milestone research where noted below. It does not amend the constitution or reopen approved Product Owner decisions. Execution evidence and the final readiness decision are recorded separately after the final gates.

## Ownership and transactions

DatabaseService exposes an explicit database-only unit of work. AsyncLocalStorage supplies its transaction client to module-owned repositories, including their callback transactions. Other asynchronous requests retain their own client/context. Batch transactions cannot silently join this context. Provider/network operations never run inside a financial database transaction.

Normal order creation locks the customer business aggregate and the cart parent before quoting, holding inventory, persisting immutable order/event records and removing the covered cart lines. Payment events lock the provider event and order before re-reading the attempt and atomically applying order/inventory/payment/event changes. Refund intent is durable before the provider call; completion locks the order and payment row, updates refund budget/state, order refund projection and audit facts together. Rollback callbacks persist immutable business-refusal facts after the failed outer transaction has ended; they never invoke providers.

Cart mutations share the parent-row lock. Internal mixed reservations combine all SKU, fixed finished-good and approved dynamic-component demands before a single atomic hold. Shared components are also aggregated for checkout readiness. FIXED assembly/disassembly and DYNAMIC component-derived stock remain governed by HC-DEC-017.

Catalog purchase facts and bundle purchase identities are published owner contracts. Cart, Customers and Inventory no longer issue foreign Catalog root queries. Existing declared FK relation projections remain deliberate read projections. The boundary gate now checks literal Prisma persistence roots as well as private imports. This static check complements source review; it is not a complete semantic verifier.

The dependency direction remains acyclic: Payments consumes Order; Order consumes Checkout, Cart and Inventory; Checkout consumes Cart, Inventory and Tax; Cart consumes Inventory and Catalog; Inventory and Customers consume Catalog. All imports cross public module indexes.

## Financial evidence and recovery

A successful event needs an explicit safe integer amount exactly equal to the attempt/order total and a matching currency. Missing, underpaid, overpaid or wrong-currency evidence cannot allocate stock. Mismatches are durable rejected facts. A supplied provider reference must resolve directly under its provider; it never falls back to an unrelated order attempt or a newest-200 scan.

Payment attempts are claimed under a customer business-key lock and an order lock. A different key cannot create another active attempt for the same order. An unknown create/refund provider outcome leaves a durable pending intent; retry uses payment:<attempt UUID> or refund:<refund UUID>. A definite failed refund returns its reserved budget once. A pending refund retains budget in pendingRefundMinor; refundedMinor reports only successful money movement. Full refund is derived from successful totals under lock, and the order reports refundedMinor and REFUNDED as M10 requires. Refunds do not restock physical goods: M11 return policy is excluded.

Order snapshots carry the actual discount. ORDER_CREATED also retains the complete applied quote, including tax-rule identifiers. Tax arithmetic uses BigInt intermediates and returns bounded integer minor units. Checkout reports AMOUNT_UNSUPPORTED before creating a hold when PostgreSQL's existing Int money representation cannot store the result. This is a representation guard, not a new commercial price policy.

The default initial order hold remains 900 seconds. ORDER_RESERVATION_TTL_SECONDS accepts 60..86400 seconds. An expired hold never becomes sellable allocation through a late event; money is recorded as PAID_PENDING_ALLOCATION, and reconciliation reports missing allocation. Lists and individual reads use the same order expiry semantics.

## Pre-orders

Creation records intent and a complete quote/destination snapshot without a charge or hold. Readiness checks ownership before any state/stock change, then creates a real atomic reservation. A lapsed pre-order hold returns to awaiting stock and may be reacquired with a new versioned key. Lifecycle facts are append-only pre_order_events.

Authenticated POST /api/v1/orders/pre-orders/{preOrderId}/convert accepts only expectedFingerprint (null or the confirmed quote digest). It recomputes current server catalog/tax facts for the saved intent independently of the current cart, verifies the exact existing hold, and creates one idempotent ordinary pending-payment order. It creates no payment, never duplicates the hold and never clears an unrelated/current cart. The existing hold's remaining expiry transfers to the order. The pre-order links AWAITING_PAYMENT and becomes CONVERTED on settlement. Cancellation delegates to the linked order's own rules. Legacy incomplete intents fail closed for review; missing historic destinations/tax are not invented.

## Local webhook protocol tightening

Only LOCAL_TEST is registered. Adapter operations and service entry points refuse production. There are no real provider credentials, network calls or activated payment integration.

For local test events, x-local-test-signature authenticates a UTF-8 JSON tuple consisting of the exact raw body string, followed in order by the values of x-local-test-event-id, x-local-test-event-type, x-local-test-order-id, x-local-test-provider-reference, x-local-test-amount-minor, x-local-test-currency and x-local-test-occurred-at. A missing value is represented by null. The algorithm remains HMAC-SHA256 with the deliberately non-secret local test fixture key. This is a security-compatible protocol correction requiring local event producers to update their signatures; body-only signatures are rejected.

Nest retains the actual raw request Buffer. The handler does not reconstruct JSON bytes. Timestamp is required and authenticated within the existing five-minute window; amount, currency and identifier shape are validated. Durable provider-event deduplication remains authoritative for repeats.

Explicit constructor-only test scenarios cover failure, timeout, delayed pending state and deterministic duplicate references. Scenario selection is not a customer-controlled financial API. This simulation is not a persistent provider system or a Paymob reconciliation oracle; restart, real upstream status/currency/amount reconciliation, unknown-provider-payment discovery, provider idempotency guarantees and merchant activation require a verified future adapter contract. The Paymob assumption document remains unverified and no adapter was activated.

## Safe schema evolution and compatibility

20261021150000_audit_integrity adds the missing pre-order/order unique index and append-only pre-order/refund audit tables. Existing product/tax index names and the effective-price default are represented accurately in Prisma. 20261021153000_order_refund_projection adds the approved refunded-order enum value and bounded refunded_minor column. Applied migration files are not rewritten. 20261021160000_pending_refund_budget separates pending refund holds from completed refunds with a combined database bound. Historical financial outcomes are not fabricated by a backfill.

The schemas were replayed and corrected on newly created isolated databases with status/drift and pre-existing data checks. Any application to canonical databases must use verified separate pg_dump archives, a quiet-state/data preflight and post-migration history/schema/data validation. Tests always target the isolated databases; canonical data is never reset or used as test fixtures.

Compatibility changes are additive order/refund fields/status and pre-order conversion, a checkout blocker, strict authenticated webhook metadata and bounded idempotency headers. Existing authenticated ownership, mandatory admin MFA, EGP settlement, HC-DEC-017 and all production activation blockers remain in force. No M11–M14 implementation is included.

## M08 configuration history

M08-FR007 requires attributable records for configuration changes. Tax rule creation/deletion, product tax classification changes and checkout destination replacement now append owner-scoped before/after facts in the same database transaction. HTTP actors come from the authenticated administrator; internal callers retain nullable legacy/system attribution rather than inventing historical actors. Aggregate locks serialize classification and destination changes. New migration `20261021170000_configuration_audit` only creates the two audit tables and indexes. Existing history is not reconstructed. These application append-only records do not implement the later M13 administrative audit product or activate production tax.
