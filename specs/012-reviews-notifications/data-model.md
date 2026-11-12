# Data Model: Milestone 12 - Reviews and Notifications

**Date**: 2026-10-21

**Status**: **Delivered.** Every structure below is additive and was created by one forward migration
that was applied to the **isolated** targets only.

## The review

```
reviews
  id                    the review identifier
  product_id            the reviewed product, as a stable identifier
  customer_id           the author, as a stable identifier
  order_id              the paid order that proves the purchase
  rating                a whole number from one to five
  title                 the customer's headline
  body                  the customer's statement
  status                PENDING, APPROVED, or REJECTED
  verified_purchase     true when a paid order of the author contains the product
  moderated_by_user_id  the administrator who decided it
  moderated_at          when it was decided
  moderation_reason     the reason the decision was recorded with
  created_at, updated_at
```

**Why the order is recorded.** The verified-purchase fact is a property of the record rather than of
a code path, so a reader can see **why** the review was eligible without re-deriving it.

**Why the status is an enum.** The set of states is closed, so a client can render it exhaustively
and the database refuses a state the platform does not know.

**The unique key.** `reviews_product_id_customer_id_key` refuses a second review of the same product
by the same customer, so the one-review rule is structural rather than conventional.

**The check constraints.** `reviews_rating_range` refuses a rating outside one to five, and
`reviews_title_not_empty` and `reviews_body_not_empty` refuse an empty statement.

## The review event

```
review_events
  id               the event identifier
  review_id        the owning review
  event_type       what happened
  previous_status  the state the review was in
  next_status      the state it moved to
  actor            the customer, an administrator, or the system
  actor_user_id    the actor's stable identifier
  reason           why the transition was refused or what qualified it
  detail           the non-sensitive detail
  created_at
```

**The log is append-only.** A refused decision is recorded while the review's own state is left
unchanged, so an operator can see what was attempted.

## The notification

```
notifications
  id                 the notification identifier
  kind               the platform's own name for the message
  recipient_user_id  the recipient, as a stable identifier
  subject            the message's subject
  body               the message's body
  status             PENDING, DELIVERED, FAILED, or SKIPPED
  provider           the provider that handled it
  provider_reference the provider's own reference
  failure_reason     a fixed, non-sensitive reason when it was not delivered
  idempotency_key    the stable business key of the request
  created_at, updated_at, sent_at
```

**Why the business key is unique.** A retried workflow produces **one** message and therefore one
delivery, so a customer is never told the same thing twice.

**Why the message is recorded before it is delivered.** The channel sends nothing while the channel
is unapproved, and the platform still knows what it would have sent. That is what makes the delivery
record the operational evidence.

**Why the recipient is a stable identifier.** The Identity capability owns the address, and the
Notifications capability must not read it; the **provider** resolves the address.

## The notification delivery

```
notification_deliveries
  id              the attempt identifier
  notification_id the owning notification
  attempt         the attempt number
  provider        the provider that handled the attempt
  delivered       whether the provider accepted it
  failure_reason  a fixed, non-sensitive reason
  created_at
```

**Why the attempts are recorded separately.** The delivery record is how an operator sees what the
platform tried to send, through which provider, and why a delivery did not happen.

## What the milestone did not change

The orders table gained nothing, and no existing route changed. The Orders capability published one
new method, `paidOrdersOf`, so the Reviews capability can decide eligibility without reading the
Orders capability's tables.

## Data ownership

| Capability    | Owns                                        | Depends on, through a published contract |
| ------------- | ------------------------------------------- | ----------------------------------------- |
| Reviews       | `reviews`, `review_events`                  | The Orders capability's ledger, the Notifications capability's sender |
| Notifications | `notifications`, `notification_deliveries`  | nothing                                   |

## The migration

`20261021230000_reviews_notifications` - the two review tables, the two notification tables, the
`ReviewStatus` enum, the check constraints, the unique keys, and the indexes.

It rewrites no history and touches none of the three original databases. The isolated targets carry
it; the originals stay at fourteen applied migrations and remain a controlled-rollout task for
Milestone 14.
