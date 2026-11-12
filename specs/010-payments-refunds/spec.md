# Feature Specification: Milestone 10 - Payments and Refunds

**Feature Branch**: Not created; the repository has no commits yet and no `before_specify` branch hook
is configured

**Created**: 2026-10-21

**Status**: Approved for development. The Product Owner approved the checkout, tax, order, payment,
and refund **development scope** on 2026-10-21, which resolves the decisions that govern this
milestone.

**Input**: User description: "Milestone 10: Payments and Refunds for Nordhaven Commerce - a
provider-independent payment architecture, a safe deterministic non-production test provider,
authenticated and verified payment event processing, idempotent webhook processing, a payment state
machine, reconciliation and recovery paths, and full and partial refunds with cumulative amount
constraints."

## Scope Boundaries and Open Decisions

The register records each governing decision as `Approved (development scope)` with its **activation
blockers** stated separately, so a development decision is never mistaken for a production
activation.

- **HC-DEC-007 (Approved, development scope)** - Paymob is the preferred candidate for future
  Egyptian processing but is **NOT** an activated provider; the architecture is provider-independent;
  a safe LOCAL/TEST adapter supports deterministic success, failure, timeout, duplicate, and
  delayed-event simulations; webhook verification, event deduplication, idempotency, reconciliation,
  and refund workflows are designed and implemented; an unsigned or unauthenticated external
  payment success is never accepted; no real payment is collected, no real refund is issued, and no
  live provider credential is used. A Paymob adapter interface and its contract assumptions are
  prepared, without inventing undocumented provider behavior. **Activation blocker remains**: no
  provider contract has been reviewed or signed off, so no production payment is possible.
- **HC-DEC-011 (Approved, development scope)** - full and partial refunds are supported with
  cumulative amount constraints and a reliable audit trail, and a duplicate refund is never issued.
- **HC-DEC-006 (Approved, development scope)** - the tax treatment of a refund follows the tax
  configuration of the order it refunds, and the refund's amounts are exact integer minor units.
- **HC-DEC-010 (Approved, development scope)** - a customer cancellation before shipment follows the
  order and payment state machine, a refund is issued only when appropriate, and a duplicate refund
  is never issued.
- **HC-DEC-015 (Approved, development scope)** - a pre-order is never charged before sufficient
  inventory is physically available and can be reserved.

**Still open, and therefore not implemented here:** HC-DEC-001 (V1 scope), HC-DEC-002 (email
verification), HC-DEC-003 (privacy lifecycle), HC-DEC-012 (returns and exchanges), HC-DEC-013
(shipping providers and rates - the shipping **rate** is Milestone 11), HC-DEC-014 (notification
channels), HC-DEC-016 (launch capacity targets), and the project identity, security, and legal
matters those decisions own.

**Production activation blockers.** Local development completion is not production readiness. No
provider is activated, no live credential exists, and the platform's payment path is a **test-only**
adapter, so a production request can never collect money. The merchant's exact VAT registration
status, a production tax configuration, production shipping rules, a security sign-off, and hosted
continuous integration also remain unapproved.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pay for an order exactly once (Priority: P1)

A customer pays for an order. The platform records the payment against that order, confirms the
order's held stock, and moves the order to its paid state. If the customer pays again, or the
provider delivers the same event twice, the order is not paid twice and the stock is not taken twice.

**Why this priority**: A duplicated capture is a duplicated charge and a duplicated stock
deduction. It is the single most damaging defect a payment path can have.

**Independent Test**: Deliver the same verified payment event twice, and concurrently, and confirm
one payment record, one order transition, and one stock confirmation.

**Acceptance Scenarios**:

1. **Given** a pending order and a verified payment for its full amount, **When** the event is
   processed, **Then** the payment is `SUCCEEDED` and the order is `PAID` with its stock allocated.
2. **Given** a payment event that was already processed, **When** the same event is delivered again,
   **Then** the outcome is unchanged and no second transition occurs.
3. **Given** two concurrent deliveries of the same event, **When** they race, **Then** exactly one
   payment and one transition exist.
4. **Given** a payment for an order that was already cancelled, **When** the event is processed,
   **Then** the payment is recorded, the order is not moved, and the discrepancy is recorded.

### User Story 2 - Never accept an unverified payment (Priority: P1)

A caller posts a payment success to the platform without a valid signature. The platform refuses it
and changes nothing.

**Why this priority**: Accepting an unsigned success claim is how money is invented. The
platform's own authority to move an order must rest on verified evidence, never on a claim.

**Independent Test**: Deliver an event with a wrong signature, a missing signature, a stale
timestamp, and a replayed identifier, and confirm none of them changes any state.

**Acceptance Scenarios**:

1. **Given** a payment event with an invalid signature, **When** it is delivered, **Then** it is
   refused with `401` and no state changes.
2. **Given** a payment event with a valid signature but a replayed identifier, **When** it is
   delivered, **Then** the recorded outcome is returned and nothing is applied twice.
3. **Given** a payment event with a timestamp outside the accepted window, **When** it is delivered,
   **Then** it is refused as stale.

### User Story 3 - Recover when the provider and the platform disagree (Priority: P1)

The provider's record of a payment does not match the platform's. An operator runs the
reconciliation, and the platform reports the difference and records what it found.

**Why this priority**: Provider retries, reordering, and out-of-order delivery are normal, and the
platform must converge on the provider's truth without a client callback being trusted.

**Independent Test**: Put the platform's record and the provider's record out of step, run the
reconciliation, and confirm the difference is reported and recorded.

**Acceptance Scenarios**:

1. **Given** a payment the provider reports as succeeded and the platform reports as pending, **When**
   the reconciliation runs, **Then** the difference is reported and recorded.
2. **Given** a payment the platform does not know at all, **When** the reconciliation runs, **Then**
   it is reported as unknown to the platform.

### User Story 4 - Refund an order, wholly or partly (Priority: P2)

An operator refunds an order, in full or in part. The refunded amounts never exceed the amount
that was paid, a repeated refund request does not refund twice, and the order's state reflects
what has been refunded.

**Why this priority**: A refund that exceeds the payment, or that is issued twice, is a financial
defect, and a refund that cannot be partial cannot serve a real business.

**Independent Test**: Refund an order in two parts until the total reaches the paid amount, then
attempt one more, and confirm the total never exceeds the payment and the last attempt is refused.

**Acceptance Scenarios**:

1. **Given** a paid order, **When** a full refund is issued, **Then** the refund is `SUCCEEDED`
   for the paid amount and the order is `REFUNDED`.
2. **Given** a paid order, **When** a partial refund is issued, **Then** the refund is `SUCCEEDED`
   for that amount and the order reports the refunded total.
3. **Given** refunds that already cover the paid amount, **When** another refund is requested, **Then**
   it is refused with `409`, and no money moves.
4. **Given** a refund request that is repeated with the same key, **Then** the original refund is
   returned and no second refund is created.

## Edge Cases

- A payment event for an order that does not exist is refused, and the event is not recorded as
  applied.
- A payment event whose amount does not match the order's total is recorded, and the order's state
  reflects what was actually paid rather than what was expected.
- A payment for an order whose reservation has already lapsed moves the order to
  `PAID_PENDING_ALLOCATION`, which records that the money arrived and that the stock was **not**
  allocated. The Milestone 09 milestone implements that path, and Milestone 10 supplies the verified
  event that reaches it.
- A failed payment releases the order's held stock, exactly once, even when the failure event is
  delivered twice.
- A webhook delivered with a body that is not valid JSON, or that does not match the expected
  shape, is refused without a state change.
- A refund for a payment that was never successful is refused.
- A refund of zero or a negative amount is refused at the boundary.
- A refund whose amount exceeds the remaining refundable amount is refused with `409`, and the
  already-refunded total is reported so a caller can compute the correct amount.
- A refund request that is repeated with the same key returns the original refund rather than
  creating a second one.
- A webhook for an unknown provider is refused, because the platform has no verification rule for
  it.
- The provider reports a payment the platform has never seen; the reconciliation reports it as
  unknown to the platform rather than silently adopting it.
- Two concurrent refunds of the same order cannot exceed the paid amount between them, because the
  remaining amount is computed inside the write.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The platform MUST define a **provider-independent** payment architecture: a single
      provider interface with a documented set of operations, and every provider-specific type
      confined to its adapter.
- **FR-002**: The platform MUST ship a **safe, deterministic, non-production** test provider that
      simulates success, failure, timeout, duplicate, and delayed-event outcomes without contacting
      any external service and without moving real money.
- **FR-003**: The platform MUST **never** collect a real payment, initiate a real refund, or use a
      live provider credential. The only shipped adapter MUST refuse to operate in a production
      environment.
- **FR-004**: Every provider event MUST be **verified** before any state change: a valid signature
      over the raw body, a timestamp inside the accepted window, and an unconsumed event identifier.
      An event that fails any check MUST change nothing.
- **FR-005**: Every provider event MUST be **durably deduplicated** on its identifier, so a
      repeated, a delayed, or an out-of-order delivery applies **once**.
- **FR-006**: The platform MUST have an explicit, documented **payment state machine** with the
      states `PENDING`, `SUCCEEDED`, `FAILED`, `CANCELLED`, and `REFUNDED`, and every transition
      MUST be permitted from an explicit set of source states.
- **FR-007**: The platform MUST record a **payment attempt** against an order with its amount, its
      currency, its provider, its provider reference, its idempotency key, and its state, and MUST
      make the attempt's creation idempotent on the customer's business key.
- **FR-008**: A successful payment MUST advance the order through the Orders capability's published
      contract, so the order's state and its stock allocation change together with the payment's
      state, and a payment that arrives after the reservation lapsed MUST NOT report the stock as
      allocated.
- **FR-009**: A failed payment MUST release the order's held stock exactly once, even when the
      failure event is delivered twice.
- **FR-010**: The platform MUST offer **full and partial refunds**, and the sum of the refunds
      issued for one payment MUST never exceed the amount that was paid. The remaining refundable
      amount MUST be computed inside the write, so two concurrent refunds cannot both succeed past
      the limit.
- **FR-011**: A refund MUST be **idempotent** on a stable business key, so a repeated refund
      request returns the original refund rather than creating a second one.
- **FR-012**: A refund MUST be refused for a payment that was never successful, and the refusal
      MUST NOT move money.
- **FR-013**: Every refund MUST be recorded with its amount, its currency, its reason, its
      idempotency key, its provider reference, and its state, and the platform MUST keep the
      cumulative refunded total of each payment.
- **FR-014**: The platform MUST provide a **reconciliation** operation that compares the platform's
      records with the provider's and reports every difference, and MUST record what it found.
- **FR-015**: Every payment, refund, and reconciliation event MUST be recorded in an **append-only**
      audit trail with the actor, the amount, the outcome, and the time, and the trail MUST never
      contain a secret, a card number, or a credential.
- **FR-016**: The platform MUST record a **security event** for a rejected or replayed provider
      event, so an attempt to forge a payment is visible to an operator.
- **FR-017**: The platform MUST **not** trust a client callback as proof of payment. The provider's
      verified event, and the reconciliation, are the authority.
- **FR-018**: The milestone MUST add no new runtime or development dependency, no new
      infrastructure, and no new source of truth. The provider adapter, the event intake, the payment
      state machine, and the refund rules are all in the platform's own code and its own tables.
- **FR-019**: The milestone MUST apply only safe, additive migrations, and MUST NOT change any
      existing route, operation identifier, status code, or response shape except by adding the new
      payment routes.
- **FR-020**: Every documented payment and refund behavior MUST be covered by an automated test,
      including the duplicate event, the concurrent event, the forged signature, the stale timestamp,
      the replayed identifier, the provider timeout, the delayed event, the late payment, the
      over-refund, the repeated refund, the reconciliation difference, and the authorization denial.
- **FR-021**: The platform MUST prepare the **Paymob adapter interface** and its contract
      assumptions **without** activating a provider, without inventing undocumented provider
      behavior, and without claiming a production integration.

### Key Entities

- **Payment attempt**: one attempt to pay for an order, with its amount, its currency, its provider,
  its provider reference, its idempotency key, and its state.
- **Provider event**: one event delivered by a provider, with its identifier, its type, its
  signature, its body, and whether it was applied.
- **Refund**: one refund of a payment, with its amount, its currency, its reason, its idempotency
  key, and its state.
- **Payment audit event**: one recorded fact about a payment, a refund, or a reconciliation.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A payment event that is delivered two, three, or many times, sequentially or
  concurrently, results in exactly one payment record, exactly one order transition, and exactly one
  stock confirmation.
- **SC-002**: A forged, unsigned, stale, or replayed event changes nothing, and every one of them is
  recorded as a security event.
- **SC-003**: The sum of the refunds issued for one payment never exceeds the amount paid, even when
  two refunds race.
- **SC-004**: Every amount in every payment and every refund is an exact integer count of minor
  units in the order's currency.
- **SC-005**: The reconciliation reports every difference between the platform's records and the
  provider's, and records what it found.
- **SC-006**: The complete quality gate passes, the previous milestones' behavior is unchanged, and
  the milestone's own documentation records the executed evidence.

## Assumptions

- **M10-ASM-001**: The settlement currency is the order's currency, which is EGP, as HC-DEC-008
  approved.
- **M10-ASM-002**: The only shipped provider is a **non-production** adapter. It refuses to
  operate in a production environment, so a production request can never collect money.
- **M10-ASM-003**: The provider event's signature is an HMAC over the raw request body, keyed by a
  secret the platform holds. The exact mechanism is the adapter's, and the platform verifies through
  the adapter rather than by knowing the provider's format.
- **M10-ASM-004**: The accepted event timestamp window is five minutes, and an event outside it is
  stale. The window is a constant of the payment capability.
- **M10-ASM-005**: A refund never refunds more than the payment, and a refund of a failed payment
  is refused.
- **M10-ASM-006**: The platform sends no customer message about a payment or a refund, because
  HC-DEC-014 leaves the notification channel open.
- **M10-ASM-007**: The provider reference is the only link to the provider, and the platform stores
  it rather than storing any card, credential, or other payment material.
