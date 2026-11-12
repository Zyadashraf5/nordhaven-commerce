# Requirements Checklist: Milestone 11 - Shipping and Returns

**Date**: 2026-10-21

**Status**: **Complete.** Every requirement below is implemented and covered by an automated test.

## The capability

- [x] **FR-001** The platform owns a **Shipping and Fulfillment** capability that holds the shipping
      destinations, the shipping methods, the shipments, and the returns, and that reaches no other
      capability's tables. *(The `shipping` module; its repository touches only its own tables, and
      the boundary check enforces the ownership of every persistence root.)*
- [x] **FR-002** A shipping destination is administrator-configured and environment-scoped, and the
      platform carries **no** built-in country list. *(`shipping_destinations`, scoped by
      `environment`; the model has no country table.)*
- [x] **FR-003** A shipping method is administrator-configured and environment-scoped, and states its
      exact integer minor-unit amount and its currency. The platform computes no rate, calls no
      carrier, and stores no delivery estimate. *(`shipping_methods`; the model has no
      `estimatedDelivery`, `carrierServiceLevel`, or rate function.)*
- [x] **FR-004** The configured methods for a destination are exposed, and a method that is
      unavailable for the destination is refused. *(`GET /api/v1/shipping/options`;
      `SHIPPING_METHOD_NOT_FOUND`.)*
- [x] **FR-005** The platform ignores any client-supplied shipping amount, exactly as it ignores a
      client-supplied price or tax. *(Every request schema is strict and carries no amount.)*
- [x] **FR-006** An order's figures add up exactly and the database refuses an order whose figures
      do not. *(The order's constraint is unchanged, because the shipping charge is not collected;
      the reason is recorded in the research and the data model.)*
- [x] **FR-007** The shipment lifecycle is explicit and documented, with the states `PREPARED`,
      `PACKED`, `HANDED_OVER`, `DELIVERED`, and `CANCELLED`, and every transition is permitted from an
      explicit set of source states. *(`shipping-transitions.ts`; the unit suite states the whole
      permitted set.)*
- [x] **FR-008** Every shipment transition is recorded in an append-only event log with the actor,
      the previous state, the next state, the reason, and the time, and a refused transition is
      recorded while the shipment's state is left unchanged. *(`shipment_events`; the integration
      suite asserts the refusal and the unchanged state.)*
- [x] **FR-009** A shipment is created only for an order that has been paid, and a second shipment
      for the same order is refused. *(`FULFILLABLE_ORDER_STATUSES`; the unique key on `order_id`.)*
- [x] **FR-010** A shipment records the destination it is going to and the items it carries, and
      contains no delivery commitment, no carrier rate, and no carrier integration. *(The model's
      fields and the response projection.)*
- [x] **FR-011** A tracking reference is a free-form value an administrator sets, and the platform
      never presents it as carrier-verified tracking. *(The response describes it as the
      administrator's own reference.)*
- [x] **FR-012** The return lifecycle is explicit and documented, with the states `REQUESTED`,
      `APPROVED`, `REJECTED`, `RECEIVED`, `REFUNDED`, and `CANCELLED`, and every transition is
      permitted from an explicit set of source states. *(`shipping-transitions.ts`.)*
- [x] **FR-013** A return references an order the platform owns and records the exact lines and
      quantities, and a request for more units than the order holds is refused. *(`return_lines`;
      the integration suite refuses the over-quantity request.)*
- [x] **FR-014** A return is not requested against an order that was never paid. *(`RETURNABLE_ORDER_
      STATUSES`.)*
- [x] **FR-015** Receiving a return restocks through the Inventory capability's published contract
      and requests the refund through the Payments capability's published contract, and the Shipping
      capability writes neither capability's tables. *(`INVENTORY_RESTOCK` and `PAYMENT_REFUNDS`.)*
- [x] **FR-016** Receiving a return restocks **once**, and a repeated receive does not restock again.
      *(The movement's unique business key; the integration suite repeats the receipt.)*
- [x] **FR-017** A refund for a return is idempotent on a stable business key, and the refunds for
      one return never exceed the amount the return covers. *(`return:{id}:refund`; the Payments
      capability's cumulative limit.)*
- [x] **FR-018** A return is refused for an order that belongs to another customer, exactly as an
      unknown order would be refused. *(`ORDER_NOT_FOUND`; the integration and end-to-end suites.)*
- [x] **FR-019** Every administrative change is attributable to the administrator who made it and is
      recorded. *(The `updated_by_user_id` columns and the event logs' actor.)*
- [x] **FR-020** The milestone adds no new runtime or development dependency, no new infrastructure,
      and no new source of truth. *(`pnpm audit --prod` reports no advisory; the dependency files are
      unchanged.)*
- [x] **FR-021** The milestone applies only safe, additive migrations, and changes no existing
      route's operation identifier, status code, or response shape. *(The migrations are additive;
      the OpenAPI inventory is extended, not changed.)*
- [x] **FR-022** Every documented shipping and return behaviour is covered by an automated test,
      including the unavailable method, the refused transition, the duplicate restock, the repeated
      refund, the cross-customer access, the authorization denial, and the idempotency race.
      *(Seven unit, eighteen integration, and eight end-to-end cases.)*
- [x] **FR-023** The platform sends no customer message about a shipment or a return. *(No
      notification is produced anywhere in the capability.)*

## The success criteria

- [x] **SC-001** Every shipping and return amount is an exact integer count of minor units. *(The
      `Int` columns with their `CHECK` constraints; the proportional allocation with the
      largest-remainder rule.)*
- [x] **SC-002** The options for a destination list exactly the configured methods and nothing else,
      and the platform never computes a rate. *(The integration suite.)*
- [x] **SC-003** A repeated receipt or a repeated refund changes nothing the second time. *(The
      integration and end-to-end suites.)*
- [x] **SC-004** A customer can neither read nor act on another customer's shipment or return, and
      the platform discloses nothing about whether the record exists. *(The 404 responses.)*
- [x] **SC-005** No shipment, return, destination, or method contains a carrier, a computed rate, or
      a delivery date. *(The model and the projections.)*
- [x] **SC-006** The complete quality gate passes, the previous milestones' behaviour is unchanged,
      and the milestone's documentation records the executed evidence. *(`docs/progress/
      milestone-11.md`.)*

## The documented boundary

- [x] The **shipping charge is recorded, not collected**, and the reason is recorded in the
      research, the data model, the plan, the milestone report, and the decision register.
- [x] The **merchant's return policy** stays configuration and an administrative decision, because
      HC-DEC-012 is open.
- [x] **No delivery commitment, carrier, service level, or country eligibility** was invented.
