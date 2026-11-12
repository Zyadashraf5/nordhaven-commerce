# Research, Plan, Tasks and Contract: Milestone 12 - Reviews and Notifications

**Date**: 2026-10-21

**Status**: **Executed.**

## Research

### R1 - The reviews and the notifications are two capabilities

The preliminary architecture table assigns reviews and notifications to separate capabilities, and
the implementation follows it. A review is a statement about a product, and a notification is a
delivery of a message; they have different owners, different lifecycles, and different data.

### R2 - The eligibility rule is structural

A review may only be written by a customer who holds a **paid** order that contains the reviewed
product. The order is recorded on the review, so "this is a verified purchase" is a property of the
record. The Reviews capability asks the Orders capability which of the customer's orders have been
paid, through the ledger's new `paidOrdersOf` method, and it never reads the Orders capability's
tables.

### R3 - Every review is held for moderation

No automatic moderation policy is approved, so every review starts `PENDING` and only an
administrator publishes it. The public surface therefore shows **approved** reviews only, and a
public review never carries the author's identity.

### R4 - The one-review rule is a unique key

A unique key on `(product_id, customer_id)` refuses a second review of the same product by the same
customer, so the rule is structural rather than a check that a race could defeat.

### R5 - A published review is immutable

The customer may edit a review while it is held for moderation. Once it is decided, the edit is
refused, because a published review the platform edited would not be the customer's statement.

### R6 - The abuse protections are the ones that were approved

The protections are the eligibility rule, the one-review rule, the rate limit, the moderation before
publication, the refusal to edit a published review, and the recorded refusals. **No content
classifier, keyword list, or sentiment rule was invented**, because none is approved and a keyword
list is a content policy the merchant has not written.

### R7 - The notification provider is a narrow interface

The interface is three members: the provider's name, whether it may operate, and one `deliver`. Every
provider-specific type is confined to the adapter. A real channel is therefore a binding and not a
change to the platform's rules.

### R8 - The only shipped providers are local test transports

HC-DEC-014 leaves the channel open, so the shipped providers are the **memory** transport, the
**file** transport, and the transport that **sends nothing**. The file transport refuses to
construct in a production environment, the memory transport refuses to operate there, and the
production configuration selects the transport that sends nothing.

### R9 - The message is recorded before it is delivered

A message is recorded first and delivered second, so the platform knows what it would have sent even
when the channel sends nothing. That record is what the customer sees and what an operator audits.

### R10 - The delivery is idempotent on a business key

A unique key on the notification's business key makes a retried workflow produce one message and
therefore one delivery. The audit found the same class of defect in the payment path, and the rule is
the same here.

### R11 - The recipient is a stable identifier

The Identity capability owns the address, and the Notifications capability must not read it. The
notification carries the recipient's identifier, and the provider resolves the address.

### R12 - Nothing leaves the platform

No customer email or message is sent. The platform's production configuration delivers nothing, and
the notification's body never carries recovery material or any other secret.

## Plan

1. **The schema** - one additive forward migration with the two review tables, the two notification
   tables, the `ReviewStatus` enum, the check constraints, the unique keys, and the indexes.
2. **The Notifications capability** - the provider abstraction, the three transports, the delivery
   record, the service, the customer's and the administrator's read surfaces, and the published
   `NOTIFICATION_SENDER` contract.
3. **The Reviews capability** - the repository with its conditional updates, the service with the
   eligibility rule and the moderation, the customer's, the administrator's, and the public read
   surfaces, and the published `REVIEW_LIBRARY` contract.
4. **The Orders capability** - one new published method, `paidOrdersOf`, so the Reviews capability
   can decide eligibility without reading the Orders capability's tables.
5. **The platform** - the customer notification transport configuration, the eight new application
   error codes, the removed exclusions, the fourteen new operations, and the OpenAPI document at
   **1.2.0**.
6. **The tests** - twelve integration cases and six end-to-end cases, and the rewritten repository
   hygiene suite.

## Tasks

| Phase | Tasks |
| ----- | ----- |
| 1 - The specification | 6 (spec, research, data model, plan, contract, checklist) |
| 2 - The schema | 2 (the migration, the drift proof) |
| 3 - The Notifications capability | 6 |
| 4 - The Reviews capability | 7 |
| 5 - The Orders capability's published method | 1 |
| 6 - The platform | 5 |
| 7 - The tests | 4 |
| 8 - The verification and the record | 5 |
| **Total** | **36 tasks, all complete** |

## Contract

### The routes

| Route | Operation | Authentication |
| ----- | --------- | -------------- |
| `GET /api/v1/products/reviews?productId={id}` | `listPublicProductReviews` | none |
| `GET /api/v1/reviews` | `listCustomerReviews` | customer |
| `POST /api/v1/reviews` | `createReview` | customer |
| `GET /api/v1/reviews/{reviewId}` | `getCustomerReview` | customer |
| `PATCH /api/v1/reviews/{reviewId}` | `editCustomerReview` | customer |
| `GET /api/v1/reviews/{reviewId}/events` | `listCustomerReviewEvents` | customer |
| `GET /api/v1/admin/reviews` | `listAdminReviews` | administrator |
| `GET /api/v1/admin/reviews/pending` | `listAdminPendingReviews` | administrator |
| `GET /api/v1/admin/reviews/{reviewId}` | `getAdminReview` | administrator |
| `POST /api/v1/admin/reviews/{reviewId}/decision` | `moderateAdminReview` | administrator |
| `GET /api/v1/admin/reviews/{reviewId}/events` | `listAdminReviewEvents` | administrator |
| `GET /api/v1/notifications` | `listCustomerNotifications` | customer |
| `GET /api/v1/notifications/{notificationId}` | `getCustomerNotification` | customer |
| `GET /api/v1/admin/notifications` | `listAdminNotifications` | administrator |

### The request bodies

Every schema is **strict**. A client can never supply the verified-purchase flag, the moderation
status, the moderation reason, or the notification's delivery state.

| Body | Fields |
| ---- | ------ |
| the review | `productId`, `rating`, `title`, `body` |
| the review edit | `rating`, `title`, `body` |
| the moderation decision | `decision`, `reason` |

### The error codes

| Code | Status | Meaning |
| ---- | ------ | ------- |
| `REVIEW_NOT_FOUND` | 404 | no such review for this caller |
| `NOTIFICATION_NOT_FOUND` | 404 | no such message for this caller |
| `REVIEW_NOT_ELIGIBLE` | 409 | the customer holds no paid order that contains the product |
| `REVIEW_ALREADY_EXISTS` | 409 | the customer already reviewed this product |
| `REVIEW_NOT_MODERATABLE` | 409 | the review is no longer held for moderation |
| `REVIEW_NOT_EDITABLE` | 409 | the review has already been decided |
| `NOTIFICATION_FAILED` | 503 | the provider did not accept the message |

The refusals a value would cause are answered with the platform's existing `VALIDATION_ERROR`
envelope, whose message never echoes a submitted value.


## Independent completion verification — 22 October 2026

M12 development acceptance passed on owned26-migration targets: pnpm verify387unit/37suites; full integration307/15; full E2E118/14. Evidence: C:/Users/zyad/Documents/ChatGPT/zyad ashraf/nordhaven-m11-m14-final-20261021/gates/m12-acceptance-*.log. Nine valid defensive regressions failed before correction; all23 targeted review/notification tests now pass.

Verified purchase eligibility now queries the full matching purchase history through the Orders owner contract. Duplicate review creation is serialized and produces a stable domain conflict. Review moderation and durable notification intent commit together. Post-commit callbacks run outside the database transaction; a delivery failure leaves durable FAILED/PENDING recovery state rather than rolling back a committed decision. Outer rollback discards both message and callback. Shipments handed over/delivered and successful return refunds now record safe local notices through the same published abstraction. No external channel is introduced.

Notification business keys validate recipient/content/metadata. A persisted5-minute delivery lease and token prevent competing dispatchers; local provider delivery identity is the notification UUID. File artifacts use exclusive UUID paths and memory delivery deduplicates that identity. Unknown outcomes retain the lease for a controlled retry; actual external-provider idempotency remains unverified and blocked pending approval. The new ADMIN/MFA-protected POST /admin/notifications/{notificationId}/retry records its actor. Production always binds the transport that sends nothing even if an in-memory configuration override requests a test transport.

Only additive metadata/lease/attempt-actor migration20261022030000_notification_delivery_recovery was applied to the3new owned targets; original databases remain untouched. No queue/broker/dependency, actual email/message, or approved business decision change occurred. Provider/channel/template/consent approval and operational retry scheduling remain production blockers.
