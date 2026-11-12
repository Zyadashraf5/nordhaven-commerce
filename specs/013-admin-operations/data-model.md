# Data Model: Milestone 13 - Administration and Operations

**Date**: 2026-10-21

**Status**: **Delivered. The milestone adds no table, no column, and no migration.**

## Why the milestone adds no schema

The Administration capability is a **thin orchestration layer**. It stores nothing, so there is
nothing to migrate, no drift to prove, and no second source of truth to reconcile. Every figure it
reports is read from the capability that owns the record, at the moment it is asked for.

This is a deliberate property and not an accident. A stored operational snapshot would be a second
source of truth that could disagree with the capabilities it reports, and the milestone would then
have to reconcile the two. A computed summary cannot drift.

## The records it reads

| Record | Owner | Read through |
| ------ | ----- | ------------ |
| the order and its state | Orders | `ORDER_LEDGER.listAll`, `listForCustomerOf` |
| the shipment and its state | Shipping | `SHIPPING_FULFILLMENT.listAll`, `listForCustomerOf` |
| the return and its state | Shipping | `SHIPPING_FULFILLMENT.listAllReturns`, `listReturnsForCustomerOf` |
| the review and its state | Reviews | `REVIEW_LIBRARY.listAll`, `listForCustomerOf` |
| the message and its state | Notifications | `NOTIFICATION_SENDER.listAll`, `listForRecipientOf` |
| the account | Identity | `IDENTITY_AUDIT.listAccounts` |
| the security event | Identity | `IDENTITY_AUDIT.recentSecurityEvents` |
| the attempt, the refund, and the money | Payments | `PAYMENT_OPERATIONS.financialSummary`, `listAll` |

## The money

The money is aggregated by the **database**, over the Payments capability's own tables, inside the
Payments capability:

- The collected amount is the sum of the succeeded attempts' amounts.
- The refunded amount is the sum of the succeeded refunds' amounts.
- The pending refund amount is the sum of the pending refunds' amounts.
- The counts are the attempts and the refunds **by state**.

Every amount is an exact integer count of minor units, and the Administration capability never
computes a total from a row it read itself.

## The read bound

The administrative view reads a **bounded** number of records per capability - five hundred - so it
is an operational view rather than a full report. The bound is a constant in the service, and it is
documented in the specification's assumptions.

## The database state after the milestone

The isolated targets carry **23 applied migrations**, the same as before the milestone, with
`prisma migrate status` at exit 0, `prisma migrate diff` at exit 0 and no difference, and the stock,
money, and reservation invariant counts at zero. The three original databases remain at **14**
applied migrations and were not touched.
