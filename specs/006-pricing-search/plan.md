# Implementation Plan: Milestone 06 - Pricing and Search

**Branch**: Not created; the repository has no commits yet | **Date**: 2026-10-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-pricing-search/spec.md`

**Research**: [research.md](./research.md) | **Data model**: [data-model.md](./data-model.md)

## Summary

Extend the existing Catalog capability with the two approved customer-facing commerce capabilities
that Milestone 04 deferred: **search and filtering** (HC-CAT-008) and **direct product discounts**
(HC-CAT-009).

The anonymous product listing gains optional filter parameters - a free-text term, a category, a
brand, one or more attribute pairs, and a price range in exact minor units with an explicit
currency - and keeps its existing deterministic ordering and opaque cursor, so an unfiltered
request is byte-for-byte the page it returned before this milestone. The product projection gains the
direct discount in basis points and the **effective price**: the amount the customer actually pays,
derived from the base price and the discount by one explicit, tested, half-up rounding rule applied
once at the effective-price boundary.

The effective price is stored on the product row and is constrained by the database to equal the
value derived from the base price and the discount, so the storage layer refuses any inconsistent
price no matter who writes it. It is written in the same transaction as the base price and the
discount, so no reader can observe a stale price.

The capability reuses the accepted platform unchanged: the global guard chain (availability, rate
limit, session authentication, roles), the Zod boundary pipe, the safe error envelope, the
authorization audit boundary, the structured logger and its redaction, and the OpenAPI inventory
assertion. It adds **no new dependency**, no new configuration key, no new infrastructure, no new
error code, and no new public path. Persistence changes ship as one reviewed additive Prisma
migration.

HC-DEC-018 is recorded as an open decision for the discount's form, window, and stacking rules.
HC-DEC-009 and HC-DEC-008 remain open, so no converted amount exists. HC-DEC-004, HC-DEC-006, and
HC-DEC-010 through HC-DEC-015 remain open and untouched, so no cart, checkout, order, payment,
reservation, tax, shipping, or notification behaviour is introduced.

## Technical Context

**Language/Version**: TypeScript 5.9 in strict mode on Node.js 22 (unchanged).

**Primary Dependencies**: NestJS, Prisma 7 with the PostgreSQL adapter, Zod, `@nestjs/swagger`
(unchanged). No dependency is added.

**Storage**: PostgreSQL, through the Catalog module's own Prisma repository. All monetary values are
exact integer minor units; the discount is an exact integer count of basis points.

**Testing**: Jest unit, integration (PostgreSQL), and end-to-end (in-process HTTP) suites, plus the
composite `pnpm verify` gate.

**Target Platform**: Linux server (Docker), matching the accepted foundation.

**Project Type**: Backend web service; a single deployable modular monolith.

**Observability**: Structured, correlated logs; `no-store` responses; no new redaction path is
expected (the catalog carries no personal data).

**Constraints**: No new dependency, configuration key, infrastructure, error code, or public path. No
destructive migration. No currency conversion, cart, checkout, order, payment, reservation, tax, or
notification behaviour.

**Scale/Scope**: Fewer than 1,000 products (HC-CAT-001); one owned warehouse and one administrator
(HC-PRJ-003).

## Constitution Check

| Principle                                | How this plan complies                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I. Modular Monolith Boundaries           | The capability extends the Catalog module, which already owns the products, categories, brands, and attributes that are searched and priced. No new module is introduced, no other feature module is imported, and persistence stays behind repositories. The refinement of the preliminary "Discovery" candidate boundary is recorded in research R1. `boundaries:check` still passes.                                                                                    |
| II. Secure Identity and Mandatory Admin MFA | Only the anonymous listing is public, and it is read-only. Discount administration is `@Roles('ADMIN')`, so it inherits the existing mandatory administrator MFA, the principal-resolved authorization, and the authorization audit boundary. No credential material is touched.                                                                                                                                                            |
| III. Server-Side Trust Enforcement       | Every filter value, bound, term, and discount is validated and normalized in a strict Zod schema; an unknown query parameter is refused rather than ignored; a price range without a currency is refused; authorization uses only the server-resolved principal. The negative paths are tested.                                                                                                                                                       |
| IV. Atomic Inventory Reservations        | Not applicable to this milestone; no stock is read, written, or reserved. Recorded so the omission is deliberate.                                                                                                                                                                                                                                                                                                                                       |
| V. Explicit Bundle Semantics             | Not applicable to this milestone; no bundle is priced, filtered, or discounted. The approved fixed-bundle model is untouched. Recorded so the omission is deliberate.                                                                                                                                                                                                                                                                                                  |
| VI. Stock-Gated Pre-Order Payment        | Not applicable to this milestone; no pre-order or payment exists. Recorded so the omission is deliberate.                                                                                                                                                                                                                                                                                                                                                 |
| VII. Idempotent Payments and Verified Webhooks | Not applicable; no payment exists.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| VIII. Exact Money and Safe Database Evolution | Every amount is an exact integer count of minor units and the discount is an exact integer count of basis points; the half-up rounding rule is stated in the spec, implemented in integers, proven by a unit test, and mirrored by a database `CHECK` constraint that refuses any inconsistent effective price. The migration is additive: two columns, their constraints, two indexes, and one derived-column backfill; it drops nothing.                                          |
| IX. Automated Testing at Every Boundary  | Unit tests for the rounding rule and the boundary schemas, PostgreSQL integration tests for the filter algebra, the stored-price consistency constraint, the transaction that recomputes the effective price, and the discount administration, and an end-to-end journey for the anonymous filtered listing and the administrative discount lifecycle, including denial for an anonymous caller and for a customer.                                                                 |
| X. Observable Operations and Protected Secrets | The capability introduces no personal data and no secret, so no new redaction path is required; the assessment is recorded as FR-020. Logs stay structured and correlated, and every response keeps `no-store`.                                                                                                                                                                                                                                                                     |
| XI. Recorded Decisions and Open Requirements | The discount's form, window, and stacking rules are recorded as the new open decision HC-DEC-018 with this milestone's conservative interpretation; HC-DEC-009, HC-DEC-008, HC-DEC-004, and HC-DEC-006 are carried as explicit blockers; no error code is added without recording; the REST behaviour is documented in OpenAPI and in the milestone contract.                                                                                                                                            |
| XII. Simplicity Before Distribution      | No queue, scheduler, broker, cache, search service, or new infrastructure; the search is an indexed PostgreSQL query over the module's own tables; the smallest reversible model that satisfies principles III and VIII.                                                                                                                                                                                                                                                                                                   |

## Project Structure

### Documentation (this feature)

- `specs/006-pricing-search/spec.md` - the feature specification and its acceptance criteria.
- `specs/006-pricing-search/plan.md` - this plan.
- `specs/006-pricing-search/research.md` - the fifteen recorded design decisions.
- `specs/006-pricing-search/data-model.md` - the two added columns, their constraints, and the
  migration.
- `specs/006-pricing-search/tasks.md` - the dependency-ordered task list.
- `specs/006-pricing-search/quickstart.md` - the local verification walkthrough.
- `specs/006-pricing-search/checklists/requirements.md` - the specification quality checklist.
- `specs/006-pricing-search/contracts/pricing-search-api.md` - the route, parameter, and projection
  contract.
- `specs/006-pricing-search/contracts/contract-verification.md` - how the contract is verified.

### Source code

Modified:

- `apps/api/src/modules/catalog/api/catalog.support.ts` - the money rules: the half-up rounding, the
  effective-price computation, and the filter-value normalization.
- `apps/api/src/modules/catalog/api/catalog.support.spec.ts` - the rounding and normalization unit
  tests.
- `apps/api/src/modules/catalog/api/catalog.request.ts` - the extended listing query schema and the
  discount administration body.
- `apps/api/src/modules/catalog/api/catalog.request.spec.ts` - the boundary schema tests.
- `apps/api/src/modules/catalog/api/catalog.response.ts` - the discount and effective-price
  projection fields.
- `apps/api/src/modules/catalog/api/catalog.controller.ts` - the extended listing route.
- `apps/api/src/modules/catalog/api/admin-products.controller.ts` - the discount administration route.
- `apps/api/src/modules/catalog/application/product.service.ts` - the filter application and the
  effective-price recomputation.
- `apps/api/src/modules/catalog/application/catalog-services.spec.ts` - the service unit tests.
- `apps/api/src/modules/catalog/persistence/product.repository.ts` - the filtered query and the
  transactional price write.
- `apps/api/src/platform/openapi/openapi.ts` - the discount operation and the extended parameters.
- `scripts/openapi-check.mjs` - the operation inventory and the documented parameters.
- `openapi/openapi.json` - the regenerated contract.
- `prisma/schema.prisma` - the two added columns.
- `prisma/migrations/20261020XXXXXX_pricing_search/migration.sql` - the additive migration.
- `test/helpers/catalog-database.ts` - the reset helper, if the new columns need it.
- `test/integration/catalog.integration.spec.ts` - the filter and pricing integration tests.
- `test/e2e/catalog.e2e.spec.ts` - the filtered-listing and discount journeys.
- `docs/development/migrations.md` - the Milestone 06 migration section.
- `docs/requirements/open-decisions.md` - the HC-DEC-018 entry.
- `docs/progress/milestone-06.md` - the verification record.
- `README.md` - the Milestone 06 section.

### Complexity Tracking

| Decision                                  | Alternative considered                                                                 | Why the alternative was rejected                                                                                                   | Cost of the choice                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Extend the Catalog module                 | A separate Discovery module reading Catalog's tables through a published contract       | The filter needs the base price and the discount together, and the Catalog already owns and publishes the listing; splitting forces a duplicated predicate or a second query (research R1). | The Catalog module grows; the module boundary set is unchanged.                    |
| Percentage discount in basis points       | A fixed-amount discount in a currency                                                | A fixed amount needs a currency and an exchange-rate decision that HC-DEC-009 has not made, and it becomes meaningless when the base price changes (research R2). | Only one discount form is available; a fixed amount is deferred to HC-DEC-018.      |
| Half-up rounding at the effective-price boundary | Truncation, banker's rounding, or rounding the percentage first                 | Half-up is the commercial convention and rounding once at the boundary keeps the whole money path in integer arithmetic (research R3).       | A half case rounds to the customer's benefit.                                      |
| Store the effective price and constrain it | Compute it on read                                                                     | It must be filterable and the database must be able to refuse an inconsistent value (research R4).                                    | One derived column is maintained in the same transaction as its inputs.            |
| Require an explicit currency with a price range | Assume the platform base currency                                | A range without a currency compares minor units of possibly different currencies, which is meaningless (research R5).                   | One extra required parameter when a bound is used.                                 |
| Substring free-text search                | A dedicated search engine, a trigram extension, or a ranked full-text index            | A new dependency, a new extension, and an unapproved ranking policy are all unjustified at the approved catalog size (research R6, R13).      | The free-text term is a bounded scan; the filter dimensions are indexed.            |
| Keep the existing ordering and cursor     | Add a sort parameter and a second cursor shape                                        | The ordering a shopper should prefer by default is an unapproved decision, and a second ordering risks repeating or skipping products (research R9). | One ordering; a filter cannot change the pagination semantics.                   |
| No new error code                         | Add a `PRICING_CONFLICT` or `DISCOUNT_CONFLICT` code                                | The milestone introduces no new failure kind; the existing codes cover every outcome (research R14).                                  | The closed error union is unchanged.                                               |
