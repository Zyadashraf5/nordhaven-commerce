# Milestone 04 - Product Catalog Verification Record

**Checkpoint date**: 2026-10-20
**Task state**: 38 of 38 tasks complete (T001-T038)
**Overall state**: All local Milestone 04 acceptance criteria satisfied by a single complete quality-gate
pass plus a seeded-failure rejection pass (M04-SC-008); hosted CI evidence remains NOT VERIFIED pending an
approved initial commit

This record distinguishes commands executed in the Milestone 04 session from the retained Milestone 01-03
records. No commit, push, deployment, database reset, `db push`, volume deletion, unrelated commerce module,
constitution change, or `HC-DEC-*` resolution was performed. Windows PowerShell 5.1 was used throughout; no
optional software was added to the host.

## Objective

Implement the approved Product Catalog facts (HC-CAT-001 through HC-CAT-009 data prerequisites) as a backend
capability: manual administration and anonymous browsing of categories, brands, products, images,
attributes, and sellable variants (SKUs) with an exact base price.

## Scope and constraints honored

- **Product Catalog only.** No inventory, bundle, search, filter, discount, or currency-conversion behavior
  exists; the hygiene gate still rejects every excluded domain, and the OpenAPI document carries no
  excluded operation.
- **Zero new runtime or development dependencies.** No `package.json` entry, lockfile entry, or configuration
  key was added. The catalog rate-limit policies are module constants (`catalog.policies.ts`). The E2E
  response validation reuses `openapi-response-validator`, which was already present.
- **Error codes confined to one approved addition set.** The five new codes (`CATEGORY_NOT_FOUND`,
  `BRAND_NOT_FOUND`, `PRODUCT_NOT_FOUND`, `VARIANT_NOT_FOUND` 404; `CATALOG_CONFLICT` 409) are the only
  changes to the closed `AppErrorCode` union, and they were added deliberately (M05 codes were not added, so
  each milestone's contract change stays auditable).
- **The open decisions were not resolved.** Search and filter (HC-CAT-008), discounts (HC-CAT-009), and
  currency conversion (HC-COM-002, HC-DEC-009) are unimplemented and deferred to Milestone 06. No
  `HC-DEC-*` decision was resolved.
- **The approved NestJS modular-monolith architecture and the Milestone 01-03 foundations are preserved.**
  The Catalog module owns its own persistence and imports no other feature module; it is reached only
  through the platform authorization contract (`@Roles`, `@Public`, and the global guard chain).
- No secret, token, password, or key is logged, returned, or persisted in recoverable form. An
  unpublished or unknown product slug answers identically, so the browsing surface discloses nothing about
  the commercial pipeline.

## Verification performed

### 1. Complete composite gate (M04-SC-008, positive half)

`pnpm verify` executed with all seeds removed. All eight categories passed and the run stopped only at the
end:

| Category           | Result                                                                     |
| ------------------ | -------------------------------------------------------------------------- |
| Format             | PASS — "All matched files use Prettier code style!"                        |
| ESLint             | PASS — `--max-warnings 0`, zero warnings/errors                            |
| Module boundaries  | PASS — production sources and both fixtures                                |
| TypeScript         | PASS — strict API and root/test configurations                             |
| Unit tests         | PASS — 23 suites, 195/195 tests (Milestone 03: 20 suites, 155 tests)       |
| Build              | PASS — Nest build                                                          |
| Repository hygiene | PASS — no unsafe filename, secret canary, or excluded domain               |
| OpenAPI            | PASS — structural validation, inventory, excluded-domain scan, drift check |

`All composite verification categories passed.`

### 2. Database-backed and process suites

| Suite       | Command                 | Result                                                                |
| ----------- | ----------------------- | --------------------------------------------------------------------- |
| Integration | `pnpm test:integration` | PASS — 4 suites, 44/44 tests against `nordhaven_integration`          |
| E2E         | `pnpm test:e2e`         | PASS — 5 suites, 33/33 tests against `nordhaven_e2e`                  |
| Process     | `pnpm test:process`     | PASS — 4 passed + 1 skipped (POSIX SIGTERM case, `win32`-conditional) |

Milestone 04 added 14 integration tests (catalog) and 8 E2E tests (catalog), and the Milestone 01-03 cases
in those suites pass unchanged.

### 3. Migration status

| Database                | Command                      | Result                                                      |
| ----------------------- | ---------------------------- | ----------------------------------------------------------- |
| `nordhaven`             | `pnpm prisma:migrate:status` | PASS — 4 migrations found, "Database schema is up to date!" |
| `nordhaven_integration` | `pnpm prisma:migrate:status` | PASS — 4 migrations found, "Database schema is up to date!" |
| `nordhaven_e2e`         | `pnpm prisma:migrate:status` | PASS — 4 migrations found, "Database schema is up to date!" |

The Milestone 04 migration (`20261019214516_product_catalog`) is additive and create-only; the generated SQL
was reviewed and then amended by hand to add the `products_base_price_minor_nonnegative` `CHECK`, which
Prisma does not model. It is documented in `docs/development/migrations.md`.

### 4. Seeded-failure rejection (M04-SC-008, negative half)

A deliberate defect was injected into a catalog source file, `pnpm verify` was run, and the seed was removed.
The gate rejected the seed with exit 1, halting at the first failing category:

| Seeded defect                                              | Rejection evidence                                 |
| ---------------------------------------------------------- | -------------------------------------------------- |
| An unformatted/unusable import prepended to a catalog file | `Verification failed in category: format` — exit 1 |

The seeded file was restored and confirmed byte-identical (`catalog.policies.ts` first line matches the
committed content), and the full gate then re-ran green with all eight categories passing, proving the seed
left no residue. Per M04-SC-008 no repeated identical full-suite passes were required.

### 5. Live quickstart smoke test (T035)

The published `specs/004-product-catalog/quickstart.md` was executed end to end against a built API on
`http://localhost:3100`, with the `nordhaven` database, `NODE_ENV=development`, and `LOG_LEVEL=info`:

- **31 assertions, 0 failures.** Every story was exercised: administrator provisioning, MFA enrollment and
  confirmation, a recovery-code second factor, root category with a derived slug, one-level nesting, a
  refused third level (`409 CATALOG_CONFLICT`), brand creation, a `DRAFT` product with an exact minor-unit
  price and a normalized currency, whole-collection image and attribute replacement (ordered by position),
  SKU upper-case normalization, publishing, anonymous listing and detail, the two-level public category tree,
  the public brands, a draft absent from the listing, an unpublished slug answering identically to an unknown
  one (`404 PRODUCT_NOT_FOUND`), anonymous administrative denial (`401 UNAUTHENTICATED`), a duplicate SKU
  conflict, a rejected unknown field that does not echo the submitted value, a refused fractional price, a
  refused publish without a variant, and `no-store` plus `X-Correlation-ID` metadata.
- A scan of the live server log (**196 lines**) found **zero** occurrences of the administrator password,
  **zero** `Bearer ` occurrences, and **zero** occurrences of `AUTH_ENCRYPTION_KEY` (M04-FR-020).

The harness used run-unique entity names, so the check is idempotent across executions without any database
reset.

### 6. Contract verification against the committed document

`specs/004-product-catalog/contracts/contract-verification.md` requires that observed catalog responses be
validated against the published artifact. This is implemented in `test/e2e/catalog.e2e.spec.ts`: every
asserted catalog response body (200, 201, 400, 401, 403, 404, 409) is validated with
`openapi-response-validator` against `openapi/openapi.json`, with `additionalProperties: false`, so an
undocumented extra field fails the suite. The E2E file reads the committed document from disk, so the
artifact that is published is the artifact that is asserted. The committed document was regenerated to 47
operations (23 catalog) at version `0.4.0`.

## Defects found and fixed in this session

| ID  | Defect                                                                                                                                                                                                                                     | Fix                                                                                                                             | Verification                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| D1  | `catalog.response.ts` imported `CategoryRecord` from `product.repository` (it lives in `category.repository`), and the Prisma `select` constants used `as const`, whose readonly tuple `orderBy` is not assignable to Prisma's input type. | Imported `CategoryRecord` from its own module and switched both selects to `satisfies Prisma.ProductSelect`.                    | `typecheck` exit 0.                                    |
| D2  | The catalog write paths threw the result of a `never`-returning helper, which ESLint's `only-throw-error` rejects.                                                                                                                         | Replaced the helper with `translate(error, notFound?): AppError`, which returns the mapped `AppError` or rethrows the original. | `lint` clean; unit and integration suites green.       |
| D3  | A stray edit left `test/unit/repository-hygiene.spec.ts` structurally malformed (a missing `} finally` block), so ESLint reported a parse error.                                                                                           | Restored the customers test's closing block before the new catalog test.                                                        | `lint` clean; the repository-hygiene unit suite green. |
| D4  | The integration page test passed `cursor: string \| undefined` under `exactOptionalPropertyTypes: true`, which is not assignable to the optional `cursor?: string`.                                                                        | Spread the cursor only when it is present.                                                                                      | `typecheck` exit 0; integration suite green.           |
| D5  | Two integration assertions were wrong, not the product: the category-count check ignored the seeded brand's category, and the SKU-uniqueness check passed a pre-normalized duplicate that the service normalizes itself.                   | Corrected the counts and passed the un-normalized lowercase SKU so the uniqueness conflict is genuinely exercised.              | Integration suite green (44/44).                       |
| D6  | The E2E suite accessed `.body.code` on `any` values, which `@typescript-eslint/no-unsafe-member-access` rejects.                                                                                                                           | Replaced the five inline accesses with the typed `bodyOf<ErrorBody>(...)` helper.                                               | `lint` clean (this was the sole full-gate failure).    |
| D7  | The live harness asserted that publishing a variant-less product is refused, but the product it used already had a variant from an earlier story.                                                                                          | The harness now creates a dedicated variant-less product for that assertion, and uses run-unique names so it is idempotent.     | Live quickstart PASS 31/31.                            |

No genuine product, security, database, or architecture defect remains open. All seven defects were in
verification tooling or type-level wiring; the product behavior required no correction.

## Recorded deviations from the task text (nothing was silently dropped)

- **Consolidated database suites.** T011 and T031/T032 name one integration and one E2E spec, which is what
  exists (`test/integration/catalog.integration.spec.ts`, `test/e2e/catalog.e2e.spec.ts`); the rate-limit
  proof is an additional `describe` block in the E2E file with its own application instance rather than a
  separate file, mirroring Milestone 03 and avoiding an extra app startup.
- **Controller layout.** The HTTP surface is five controllers (`catalog.controller.ts`,
  `admin-categories.controller.ts`, `admin-brands.controller.ts`, `admin-products.controller.ts`,
  `admin-variants.controller.ts`) rather than fewer; the route inventory in `contracts/catalog-api.md`
  (23 operations) is unchanged and is asserted by `scripts/openapi-check.mjs`.
- **Variant management.** Variants are created, updated, and deleted individually (not as a whole-collection
  replacement), because the SKU is the identity Milestone 05 will attach inventory to; a whole-collection
  replacement could silently delete tracked stock.
- **Redaction paths (T002).** Assessed and no new path was required: the catalog carries no personal data,
  so `REDACT_PATHS` and `redaction.spec.ts` are unchanged. The assessment is recorded here rather than as a
  code change.
- **OpenAPI response validation implemented, not weakened.** Every documented catalog status is validated
  live in the E2E suite, so the documentation and the enforcement agree.
- **Not implemented, because Open or deferred.** Search and filter (HC-CAT-008), discounts (HC-CAT-009), and
  currency conversion (HC-COM-002, HC-DEC-009) are deferred to Milestone 06 (Pricing & Search). No task
  required them and none was resolved.

## Unresolved items and open decisions

1. **Hosted CI (administrative, NOT VERIFIED)** — the repository still has zero commits. The Product Owner
   deferred the initial commit, GitHub setup, and hosted CI on 2026-10-19. All evidence above is local; **no
   hosted run is claimed.**
2. **HC-CAT-008 (search and filter) and HC-CAT-009 (discounts)** — unimplemented and explicitly deferred to
   Milestone 06 by the approved scope; the catalog listing exposes only a keyset `limit`/`cursor` page.
3. **HC-COM-002 / HC-DEC-009 (currency conversion)** — a single explicit base currency is stored; no
   conversion between currencies exists, so a multi-currency display decision is still open.
4. **HC-DEC-005 (open, carried)** — `countryCode` handling is a Milestone 03 concern and is unchanged. No
   supported-country list is enforced on the catalog.
5. **In-process rate-limit counters** — the fixed-window limiter is process-local and resets on restart
   (single-instance deployment assumption). Both catalog policies use the `client` dimension because the
   limiter runs before session authentication; this is the same accepted behavior recorded for Milestones 02
   and 03.
6. **`503` precedes `401`** while an instance is not ready, and an unpublished product is answered uniformly
   as `404 PRODUCT_NOT_FOUND` so no unpublished work is disclosed. Both are documented and asserted.

## File inventory (Milestone 04)

- **Design artifacts**: `specs/004-product-catalog/{spec.md, plan.md, research.md, data-model.md,
quickstart.md, tasks.md}`, `checklists/requirements.md`, `contracts/catalog-api.md`,
  `contracts/contract-verification.md`, `.specify/feature.json`.
- **Schema**: `prisma/schema.prisma` (`ProductStatus` enum, `Category`, `Brand`, `Product`, `ProductImage`,
  `ProductAttribute`, `ProductVariant`) and
  `prisma/migrations/20261019214516_product_catalog/migration.sql` (additive, create-only).
- **Catalog module**: `apps/api/src/modules/catalog/` — `catalog.module.ts`, `index.ts`,
  `api/{catalog.controller.ts, admin-categories.controller.ts, admin-brands.controller.ts,
admin-products.controller.ts, admin-variants.controller.ts, catalog.policies.ts, catalog.request.ts,
catalog.response.ts, catalog.support.ts, catalog.request.spec.ts, catalog.support.spec.ts}`,
  `application/{category.service.ts, brand.service.ts, product.service.ts, catalog-services.spec.ts}`,
  `persistence/{category.repository.ts, brand.repository.ts, product.repository.ts, prisma-errors.ts}`.
- **Platform changes**: `platform/http/app-error.ts` (five catalog codes),
  `platform/openapi/openapi.ts` (23 operations, `Catalog` tag, version `0.4.0`), `app.module.ts` (module
  registration).
- **Tests and helpers**: `test/integration/catalog.integration.spec.ts`, `test/e2e/catalog.e2e.spec.ts`,
  `test/helpers/catalog-database.ts`, extended `test/unit/repository-hygiene.spec.ts`.
- **Operations and docs**: `openapi/openapi.json` (47 operations, version `0.4.0`),
  `scripts/openapi-check.mjs`, `scripts/check-repository-hygiene.mjs`, `README.md`,
  `docs/development/migrations.md`, `docs/progress/milestone-04.md`.

## Acceptance conclusion

All local Milestone 04 acceptance criteria are satisfied: **38 of 38 tasks complete**, a single complete
quality-gate pass with all eight categories green, a demonstration that the gate rejects a seeded failure
(M04-SC-008) with no residue, database-backed integration, E2E, and process suites green, migrations current
on all three databases, live validation of every catalog response against the committed OpenAPI document, and
a 31-assertion live walkthrough of the published quickstart with a clean
password/token/key log scan. The seven defects found during verification (D1-D7) were fixed and re-verified;
none was a product behavior defect.

Two subjects remain outside local control and are recorded, not waived: hosted CI evidence (requires an
approved initial commit) and the deferred Milestone 06 decisions HC-CAT-008, HC-CAT-009, and HC-COM-002 /
HC-DEC-009. Milestone 05 (Inventory & Bundles) proceeds next, with the fixed ready-stock bundle model
(HC-DEC-017) and the checkout/reservation timing (HC-DEC-004) documented as blockers rather than invented.

**Exact next action**: begin Milestone 05 specification artifacts, then implement per-SKU stock with
component-derived bundle availability, documenting HC-DEC-017 and HC-DEC-004. Do not commit or push before
Product Owner approval.
