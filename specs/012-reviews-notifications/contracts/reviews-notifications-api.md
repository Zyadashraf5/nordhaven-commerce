# Contract: Milestone 12 - Reviews and Notifications API

**Date**: 2026-10-21

**Status**: **Delivered.** The contract is published in the OpenAPI document at version **1.2.0** and
is enforced by the reviewed operation inventory, the operation allow-list, and the response
validation in the end-to-end suite.

## The routes

### The public storefront read

| Route | Operation | Authentication |
| ----- | --------- | -------------- |
| `GET /api/v1/products/reviews?productId={id}` | `listPublicProductReviews` | none |

Only **approved** reviews are listed, and a public review carries no author identity and no
moderation internals.

### The customer's routes

| Route | Operation | Authentication |
| ----- | --------- | -------------- |
| `GET /api/v1/reviews` | `listCustomerReviews` | customer |
| `POST /api/v1/reviews` | `createReview` | customer |
| `GET /api/v1/reviews/{reviewId}` | `getCustomerReview` | customer |
| `PATCH /api/v1/reviews/{reviewId}` | `editCustomerReview` | customer |
| `GET /api/v1/reviews/{reviewId}/events` | `listCustomerReviewEvents` | customer |

Every route is scoped to the presented session's principal, and a review that belongs to another
customer is answered exactly like one that never existed.

### The administrator's routes

| Route | Operation | Authentication |
| ----- | --------- | -------------- |
| `GET /api/v1/admin/reviews` | `listAdminReviews` | administrator |
| `GET /api/v1/admin/reviews/pending` | `listAdminPendingReviews` | administrator |
| `GET /api/v1/admin/reviews/{reviewId}` | `getAdminReview` | administrator |
| `POST /api/v1/admin/reviews/{reviewId}/decision` | `moderateAdminReview` | administrator |
| `GET /api/v1/admin/reviews/{reviewId}/events` | `listAdminReviewEvents` | administrator |

### The notification routes

| Route | Operation | Authentication |
| ----- | --------- | -------------- |
| `GET /api/v1/notifications` | `listCustomerNotifications` | customer |
| `GET /api/v1/notifications/{notificationId}` | `getCustomerNotification` | customer |
| `GET /api/v1/admin/notifications` | `listAdminNotifications` | administrator |

## The request bodies

Every schema is **strict**, so an unexpected field is refused rather than ignored.

| Body | Fields | What a client can never supply |
| ---- | ------ | -------------------------------- |
| the review | `productId`, `rating`, `title`, `body` | the verified-purchase flag, the moderation status, the moderation reason |
| the review edit | `rating`, `title`, `body` | the same |
| the moderation decision | `decision`, `reason` | the decision's effect |

There is **no** request body for the notifications: the platform produces the messages.

## The error codes

| Code | Status | Meaning |
| ---- | ------ | ------- |
| `REVIEW_NOT_FOUND` | 404 | no such review for this caller |
| `NOTIFICATION_NOT_FOUND` | 404 | no such message for this caller |
| `REVIEW_NOT_ELIGIBLE` | 409 | the customer holds no paid order that contains the product |
| `REVIEW_ALREADY_EXISTS` | 409 | the customer already reviewed this product |
| `REVIEW_NOT_MODERATABLE` | 409 | the review is no longer held for moderation |
| `REVIEW_NOT_EDITABLE` | 409 | the review has already been decided |
| `NOTIFICATION_FAILED` | 503 | the provider did not accept the message |

The refusals a value would cause - a rating outside one to five, an empty title or body, a body over
the limit - are answered with the platform's existing `VALIDATION_ERROR` envelope, whose message
never echoes a submitted value.

## The response projections

| Projection | Reports |
| ---------- | ------- |
| the public review | the identifier, the product, the rating, the title, the body, the verified-purchase flag, and the creation time - and **no** author |
| the review | the public fields and the moderation state, the order that proves the purchase, the moderator, the moderation time, and the moderation reason |
| the review event | the event type, the previous and next states, the actor, the reason, and the time |
| the notification | the identifier, the kind, the subject, the body, the delivery state, the provider, the failure reason, and the creation time |

A notification's body is the platform's own text and **never** carries recovery material or any
other secret.
