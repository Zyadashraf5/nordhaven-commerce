# Requirements Checklist: Milestone 13 - Administration and Operations

**Date**: 2026-10-21

**Status**: **Complete.** Every requirement below is implemented and covered by an automated test.

## The capability

- [x] **FR-001** The platform owns an **Administration** capability that is a thin orchestration
      layer and owns no table and no business rule. *(The `administration` module; it owns no
      persistence root and the boundary check enforces that.)*
- [x] **FR-002** Every reported figure comes from the owning capability through its published
      contract. *(The service's six injected contracts.)*
- [x] **FR-003** The administrative surface is a read: it moves no money, changes no stock, and
      changes no state. *(Every route is a `GET`, and the service has no write.)*
- [x] **FR-004** The platform publishes the read contracts the surface needs. *(The Orders, Shipping,
      Reviews, Notifications, Payments, and Identity contracts.)*
- [x] **FR-005** The picture reports the orders, shipments, returns, reviews, and messages by state,
      and the accounts and the money. *(The `OperationalOverview` projection and the integration
      suite.)*
- [x] **FR-006** Every money figure is an exact integer count of minor units and is counted by the
      Payments capability. *(The database aggregation inside the Payments capability.)*
- [x] **FR-007** The customer administration reports the customers and their counts. *(The
      integration and end-to-end suites.)*
- [x] **FR-008** A customer the platform holds no record of is answered with a not-found answer.
      *(`CUSTOMER_NOT_FOUND`; the end-to-end suite.)*
- [x] **FR-009** The audit trail reports the platform's own security events and carries no
      credential. *(The `SecurityEventResponse` projection.)*
- [x] **FR-010** Every administrative route requires the `ADMIN` role, and the administrator's
      session is protected by the mandatory multi-factor enrollment. *(`@Roles('ADMIN')` and the
      Identity capability's enrollment gate; the end-to-end suite signs in with multi-factor.)*
- [x] **FR-011** Every access decision is recorded, and a denial as well as a grant. *(The platform's
      `RolesGuard` and the Identity capability's authorization audit.)*
- [x] **FR-012** The milestone performs no live financial operation. *(The surface has no write
      route, and the shipped payment provider refuses to operate in production.)*
- [x] **FR-013** The milestone adds no schema, no migration, no dependency, no infrastructure, and no
      new source of truth. *(The migration count is unchanged at 23, and `pnpm audit --prod` reports
      no advisory.)*
- [x] **FR-014** The milestone changes no existing route's contract. *(The OpenAPI inventory is
      extended, and the existing operations are unchanged.)*
- [x] **FR-015** Every documented behavior is covered by an automated test. *(Four integration and
      five end-to-end cases.)*

## The success criteria

- [x] **SC-001** Every figure in the picture matches the owning capability's own record. *(The
      integration suite compares the collected money with the order's own total.)*
- [x] **SC-002** The administrative surface cannot move money or stock. *(The read-only service.)*
- [x] **SC-003** An anonymous caller and a customer are both refused. *(The end-to-end suite.)*
- [x] **SC-004** The milestone adds no schema and the previous milestones' behaviour is unchanged.
      *(Every previous test still passes.)*
- [x] **SC-005** The complete quality gate passes and the executed evidence is recorded.
      *(`docs/progress/milestone-13.md`.)*

## The documented boundary

- [x] **No live financial, tax, payment, or shipping operation** was added to the administrative
      surface.
- [x] **No second source of truth** was introduced: the picture is computed, never stored.
- [x] **No new role model** was invented; the existing two roles remain, and the milestone proves the
      boundary for its own routes.
