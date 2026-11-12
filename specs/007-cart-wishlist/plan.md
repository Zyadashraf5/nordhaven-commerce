# Implementation Plan: Milestone 07 - Cart and Wishlist

**Branch**: Not created; the repository has no commits yet | **Date**: 2026-10-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-cart-wishlist/spec.md`

**Research**: [research.md](./research.md) | **Data model**: [data-model.md](./data-model.md)

## Summary

Add two customer-facing commerce capabilities to the existing NestJS modular monolith: an
**authenticated customer's cart** of catalog SKUs, and a **wishlist** of catalog products.

The cart records what the customer intends to buy. Every line carries the **last-known unit price**
the customer agreed to and reports the **current effective unit price** read live from the Catalog,
plus a flag saying whether the two differ. That makes the price comparison HC-COM-001 requires
visible in the cart, without deciding the checkout sequence that HC-DEC-004 has not settled. The
wishlist records the products a customer saved for later, and reports whether each is still
published.

The capability reuses the accepted platform unchanged: the global guard chain (availability, rate
limit, session authentication, roles), the Zod boundary pipe, the safe error envelope, the
authorization audit boundary, the structured logger and its redaction, and the OpenAPI inventory
assertion. It adds **no new dependency**, no new configuration key, and no new infrastructure. It
creates **no reservation**, holds **no stock**, and performs **no checkout**. Persistence changes
ship as one reviewed additive Prisma migration.

**HC-DEC-019** is recorded as a new open decision for the cart lifecycle. **HC-DEC-004** remains
open and untouched, so no checkout, order, payment, tax, or shipping behavior is introduced.

## Technical Context

**Language/Version**: TypeScript 5.9 in strict mode on Node.js 22 (unchanged).

**Primary Dependencies**: NestJS, Prisma 7 with the PostgreSQL adapter, Zod, `@nestjs/swagger`
(unchanged). No dependency is added.

**Storage**: PostgreSQL, through the Cart module's own Prisma repository and the Customers module's
own Prisma repository. Every price is an exact integer count of minor units in an explicit currency.

**Testing**: Jest unit, integration (PostgreSQL), and end-to-end (in-process HTTP) suites, plus the
composite `pnpm verify` gate.

**Target Platform**: Linux server (Docker), matching the accepted foundation.

**Project Type**: Backend web service; a single deployable modular monolith.

**Observability**: Structured, correlated logs; `no-store` responses; no new redaction path is
expected (the cart and the wishlist carry no personal data beyond the resolved principal).

**Constraints**: No new dependency, configuration key, infrastructure, or cross-module code import. No
destructive migration. No reservation, checkout, order, payment, tax, or shipping behavior.

**Scale/Scope**: Fewer than 1,000 products (HC-CAT-001); one owned warehouse; a cart holds at most
200 lines with at most 999 units per line.

## Constitution Check

| Principle                                | How this plan complies                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Modular Monolith Boundaries           | The Cart is a new module owning `carts` and `cart_items`; the Wishlist joins the existing Customers module, which the architecture overview assigns wishlist ownership to. Both reference the Catalog only through a **declared database foreign key** and read the referenced rows through that relation, exactly as the Inventory module does in Milestone 05 (research R2). No feature module is imported, and `boundaries:check` still passes.                    |
| II. Secure Identity and Mandatory Admin MFA | Every cart and wishlist route requires an authenticated **customer** session. The `CUSTOMER` role refuses an administrator account, so the MFA-protected administrative role can never read a customer's cart. No credential material is touched.                                                                                                                                                                                          |
| III. Server-Side Trust Enforcement       | Every quantity, identifier, and body is validated in a strict Zod schema; the scope is always the server-resolved principal, so no request can name another customer or cart; a negative, zero, fractional, or over-maximum quantity is refused rather than clamped. The negative paths are tested.                                                                                                                                                |
| IV. Atomic Inventory Reservations        | Not applicable to this milestone: the cart **never** reserves, holds, or decrements stock, and the integration and end-to-end suites assert that the on-hand, the reserved quantity, and the reservation count are unchanged after a cart write.                                                                                                             |
| V. Explicit Bundle Semantics             | Not applicable to this milestone: a cart holds catalog SKUs only. A bundle cart line needs the bundle selection rule and the bundle availability contract and is deferred to the Milestone 08 plan with that reason recorded (research R6).                                                                                                                                   |
| VI. Stock-Gated Pre-Order Payment        | Not applicable to this milestone; no pre-order or payment exists. Recorded so the omission is deliberate.                                                                                                                                                                                                                                                                                                                                 |
| VII. Idempotent Payments and Verified Webhooks | Not applicable; no payment exists.                                                                                                                                                                                                                                                                                                                                                                                                       |
| VIII. Exact Money and Safe Database Evolution | Every price is an exact integer count of minor units in an explicit currency; the last-known price is the catalog's exact effective price, and no floating-point value is used. The migration is additive: two tables and one more, with their constraints and indexes, and it drops nothing.                                                                                                                         |
| IX. Automated Testing at Every Boundary  | Unit tests for the quantity rules, PostgreSQL integration tests for the cart and wishlist lifecycles, the price-change signal, the customer isolation, the database constraint refusals, and the "never reserves stock" property, and end-to-end journeys for the anonymous and administrator denials, the customer journeys, the invalid-request refusals, and the customer isolation.          |
| X. Observable Operations and Protected Secrets | The capability introduces no personal data beyond the resolved principal and no secret, so no new redaction path is required; the assessment is recorded as FR-018. Logs stay structured and correlated, and every response keeps `no-store`.                                                                                                                                                                    |
| XI. Recorded Decisions and Open Requirements | The cart lifecycle is recorded as the new open decision HC-DEC-019 with this milestone's conservative interpretation; HC-DEC-004, HC-DEC-009, and HC-DEC-008 are carried as explicit blockers; the two new error codes are recorded in the contract and the OpenAPI error table; the REST behavior is documented in OpenAPI and in the milestone contract.                                                                                     |
| XII. Simplicity Before Distribution      | No queue, scheduler, broker, cache, search service, or new infrastructure; the cart is an ordinary relational table; the smallest reversible model that satisfies principles III, VIII, and the approved customer facts.                                                                                                                                                                                                                                                |

## Project Structure

### Documentation (this feature)

- `specs/007-cart-wishlist/spec.md` - the feature specification and its acceptance criteria.
- `specs/007-cart-wishlist/plan.md` - this plan.
- `specs/007-cart-wishlist/research.md` - the fifteen recorded design decisions.
- `specs/007-cart-wishlist/data-model.md` - the three new tables, their constraints, and the
  migration.
- `specs/007-cart-wishlist/tasks.md` - the dependency-ordered task list.
- `specs/007-cart-wishlist/quickstart.md` - the local verification walkthrough.
- `specs/007-cart-wishlist/checklists/requirements.md` - the specification quality checklist.
- `specs/007-cart-wishlist/contracts/cart-wishlist-api.md` - the route and projection contract.
- `specs/007-cart-wishlist/contracts/contract-verification.md` - how the contract is verified.

### Source code

New:

- `apps/api/src/modules/cart/cart.module.ts` - the Cart module.
- `apps/api/src/modules/cart/index.ts` - the module's public export.
- `apps/api/src/modules/cart/api/cart.support.ts` - the quantity rules.
- `apps/api/src/modules/cart/api/cart.support.spec.ts` - the quantity unit tests.
- `apps/api/src/modules/cart/api/cart.request.ts` - the strict request schemas.
- `apps/api/src/modules/cart/api/cart.response.ts` - the response projections.
- `apps/api/src/modules/cart/api/cart.controller.ts` - the cart routes.
- `apps/api/src/modules/cart/api/cart.policies.ts` - the rate-limit policies.
- `apps/api/src/modules/cart/application/cart.service.ts` - the cart rules.
- `apps/api/src/modules/cart/persistence/cart.repository.ts` - the cart persistence.
- `apps/api/src/modules/customers/persistence/wishlist.repository.ts` - the wishlist persistence.
- `apps/api/src/modules/customers/application/wishlist.service.ts` - the wishlist rules.
- `apps/api/src/modules/customers/api/wishlist.controller.ts` - the wishlist routes.
- `test/helpers/cart-database.ts` - the reset helper.
- `test/integration/cart-wishlist.integration.spec.ts` - the integration coverage.
- `test/e2e/cart-wishlist.e2e.spec.ts` - the end-to-end coverage.

Modified:

- `prisma/schema.prisma` - the three new models and their relations.
- `prisma/migrations/20261020210000_cart_wishlist/migration.sql` - the additive migration.
- `apps/api/src/app.module.ts` - the Cart module registration.
- `apps/api/src/modules/customers/customers.module.ts` - the wishlist providers and controller.
- `apps/api/src/modules/customers/api/customers.request.ts` - the wishlist request schemas.
- `apps/api/src/modules/customers/api/customers.response.ts` - the wishlist projections.
- `apps/api/src/platform/http/app-error.ts` - the two new error codes.
- `apps/api/src/platform/openapi/openapi.ts` - the seven new operations, the tags, and the version.
- `scripts/check-repository-hygiene.mjs` - the approved module names.
- `scripts/openapi-check.mjs` - the operation inventory and the excluded terms.
- `test/helpers/catalog-database.ts` - the cart-line cleanup before the variant deletion.
- `test/helpers/inventory-database.ts` - the same cleanup.
- `test/unit/repository-hygiene.spec.ts` - the approved `cart` module and the still-excluded example.
- `openapi/openapi.json` - the regenerated contract.
- `docs/development/migrations.md` - the Milestone 07 migration section.
- `docs/requirements/open-decisions.md` - the HC-DEC-019 entry.
- `docs/progress/milestone-07.md` - the verification record.
- `README.md` - the Milestone 07 section.

### Complexity Tracking

| Decision                                    | Alternative considered                                                             | Why the alternative was rejected                                                                                                                                    | Cost of the choice                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| A new Cart module; the wishlist joins Customers | One combined "Commerce" module for both, or the wishlist as its own module      | The architecture overview assigns the cart and the wishlist to different capabilities, and the two have different future dependencies (research R1). Combining them would couple the cart's checkout future to a simple saved-items list. | Two module boundaries instead of one; the wishlist reuses the existing customer-scoped route family. |
| A declared foreign key to the catalog          | A published Catalog read contract and a cross-module service call                | A cross-module service call for a single row is more machinery than a foreign key, and the Inventory module already established the foreign-key precedent (research R2).                                                                  | A deliberate cross-module foreign key, documented in the schema and the research.    |
| Two prices per line                           | Only the current price, or only the last-known price                            | One price hides a change; the other silently overwrites what the customer agreed to. HC-COM-001 needs both and the difference (research R4).                                        | Two extra fields per line and one boolean.                                          |
| The last-known price refreshes on every write | Refresh only on creation, or never refresh                                         | "Refresh on every write" is one rule with no special cases, and it keeps the meaning "the price at your last decision" (research R5).                                                 | The price-change signal clears after any customer action, which is the intended meaning. |
| A cart of SKUs only                           | Support bundle lines now                                                         | A bundle line needs the bundle selection rule and the bundle availability contract, both inside the open checkout boundary (research R6).                                            | Bundle carts are deferred to the Milestone 08 plan.                                   |
| The cart does not check stock                 | Refuse an add when the SKU is out of stock                                    | That is an availability promise, and availability is revalidated at checkout under HC-DEC-004 (research R7).                                                                 | A cart can hold an item that is currently unavailable.                               |
| The customer role protects the routes         | Any authenticated principal, including an administrator                          | HC-IAM-002 requires a customer account, and the Customers module already refuses an administrator on its own routes (research R8).                                                   | An administrator cannot read a customer's cart, which is a privacy property.        |
