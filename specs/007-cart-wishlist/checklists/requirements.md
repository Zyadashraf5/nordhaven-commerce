# Specification Quality Checklist: Milestone 07 - Cart and Wishlist

**Feature**: Milestone 07 - Cart and Wishlist
**Spec**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md)
**Date**: 2026-10-20

## Content Quality

- [x] The specification is written for a product owner, not a developer: no implementation detail
      appears in the user scenarios or the acceptance criteria.
- [x] The user scenarios describe what a shopper does, not what a class does.
- [x] The acceptance criteria are written as Given/When/Then and are each independently observable.
- [x] The spec states the approved facts it implements (HC-IAM-002, HC-IAM-003, and the cart half of
      HC-COM-001) and the decisions it deliberately does not resolve (HC-DEC-004, HC-DEC-009,
      HC-DEC-008).
- [x] No unresolved requirement is silently selected; the cart lifecycle is recorded as the new
      open decision HC-DEC-019 with this milestone's interpretation stated.

## Requirement Completeness

- [x] Every functional requirement is testable: it names an observable behavior, not an
      implementation.
- [x] The scoping requirements name the principal as the only source of scope (FR-001, FR-002,
      FR-009), so cross-customer access is structurally impossible rather than merely tested.
- [x] The pricing requirements name both prices and the difference (FR-005, FR-006), so a price
      change is never invisible and never silently applied.
- [x] The constraint requirement forbids a new dependency, configuration key, infrastructure, and
      cross-module code import (FR-015), so the milestone cannot quietly grow.
- [x] The edge cases cover the empty cart, the unpublished product, the archived product, the
      zero and over-maximum quantity, the repeated add, the price change, the deleted product, and
      the missing line or item.

## Feature Readiness

- [x] Every user story has an independent test and a clear "why this priority".
- [x] The success criteria are measurable: latency, isolation under concurrency, a visible price
      change, automated coverage, and a green gate.
- [x] The assumptions are stated, numbered, and each is either an approved fact or a decision
      recorded for the Product Owner.
- [x] No requirement depends on an unresolved decision for the work that is actually delivered.

## Notes

### Validation record (2026-10-20)

- The specification was checked against the approved product facts. HC-IAM-002 and HC-IAM-003 are
  approved and are implemented in full. HC-COM-001's cart half is implemented; its checkout half
  stays with the open HC-DEC-004.
- The specification was checked against the architecture overview's module table. The Cart is a new
  capability and the wishlist joins the Customers capability, exactly as the table assigns them.
- The specification was checked against the boundary rules. Both capabilities reference the Catalog
  only through a declared foreign key and read the referenced rows through that relation, so no
  feature module is imported and `boundaries:check` still passes.
- The specification was checked against the existing contract. The cart and the wishlist add seven
  new operations and two new error codes, and change no existing route, operation identifier, status
  code, or response shape.
- The specification was checked for the closed error-code union. Exactly two codes are added, and
  every other outcome reuses an existing code.
