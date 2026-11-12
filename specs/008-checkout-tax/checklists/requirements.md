# Specification Quality Checklist: Milestone 08 - Checkout and Tax

**Feature**: Milestone 08 - Checkout and Tax
**Spec**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md)
**Date**: 2026-10-21

## Content Quality

- [x] The specification states up front the approved **development scope** and names the decisions
      that govern the two capabilities, each with its remaining activation blocker.
- [x] Every functional requirement is checkable: it names an artifact or a property, not an
      implementation.
- [x] The edge cases cover the price change, the empty cart, the unavailable product, the
      unsupported quantity, the insufficient stock, the unsupported destination, the missing shipping
      approval, the missing tax rule, the mixed tax-pricing mode, the unsettled currency, the
      expired rule, the overlapping rules, and the dynamic bundle.
- [x] The assumptions are stated, numbered, and each is either an approved fact or a stated
      consequence of an approved decision.

## Requirement Completeness

- [x] The tax requirements make the configuration-data rule explicit: a rate is never hardcoded, and
      the environment scope makes the production block structural.
- [x] The money requirements name the exactness, the rounding rule, and the boundary at which the
      rounding is applied.
- [x] The readiness requirements name a **closed** set of blockers, so a client can render them
      exhaustively and a test can assert them.
- [x] The trust requirements forbid a client-supplied price, tax, or total, and the request schema
      enforces it by refusing the field.
- [x] The determinism requirements name the fingerprint and what must change it.
- [x] The boundary requirements forbid a cross-module table read and require the published contracts.
- [x] The migration requirement forbids a destructive change, and the executed evidence proves the
      row counts are identical.

## Feature Readiness

- [x] The success criteria are measurable and each was measured.
- [x] The plan sequences the work behind the phases and states the constitution check for every
      principle.
- [x] The data model describes the **implemented** structures, each with the constraint that makes it
      correct, and it marks the order aggregate as Milestone 09's.
- [x] The contract document describes the implemented surface, the closed blocker set, the error
      catalogue, and the four published contracts.

## Notes

### Validation record (2026-10-21)

- The specification was checked against the approved decisions. HC-DEC-004 and HC-DEC-006 were
  approved for the development scope on 2026-10-21, and the milestone implements exactly that scope:
  it does not implement the order lifecycle, the reservation window, the payment, the refund, or the
  shipping rate, and the activation blockers are recorded rather than resolved.
- The specification was checked against the constitution. Principle XI requires unresolved
  requirements to be identified explicitly rather than silently selected, and the milestone states
  every assumption it relies on, including the settlement currency, the tax-inclusive treatment, the
  default classification, the rounding rule, the fingerprint's content, and the dynamic bundle's
  composition.
- The specification was checked against the decision register. Every decision the milestone depends
  on is listed with its approved scope and its remaining activation blocker, and the milestone
  records the new decisions it identified - HC-DEC-018, HC-DEC-019, and HC-DEC-020 - rather than
  leaving them implicit.
- The specification was checked against the existing contract. The published document advanced from
  version 0.7.0 with 73 operations to version 0.8.0 with 81 operations, the `openapi:check` gate
  passed with zero drift, and the composite quality gate passed all eight categories.
