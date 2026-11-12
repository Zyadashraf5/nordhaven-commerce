# Milestone 12 - Reviews and Notifications Implementation Record

**Date**: 2026-10-21

**Status**: **COMPLETE for development scope.** The milestone passes every development acceptance
gate. It is **not** production-ready: the notification channel is unapproved, so no customer message
leaves the platform.

## Objective

Implement customer reviews with verified purchase eligibility, moderation, ownership, spam and abuse
protections, administrative controls, and customer notification workflows; design the notification
delivery as a modular provider abstraction; use safe local and test notification transports only; and
send no actual customer email or message.

## Task count

| Phase                                        | Tasks                      |
| -------------------------------------------- | -------------------------- |
| 1 - The specification                        | 6                          |
| 2 - The schema                               | 2                          |
| 3 - The Notifications capability             | 6                          |
| 4 - The Reviews capability                   | 7                          |
| 5 - The Orders capability's published method | 1                          |
| 6 - The platform                             | 5                          |
| 7 - The tests                                | 4                          |
| 8 - The verification and the record          | 5                          |
| **Total**                                    | **36 tasks, all complete** |

## Features implemented

1. **The verified-purchase eligibility.** A review is written only by a customer who holds a
   **paid** order that contains the reviewed product, and the order that proves it is recorded on the
   review. The Reviews capability asks the Orders capability through its ledger's new
   `paidOrdersOf` method and never reads the Orders capability's tables.
2. **The one-review rule.** A unique key on `(product_id, customer_id)` refuses a second review of
   the same product by the same customer.
3. **The moderation.** Every review starts `PENDING` and only an administrator publishes it. The
   decision is attributable, records its reason, and is written to an append-only event log; a second
   decision is refused **and recorded** while the review stays unchanged.
4. **The ownership.** The author may edit a review while it is held for moderation and may not edit
   it afterwards, and another customer's review is answered exactly like one that never existed.
5. **The public surface.** Only approved reviews are listed, and a public review carries no author
   identity and no moderation internals.
6. **The abuse protections**, and only the approved ones: the eligibility rule, the one-review rule,
   the rate limit, the moderation before publication, the refusal to edit a published review, and the
   recorded refusals. No content classifier and no keyword list was invented.
7. **The notification provider abstraction.** A narrow interface with three members, every
   provider-specific type confined to its adapter, and the provider bound through a token, so a real
   channel is a binding and not a change to the rules.
8. **The safe transports.** The memory transport, the file transport, and the transport that sends
   nothing. The file transport refuses to construct in a production environment and the memory
   transport refuses to operate there, so the production configuration delivers nothing.
9. **The recorded message.** Every message is recorded before it is delivered, so the platform knows
   what it would have sent even when the channel sends nothing, and the delivery attempt is recorded
   beside it.
10. **The idempotent delivery.** A unique key on the notification's business key makes a retried
    workflow produce one message and one delivery.
11. **The customer notification workflow.** A moderation decision notifies the author through the
    Notifications capability's published contract, with a business key of its own.
12. **The read surfaces.** The customer reads their own messages, the administrator reads the
    delivery record, and neither can read the other's.

## The executed evidence

### The automated suites

| Suite       | Result                    | Change from the M12 baseline                        |
| ----------- | ------------------------- | --------------------------------------------------- |
| unit        | **387 passed**, 37 suites | +7 (the rewritten repository hygiene suite)         |
| integration | **281 passed**, 14 suites | +12 (the whole reviews and notifications suite)     |
| end-to-end  | **112 passed**, 13 suites | +6 (the whole reviews and notifications HTTP suite) |

The M12 baseline, taken before any implementation, was 380 unit, 269 integration, and 106 end-to-end
tests passing. **Every previous test still passes.**

### The composite verification

`pnpm verify` ran its eight categories in order and **exited 0**: format, lint, module boundaries,
types, unit, build, repository hygiene, and the OpenAPI validation and drift check.

### The migrations

One additive forward migration, `20261021230000_reviews_notifications`, applied to the isolated
targets only. Both targets carry **23 applied migrations**, `prisma migrate status` exits 0,
`prisma migrate diff` exits 0 with no difference, and every applied migration's stored checksum
matches its source file. The three original databases remain at **14** applied migrations and were
**not** touched.

### The database constraints

| Constraint                                 | Refuses                                                  |
| ------------------------------------------ | -------------------------------------------------------- |
| `reviews_rating_range`                     | a rating outside one to five                             |
| `reviews_title_not_empty`                  | an empty title                                           |
| `reviews_body_not_empty`                   | an empty body                                            |
| `reviews_product_id_customer_id_key`       | a second review of the same product by the same customer |
| `notifications_idempotency_key_key`        | a second message for the same business key               |
| `notifications_status_known`               | a delivery state the platform does not know              |
| `notification_deliveries_attempt_positive` | a non-positive attempt number                            |

### The OpenAPI contract

The document advanced from **1.1.0** to **1.2.0** and gained **14 operations**, from 127 to 141.
The `review` and `notification` terms were removed from the excluded domain list and from the
excluded module list, because both capabilities are approved. The excluded module list is now
**empty**, because every capability the project planned has been approved; the repository hygiene
suite was rewritten to prove that each approved capability is allowed.

## The bugs this milestone found and fixed

1. **The excluded module list became empty.** The repository hygiene suite used `shipping` and then
   `review` as its "pending capability" fixture, and both are now approved. The suite was rewritten
   to prove the **allowed** direction for every approved capability, and the check's excluded list
   keeps the rule in place for the next capability.
2. **The notification service dropped two fields.** The customer's read projection had narrowed the
   record and lost the provider and the failure reason, which are the operational evidence the
   administrator's surface needs. The projection now passes the whole record.
3. **The provider failure leaked the provider's error.** The service caught the provider's exception
   and re-threw nothing, so the raw error text could have reached the error envelope. The catch now
   records the failure with the fixed reason `PROVIDER_FAILED` and throws the platform's own
   `NOTIFICATION_FAILED`.
4. **The end-to-end suite reached for the payment capability dynamically.** The dynamic import
   broke the lint gate with an unsafe `any`, so the payment service is now imported statically and
   resolved from the application container.
5. **The configuration fixtures did not know the new transport.** Three unit fixtures built an
   environment configuration literal, and the new customer notification transport had to be added to
   each of them.

## The outstanding dependencies

1. **The notification channel.** HC-DEC-014 is open. A real channel needs an approved provider, the
   approved templates, the consent rules, and a production configuration that is allowed to send.
2. **The moderation policy.** Every review is held for moderation and an administrator publishes it.
   An automatic pre-publication check needs an approved policy.
3. **The customer notification transport for production.** The production configuration delivers
   nothing today, by design.
4. **The review's attachment and reply.** None is approved, so a review has no image, no reply,
   and no reaction.
5. **The reconciliation of the three original databases** and their outstanding forward migrations,
   which Milestone 14 must schedule as a controlled rollout.

## What this milestone does not deliver

- **A sent customer email or message.** The message is recorded; nothing leaves the platform.
- **A real channel provider, a template engine, or a template set.**
- **A content classifier, a keyword list, a sentiment rule, or an automatic moderation policy.**
- **A review image, a review reply, a review reaction, a helpfulness vote, or a store reply.**
- **An exchange, a refund workflow change, or a customer-facing return policy.**

## The development acceptance

**Milestone 12 passes its development acceptance gates.** The specification is complete, the
implementation is complete, the API contract is published and enforced, the tests are complete and
passing, the migration is additive and drift-free on the isolated targets, the previous milestones'
behaviour is unchanged, and the executed evidence is recorded above.

The milestone does **not** claim production readiness, and it does **not** activate any customer
notification channel.

## Independent completion verification — 22 October 2026

M12 development acceptance passed on owned26-migration targets: pnpm verify 387 unit/37 suites; full integration 307/15; full E2E 118/14. Evidence: C:/Users/zyad/Documents/ChatGPT/zyad ashraf/nordhaven-m11-m14-final-20261021/gates/m12-acceptance-\*.log. Nine valid defensive regressions failed before correction; all 23 targeted review/notification tests now pass.

Verified purchase eligibility now queries the full matching purchase history through the Orders owner contract. Duplicate review creation is serialized and produces a stable domain conflict. Review moderation and durable notification intent commit together. Post-commit callbacks run outside the database transaction; a delivery failure leaves durable FAILED/PENDING recovery state rather than rolling back a committed decision. Outer rollback discards both message and callback. Shipments handed over/delivered and successful return refunds now record safe local notices through the same published abstraction. No external channel is introduced.

Notification business keys validate recipient/content/metadata. A persisted5-minute delivery lease and token prevent competing dispatchers; local provider delivery identity is the notification UUID. File artifacts use exclusive UUID paths and memory delivery deduplicates that identity. Unknown outcomes retain the lease for a controlled retry; actual external-provider idempotency remains unverified and blocked pending approval. The new ADMIN/MFA-protected POST /admin/notifications/{notificationId}/retry records its actor. Production always binds the transport that sends nothing even if an in-memory configuration override requests a test transport.

Only additive metadata/lease/attempt-actor migration20261022030000_notification_delivery_recovery was applied to the3 new owned targets; original databases remain untouched. No queue/broker/dependency, actual email/message, or approved business decision change occurred. Provider/channel/template/consent approval and operational retry scheduling remain production blockers.

## Independent final acceptance —2026-10-22

Authoritative report:m11-m14-batch-report.md. Final416 unit/40 suites,312 integration/15,119E2E/14; Windowsprocess4 pass/1skip; actual localLinuxprocess5/2 pass. Full composite verify/OpenAPI/Prisma/compose/image build/runtime scan and non-root smoke passed. Prod audit0; full audit1 High braces; readiness15/16 thereforefailed. Source26/originals 14/12 pending; original data/backups/checksums preserved. Actual retained 51-table restore passed. M14tasks18 complete/6blocked. Production remains PARTIAL/BLOCKED; no deployment or original mutation.
