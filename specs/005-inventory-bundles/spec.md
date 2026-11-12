# Feature Specification: Milestone 05 - Inventory and Bundles

**Feature Branch**: Not created; the repository has no commits yet and no `before_specify` branch hook
is configured

**Created**: 2026-10-20

**Status**: Draft for Product Owner review; implementation authorized by the overnight autonomous
development instruction of 2026-10-20

**Approval**: The Product Owner accepted Milestones 01, 02, 03, and 04 for local development. This
specification implements the approved inventory and bundle facts HC-INV-001 through HC-INV-004 as far as
they are decidable with HC-DEC-017 approved on 2026-10-20 and Principle V amended. HC-DEC-004 remains open; other decisions are unchanged. Hosted continuous integration remains deferred and NOT VERIFIED.

**Input**: User description: "Milestone 05: Inventory and Bundles for Nordhaven Commerce - per-SKU stock
tracked and reserved atomically, a reservation primitive with idempotent lifecycle and expiry, fixed
bundles with predetermined components, and dynamic bundles whose availability and reservation resolve to
their constituent SKUs and quantities, exposed through versioned REST and OpenAPI, integrated with the
existing Product Catalog module, with validation, migrations, unit, integration, E2E, and concurrency
tests."

## Scope Boundaries and Open Decisions

This milestone follows the approved stock decision and preserves the unresolved checkout boundary:

- **HC-DEC-017 (Approved 2026-10-20)** - FIXED bundles hold independent finished-goods stock produced by atomic, audited assembly and consumed by reservations. Disassembly returns only unreserved goods to components. DYNAMIC bundles remain component-derived. Constitution Principle V has been amended.
- **HC-DEC-004 (Open)** - the checkout state machine, reservation timing, and order-creation boundary are
  unresolved. This milestone therefore exposes reservation management as an **operational primitive**
  (create, read, extend, confirm, release, expire) that checkout can later drive. It does **not** create
  a cart, a checkout, an order, or a payment, and it does not decide when a customer-facing reservation
  begins or ends.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Track and reserve stock per SKU without overselling (Priority: P1)

An administrator sets the quantity on hand for each sellable variant (SKU) and can adjust it as stock
arrives or is written off. The platform can atomically reserve a quantity of a SKU so that stock is
promised but not yet deducted, and available stock never becomes negative even when many reservation
attempts race for the last unit. A reservation has an explicit lifecycle (active, confirmed, released,
expired) and an expiry; confirming it permanently deducts the stock, releasing it returns the stock, and
an expired reservation stops holding stock.

**Why this priority**: Inventory correctness is the financial promise (constitution principle IV) and is
the foundation everything downstream depends on. Per-SKU atomic reservation is the smallest unit of value
and is independently testable without bundles.

**Independent Test**: Set on-hand stock for one SKU; issue more concurrent reservations than the stock
allows and confirm exactly the affordable number succeed with no negative available stock; confirm one
reservation deducts stock; release another and confirm stock returns; let a third expire and confirm the
stock is available again; and confirm every one of those operations is idempotent when retried.

**Acceptance Scenarios**:

1. **Given** a SKU with on-hand stock of 5 and no reservations, **When** the administrator reads it,
   **Then** on-hand is 5, reserved is 0, and available is 5.
2. **Given** a SKU with available stock of 1, **When** two reservations for 1 race concurrently, **Then**
   exactly one succeeds, the other is refused with a stable conflict, and available stock is 0.
3. **Given** a SKU with available stock of 3, **When** a reservation for 4 is requested, **Then** it is
   refused with a stable conflict and no stock is held.
4. **Given** an active reservation, **When** it is confirmed, **Then** the reserved quantity becomes
   deducted on-hand stock and the reservation is `CONFIRMED`; confirming it again is a no-op.
5. **Given** an active reservation, **When** it is released, **Then** the held stock becomes available
   again and the reservation is `RELEASED`; releasing it again is a no-op.
6. **Given** an active reservation whose expiry has passed, **When** stock availability is next
   evaluated, **Then** the expired hold no longer reduces available stock and the reservation is
   `EXPIRED`.
7. **Given** an administrator, **When** they set or adjust on-hand stock, **Then** the change is
   persisted and returned, and a negative on-hand value is refused.

---

### User Story 2 - Sell bundles whose availability comes from their components (Priority: P1)

An administrator defines FIXED compositions and DYNAMIC component ranges. FIXED bundles start empty, acquire finished stock through assembly, and reserve only those finished goods. DYNAMIC availability derives from component stock; explicit SKU lines reserve selected components. Quantity-only DYNAMIC reservations are refused because no selection is supplied; customer selection/checkout remains outside M05.

**Independent Test**: assemble a fixed bundle, verify component consumption and finished output, reserve it without holding components twice, refuse disassembly of reserved stock, and reverse free stock with complete audit. Race assembly, reservation and disassembly attempts beyond available stock and verify no overselling or partial changes.

**Acceptance Scenarios**:

1. A newly created FIXED bundle has zero availability even with stocked components; assembly produces the requested finished quantity and consumes exact component quantities.
2. Reserving three FIXED goods holds three finished units and does not reserve components again.
3. Insufficient components or finished stock produce a conflict with no partial inventory/audit persistence.
4. DYNAMIC capacity derives from component minimums; quantity-only reservations return 409. Explicit chosen SKU quantities use component reservations. No customer selection flow is introduced.
5. Stocked FIXED composition cannot change; empty compositions can be replaced atomically. Inventory history prevents bundle deletion.
6. Disassembly cannot consume reserved goods; expiry releases lapsed holds before availability is reported or goods are disassembled.

---

### User Story 3 - Administer and audit stock and reservations (Priority: P2)

An administrator lists and filters the inventory of the catalog they manage, reads and extends active
reservations, and can see why a reservation failed. Every stock movement and reservation transition is
recorded so an operator can explain how a SKU reached its current quantity. Customers and anonymous
callers can never read or change inventory.

**Why this priority**: Operating inventory requires visibility (constitution principle X), and the
authorization boundary must hold before any customer-facing use. It is lower priority only because it
depends entirely on the primitives in User Stories 1 and 2.

**Independent Test**: As an administrator, list inventory across products, filter by product, extend an
active reservation, and confirm the audit trail of stock movements and reservation transitions; then
confirm a customer session and an anonymous caller are refused every inventory route.

**Acceptance Scenarios**:

1. **Given** an authenticated administrator, **When** they list inventory, **Then** they see each SKU's
   on-hand, reserved, and available quantities.
2. **Given** an active reservation, **When** the administrator extends it, **Then** its expiry moves
   forward and the reservation remains active.
3. **Given** a customer session or an anonymous caller, **When** any inventory or bundle administrative
   route is called, **Then** the request is refused and no inventory is read or written.
4. **Given** a stock change, **When** the administrator reads the SKU, **Then** an auditable record of
   the movement exists.

---

### Edge Cases

- A reservation that expires between the availability read and the confirm is treated as expired, not
  active; confirming an expired reservation is refused rather than silently succeeding or overselling.
- Two reservations for the last unit: exactly one holds it; the loser receives a stable conflict, never a
  negative available quantity and never a partial hold on a bundle.
- Confirming or releasing an already-terminal reservation is an idempotent no-op that returns the same
  observable state.
- Setting on-hand stock below the currently reserved quantity is refused or explicitly disallowed, so
  available stock can never become negative.
- A bundle with a zero or missing component quantity is invalid; a bundle may not reference itself and may
  not contain another bundle as a component (no nested bundles in this milestone).
- A dynamic bundle selection with duplicate components, a component outside the allowed set, or a
  non-positive quantity is refused.

## Requirements *(mandatory)*

### Functional Requirements

- **M05-FR-001**: The platform MUST track sellable stock **per SKU** (the catalog `ProductVariant`), with
  a non-negative on-hand quantity and a derived reserved and available quantity.
- **M05-FR-002**: An administrator MUST be able to set or adjust the on-hand quantity of a SKU; a negative
  on-hand value MUST be refused.
- **M05-FR-003**: A reservation MUST be created atomically such that concurrent reservations can never
  oversell and available stock can never become negative (constitution principle IV).
- **M05-FR-004**: A reservation MUST have an explicit lifecycle (`ACTIVE`, `CONFIRMED`, `RELEASED`,
  `EXPIRED`) with an expiry; creation, confirmation, release, and expiry MUST each be idempotent.
- **M05-FR-005**: Confirming a reservation MUST permanently deduct the reserved quantity from on-hand
  stock; releasing or expiring a reservation MUST return the held quantity to available stock.
- **M05-FR-006**: The platform MUST support **fixed** bundles with a predetermined component composition
  (SKU and quantity) and **dynamic** bundles with a validated customer-selected composition drawn from an
  allowed component set (HC-INV-001).
- **M05-FR-007**: FIXED availability MUST equal finished on-hand minus reserved. DYNAMIC availability MUST derive from its component constraints, consistent with amended Principle V.
- **M05-FR-008**: FIXED reservations MUST hold finished goods once. DYNAMIC chosen SKU lines MUST hold component inventory atomically; partial holds MUST never persist.
- **M05-FR-009**: The platform MUST NOT count the same physical unit both as fixed-bundle stock and as
  component stock (HC-INV-004); For fixed bundles, assembly creates finished-goods stock while consuming component stock; disassembly reverses this. All movements are atomic and auditable to prevent double-counting.
- **M05-FR-010**: Every stock movement and reservation transition MUST be recorded as an auditable record
  sufficient to explain a SKU's current quantity (constitution principles IV and X).
- **M05-FR-011**: Every inventory and bundle administrative route MUST require the `ADMIN` role; no
  customer or anonymous caller may read or change inventory or bundle composition.
- **M05-FR-012**: Inventory and bundle behavior MUST be exposed through the versioned REST surface and
  documented in the committed OpenAPI document (constitution principle XI).
- **M05-FR-013**: All quantity arithmetic MUST be exact integers; no floating-point quantity is permitted.
- **M05-FR-014**: The reservation timing for
  checkout (HC-DEC-004) MUST be recorded as explicit blockers, not silently decided.

### Key Entities

- **InventoryItem**: the per-SKU stock record. Belongs to exactly one catalog variant (SKU); carries the
  on-hand quantity and the derived reserved quantity.
- **StockMovement**: an append-only, auditable record of a change to a SKU's stock (reason, delta,
  resulting quantity, time, and the acting principal or operation).
- **Reservation**: a hold of one or more SKUs (or one bundle) for a bounded time, with a lifecycle state
  and an expiry, idempotent on every transition.
- **ReservationLine**: one SKU and quantity held by a reservation, resolved from the SKU or the bundle
  composition.
- **Bundle**: a named, administrable composition of component SKUs and quantities, typed as `FIXED` (a
  stored composition) or `DYNAMIC` (an allowed component set from which a selection is drawn). A bundle
  references catalog products/variants and holds **no** stock of its own.
- **BundleComponent**: one allowed component of a bundle: the referenced SKU, its per-bundle quantity
  (fixed) or allowed range (dynamic), and position.

## Success Criteria *(mandatory)*

- **M05-SC-001**: The published `quickstart.md` can be executed end to end against a locally running API
  and demonstrates every story, with the result recorded.
- **M05-SC-002**: A concurrency test proves that N concurrent reservations against stock of M (N > M)
  yield exactly M successes, no negative available stock, and no partial bundle hold.
- **M05-SC-003**: A bundle's reported availability equals the minimum over its components' affordable
  quantities, and reserving the bundle moves exactly the constituent quantities.
- **M05-SC-004**: Every one of create, confirm, release, and expire is proven idempotent by test.
- **M05-SC-005**: The composite quality gate passes with all categories green, and the gate is proven to
  reject a seeded failure (mirroring M04-SC-008).
- **M05-SC-006**: Migrations are additive, create-only, and current on `nordhaven`, `nordhaven_integration`,
  and `nordhaven_e2e`.
- **M05-SC-007**: The committed OpenAPI document covers every new operation and is validated live in the
  end-to-end suite.
- **M05-SC-008**: No customer or anonymous caller can read or change inventory or bundle composition.

## Assumptions

- **M05-ASM-001**: A reservation is an **operational primitive** in this milestone (no cart/checkout
  wiring), because HC-DEC-004 is Open. Reversible: checkout can later drive the same primitive.
- **M05-ASM-002**: HC-DEC-017 is approved: FIXED finished goods and DYNAMIC component-derived stock are distinct, with atomic audited transformations preventing double-counting.
- **M05-ASM-003**: A bundle component is a catalog `ProductVariant` (SKU). Nested bundles are out of scope
  for this milestone (recorded, not silently omitted).
- **M05-ASM-004**: Reservation expiry is enforced lazily at read/reserve time (no background scheduler in
  this milestone; constitution principle XII prefers no new infrastructure), and the expiry timestamp is
  authoritative.
- **M05-ASM-005**: On-hand stock may not be set below the currently reserved quantity, so available stock
  is never negative.
