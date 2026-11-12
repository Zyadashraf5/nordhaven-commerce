# Implementation Plan: Milestone 05 - Inventory and Bundles

> **HC-DEC-017 amendment, 2026-10-20:** This document preserves the original pre-approval research/plan. Statements below that call HC-DEC-017 open or all bundles component-derived are superseded by the approved decision, amended Constitution Principle V, updated spec and docs/progress/milestone-05.md. FIXED goods hold assembled stock; DYNAMIC goods remain component-derived. HC-DEC-004 remains open.

**Branch**: Not created; the repository has no commits yet | **Date**: 2026-10-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-inventory-bundles/spec.md`
**Research**: [research.md](./research.md) | **Data model**: [data-model.md](./data-model.md)

## Summary

Add one Inventory and Bundles capability to the existing NestJS modular monolith. It tracks sellable stock
per SKU (the catalog variant), reserves stock atomically so it can never oversell, exposes an explicit
idempotent reservation lifecycle with lazy expiry, and models **fixed** and **dynamic** bundles whose
availability and reservation resolve to their constituent SKUs and quantities.

The capability reuses the accepted platform unchanged: the global guard chain (availability, rate limit,
session authentication, roles), the Zod boundary pipe, the safe error envelope, the authorization audit
boundary, the structured logger and its redaction, and the OpenAPI inventory assertion. It adds **no new
dependency**, no new configuration key, no new infrastructure, and no cart, checkout, order, payment, or
shipping behavior. Persistence changes ship as one reviewed additive Prisma migration. HC-DEC-017
(fixed-bundle stock model) and HC-DEC-004 (checkout/reservation timing) are **not** resolved and are
recorded as explicit blockers.

## Technical Context

**Language/Version**: TypeScript 5.9 in strict mode on Node.js 22 (unchanged).

**Primary Dependencies**: NestJS, Prisma 7 with the PostgreSQL adapter, Zod, `@nestjs/swagger` (unchanged).
No dependency is added.

**Storage**: PostgreSQL, through the `inventory` module's own Prisma repositories. All quantities are exact
non-negative integers.

**Testing**: Jest unit, integration (PostgreSQL, including concurrency), end-to-end (in-process HTTP), and
process suites, plus the composite `pnpm verify` gate.

**Target Platform**: Linux server (Docker), matching the accepted foundation.

**Project Type**: Backend web service; a single deployable modular monolith.

**Observability**: Structured, correlated logs; `no-store` responses; append-only `stock_movements` as the
queryable inventory history; no new redaction path is expected (inventory carries no personal data).

**Constraints**: No new dependency, configuration key, or infrastructure. No destructive migration. Every
inventory and bundle route is `ADMIN`-only. No scheduled/background worker (lazy expiry only).

**Scale/Scope**: Fewer than 1,000 products (HC-CAT-001); one owned warehouse and one administrator
(HC-PRJ-003); reservation volumes bounded by checkout, which is not in this milestone.

## Constitution Check

| Principle                                | How this plan complies                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Modular Monolith Boundaries           | One new `inventory` module owning its tables; no import of another feature module; persistence behind repositories; the deliberate `product_variants` foreign key is documented as a recorded decision (research R2) and `boundaries:check` still passes.                                              |
| II. Secure Identity and Mandatory Admin MFA | Every inventory and bundle route is `@Roles('ADMIN')`; MFA is already mandatory for administrators; no credential material is touched here.                                                                                                                                                       |
| III. Server-Side Trust Enforcement       | Every quantity, identifier, expiry, and bundle composition is validated and normalized in a strict Zod schema; authorization uses only the server-resolved principal; negative and cross-role paths are tested.                                                                                     |
| IV. Atomic Inventory Reservations        | The core of the milestone: per-SKU integer stock; a conditional atomic `UPDATE ... WHERE on_hand - reserved >= qty` inside one transaction; idempotent create/confirm/release/expire; explicit `expiresAt`; a concurrency integration test proves no oversell and no partial hold.                   |
| V. Explicit Bundle Semantics             | Fixed and dynamic bundles; availability is the minimum over components; reserving a bundle reserves exactly its constituent SKUs and quantities; a bundle holds no stock of its own, so nothing is double-counted (HC-INV-004).                                                                   |
| VI. Stock-Gated Pre-Order Payment        | Not applicable to this milestone; no pre-order or payment exists. Recorded so the omission is deliberate.                                                                                                                                                                                          |
| VII. Idempotent Payments and Verified Webhooks | Not applicable; no payment exists.                                                                                                                                                                                                                                                        |
| VIII. Exact Money and Safe Database Evolution | Quantities are exact non-negative integers with database `CHECK` constraints; no floating point; one additive, create-only migration applied and verified on three databases.                                                                                                                       |
| IX. Automated Testing at Every Boundary  | Unit tests for quantity and bundle-resolution rules, PostgreSQL integration tests including a concurrency case for the last unit and for a bundle, idempotency tests for every transition, and an end-to-end administrator journey plus authorization denial.                                       |
| X. Observable Operations and Protected Secrets | An append-only `stock_movements` table makes every quantity explainable; logs stay structured and correlated; no secret or personal data is introduced.                                                                                                                                          |
| XI. Recorded Decisions and Open Requirements | The `product_variants` foreign key is a recorded decision (R2); HC-DEC-017 and HC-DEC-004 are recorded as explicit blockers in the spec, research, and progress record; every route is documented in OpenAPI.                                                                                        |
| XII. Simplicity Before Distribution      | No queue, scheduler, broker, cache, or new infrastructure; expiry is lazy and the database is the source of truth; the smallest reversible model that satisfies principles IV and V.                                                                                                               |

## Project Structure

### Documentation (this feature)

```text
specs/005-inventory-bundles/
  spec.md         # User stories, requirements, success criteria, assumptions
  research.md     # R1-R12 recorded decisions
  data-model.md   # Owned tables, invariants, migration
  plan.md         # This file
  contracts/
    inventory-api.md           # Operation inventory, statuses, payloads
    contract-verification.md   # How the committed document is validated
  checklists/requirements.md   # Requirement-to-artifact traceability
  tasks.md        # Dependency-ordered tasks
  quickstart.md   # Live manual verification
```

### Source code

```text
apps/api/src/modules/inventory/
  inventory.module.ts
  index.ts
  api/
    admin-inventory.controller.ts     # set/adjust/read/list stock
    admin-bundles.controller.ts       # CRUD bundles and their components
    admin-reservations.controller.ts  # create/read/extend/confirm/release a reservation
    inventory.policies.ts
    inventory.request.ts
    inventory.response.ts
    inventory.support.ts              # quantity/bundle resolution math
    inventory.support.spec.ts
    inventory.request.spec.ts
  application/
    inventory.service.ts              # per-SKU stock and reservation lifecycle
    bundle.service.ts                 # bundle administration and availability
    inventory-services.spec.ts
  persistence/
    inventory.repository.ts           # conditional atomic stock update + movements
    reservation.repository.ts
    bundle.repository.ts
    prisma-errors.ts
```

| Path                                                              | Change                                                              |
| ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| `apps/api/src/app.module.ts`                                      | Register `InventoryModule`.                                          |
| `apps/api/src/platform/http/app-error.ts`                         | Add the new inventory error codes (404/409) to the closed union.     |
| `apps/api/src/platform/openapi/openapi.ts`                        | Add the operations, the `Inventory` tag, bump the version.           |
| `scripts/openapi-check.mjs`                                       | Update the inventory, the anonymous allow-list (none added), excluded terms. |
| `scripts/check-repository-hygiene.mjs`                            | Remove `inventory` and `bundle` from `excludedModules`.              |
| `prisma/schema.prisma` + `prisma/migrations/<ts>_inventory_bundles` | The three enums and six tables (additive, create-only).             |
| `test/helpers/inventory-database.ts`                              | Catalog-aware reset in dependency order.                             |
| `test/integration/inventory.integration.spec.ts`                  | Persistence, concurrency, idempotency, bundle resolution.            |
| `test/e2e/inventory.e2e.spec.ts`                                  | Administrator journey, authorization denial, rate limit, OpenAPI validation. |
| `README.md`, `docs/development/migrations.md`, `docs/progress/milestone-05.md` | Documentation.                                          |

**Structure Decision**: The accepted single-module layout (api/application/persistence) is reused exactly,
because a new module is the smallest structure that keeps ownership clear (principle XII) and the
inventory write paths are one transaction boundary.

## Complexity Tracking

No constitution violation is introduced. The one notable design choice is the deliberate database foreign
key from `inventory_items.variant_id` to `product_variants(id)` (research R2): it accepts schema coupling to
the catalog to gain a hard integrity guarantee, while keeping the code-level boundary intact (no import,
no cross-module read). This is recorded rather than hidden, per principle XI.
