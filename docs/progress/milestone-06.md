# Milestone 06 - Pricing and Search Verification Record

**Date**: 2026-10-20 (Africa/Cairo). **Status**: complete and verified; the discount's form, window,
and stacking rules remain the open decision HC-DEC-018, and the currency-conversion, checkout, and
tax decisions remain open and unimplemented.

## Objective

Implement the two approved customer-facing commerce capabilities that Milestone 04 deferred:
**search and filtering** (HC-CAT-008) and **direct product discounts** (HC-CAT-009), with exact
integer money, an explicit rounding rule, and a database-enforced invariant that the effective price
always agrees with its own inputs.

## Scope and boundaries honored

- **HC-CAT-008** - the anonymous product listing now accepts a free-text term, a category, a brand,
  repeatable attribute pairs, and a price range. Every parameter is optional, the criteria combine
  with AND, and the existing deterministic ordering and opaque cursor are unchanged.
- **HC-CAT-009** - one direct product discount per product, in basis points. No coupon, tier,
  campaign, window, or stacking behavior exists.
- **HC-COM-002** - the base currency is delivered. **Display-currency conversion is deferred**:
  HC-DEC-009 (the exchange-rate policy) and HC-DEC-008 (the settlement currency) are unresolved, so
  no rate is fetched, stored, or displayed.
- **HC-DEC-018 (Open, recorded by this milestone)** - the discount's form, window, and stacking rules
  are not approved. The conservative interpretation this milestone implemented is recorded in
  `docs/requirements/open-decisions.md` and can be widened or narrowed without a data migration.
- **HC-DEC-004, HC-DEC-006, and HC-DEC-010 through HC-DEC-015 remain open and untouched.** No cart,
  checkout, order, payment, reservation, tax, shipping, or notification behavior exists.
- No new dependency, configuration key, infrastructure, error code, or public path was added. The
  closed `AppErrorCode` union is unchanged, and no other module's tables are read or written.

## Design decisions

Fifteen decisions are recorded in `specs/006-pricing-search/research.md`. The ones that shape the
implementation:

- **R1** - search and filtering extend the Catalog module rather than adding a "Discovery" module.
  The Catalog already owns the products, categories, brands, and attributes that are searched and
  priced, and the effective price is a function of the base price and the discount on the same row.
  A separate module would either duplicate the predicate or read another module's tables.
- **R2** - the discount is a percentage in basis points. It needs no exchange rate, so it does not
  depend on the unresolved HC-DEC-009, and it stays valid when the base price changes.
- **R3** - the rounding rule is half up, applied once, at the effective-price boundary, in exact
  integer arithmetic.
- **R4** - the effective price is stored and the **database** constrains it, so the storage layer
  refuses any inconsistent value whoever writes it.
- **R5** - a price range requires an explicit currency, because comparing minor units of two
  different currencies is meaningless.
- **R9** - the ordering and the cursor are unchanged, so a filtered page neither repeats nor skips a
  product.

## What was built

| Area                    | Change                                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Schema                  | `products.discount_basis_points` and `products.effective_price_minor`, with three hand-added `CHECK` constraints and one index.                  |
| Money rule              | `apps/api/src/modules/catalog/pricing.ts` - the half-up discounted amount and the effective price, in exact integer arithmetic.                  |
| Search and filtering    | `SearchProductsQuery` boundary schema, the search-term and attribute-filter normalization, the repository predicate, and the service resolution. |
| Discount administration | `PUT /api/v1/admin/catalog/products/{productId}/discount`, ADMIN-only, transactional.                                                            |
| Projection              | `discountBasisPoints` and `effectivePriceMinor` on the product summary and detail responses.                                                     |
| Contract                | OpenAPI 0.6.0: one new operation, the documented query parameters, and the regenerated `openapi/openapi.json` (66 operations).                   |
| Migration               | `prisma/migrations/20261020200000_pricing_search/migration.sql` - additive, applied to three databases.                                          |

## Actual verification

Every number below is from an executed command in this session.

### 1. Composite quality gate

`pnpm verify` - **exit 0**, all eight categories passed in order: format, lint, module boundaries,
types, unit, build, repository hygiene, and OpenAPI validation with drift check.

`All composite verification categories passed.`

### 2. Automated suites

| Suite       | Command                 | Result                                                                              |
| ----------- | ----------------------- | ----------------------------------------------------------------------------------- |
| Unit        | `pnpm test:unit`        | PASS - 29 suites, 278/278 tests                                                     |
| Integration | `pnpm test:integration` | PASS - 7 suites, 116/116 tests                                                      |
| End-to-end  | `pnpm test:e2e`         | PASS - 6 suites, 47/47 tests                                                        |
| Process     | `pnpm test:process`     | PASS - 4 passed, 1 skipped (the pre-existing Windows graceful-shutdown signal test) |

The unit suite grew from 248 tests over 28 suites to **278 tests over 29 suites**: 30 new tests
covering the rounding rule, the boundary schemas, the search-term and attribute-filter
normalization, and the discount projection.

The integration suite grew from 97 tests over 7 suites to **116 tests over 7 suites**: 19 new tests
covering the discount lifecycle, the effective-price recomputation, the database constraint
refusals, every filter dimension, the unknown-name case, and pagination under a filter.

The end-to-end suite grew from 42 tests over 6 suites to **47 tests over 6 suites**: 5 new tests
covering the anonymous search and filter surface, the discount lifecycle over HTTP, the invalid
request refusals, and the anonymous and customer denials.

### 3. Migration status and data preservation

`prisma migrate status` reports **10 migrations found** and **"Database schema is up to date!"** on
all three databases: `nordhaven`, `nordhaven_integration`, and `nordhaven_e2e`.

The row counts of every application table were captured immediately before the migration and again
immediately after, and they are **identical**:

| Table          | Before | After | Table              | Before | After |
| -------------- | ------ | ----- | ------------------ | ------ | ----- |
| products       | 5      | 5     | categories         | 5      | 5     |
| brands         | 2      | 2     | product_variants   | 4      | 4     |
| product_images | 4      | 4     | product_attributes | 2      | 2     |
| users          | 9      | 9     | customer_profiles  | 4      | 4     |

The `nordhaven_integration` and `nordhaven_e2e` counts are likewise identical before and after.

The backfill was verified directly: every pre-existing product has
`effective_price_minor = base_price_minor` and `discount_basis_points = 0`.

### 4. The database is the authority on the effective price

Each constraint was exercised directly against PostgreSQL on the `nordhaven` database, and the
affected row was restored afterwards:

| Attempted write                                                        | Result                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------ |
| A consistent 20% discount with the matching effective price            | ACCEPTED                                         |
| An effective price that disagrees with the base price and the discount | REFUSED - `products_effective_price_consistent`  |
| A discount of 10001 basis points                                       | REFUSED - `products_discount_basis_points_range` |
| A negative effective price                                             | REFUSED - `products_effective_price_consistent`  |

After the four attempts the row was verified to be back at its original
`base_price_minor = 129900`, `discount_basis_points = 0`, `effective_price_minor = 129900`.

### 5. Seeded-failure rejection

The gate was proven to reject a real defect, not only to pass on a good tree.

**Seed.** `discountedAmountMinor` was changed from the half-up rule to truncation, so the
application computed a different effective price from the database constraint.

**Rejection, unit level.** 5 unit tests failed, including `matches the database expression exactly
for a range of amounts`, which failed with `Expected: 0, Received: 1`.

**Rejection, integration level.** The integration suite failed with the database refusing the write:

```
Database error. Code: `23514`. Message: `new row for relation "products" violates check
constraint "products_effective_price_consistent"`
```

**Restoration.** The seed was reverted, the file was verified to contain the original expression,
and `pnpm verify` was run again: **exit 0**, all eight categories passed. The seed left no
residue.

### 6. OpenAPI drift

`pnpm openapi:check` regenerated the document and reported
`OpenAPI validation and drift check passed.` The committed `openapi/openapi.json` is version 0.6.0
with 66 operations, including the new
`PUT /api/v1/admin/catalog/products/{productId}/discount`. The operation inventory in
`apps/api/src/platform/openapi/openapi.ts` and the independent inventory in
`scripts/openapi-check.mjs` both list it, so a route that is in neither fails the gate. The
excluded-domain scan is unchanged, and the anonymous allow-list is unchanged.

### 7. Production dependency audit

`pnpm audit:prod --audit-level critical` - **exit 0**, `No known vulnerabilities found`.

The full development-inclusive audit is unchanged from Milestone 05: the `braces@3.0.3` advisory
(GHSA-vfj7-8cjw-p6xm) has no upstream patch and remains unwaived. It is a transitive development
glob dependency, not a production dependency, and the production audit is clean. Full security
sign-off remains open and is not claimed here.

### 8. Test isolation

The database-backed suites ran against newly created, isolated databases
`hc_m06_20261020_integration` and `hc_m06_20261020_e2e`, which were created empty and had the ten
migrations applied to them. The three pre-existing databases were only read from, except for the
additive migration itself, whose data preservation is proved above. No database was reset, no
volume was deleted, and no existing application row was removed.

## Defects found and fixed in this milestone

| ID  | Defect                                                                                                                                                               | Fix                                                                                                                                                                                 | Verification                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| D1  | A named category or brand that does not exist resolved to "no filter" instead of "match nothing", so an unknown name widened the result set instead of narrowing it. | The service returns an empty page when a named category resolves to no identifier, and the repository applies the category filter whenever one is present, including an empty list. | The integration test `returns an empty page for an unknown category or brand` and the end-to-end assertions on unknown names. |
| D2  | The money unit test expected `97325` for a quarter off `129900`; the correct value under the half-up rule is `97425`.                                                | The test expectation was corrected. The implementation was already right, and the parity test against the database expression confirmed it.                                         | The unit suite and the parity matrix.                                                                                         |
| D3  | The search-term boundary test expected a price bound without a currency to be accepted, which contradicted the rule that a range requires one.                       | The test was corrected to supply the currency, and the refusal is asserted separately.                                                                                              | The unit suite.                                                                                                               |
| D4  | The composite gate failed on formatting in seven files after the change.                                                                                             | The files were formatted with the repository's own Prettier configuration. No gate rule, configuration value, or source file was changed to make the check pass.                    | `pnpm verify` exit 0, and the failure was shown to be a formatting failure only.                                              |
| D5  | The integration helper seeded a fixed category and brand name, so calling it twice conflicted.                                                                       | The helper now creates uniquely named fixtures.                                                                                                                                     | The integration suite.                                                                                                        |
| D6  | The end-to-end search fixture gave every product the same default description, so a term meant for one product matched another.                                      | Each fixture now carries its own description.                                                                                                                                       | The end-to-end suite.                                                                                                         |
| D7  | The end-to-end attribute fixture omitted the required `position`.                                                                                                    | The fixture sends the position.                                                                                                                                                     | The end-to-end suite.                                                                                                         |

D1 was a genuine product defect and is covered by a regression test. D2, D3, D5, D6, and D7 were
mistakes in the new tests and were corrected without weakening an assertion. D4 was a formatting
failure only.

## Unresolved items and open decisions

1. **HC-DEC-018 (Open)** - the form, window, and stacking rules of a direct product discount are not
   approved. The interpretation this milestone implemented is recorded in the decision register and
   can be widened or narrowed without a data migration.
2. **HC-DEC-009 and HC-DEC-008 (Open)** - no converted amount, display quote, or settlement currency
   exists. The price projection names the base currency on every amount, so a later display-quote
   layer can be added without changing the stored facts.
3. **HC-DEC-004 (Open)** - no reservation is created, no cart exists, and no checkout or order
   behavior is introduced. The price is available for a future checkout to snapshot.
4. **HC-DEC-006 (Open)** - no tax amount exists.
5. **The `braces@3.0.3` development advisory** - no upstream patch, unwaived, and not a production
   dependency. The production audit is clean.
6. **Hosted CI (administrative, NOT VERIFIED)** - the repository still has zero commits, so no hosted
   run is claimed. All evidence above is local.
7. **The "Discovery" module boundary** - the preliminary architecture table names a Discovery module
   that would own search and filters. This milestone refines that boundary to the Catalog module for
   the reasons in research R1. The refinement is a documented architecture decision, not a silent
   change, and the candidate boundary remains available for a later milestone when a read-optimized
   projection is actually justified by measured need.

## Readiness

All local Milestone 06 acceptance criteria are satisfied: **26 of 26 tasks complete**, a single
complete quality-gate pass with all eight categories green, the unit, integration, and end-to-end
suites green, the process suite green with one pre-existing Windows skip, migrations current on all
three databases with the data preservation proved by before-and-after row counts, the database
constraint proven to refuse an inconsistent effective price, the gate proven to reject a seeded
defect and to pass again once the defect was removed, and the production audit clean.

The milestone is ready for Product Owner review on the implemented behavior. It does not claim
security sign-off, hosted CI evidence, or a resolution of HC-DEC-018, HC-DEC-009, HC-DEC-008,
HC-DEC-004, or HC-DEC-006. No commit, push, deployment, database reset, or volume deletion was
performed. Milestones 01 through 05 are preserved, and no Milestone 07 work was started during this
milestone.

## Milestone 07 disposition

The Milestone 07 milestone that followed confirmed the composite gate green again (exit 0, all eight
categories) with 283 unit, 143 integration, 55 end-to-end, and 4 process tests passing, and the
production dependency audit clean. The unwaived `braces@3.0.3` development advisory is unchanged,
so the M06 NO-GO assessment is carried forward unchanged and the security review item remains with
the Product Owner and the security owner. See [Milestone 07](milestone-07.md) for the executed
evidence.
