# Milestone 07 - Cart and Wishlist Verification Record

**Date**: 2026-10-20 (Africa/Cairo). **Status**: complete and verified; the cart lifecycle remains
the open decision HC-DEC-019, and the checkout, currency-conversion, tax, and payment decisions
remain open and unimplemented.

## Objective

Implement the two approved customer-facing commerce capabilities that Milestone 03 and Milestone 04
deferred: an **authenticated customer's cart** of catalog SKUs (HC-IAM-002) with the pricing
revalidation HC-COM-001 requires made visible, and a **wishlist** of catalog products (HC-IAM-003).

## Scope and boundaries honored

- **HC-IAM-002** - a cart requires an authenticated customer account. There is no guest cart, and an
  administrator account is refused the cart routes.
- **HC-IAM-003** - a registered customer maintains a wishlist of catalog products, scoped to the
  session's principal.
- **HC-COM-001 (cart half)** - the server revalidates cart pricing and informs the customer of any
  change. Every cart line reports the last-known unit price, the current effective unit price, and
  whether they differ.
- **HC-DEC-004 (Open)** - no reservation, stock hold, availability check, checkout, order, payment,
  tax, or shipping behavior exists. A cart is an intent record, not a commitment.
- **HC-DEC-019 (Open, recorded by this milestone)** - the cart lifecycle is not approved. The
  conservative interpretation is recorded in the decision register.
- **HC-DEC-009 and HC-DEC-008 (Open)** - no converted amount, display quote, or settlement currency
  exists.
- No new dependency, configuration key, infrastructure, or cross-module code import was added. The
  closed `AppErrorCode` union grew by exactly two codes.

## Design decisions

Fifteen decisions are recorded in `specs/007-cart-wishlist/research.md`. The ones that shape the
implementation:

- **R1** - the Cart is a new module; the Wishlist joins the Customers module, exactly as the
  architecture overview's module table assigns them.
- **R2/R3** - both capabilities reference the Catalog through a **declared database foreign key** and
  read the referenced rows through that relation, exactly as the Inventory module does in Milestone 05. Neither module imports Catalog code.
- **R4** - a cart line carries two prices: the last-known price the customer agreed to, and the
  current effective price. One price would either hide a change or silently overwrite what the
  customer agreed to.
- **R5** - the last-known price is refreshed on every write to a line, so it always means "the price
  at the customer's most recent decision".
- **R6** - a cart holds catalog SKUs only. A bundle line needs the bundle selection rule and the
  bundle availability contract, and is deferred to the Milestone 08 plan.
- **R7** - a cart never checks or holds stock. Availability is revalidated at checkout under
  HC-DEC-004.

## What was built

| Area           | Change                                                                                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema         | `carts`, `cart_items`, and `customer_wishlist_items`, with their foreign keys, unique constraints, indexes, and two `CHECK` constraints.                        |
| Cart module    | `apps/api/src/modules/cart/` - the support rules, the request schemas, the response projections, the controller, the policies, the service, and the repository. |
| Wishlist       | `apps/api/src/modules/customers/` - the wishlist repository, service, controller, request schemas, and projections.                                             |
| Error contract | `CART_ITEM_NOT_FOUND` and `WISHLIST_ITEM_NOT_FOUND` (404).                                                                                                      |
| Contract       | OpenAPI 0.7.0: seven new operations, the `Cart` tag, and the regenerated `openapi/openapi.json` (73 operations).                                                |
| Migration      | `prisma/migrations/20261020210000_cart_wishlist/migration.sql` - additive, applied to three databases.                                                          |
| Guard scripts  | The approved `cart` and `wishlist` module names were removed from the hygiene and excluded-domain scans; every other term is still rejected.                    |

## Actual verification

Every number below is from an executed command in this session.

### 1. Composite quality gate

`pnpm verify` - **exit 0**, all eight categories passed in order: format, lint, module boundaries,
types, unit, build, repository hygiene, and OpenAPI validation with drift check.

`All composite verification categories passed.`

### 2. Automated suites

| Suite       | Command                 | Result                                                                              |
| ----------- | ----------------------- | ----------------------------------------------------------------------------------- |
| Unit        | `pnpm test:unit`        | PASS - 30 suites, 283/283 tests                                                     |
| Integration | `pnpm test:integration` | PASS - 8 suites, 143/143 tests                                                      |
| End-to-end  | `pnpm test:e2e`         | PASS - 7 suites, 55/55 tests                                                        |
| Process     | `pnpm test:process`     | PASS - 4 passed, 1 skipped (the pre-existing Windows graceful-shutdown signal test) |

The unit suite grew from 278 tests over 29 suites to **283 tests over 30 suites**: 5 new tests
covering the quantity rules and the approved-module hygiene case.

The integration suite grew from 116 tests over 7 suites to **143 tests over 8 suites**: 27 new tests
covering the cart and wishlist lifecycles, the quantity merge, the price-change signal, the customer
isolation, the database constraint refusals, the deletion protection, and the "never reserves stock"
property.

The end-to-end suite grew from 47 tests over 6 suites to **55 tests over 7 suites**: 8 new tests
covering the customer journeys, the anonymous and administrator denials, the invalid-request
refusals, the customer isolation, and the live OpenAPI response validation.

### 3. Migration status and data preservation

`prisma migrate status` reports **11 migrations found** and **"Database schema is up to date!"** on
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

### 4. The database refuses an out-of-range cart line

The integration suite writes a cart line directly through Prisma with a quantity of `0` and with a
negative price, and the database refuses both with the `cart_items_quantity_in_range` and
`cart_items_unit_price_nonnegative` constraints.

The suite also proves the deletion protection: a SKU that is in a cart cannot be deleted, and the
deletion is refused with the catalog's existing stable conflict, so the customer is not left with a
line that points at nothing.

### 5. A cart never reserves or holds stock

The integration and end-to-end suites both assert the property directly: after a cart write, the
inventory item's `on_hand` and `reserved` are unchanged and the reservation count is `0`. A cart is
an intent record, and the reservation timing stays open under HC-DEC-004.

### 6. Seeded-failure rejection

The gate was proven to reject a real defect, not only to pass on a good tree.

**Seed.** The cart's last-known price was no longer refreshed when the customer changed a line's
quantity, so the stored price silently disagreed with the customer's latest decision.

**Rejection, integration level.** The integration suite failed on the affected case:

```
expect(received).toMatchObject(expected)
- "lastKnownUnitPriceMinor": 99900,
- "priceChanged": false,
+ "lastKnownUnitPriceMinor": 129900,
+ "priceChanged": true,
```

**Restoration.** The seed was reverted, the file was verified to contain the original expression, and
`pnpm verify` was run again: **exit 0**, all eight categories passed. The seed left no residue.

### 7. OpenAPI drift

`pnpm openapi:check` regenerated the document and reported
`OpenAPI validation and drift check passed.` The committed `openapi/openapi.json` is version 0.7.0
with 73 operations, including the four cart routes and the three wishlist routes. The operation
inventory in `apps/api/src/platform/openapi/openapi.ts` and the independent inventory in
`scripts/openapi-check.mjs` both list them, so a route that is in neither fails the gate.

The excluded-domain scan was **narrowed, not weakened**: `cart` and `wishlist` were removed because
those capabilities are now approved, and every remaining term - `authentication`, `administrator`,
`checkout`, `order`, `payment`, `preorder`, `shipping`, `review`, `notification` - is still rejected.
The hygiene unit suite proves the newly approved `cart` module directory is accepted while a
still-excluded one is rejected.

### 8. Production dependency audit

`pnpm audit:prod --audit-level critical` - **exit 0**, `No known vulnerabilities found`.

The full development-inclusive audit is unchanged from Milestone 05: the `braces@3.0.3` advisory
(GHSA-vfj7-8cjw-p6xm) has no upstream patch and remains unwaived. It is a transitive development
glob dependency, not a production dependency, and the production audit is clean. Full security
sign-off remains open and is not claimed here.

### 9. Test isolation

The database-backed suites ran against the isolated databases `hc_m06_20261020_integration` and
`hc_m06_20261020_e2e`, which were created empty and had the eleven migrations applied to them. The
three pre-existing databases were only read from, except for the additive migration itself, whose
data preservation is proved above. No database was reset, no volume was deleted, and no existing
application row was removed.

## Defects found and fixed in this milestone

| ID  | Defect                                                                                                                                                                   | Fix                                                                                                                                                              | Verification                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| D1  | The catalog and inventory reset helpers deleted SKUs while a cart line still referenced one, so the RESTRICT foreign key refused the reset and every later suite failed. | Both reset helpers now remove the cart lines before the SKUs they reference.                                                                                     | The integration and end-to-end suites, and the restored catalog and inventory suites. |
| D2  | The cart integration suite reset the catalog before the cart, so the cart's rows outlived their SKUs.                                                                    | The reset order was corrected so the cart is cleared before the catalog.                                                                                         | The integration suite.                                                                |
| D3  | The repository-hygiene unit suite used `wishlist` as its example of a still-excluded module, which the milestone had approved.                                           | The example became `checkout`, and a new case proves the approved `cart` module is accepted while a still-excluded one is rejected.                              | The unit suite.                                                                       |
| D4  | The end-to-end administrator helper reused the enrollment time step for the second factor, so the verification was refused with `401`.                                   | The helper now proves the second factor with a recovery code, exactly as the catalog suite does.                                                                 | The end-to-end suite.                                                                 |
| D5  | The end-to-end suite asserted a half-off effective price of `97325`; the correct value under the Milestone 06 half-up rule is `64950`.                                   | The expectation was corrected and the rule was re-derived from the implementation.                                                                               | The integration and end-to-end suites.                                                |
| D6  | The composite gate failed on formatting in nine files after the change.                                                                                                  | The files were formatted with the repository's own Prettier configuration. No gate rule, configuration value, or source file was changed to make the check pass. | `pnpm verify` exit 0.                                                                 |
| D7  | The composite gate failed on OpenAPI drift after the contract version and tag changed.                                                                                   | The document was regenerated and reviewed.                                                                                                                       | `pnpm openapi:check` and `pnpm verify` exit 0.                                        |

D1 was a genuine defect in the shared test infrastructure that would have broken every later
suite; it is now covered by the restored catalog and inventory suites. D2, D3, D4, and D5 were
mistakes in the new tests and were corrected without weakening an assertion. D6 and D7 were
formatting and contract-regeneration failures only.

## Unresolved items and open decisions

1. **HC-DEC-019 (Open)** - the cart lifecycle is not approved. The interpretation this milestone
   implemented is recorded in the decision register and can be widened or narrowed without a data
   migration.
2. **HC-DEC-004 (Open)** - no reservation, checkout, order, payment, tax, or shipping behavior
   exists. The cart is ready to be read by a future checkout, and the price comparison it performs
   is the revalidation that checkout will need.
3. **HC-DEC-009 and HC-DEC-008 (Open)** - no converted amount or display quote exists.
4. **Bundle cart lines** - deferred to the Milestone 08 plan with the reason recorded: a bundle line
   needs the bundle selection rule and the bundle availability contract, both inside the open
   checkout boundary.
5. **The `braces@3.0.3` development advisory** - no upstream patch, unwaived, and not a production
   dependency. The production audit is clean.
6. **Hosted CI (administrative, NOT VERIFIED)** - the repository still has zero commits, so no hosted
   run is claimed. All evidence above is local.

## Readiness

All local Milestone 07 acceptance criteria are satisfied: **29 of 29 tasks complete**, a single
complete quality-gate pass with all eight categories green, the unit, integration, and end-to-end
suites green, the process suite green with one pre-existing Windows skip, migrations current on all
three databases with the data preservation proved by before-and-after row counts, the database
constraints proven to refuse an out-of-range cart line, the "a cart never reserves stock" property
proven by both the integration and the end-to-end suites, the gate proven to reject a seeded defect
and to pass again once the defect was removed, and the production audit clean.

The milestone is ready for Product Owner review on the implemented behavior. It does not claim
security sign-off, hosted CI evidence, or a resolution of HC-DEC-019, HC-DEC-004, HC-DEC-009, or
HC-DEC-008. No commit, push, deployment, database reset, or volume deletion was performed.
Milestones 01 through 06 are preserved, and no Milestone 08 implementation was started during this
milestone.
