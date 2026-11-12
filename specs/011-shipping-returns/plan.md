# Implementation Plan: Milestone 11 - Shipping and Returns

**Date**: 2026-10-21

**Status**: **Executed.** This plan states what was built and why, and it records the two design
decisions that changed during the milestone, because a plan that hides a reversal hides the reason
for the shape of the code.

## The capability and its boundary

The Shipping and Fulfillment capability owns the shipping destinations, the shipping methods, the
shipments, and the returns. It reaches the other capabilities only through published contracts:

| The Shipping capability needs to | It asks | Through |
| -------------------------------- | ------- | ------- |
| the order's lines, its owner, and its paid state | `ORDER_LEDGER.findOrderById` | the Orders capability's published contract |
| to put returned goods back into stock | `INVENTORY_RESTOCK.restock` | the Inventory capability's new published contract |
| to return the money | `PAYMENT_REFUNDS.refundOrder` | the Payments capability's new published contract |

It never writes another capability's rows. The two new contracts are thin adapters over the owning
capability's own rules: the restock is the Inventory capability's own idempotent stock movement, and
the refund is the Payments capability's own refund with its cumulative limit.

## The dependency decision that shaped the milestone

The first design put the shipping amount into the checkout quote, so the customer would pay for the
delivery. **The module graph does not permit it.**

The Payments capability already depends on the Orders capability. The Shipping capability must
depend on the Orders capability, because a shipment is created for an order and a return is
validated against an order's lines. So a Shipping capability that depends on the Payments capability
must not be depended on by the Orders capability's dependency closure, and the Orders capability's
closure contains the Checkout capability. A Checkout capability that depended on the Shipping
capability would therefore close the cycle

```
Checkout -> Shipping -> Payments -> Orders -> Checkout
```

Two ways out were considered.

1. **Split the Shipping capability** into a configuration module and a fulfilment module, so the
   Checkout capability could depend on the configuration module alone. This is structurally sound,
   but it splits one business capability into two modules for the sake of a price that is not
   approved yet, and it leaves the shipping configuration and the shipments owned by different
   modules.
2. **Keep the capability whole and do not collect the shipping amount yet.**

The second was chosen, because the shipping charge is not approved. HC-DEC-013 leaves the shipping
providers, the rate calculation, and the service areas open, and the milestone's instruction is
explicit: do not invent actual shipping rates. Adding an unapproved configured amount to a payable
total is inventing a rate in everything but name. So the milestone records the configured amount on
the shipment, exposes the configured options, and states plainly that the amount is recorded and not
collected.

The order's figures are therefore unchanged, the checkout quote is unchanged, and the Milestone 08
and Milestone 09 regression suites are untouched. The decision is recorded in the research, in the
data model, and in the milestone report, and the withdrawal of the order columns is a forward
migration rather than a rewrite of history.

## The work

### 1. The schema

Three additive forward migrations, applied to the isolated targets only:

- `20261021190000_shipping_returns` - eight new tables with their constraints and indexes.
- `20261021200000_order_shipping_snapshot` - the order's shipping columns, later withdrawn.
- `20261021210000_order_shipping_snapshot_withdrawn` - the withdrawal, which restores the original
  order constraint.
- `20261021220000_stock_movement_reference` - the stock movement's business key and the `RESTOCK`
  reason, which is what makes a restock idempotent.

### 2. The two new published contracts

- **The Inventory capability's `INVENTORY_RESTOCK`.** A restock increases the on-hand quantity and
  records a movement, in one transaction, with the inventory row locked and the business key unique.
  A repeated request changes nothing the second time.
- **The Payments capability's `PAYMENT_REFUNDS`.** The attempt is resolved by the Payments
  capability, so the caller never has to know which attempt paid the order, and the cumulative refund
  limit stays inside the capability that owns it.

### 3. The Shipping capability

- `contracts.ts` - the published contract, the states, and the records.
- `application/shipping-transitions.ts` - the two lifecycles as data.
- `application/shipping.service.ts` - the rules: the configuration, the options, the shipment
  lifecycle, the tracking reference, the return lifecycle, the proportional allocation of a
  returned line's amount, the restock, and the refund.
- `persistence/shipping.repository.ts` - the persistence, with every state change a **conditional**
  update.
- `api/` - the request schemas, the response projections, the rate-limit policies, the anonymous
  options route, the customer's routes, and the administrator's routes.

### 4. The platform wiring

- The six new application error codes, with their statuses and their fixed messages.
- The `shipping` capability removed from the excluded module list and from the excluded OpenAPI
  domain list, because the capability is approved.
- The twenty-four new operations in the reviewed operation inventory, the operation allow-list, the
  anonymous operation set, and the committed OpenAPI document, which advanced to **1.1.0**.
- The `SETTLEMENT_CURRENCY` and the environment scope moved to the platform's configuration module,
  because the Shipping capability needs them and the Shipping capability must not depend on the
  Checkout capability for a constant.

### 5. The tests

- A unit suite for the two lifecycles, which states the whole permitted set so a new state cannot be
  added without stating what it may become.
- An integration suite of eighteen cases: the configuration, the options, the shipment creation and
  its refusals, the lifecycle, the refusal recording, the tracking, the return request and its
  refusals, the receipt with its restock and refund, the rejected return, the repeated receipt, and
  the recorded transitions.
- An end-to-end suite of eight cases over the HTTP surface: the anonymous options route, the
  authorization boundaries in both directions, the anonymous refusal, the full shipment and return
  flow, the administrative visibility, and the customer boundary.

## The verification

| Gate | Result |
| ---- | ------ |
| `verify` (format, lint, boundaries, types, unit, build, repository hygiene, OpenAPI) | **PASS**, exit 0 |
| `test:unit` | 380 passed, 37 suites |
| `test:integration` | 269 passed, 13 suites |
| `test:e2e` | 106 passed, 12 suites |
| `test:process` | 4 passed, 1 skipped |
| `prisma migrate status` on both isolated targets | exit 0, up to date, 22 migrations |
| `prisma migrate diff` on both isolated targets | exit 0, no difference |

## What the milestone deliberately leaves open

- **Collecting the shipping charge.** It needs the approved rate, the approved provider, and the
  module-graph decision recorded above.
- **The merchant's return policy.** The window, the conditions, the reverse logistics, and the fees
  are configuration and administrative decisions, because HC-DEC-012 is open.
- **Any customer message about a shipment or a return.** HC-DEC-014 leaves the notification channel
  open, so the milestone sends nothing.
- **The order's fulfilment state.** A shipment does not move the order to `FULFILLED`; that is the
  Orders capability's transition and it belongs with the rest of the administrative operations.
