# Specification Quality Checklist: Milestone 06 - Pricing and Search

**Feature**: Milestone 06 - Pricing and Search
**Spec**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md)
**Date**: 2026-10-20

## Content Quality

- [x] The specification is written for a product owner, not a developer: no implementation detail
      appears in the user scenarios or the acceptance criteria.
- [x] The user scenarios describe what a shopper and an administrator do, not what a class does.
- [x] The acceptance criteria are written as Given/When/Then and are each independently observable.
- [x] The spec states the approved facts it implements (HC-CAT-008, HC-CAT-009, HC-COM-002) and the
      decisions it deliberately does not resolve (HC-DEC-009, HC-DEC-008, HC-DEC-004, HC-DEC-006).
- [x] No unresolved requirement is silently selected; the discount's form is recorded as the new
      open decision HC-DEC-018 with this milestone's interpretation stated.

## Requirement Completeness

- [x] Every functional requirement is testable: it names an observable behavior, not an
      implementation.
- [x] The money requirements name the rounding rule and its application boundary (FR-011), as
      constitution principle VIII requires.
- [x] The data-consistency requirement names the storage layer as the authority (FR-012), not the
      application.
- [x] The authorization requirements name the role and both denial paths (FR-014).
- [x] The constraint requirement forbids a new dependency, configuration key, infrastructure, error
      code, and public path (FR-018), so the milestone cannot quietly grow.
- [x] The edge cases cover the empty result, the unknown name, the inverted range, the missing
      currency, the zero and full discount, the deleted product, and the extreme amount.

## Feature Readiness

- [x] Every user story has an independent test and a clear "why this priority".
- [x] The success criteria are measurable: latency, exactness, no repeat or skip, automated
      coverage, and a green gate.
- [x] The assumptions are stated, numbered, and each is either an approved fact or a decision
      recorded for the Product Owner.
- [x] No requirement depends on an unresolved decision for the work that is actually delivered.

## Notes

### Validation record (2026-10-20)

- The specification was checked against the approved product facts and the decision register.
  HC-CAT-008 and HC-CAT-009 are approved and are implemented in full. HC-COM-002 is partially
  implemented: the base currency is delivered, and the display-currency half is deferred because
  HC-DEC-009 and HC-DEC-008 are open. No converted amount is invented.
- The specification was checked against constitution principle VIII. The rounding rule is explicit,
  the application boundary is named, and the arithmetic is exact integer arithmetic with a database
  constraint that enforces the same expression.
- The specification was checked against the boundary rules. The capability extends the Catalog
  module and introduces no new module, so no cross-module table access is introduced.
- The specification was checked against the existing contract. The search and the discount extend
  the existing catalog surface, so no existing client breaks and no new public path is introduced.
- The specification was checked for the closed error-code union. No new code is required, so the
  union is unchanged.
