# Feature Specification: Milestone 13 - Administration and Operations

**Created**: 2026-10-21

**Status**: Approved for development. The M06-M10 audit recorded a **CONDITIONAL GO** for M11-M14
development on the verified isolated databases, and the Product Owner authorized the M11-M14 batch on
2026-10-21.

**Input**: "Implement administration workflows for the completed platform, including catalog,
inventory, bundles, pricing, orders, shipping, returns, reviews, customers, financial operations and
operational monitoring within the existing approved scope. Enforce administrator authentication,
MFA, role boundaries, audit trails, and security controls. No unapproved live financial or production
operations."

## Scope Boundaries

The administrative surface for the catalog, the inventory, the bundles, the pricing, the orders, the
shipping, the returns, the reviews, the payments, and the accounts was **already implemented and
verified** by Milestones 04 to 12. This milestone therefore does not rebuild them.

What was **missing** is the layer that presents the completed platform as one operation:

1. **The operational monitoring** - what the platform currently holds and what is waiting for a
   decision.
2. **The customer administration** - who the platform's customers are and what it holds for them.
3. **The financial operations view** - the money, counted in the capability that owns it.
4. **The audit trail** - the platform's own security decisions, in one place.
5. **The published read contracts** the three layers need, so the administration surface has **no
   bypass path** into another capability's persistence.

**The milestone adds no schema, no migration, and no new business rule.** It is an orchestration
layer over what already exists, and every figure it reports comes from the capability that owns the
record.

## What "no unapproved live financial or production operations" means here

| Not done | What the milestone does instead |
| -------- | -------------------------------- |
| A live payment, capture, or refund from the administrative surface | The administrative surface is a **read**. Every money movement stays in the Payments capability, behind its own rules, its own idempotency, and its own cumulative limit. |
| A production tax, payment, or shipping activation | Nothing is activated. The shipped payment provider refuses to operate in production, and the notification channel sends nothing. |
| A stock adjustment from the operations view | The view reports the stock through the Inventory capability's own read contract; an adjustment stays an Inventory operation. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See what the platform holds (Priority: P1)

An administrator opens the operational picture: the orders by state, the shipments by state, the
returns by state, the reviews by state, the messages by state, and the money.

**Why this priority**: An operator cannot run a platform they cannot see, and a platform whose
operational view is assembled from the capabilities' own records cannot disagree with them.

**Independent Test**: Place a paid order and a held review, then read the picture and confirm the
counts and the money.

**Acceptance Scenarios**:

1. **Given** a paid order and a held review, **When** the administrator reads the picture, **Then**
   the order is counted as paid, the review is counted as held, and the collected money equals the
   order's total.
2. **Given** no refunds, **When** the administrator reads the picture, **Then** the refunded amount
   and the pending refund amount are both zero.

### User Story 2 - Find a customer and what the platform holds for them (Priority: P1)

An administrator lists the customers and opens one of them.

**Why this priority**: A customer-facing question - "what do you have about this customer?" - is
answered from one place, and every answer comes from the capability that owns the record.

**Acceptance Scenarios**:

1. **Given** a customer with an order and a review, **When** the administrator lists the customers,
   **Then** the customer is listed with the order and review counts.
2. **Given** a customer identifier the platform holds no record of, **When** the administrator reads
   it, **Then** the request is refused with a not-found answer.
3. **Given** a customer, **When** the administrator reads them, **Then** their orders, reviews,
   shipments, and returns are listed.

### User Story 3 - Audit what the platform decided (Priority: P1)

An administrator reads the platform's recent security events.

**Why this priority**: The security trail is the audit evidence for every authentication and
authorization decision, and an operator must be able to read it.

**Acceptance Scenarios**:

1. **Given** an administrator, **When** they read the trail, **Then** the recorded events are
   listed.
2. **Given** a customer, **When** they read the trail, **Then** the request is refused with the
   forbidden answer.

### User Story 4 - Keep the administrative surface behind the same controls (Priority: P1)

The administrative surface is reachable only by an administrator who has completed multi-factor
enrollment, and every access decision is recorded.

**Why this priority**: The administrative surface reads the whole platform, so it is the most
valuable target on the platform. The controls are not new in this milestone, but the milestone must
prove them for its own routes.

**Acceptance Scenarios**:

1. **Given** an anonymous caller, **When** they read an administrative route, **Then** the request
   is refused with the unauthenticated answer.
2. **Given** a customer, **When** they read an administrative route, **Then** the request is
   refused with the forbidden answer, and the denial is recorded as a security event.
3. **Given** an administrator, **When** they read an administrative route, **Then** the request
   succeeds, and the grant is recorded as a security event.

## Edge Cases

- The platform holds no record at all; the picture reports empty counts and zero money.
- A customer identifier that belongs to no account but has a commerce record; the customer is
  reported with no address and no role.
- An administrator reads the picture while a payment is in flight; the figures are the ones the
  owning capability reports at that moment.
- A refund is pending; the pending refund amount is counted and the refunded amount is not.
- An account exists but has never ordered; the customer is listed with zero counts.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The platform MUST own an **Administration** capability that is a thin orchestration
      layer over the completed platform, and that owns **no** table and **no** business rule.
- **FR-002**: Every figure the administrative surface reports MUST come from the capability that
      owns the record, through that capability's **published contract**.
- **FR-003**: The administrative surface MUST be a **read**: it MUST NOT move money, change a stock
      quantity, change an order's state, or change a review's state.
- **FR-004**: The platform MUST publish the read contracts the administrative surface needs: the
      orders, the shipments and the returns, the reviews, the messages, the payments, and the
      identity audit.
- **FR-005**: The operational picture MUST report the orders, the shipments, the returns, the
      reviews, and the messages **by state**, and the accounts, the collected money, the refunded
      money, and the pending refund money.
- **FR-006**: Every money figure MUST be an exact integer count of minor units, and MUST be counted
      by the Payments capability.
- **FR-007**: The customer administration MUST report the customers the platform holds records for,
      with their order, review, shipment, and return counts.
- **FR-008**: A customer the platform holds no record of MUST be answered with a not-found answer.
- **FR-009**: The audit trail MUST report the platform's own security events, and MUST NOT carry a
      credential or any other secret.
- **FR-010**: Every administrative route MUST require the `ADMIN` role, and the administrator's
      session MUST be protected by the mandatory multi-factor enrollment.
- **FR-011**: Every access decision MUST be recorded, and a denial MUST be recorded as well as a
      grant.
- **FR-012**: The milestone MUST NOT perform, schedule, or approve a live financial operation.
- **FR-013**: The milestone MUST add no schema, no migration, no dependency, no infrastructure, and
      no new source of truth.
- **FR-014**: The milestone MUST NOT change any existing route's operation identifier, status code,
      or response shape.
- **FR-015**: Every documented administrative behavior MUST be covered by an automated test,
      including the anonymous refusal, the customer denial, the picture, the customer list, the
      unknown customer, and the audit trail.

### Key Entities

The milestone adds **no** entity. It presents the entities the other capabilities own.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every figure in the picture matches the owning capability's own record.
- **SC-002**: The administrative surface cannot move money or stock, and the only way to do so
      remains the owning capability's own route.
- **SC-003**: An anonymous caller and a customer are both refused, and both refusals are recorded.
- **SC-004**: The milestone adds no schema and no migration, and the previous milestones' behaviour
      is unchanged.
- **SC-005**: The complete quality gate passes, and the milestone's documentation records the
      executed evidence.

## Assumptions

- **M13-ASM-001**: The administrative picture is a **summary**, not a stored snapshot, so it can never
      drift from the capabilities it reports.
- **M13-ASM-002**: The read contracts the milestone adds are **additive**; no existing contract
      member changed its meaning, and no existing route changed.
- **M13-ASM-003**: The platform's role model has two roles, `CUSTOMER` and `ADMIN`, so a role
      boundary is the boundary between them. The milestone proves it for its own routes rather than
      inventing a finer model.
- **M13-ASM-004**: The operational picture reads a bounded number of records per capability, so it is
      an operational view rather than a full report. The bound is documented in the service.
