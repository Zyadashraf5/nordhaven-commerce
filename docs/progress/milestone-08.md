# Milestone 08 - Checkout and Tax Implementation Record

**Date**: 2026-10-21 (Africa/Cairo). **Status**: **development scope complete and locally
verified.** The tax engine and the checkout calculation exist, are tested, and are published. The
order aggregate and the payment lifecycle belong to Milestones 09 and 10 and are **not** implemented
here.

## Objective

Implement secure checkout calculation, validation, tax estimation, deterministic totals, checkout
readiness rules, and the typed interfaces the order creation needs.

## Why this milestone could be implemented

The Product Owner approved the checkout, tax, order, payment, and refund **development scope** on
2026-10-21, which resolved the two decisions that previously blocked the milestone:

- **HC-DEC-004** - the checkout revalidates the SKU status, the current effective prices, the
  quantities, and the inventory before an order is confirmed; the checkout and order state machines
  are explicit and documented; order creation is idempotent; the order price snapshots are
  immutable; a client-supplied price or total is never trusted; a cart never reserves stock. The
  initial pending-payment reservation window is fifteen minutes and is configurable; an expired or
  released reservation can never be consumed by a late payment event; a payment-pending versus
  reservation-expiry race is resolved by explicit state transitions and reconciliation. A FIXED
  bundle uses independently stocked finished goods; a DYNAMIC bundle uses component-derived
  inventory and the approved bundle composition, and a customer may not select components
  arbitrarily.
- **HC-DEC-006** - a configurable, auditable tax calculation engine with product classification,
  destination, effective dates, tax-inclusive and tax-exclusive pricing, an explicit rounding rule,
  and tax snapshots. Fourteen percent is **not** hardcoded as a universal rate. The automated tests
  use clearly identified `TEST` fixtures. Production tax calculation is not enabled for a
  jurisdiction without an approved configuration, and no exemption, zero rate, or e-receipt
  compliance is assumed.

The remaining activation blockers are unchanged and are listed below.

## What was delivered

| Artifact                                               | Content                                                                                                               |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `specs/008-checkout-tax/spec.md`                       | The rewritten specification for the approved development scope.                                                       |
| `specs/008-checkout-tax/research.md`                   | The twenty findings that turn the approved scope into an implementation.                                              |
| `specs/008-checkout-tax/data-model.md`                 | The implemented tax rule, classification, destination, and cart line owner, with the proof the migration is additive. |
| `specs/008-checkout-tax/contracts/checkout-tax-api.md` | The implemented surface, the closed blocker set, the error catalogue, and the published contracts.                    |
| `specs/008-checkout-tax/plan.md`                       | The implementation plan and the constitution check.                                                                   |
| `apps/api/src/modules/tax/`                            | The Tax capability: the pure engine, the configuration, the administration, and the published assessor.               |
| `apps/api/src/modules/checkout/`                       | The Checkout capability: the destinations, the quote calculation, and the published quoter.                           |
| `apps/api/src/modules/cart/contracts.ts`               | The published cart reader, and the cart's bundle line support.                                                        |
| `apps/api/src/modules/inventory/contracts.ts`          | The published availability reader.                                                                                    |

## The design decisions this milestone made

1. **The tax rules are configuration data, not code.** A rate lives in a row with an environment
   scope, a jurisdiction, a product classification, an exact basis-point rate, an inclusive or
   exclusive treatment, an effective window, and a priority. A production request looks only for
   production rules, so production tax is disabled **structurally** rather than by convention.
2. **A missing tax rule blocks the quote; it is never a zero rate.** A configured zero rate is an
   explicit decision; an absent rule is a gap, and the quote reports it.
3. **The tax is assessed per line and rounded once per line, half up.** The rounding rule is named
   in every quote, and the identity `netSubtotal + taxTotal === total` holds exactly in every
   configuration, including a tax-inclusive one.
4. **The quote is a pure function of the cart, the destination, and the server's configuration.** It
   is recomputed rather than persisted, because a stored quote would need an expiry and cleanup
   policy that no approved decision defines.
5. **The quote carries a deterministic fingerprint** over its material content, so a later step
   detects a stale price rather than silently applying a new one.
6. **Availability is a published contract, not a table read.** Availability is `on_hand - reserved`
   after the lapsed reservations are released, and for a DYNAMIC bundle it is derived from the
   component composition. Both are the Inventory capability's rules.
7. **A quote is not a commitment.** It reserves no stock, creates no reservation, creates no order,
   and takes no payment.
8. **A cart line names a SKU or a bundle, never both and never neither.** The exactly-one-owner
   check is hand-added, exactly as `inventory_items` carries one.
9. **Every amount is an exact integer count of minor units in one explicit currency.** EGP is the
   settlement currency, and a line priced in another currency is refused rather than converted,
   because no conversion is implemented.

## The executed evidence

### The automated suites

| Suite       | Result                    | Command                 |
| ----------- | ------------------------- | ----------------------- |
| Unit        | **315 passed**, 32 suites | `pnpm test:unit`        |
| Integration | **164 passed**, 9 suites  | `pnpm test:integration` |
| End-to-end  | **69 passed**, 8 suites   | `pnpm test:e2e`         |
| Process     | **4 passed**, 1 skipped   | `pnpm test:process`     |

The counts before this milestone were 283, 155, and 55 respectively.

### The composite verification

`pnpm verify` **passed all eight categories** in order: format, lint, boundaries, types, unit, build,
repository hygiene, and OpenAPI.

### The migration

The migration `20261021090000_checkout_tax` was applied to the three canonical databases
(`nordhaven`, `nordhaven_integration`, `nordhaven_e2e`) and to the two isolated test databases
(`hc_m08_20261021_integration`, `hc_m08_20261021_e2e`). `prisma migrate status` reports the schema
**up to date** with **twelve** migrations on all three canonical databases.

**The migration is additive.** The row counts were captured before and after and were **identical** in
every table: 5 products, 4 variants, 9 users, and 0 carts, cart items, inventory items, reservations,
and wishlist items on `nordhaven`; 0 everywhere else.

### The database constraints

Every hand-added constraint was proven to refuse the bad write against the real database:

| Constraint                                       | Bad write it refuses                               |
| ------------------------------------------------ | -------------------------------------------------- |
| `cart_items_exactly_one_owner`                   | A cart line naming both a SKU and a bundle         |
| `cart_items_exactly_one_owner`                   | A cart line naming neither                         |
| `cart_items_cart_id_variant_id_key`              | A second line for the same SKU in one cart         |
| `cart_items_cart_id_bundle_id_key`               | A second line for the same bundle in one cart      |
| `tax_rules_rate_basis_points_range`              | A rate above one hundred percent                   |
| `tax_rules_effective_window`                     | An effective window that ends before it starts     |
| `checkout_destinations_tax_jurisdiction_present` | A destination with no jurisdiction                 |
| `tax_classifications_product_id_fkey`            | A classification for a product that does not exist |

A valid rule, a valid destination, a SKU line, and a bundle line were each **accepted**, so the
constraints refuse the bad writes rather than everything.

### The OpenAPI contract

The published contract is **version 0.8.0** with **81 operations**, up from 73. The eight new
operations are the customer quote, the four tax administration routes, the two checkout destination
routes, and the cart bundle line. The `openapi:check` gate passed, which asserts the operation
inventory, the authorization metadata of every route, the excluded-domain names, and **zero drift**
against the committed document.

### The bugs this milestone found and fixed

1. **The tax engine's gross total was not computable.** The first version reduced over a field the
   per-line result did not carry, so the total would not have compiled into a correct figure. The
   engine now carries the priced amount on every line and the totals are reduced from it.
2. **The rule tie-break was not the documented one.** The first version selected the **highest**
   identifier on a full tie, while the design and the repository's listing order are ascending. The
   engine now selects the **lowest** identifier, so the selection matches the order the rules are
   listed in.
3. **A test-isolation defect the bundle line exposed.** The new `cart_items.bundle_id` foreign key
   made the reset helpers delete rows in an order the foreign keys forbid, so the catalog and the
   inventory suites failed against each other. The reset helpers now delete the cart lines before the
   variants and the bundles they hold, and the catalog reset clears the inventory rows that
   reference a SKU. The defect was in the test helpers, not in the application.
4. **Two tax administration routes answered `200` where the contract declared `204`.** The controller
   lacked the explicit no-content status, so a client that trusted the contract would have failed.
   The controller now declares `204` explicitly, as the other administrative controllers do.

## The remaining activation blockers

Local development completion is **not** production readiness. The following remain unapproved and
keep production checkout, payment, and tax disabled:

- The merchant's exact VAT registration status and every cross-border tax obligation.
- A production tax configuration and a production destination list. The `EnvironmentScope` makes
  this structural: a production request finds no rule and no destination today.
- A reviewed payment-provider contract. The Paymob adapter interface may be prepared, but no
  provider is activated and no live credential exists.
- Production shipping rules and rates. The shipping capability is Milestone 11.
- A security sign-off on the development dependency advisory.
- Hosted continuous integration. The repository has no commits, so no hosted run is claimed.

## What this milestone does not deliver

- **No order, payment, refund, or shipping behavior.** The order aggregate and its state machine
  belong to Milestone 09; the payment provider, the webhook verification, and the refunds belong to
  Milestone 10. This milestone publishes the contract the Orders capability consumes and records the
  remaining work as traceability tasks T041 to T045.
- **No production tax, no production destination, and no live payment.** See the activation
  blockers above.
- **No shipping rate.** A destination must have an approved shipping rule to check out, but no
  shipping rate is invented and no shipping amount appears in the quote.
- **No customer-selected dynamic bundle components.** The approved decision forbids arbitrary
  selection in this phase, and the DYNAMIC bundle's approved composition is used.
- **No frontend.** The milestone delivers the API only.
