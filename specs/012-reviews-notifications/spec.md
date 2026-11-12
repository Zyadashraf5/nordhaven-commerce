# Feature Specification: Milestone 12 - Reviews and Notifications

**Created**: 2026-10-21

**Status**: Approved for development. The M06-M10 audit recorded a **CONDITIONAL GO** for M11-M14
development on the verified isolated databases, and the Product Owner authorized the M11-M14 batch on
2026-10-21.

**Input**: "Implement customer reviews with verified purchase eligibility, moderation, ownership,
spam/abuse protections, administrative controls, and appropriate customer notification workflows.
Design notification delivery as a modular provider abstraction. Use safe local/test notification
transports only until real channels are approved. Do not send actual customer emails or messages
without approved configuration."

## Scope Boundaries and Open Decisions

- **HC-DEC-014 (Open)** - the notification channel, the templates, the consent rules, and the
  provider are **not** approved. This milestone therefore builds the provider abstraction and the
  delivery record, ships only **local test transports** and the transport that sends nothing, and
  sends **no** actual customer email or message.
- **HC-DEC-012 (Open)** - the merchant's return policy stays open, so the reviews milestone says
  nothing about returns.

**What "do not send actual customer emails or messages" means here, concretely.**

| Not done | What the milestone does instead |
| -------- | -------------------------------- |
| A real email or SMS | The message is **recorded** and the delivery outcome is recorded with it. The production transport is the one that sends nothing. |
| A channel integration | The provider is bound through a narrow interface, so a channel is an adapter and not a change to the rules. |
| A template engine and an approved template set | The message text is the platform's own, produced by the workflow that produced the fact. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Review a product the customer bought (Priority: P1)

A customer who bought a product writes what they think of it. The platform accepts the review only
if the customer holds a **paid** order that contains the product, and the review is held for
moderation before anybody else sees it.

**Why this priority**: A review that anybody can write about anything is not a review, it is
advertising, and a review that appears before it is checked is a reputational risk.

**Independent Test**: Try to review a product that was never bought, then buy it, review it, and
confirm the first attempt is refused and the second is accepted and held.

**Acceptance Scenarios**:

1. **Given** a customer with no paid order that contains the product, **When** they review it,
   **Then** the request is refused and no review is recorded.
2. **Given** a customer with a paid order that contains the product, **When** they review it,
   **Then** the review is recorded as held for moderation, and the order that proves the purchase
   is recorded with it.
3. **Given** a customer who already reviewed the product, **When** they review it again, **Then**
   the request is refused and the first review stands.
4. **Given** a rating outside one to five, **When** the customer reviews, **Then** the request is
   refused before anything is recorded.

### User Story 2 - Read what other customers said (Priority: P1)

A visitor reads a product's reviews. Only the reviews an administrator approved are visible, and a
public review never says who wrote it.

**Why this priority**: A published review is the platform's promise about a product, so it must be
one the platform checked and one it is willing to stand behind.

**Independent Test**: Write a review, read the public list before and after the moderation
decision, and confirm the list is empty before and holds exactly one review after.

**Acceptance Scenarios**:

1. **Given** a review that is held for moderation, **When** a visitor reads the product's reviews,
   **Then** the review is not listed.
2. **Given** a review that an administrator approved, **When** a visitor reads the product's
   reviews, **Then** the review is listed and carries no author identity.
3. **Given** a review that an administrator refused, **When** a visitor reads the product's
   reviews, **Then** the review is not listed.

### User Story 3 - Moderate a review (Priority: P1)

An administrator approves or refuses a review. The decision is recorded with its reason, and the
author is told what happened.

**Why this priority**: The moderation is the only thing standing between an unchecked statement and
the storefront.

**Independent Test**: Approve a review, refuse a second decision on it, and confirm the second
decision is refused, recorded, and changes nothing.

**Acceptance Scenarios**:

1. **Given** a review that is held for moderation, **When** the administrator approves it, **Then**
   it becomes public and the author is notified.
2. **Given** a review that is held for moderation, **When** the administrator refuses it with a
   reason, **Then** it stays unpublished, the reason is recorded, and the author is notified.
3. **Given** a review that has already been decided, **When** the administrator decides it again,
   **Then** the decision is refused, the refusal is recorded, and the review is unchanged.

### User Story 4 - Keep the reviewer's own words theirs (Priority: P2)

A customer may correct their own review while it is still held for moderation, and cannot change it
afterwards.

**Why this priority**: A published review that the platform edited would not be the customer's
statement, and one that the customer can rewrite after publication would not be trustworthy either.

**Independent Test**: Edit a held review, approve it, and confirm the later edit is refused.

**Acceptance Scenarios**:

1. **Given** a review of the customer that is held for moderation, **When** they edit it, **Then**
   the edit is recorded and the review carries the new words.
2. **Given** a review that has been approved or refused, **When** the customer edits it, **Then**
   the edit is refused.
3. **Given** a review of another customer, **When** the caller edits it, **Then** the request is
   refused exactly as an unknown review would be.

### User Story 5 - Deliver a message exactly once (Priority: P1)

When the platform produces a message, it is recorded and delivered **once**, even if the workflow
that produced it is retried.

**Why this priority**: A duplicated message is a customer-facing defect, and the audit found the
same class of defect in the payment path.

**Independent Test**: Produce the same message twice with the same business key and confirm one
message and one delivery exist.

**Acceptance Scenarios**:

1. **Given** a message that was already produced with a business key, **When** it is produced
   again, **Then** the same message is returned and no second delivery happens.
2. **Given** a channel that sends nothing, **When** a message is produced, **Then** the message is
   still recorded, with the reason it was not delivered.

## Edge Cases

- A customer reviews a product they bought in an order that was cancelled or expired; the request
  is refused, because there is no paid order.
- A customer reviews a product they bought in an order that was paid and later refunded; the review
  is accepted, because the customer did buy the goods.
- A review's title or body is empty after trimming; the request is refused.
- A review's body is longer than the platform's limit; the request is refused.
- The administrator decides a review twice concurrently; exactly one decision applies.
- The customer edits a review while the administrator decides it; exactly one of the two applies.
- A notification's provider throws; the failure is recorded and the message is reported as failed.
- A customer reads another customer's notification; the request is answered like an unknown message.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The platform MUST own a **Reviews** capability that holds the reviews and their
      moderation trail, and that reaches no other capability's tables.
- **FR-002**: A review MUST be written only by a customer who holds a **paid** order that contains
      the reviewed product, and the order that proves it MUST be recorded on the review.
- **FR-003**: The platform MUST hold every review for moderation, and MUST publish only a review an
      administrator approved.
- **FR-004**: A customer MUST hold **at most one** review per product, and a second review MUST be
      refused.
- **FR-005**: The rating MUST be a whole number from one to five, and the title and body MUST be
      non-empty and within their documented limits.
- **FR-006**: A public review MUST NOT carry the author's identity, and MUST NOT carry the
      moderation internals.
- **FR-007**: The author MUST be able to edit a review while it is held for moderation, and MUST NOT
      be able to edit it afterwards.
- **FR-008**: A moderation decision MUST be attributable to the administrator who made it, MUST
      record the reason, and MUST be recorded in an append-only event log.
- **FR-009**: A moderation decision on a review that is no longer held for moderation MUST be
      refused and recorded, and the review MUST be unchanged.
- **FR-010**: The platform MUST own a **Notifications** capability that holds the customer message,
      the provider abstraction, and the delivery record, and that reaches no other capability's
      tables.
- **FR-011**: The notification provider MUST be a narrow interface, and every provider-specific type
      MUST be confined to the adapter that implements it.
- **FR-012**: The only shipped providers MUST be the local test transports and the transport that
      sends nothing, and the production transport MUST send nothing.
- **FR-013**: A message MUST be **recorded** before it is delivered, so the platform knows what it
      would have sent even when the channel sends nothing.
- **FR-014**: A message MUST be delivered at most once for a business key, and a repeated request
      MUST return the same message.
- **FR-015**: The platform MUST NOT send an actual customer email or message, and the production
      configuration MUST deliver nothing.
- **FR-016**: Every administrative change MUST be attributable to the administrator who made it, and
      MUST be recorded.
- **FR-017**: The milestone MUST add no new runtime or development dependency, no new
      infrastructure, and no new source of truth.
- **FR-018**: The milestone MUST apply only safe, additive migrations, and MUST NOT change any
      existing route's operation identifier, status code, or response shape.
- **FR-019**: Every documented review and notification behavior MUST be covered by an automated
      test, including the ineligible review, the duplicate review, the unpublished review, the
      refused second decision, the immutable review, the cross-customer access, the authorization
      denial, and the repeated delivery.
- **FR-020**: A notification MUST NOT carry recovery material or any other secret.

### Key Entities

- **Review**: one customer's statement about one product, with its moderation state.
- **Review event**: one recorded review transition.
- **Notification**: one message the platform produced, with its delivery state.
- **Notification delivery**: one recorded delivery attempt.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A review exists only when a paid order proves the purchase.
- **SC-002**: A review the platform has not approved is invisible to everybody but its author and
      the administrators.
- **SC-003**: A repeated delivery request changes nothing the second time.
- **SC-004**: A customer can neither read nor act on another customer's review or message, and the
      platform discloses nothing about whether the record exists.
- **SC-005**: No customer message leaves the platform while the channel is unapproved.
- **SC-006**: The complete quality gate passes, the previous milestones' behavior is unchanged, and
      the milestone's own documentation records the executed evidence.

## Assumptions

- **M12-ASM-001**: The review is a statement about a **product**, not about a variant or a bundle,
      because the catalog's unit of sale and of comparison is the product.
- **M12-ASM-002**: A verified purchase means a **paid** order that contains the product, whether or
      not the order was later refunded, because the customer did buy the goods.
- **M12-ASM-003**: A review is held for moderation and is never published automatically, because no
      automatic moderation policy is approved.
- **M12-ASM-004**: The abuse protections are the eligibility rule, the one-review-per-product rule,
      the rate limit, the moderation before publication, and the refusal to edit a published review.
      No content classifier and no keyword list was invented.
- **M12-ASM-005**: The message text is the platform's own and is produced by the workflow that
      produced the fact, because no approved template set exists.
- **M12-ASM-006**: The notification's recipient is a **stable identifier**, and the provider
      resolves the address, because the Identity capability owns the address and the Notifications
      capability must not read it.
