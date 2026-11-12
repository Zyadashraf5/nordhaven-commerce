# Research: Milestone 05 - Inventory and Bundles

> **HC-DEC-017 amendment, 2026-10-20:** This document preserves the original pre-approval research/plan. Statements below that call HC-DEC-017 open or all bundles component-derived are superseded by the approved decision, amended Constitution Principle V, updated spec and docs/progress/milestone-05.md. FIXED goods hold assembled stock; DYNAMIC goods remain component-derived. HC-DEC-004 remains open.

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-20

This document records the decisions taken while turning the approved inventory and bundle facts
(HC-INV-001 through HC-INV-004) into a bounded, testable capability. Each decision states the
alternatives considered and why the selected option is the smallest reversible one that satisfies the
constitution. Two decisions (HC-DEC-017 and HC-DEC-004) are **not** resolved here; they are recorded as
explicit blockers.

## Findings

### R1 - One new module, `inventory`

**Decision**: Add exactly one module directory, `apps/api/src/modules/inventory`, with the same internal
shape as the accepted modules (`api/`, `application/`, `persistence/`).

**Alternatives**: (a) extend the Catalog module; (b) split stock and bundles into two modules.

**Rationale**: Inventory is a distinct business capability with its own tables and its own concurrency
guarantees; principle I requires business-aligned boundaries, and principle XII prefers the smallest
structure that keeps ownership clear. Stock and bundles share one transaction boundary (reserving a bundle
writes several SKU holds), so splitting them would create cross-module write coupling for no benefit.

### R2 - Cross-module reference to the catalog SKU, with a recorded coupling

**Decision**: `inventory_items.variant_id` (and every bundle component reference) is a database foreign
key to `product_variants(id)` with `ON DELETE RESTRICT`.

**Alternatives**: (a) store the SKU string with no foreign key (loose coupling); (b) store a bare variant
UUID with no database constraint.

**Rationale**: A SKU is the identity inventory is tracked against; allowing a variant to be deleted while
stock still references it would orphan the stock and make "available" meaningless. A foreign key with
`ON DELETE RESTRICT` makes the database refuse the deletion, which the catalog delete path already maps to
`CATALOG_CONFLICT`. This is a deliberate, recorded schema coupling (constitution principle XI): there is
still **no code-level** boundary violation, because the inventory module never imports the catalog module
and never reads catalog tables other than through its own `variant_id` column; it validates a variant's
existence exactly as the catalog validates a category's. The alternative (a) trades a precise integrity
guarantee for decoupling that provides no present benefit, and risks stock pointing at nothing.

### R3 - Exact integer quantities, non-negative, with a database check

**Decision**: Quantities are non-negative integers (`INTEGER`). `inventory_items.on_hand` and
`inventory_items.reserved` carry `CHECK (... >= 0)` constraints, and every reservation holds
`reserved <= on_hand`.

**Alternatives**: (a) allow a signed "available" column and derive the rest; (b) rely only on service
logic.

**Rationale**: Principle VIII-style exactness applies to quantities too, and principle IV forbids
available stock becoming negative. A `CHECK` constraint is the last line of defence if a service bug ever
computes a wrong delta; the concurrency test is the first. Storing `on_hand` and `reserved` separately
(rather than only `available`) makes the audit trail and the "confirm deducts, release returns"
distinction explicit and directly testable.

### R4 - Reservation as an explicit, idempotent lifecycle

**Decision**: A `Reservation` is a row with `status` in `ACTIVE`, `CONFIRMED`, `RELEASED`, `EXPIRED`, a
unique `idempotencyKey`, and an `expiresAt`. `ReservationLine` rows hold one SKU and quantity each.
Creation, confirmation, release, and expiry are idempotent: repeating a terminal transition returns the
same state and changes no quantity.

**Alternatives**: (a) model only a "hold" with no lifecycle; (b) use a database row lock held open for the
reservation lifetime.

**Rationale**: Principle IV requires creation, confirmation, expiration, release, and cancellation to be
idempotent and auditable, and requires an explicit timeout and failure recovery. A persisted lifecycle
with an `expiresAt` satisfies that and survives a process restart, which a held-open lock or an
in-process timer would not. The `idempotencyKey` makes a retried create return the original reservation
rather than double-holding.

### R5 - Expiry is lazy and the timestamp is authoritative

**Decision**: There is no background scheduler. When a reservation is read, reserved quantity is computed,
or a new reservation is attempted, the platform first expires any `ACTIVE` reservation whose `expiresAt`
has passed (a single conditional `updateMany`), then proceeds.

**Alternatives**: (a) a cron/queue job that sweeps expired reservations; (b) a database `TSTZRANGE` with an
exclusion constraint.

**Rationale**: Principle XII forbids introducing a queue or scheduler without a measured need. Lazy expiry
is correct because the only thing expiry affects is how much stock is available, and that is recomputed on
every read and every reservation attempt; the expired hold is released in the same transaction that
observes it. A compensating sweep could be added later without changing the data model.

### R6 - Concurrency via a conditional atomic update, not an application read-modify-write

**Decision**: A reservation attempt performs, inside one transaction, a conditional update per SKU of the
form `UPDATE inventory_items SET reserved = reserved + :qty WHERE variant_id = :id AND on_hand - reserved >= :qty`
and treats "0 rows affected" as an out-of-stock conflict; if any line fails, the transaction rolls back so
no partial hold persists.

**Alternatives**: (a) `SELECT ... FOR UPDATE` then update; (b) optimistic version columns with retry;
(c) serializable isolation with retry.

**Rationale**: A conditional `UPDATE ... WHERE` is the "atomic conditional update" principle IV names
explicitly: it is a single statement, so two concurrent reservations cannot both read the same available
count and both succeed. It avoids a retry loop (principle XII) and is directly provable by an integration
test that fires concurrent requests. Prisma exposes this through `updateMany` with a compound `where`, or
through `$executeRaw` when the arithmetic predicate is clearer; the plan selects the `updateMany` form
where possible.

### R7 - Bundles resolve to constituent SKUs; no independent fixed-bundle stock

**Decision**: A `Bundle` is `FIXED` (a stored set of `BundleComponent` rows, each a SKU and a per-bundle
quantity) or `DYNAMIC` (an allowed set of `BundleComponent` rows, each a SKU with a minimum and maximum
per-selection quantity). Availability is the minimum over components of `floor(available / perBundleQty)`.
Reserving a bundle resolves to the same `ReservationLine` per-SKU holds as reserving the SKUs directly.

**Alternatives**: (a) give a fixed bundle its own `inventory_items` row (independent stock); (b) treat
bundles as a display-only grouping with no reservation effect.

**Rationale**: Principle V requires exactly this resolution, and HC-INV-004 forbids double-counting.
Option (a) is the model **blocked** by HC-DEC-017, so it is not implemented and no fixed-bundle stock row
is ever created. Option (b) would let a bundle oversell, which principle V forbids. Modeling fixed bundles
as component-derived is the only model currently permitted and is reversible: if HC-DEC-017 later approves
independent stock, it is an additive change to availability and reservation resolution.

### R8 - Nested bundles are out of scope

**Decision**: A bundle component MUST reference a catalog variant, never another bundle.

**Alternatives**: (a) allow recursion with cycle detection.

**Rationale**: Nothing in the approved facts requires nested bundles, and recursion would complicate
availability (a fixpoint over a graph) and the concurrency proof for no present benefit (principle XII).
The constraint is enforced at the service and asserted by test; allowing it later is additive.

### R9 - Admin-only surface; reservations are an operational primitive

**Decision**: Every inventory and bundle route requires the `ADMIN` role. There is no customer-facing
availability or reservation route in this milestone.

**Alternatives**: (a) expose a public availability read; (b) expose a customer reservation route.

**Rationale**: Principle III requires server-side trust enforcement, and HC-INV-002's reservation
lifecycle is driven by checkout, which HC-DEC-004 has not defined. Exposing a customer reservation route
now would invent the timing decision that is still open. The admin surface is sufficient to prove the
primitive and is what the plan and tests exercise.

### R10 - Recorded decisions and explicit blockers

**Decision**: Record HC-DEC-017 (fixed-bundle stock model) and HC-DEC-004 (checkout/reservation timing) as
explicit blockers in the spec, plan, this research, and each milestone progress record, rather than
deciding them.

**Alternatives**: (a) silently pick a fixed-bundle model; (b) refuse to implement any bundle support.

**Rationale**: Principle XI requires specifications to identify unresolved requirements explicitly rather
than silently select behavior. Option (a) would invent an irreversible business rule; option (b) would
drop an approved capability (HC-INV-001/003) that is decidable and constitutional. Modeling bundles as
component-derived implements the approved, decidable behavior and leaves the unresolved part visibly open.

### R11 - Reservation idempotency key scope

**Decision**: A reservation create request carries a client-supplied `idempotencyKey`, unique per
reservation. A repeat with the same key returns the existing reservation without re-holding stock.

**Alternatives**: (a) derive the key from the request body hash; (b) no idempotency, rely on the caller.

**Rationale**: Principle IV requires creation to be idempotent. A body-hash key would make two legitimate
identical reservations collide; an explicit caller-supplied key makes retry semantics unambiguous and is
what a later checkout orchestration needs. The key is validated for shape and uniqueness and is the only
part of idempotency that is externally visible.

### R12 - Auditable stock movements

**Decision**: Every change to a SKU's quantity writes an append-only `StockMovement` row recording the
reason and the delta, in the same transaction as the change.

**Alternatives**: (a) derive history from reservation rows only; (b) log to the application log.

**Rationale**: Principle X requires inventory reservations to be observable and principle IV requires them
to be auditable. A reservation row shows holds, but an administrative on-hand adjustment has no other
record; the movement table is the single authoritative history and lets an operator explain a quantity.
Logging alone is not queryable and is redacted for personal data.
