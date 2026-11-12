# Specification Quality Checklist: Milestone 09 - Orders and Pre-orders

**Feature**: Milestone 09 - Orders and Pre-orders
**Spec**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md)
**Date**: 2026-10-21

## Content Quality

- [x] The specification states up front the approved **development scope** and names the decisions
      that govern it, each with its remaining activation blocker.
- [x] Every functional requirement is checkable: it names an artifact or a property, not an
      implementation.
- [x] The edge cases cover the empty cart, the changed price, the concurrent idempotency, the
      repeated key with a different key, the reservation that expires between the creation and the
      read, the cancellation after the expiry, the destination that lost its approval, the bundle
      composition, the cross-customer access, and the pre-order that is never restocked.
- [x] The assumptions are stated, numbered, and each is either an approved fact or a stated
      consequence of an approved decision.

## Requirement Completeness

- [x] The snapshot requirements name every figure the order stores, and the immutability
      requirement states that a later catalog change cannot alter a purchase.
- [x] The trust requirements forbid a client-supplied amount and make the request schema itself
      express it, because a strict schema has no field for one.
- [x] The idempotency requirement names the scoping and the concurrent case.
- [x] The state-machine requirement names the states and requires the permitted transitions to be
      explicit.
- [x] The reservation requirements name the window, the release paths, and the late-payment race.
- [x] The pre-order requirements make the "never charged early" guarantee structural, by giving the
      pre-order no payable amount, no reservation, and no payment reference while it awaits stock.
- [x] The boundary requirement forbids a cross-module table read and names the published contracts.
- [x] The migration requirement forbids a destructive change, and the executed evidence proves the
      row counts are identical.

## Feature Readiness

- [x] The success criteria are measurable and each was measured.
- [x] The data model describes the **implemented** structures, each with the constraint that makes it
      correct.
- [x] The contract document describes the implemented surface, the states, the error catalogue, and
      the published contracts, including the one-way dependency direction.

## Notes

### Validation record (2026-10-21)

- The specification was checked against the approved decisions. HC-DEC-004, HC-DEC-010, and
  HC-DEC-015 were approved for the development scope on 2026-10-21, and the milestone implements
  exactly that scope: it does not implement a refund, a shipping rate, a customer notification, or a
  pre-order deadline, and the activation blockers are recorded rather than resolved.
- The specification was checked against the constitution. Principle I requires cross-module access to
  use published contracts, and the milestone introduces four of them; principle V requires the
  bundle composition to be snapshotted, and the order's line stores it; principle VIII requires the
  amounts to be exact and the migration to be safe, and both are proven.
- The specification was checked against the decision register. Every decision the milestone depends
  on is listed with its approved scope and its remaining activation blocker.
- The specification was checked against the existing contract. The published document advanced from
  version 0.8.0 with 81 operations to version 0.9.0 with 93 operations, the `openapi:check` gate
  passed with zero drift, and the composite quality gate passed all eight categories.
