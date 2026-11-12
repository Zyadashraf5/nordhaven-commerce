# Requirements Checklist: Milestone 12 - Reviews and Notifications

**Date**: 2026-10-21

**Status**: **Complete.** Every requirement below is implemented and covered by an automated test.

## The capability

- [x] **FR-001** The platform owns a **Reviews** capability that holds the reviews and their
      moderation trail, and that reaches no other capability's tables. *(The `review` module; the
      boundary check enforces the ownership of every persistence root.)*
- [x] **FR-002** A review is written only by a customer who holds a **paid** order that contains the
      reviewed product, and the order that proves it is recorded. *(`REVIEW_NOT_ELIGIBLE`; the
      `order_id` column and the `verified_purchase` flag.)*
- [x] **FR-003** Every review is held for moderation, and only an approved review is published.
      *(The `PENDING` default and the public read of the approved reviews only.)*
- [x] **FR-004** A customer holds at most one review per product. *(The unique key on
      `(product_id, customer_id)`.)*
- [x] **FR-005** The rating is a whole number from one to five, and the title and the body are
      non-empty and within their limits. *(The request schema and the database check constraints.)*
- [x] **FR-006** A public review carries no author identity and no moderation internals. *(The
      `PublicReviewResponse` projection.)*
- [x] **FR-007** The author may edit a held review and may not edit a decided one.
      *(`REVIEW_NOT_EDITABLE`; the conditional update on `status = 'PENDING'`.)*
- [x] **FR-008** A moderation decision is attributable, records its reason, and is recorded in an
      append-only event log. *(`moderated_by_user_id`, `moderation_reason`, and `review_events`.)*
- [x] **FR-009** A decision on a review that is no longer held for moderation is refused and
      recorded, and the review is unchanged. *(The `REVIEW_DECISION_REFUSED` event.)*
- [x] **FR-010** The platform owns a **Notifications** capability that holds the message, the
      provider abstraction, and the delivery record. *(The `notification` module.)*
- [x] **FR-011** The provider is a narrow interface and every provider-specific type is confined to
      its adapter. *(`NotificationProvider` has three members.)*
- [x] **FR-012** The only shipped providers are the local test transports and the transport that
      sends nothing, and the production transport sends nothing. *(The `memory` and `file` providers
      refuse a production environment; the `none` provider is the default.)*
- [x] **FR-013** A message is recorded before it is delivered. *(The service's order of operations.)*
- [x] **FR-014** A message is delivered at most once for a business key, and a repeated request
      returns the same message. *(The unique key on `idempotency_key`.)*
- [x] **FR-015** No actual customer email or message is sent, and the production configuration
      delivers nothing. *(The `CUSTOMER_NOTIFICATION_TRANSPORT` default is `none`, and the file
      transport refuses a production environment.)*
- [x] **FR-016** Every administrative change is attributable and recorded. *(The moderator columns and
      the event log.)*
- [x] **FR-017** The milestone adds no new dependency, no new infrastructure, and no new source of
      truth. *(`pnpm audit --prod` reports no advisory.)*
- [x] **FR-018** The milestone applies only safe, additive migrations and changes no existing
      route's contract. *(One additive migration; the OpenAPI inventory is extended.)*
- [x] **FR-019** Every documented behavior is covered by an automated test, including the ineligible
      review, the duplicate review, the unpublished review, the refused second decision, the
      immutable review, the cross-customer access, the authorization denial, and the repeated
      delivery. *(Twelve integration and six end-to-end cases.)*
- [x] **FR-020** A notification never carries recovery material or any other secret. *(The message
      body is the platform's own text, and the notification's fields are the subject, the body, and
      the kind.)*

## The success criteria

- [x] **SC-001** A review exists only when a paid order proves the purchase. *(The integration
      suite.)*
- [x] **SC-002** A review the platform has not approved is invisible to everybody but its author and
      the administrators. *(The end-to-end suite reads the public list before and after the
      decision.)*
- [x] **SC-003** A repeated delivery request changes nothing the second time. *(The integration
      suite.)*
- [x] **SC-004** A customer can neither read nor act on another customer's review or message, and
      the platform discloses nothing about whether the record exists. *(The 404 responses.)*
- [x] **SC-005** No customer message leaves the platform while the channel is unapproved. *(The
      production transport sends nothing.)*
- [x] **SC-006** The complete quality gate passes, the previous milestones' behaviour is unchanged,
      and the milestone's documentation records the executed evidence. *(`docs/progress/
      milestone-12.md`.)*

## The documented boundary

- [x] **No content classifier, keyword list, or sentiment rule** was invented; the abuse protections
      are the approved ones.
- [x] **No template engine and no template set** were invented; the message text is the platform's
      own.
- [x] **No exchange, no review reply, no review reaction, and no review image** were implemented,
      because none is approved.
