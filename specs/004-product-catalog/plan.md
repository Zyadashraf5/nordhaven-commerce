# Implementation Plan: Milestone 04 - Product Catalog

**Branch**: Not created; the repository has no commits yet | **Date**: 2026-10-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-product-catalog/spec.md`
**Research**: [research.md](./research.md) | **Data model**: [data-model.md](./data-model.md)

## Summary

Add one Product Catalog capability to the existing NestJS modular monolith. It lets an authenticated
administrator manually administer a two-level category tree, brands, products with ordered images and
attribute pairs, and sellable variants (SKUs) carrying a product-level exact price; and it lets an
anonymous shopper list and open published products.

The capability reuses the accepted platform unchanged: the global guard chain (availability, rate
limit, session authentication, roles), the Zod boundary pipe, the safe error envelope, the
authorization audit boundary, the structured logger and its redaction, and the OpenAPI inventory
assertion. It adds **no new dependency**, no new configuration key, no new infrastructure, and no
inventory, bundle, pricing, search, cart, checkout, order, payment, or shipping behavior. Persistence
changes ship as one reviewed additive Prisma migration. HC-DEC-001 through HC-DEC-017 remain
unresolved and are not implied by this milestone.

## Technical Context

**Language/Version**: TypeScript 5.9 in strict mode on Node.js 22 (unchanged).

**Primary Dependencies**: NestJS, Prisma 7 with the PostgreSQL adapter, Zod, `@nestjs/swagger`
(unchanged). No dependency is added.

**Storage**: PostgreSQL, through the `catalog` module's own Prisma repositories. Money is stored as
exact integer minor units plus a 3-letter currency.

**Testing**: Jest unit, integration (PostgreSQL), end-to-end (in-process HTTP), and process suites,
plus the composite `pnpm verify` gate.

**Target Platform**: Linux server (Docker), matching the accepted foundation.

**Project Type**: Backend web service; a single deployable modular monolith.

**Observability**: Structured, correlated logs; `no-store` responses; the existing `REDACT_PATHS`
extended with any new response field name that could carry personal data.

**Constraints**: No new dependency, configuration key, or infrastructure. No destructive migration.
Anonymous browsing only; all administration is `ADMIN`-only and audited.

**Scale/Scope**: Fewer than 1,000 products (HC-CAT-001); one administrator (HC-PRJ-003).

## Constitution Check

| Principle | How this plan complies |
| --- | --- |
| I. Modular Monolith Boundaries | One new `catalog` module owning its tables; no import of another feature module; persistence behind repositories; boundary change documented in this plan and tested by `boundaries:check`. |
| II. Secure Identity and Mandatory Admin MFA | Every administrative route is `@Roles('ADMIN')`; MFA is already mandatory for administrators in the accepted Identity module; no credential material is touched here. |
| III. Server-Side Trust Enforcement | Every value is validated and normalized in a strict Zod schema; authorization uses only the server-resolved principal; negative paths are tested. |
| IV. Atomic Inventory Reservations | Not applicable to this milestone; the catalog stores no quantity. Explicitly recorded so the omission is deliberate. |
| V. Explicit Bundle Semantics | Not applicable to this milestone; no bundle model is added. |
| VI. Stock-Gated Pre-Order Payment | Not applicable. |
| VII. Idempotent Payments and Verified Webhooks | Not applicable. |
| VIII. Exact Money and Safe Database Evolution | Integer minor units plus explicit currency; no floating point; one additive, create-only migration applied and verified on three databases. |
| IX. Automated Testing at Every Boundary | Unit domain tests, PostgreSQL integration tests including a concurrent duplicate-identifier case, and an end-to-end administrator plus anonymous-browsing journey; authorization denial is covered. |
| X. Observable Operations and Protected Secrets | Correlated structured logs; catalog content carries no personal data, and the redaction guardrail is extended for any new field name that could. |
| XI. Recorded Decisions and Open Requirements | Assumptions M04-ASM-001 through M04-ASM-006 and an open-dependency table are stated; no HC-DEC-* decision is resolved; OpenAPI is updated in the same change. |
| XII. Simplicity Before Distribution | No new dependency, key, cache, queue, or service; the smallest reversible model that satisfies the approved facts. |

**Result**: No violation requires a constitution amendment.

## Project Structure

### Documentation

```
specs/004-product-catalog/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── checklists/
│   └── requirements.md
├── contracts/
│   ├── catalog-api.md
│   └── contract-verification.md
└── tasks.md
```

### Source

```
apps/api/src/modules/catalog/
├── index.ts
├── catalog.module.ts
├── api/
│   ├── catalog.policies.ts         # declared rate limits
│   ├── catalog.support.ts          # slug/SKU/price/hierarchy helpers + rules
│   ├── catalog.request.ts          # strict Zod boundary schemas + params
│   ├── catalog.response.ts         # response DTOs and projections
│   ├── admin-categories.controller.ts
│   ├── admin-brands.controller.ts
│   ├── admin-products.controller.ts
│   ├── admin-variants.controller.ts
│   └── catalog.controller.ts       # anonymous browsing
├── application/
│   ├── category.service.ts
│   ├── brand.service.ts
│   └── product.service.ts
└── persistence/
    ├── category.repository.ts
    ├── brand.repository.ts
    ├── product.repository.ts
    └── prisma-errors.ts
```

### Tests

```
test/integration/catalog.integration.spec.ts
test/e2e/catalog.e2e.spec.ts
test/helpers/catalog-database.ts
apps/api/src/modules/catalog/**/*.spec.ts        # unit
```

### Platform changes (shared, additive)

```
apps/api/src/platform/http/app-error.ts                     # new catalog error codes
apps/api/src/app.module.ts                                  # register CatalogModule
apps/api/src/platform/openapi/openapi.ts                    # operation inventory + tag + version
scripts/openapi-check.mjs                                   # inventory + excluded terms
scripts/check-repository-hygiene.mjs                        # approve the catalog module
openapi/openapi.json                                        # regenerated committed contract
```

## Phases

1. **Setup** - new error codes, redaction coverage, and the repository-hygiene approval.
2. **Persistence** - Prisma models, the additive migration applied to three databases, and the three
   repositories with PostgreSQL integration coverage.
3. **Domain and boundary** - support rules, request schemas, response projections, services, unit
   tests.
4. **HTTP surface and contract** - controllers, policies, module wiring, the OpenAPI inventory, and
   the regenerated document.
5. **End-to-end and verification** - the administrator and anonymous journeys, authorization denial,
   the contract-validation harness, the composite gate, and the live quickstart.
6. **Documentation** - the milestone progress record, the README, and the migration notes.

## Complexity Tracking

No constitution violation is claimed. The only noteworthy design choices are recorded in
`research.md` (R4 lifecycle default, R6 collection-vs-item writes, R8 cursor pagination) and stated as
assumptions in `spec.md`.

## Dependency and Risk Notes

- The catalog must not import the Customers or Identity modules; the boundary check enforces it.
- The public listing orders by `(name, id)`; the ordering index must match so pagination is stable.
- The migration is additive; a rolled-back deployment leaves the previous version unaffected.
