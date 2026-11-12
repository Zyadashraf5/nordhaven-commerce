# Contract: Milestone 11 - Shipping and Returns API

**Date**: 2026-10-21

**Status**: **Delivered.** The contract is published in the OpenAPI document at version **1.1.0** and
is enforced by the reviewed operation inventory, the operation allow-list, and the response
validation in the end-to-end suite.

## The routes

### The anonymous storefront read

| Route | Operation | Authentication |
| ----- | --------- | -------------- |
| `GET /api/v1/shipping/options?destinationCountryCode=EG` | `listShippingOptions` | none |

It reports the methods an administrator configured for that destination, each with its configured
amount. A destination with no approved row, or with no configured method, has **no** options; the
platform says so rather than inventing one.

### The customer's routes

| Route | Operation | Authentication |
| ----- | --------- | -------------- |
| `GET /api/v1/shipments` | `listCustomerShipments` | customer |
| `GET /api/v1/shipments/{shipmentId}` | `getCustomerShipment` | customer |
| `GET /api/v1/shipments/{shipmentId}/events` | `listCustomerShipmentEvents` | customer |
| `GET /api/v1/returns` | `listCustomerReturns` | customer |
| `POST /api/v1/returns` | `createReturn` | customer |
| `GET /api/v1/returns/{returnId}` | `getCustomerReturn` | customer |
| `GET /api/v1/returns/{returnId}/events` | `listCustomerReturnEvents` | customer |
| `DELETE /api/v1/returns/{returnId}` | `cancelReturn` | customer |

Every route is scoped to the presented session's principal. A shipment or a return that belongs to
another customer is answered exactly like one that never existed, so the API never discloses whether
it exists.

### The administrator's routes

| Route | Operation | Authentication |
| ----- | --------- | -------------- |
| `GET /api/v1/admin/shipping/destinations` | `listAdminShippingDestinations` | administrator |
| `PUT /api/v1/admin/shipping/destinations/{countryCode}` | `configureAdminShippingDestination` | administrator |
| `GET /api/v1/admin/shipping/methods` | `listAdminShippingMethods` | administrator |
| `PUT /api/v1/admin/shipping/methods/{code}` | `configureAdminShippingMethod` | administrator |
| `GET /api/v1/admin/shipments` | `listAdminShipments` | administrator |
| `POST /api/v1/admin/shipments` | `createAdminShipment` | administrator |
| `GET /api/v1/admin/shipments/{shipmentId}` | `getAdminShipment` | administrator |
| `PATCH /api/v1/admin/shipments/{shipmentId}` | `transitionAdminShipment` | administrator |
| `PUT /api/v1/admin/shipments/{shipmentId}/tracking` | `setAdminShipmentTracking` | administrator |
| `GET /api/v1/admin/shipments/{shipmentId}/events` | `listAdminShipmentEvents` | administrator |
| `GET /api/v1/admin/returns` | `listAdminReturns` | administrator |
| `GET /api/v1/admin/returns/{returnId}` | `getAdminReturn` | administrator |
| `POST /api/v1/admin/returns/{returnId}/decision` | `decideAdminReturn` | administrator |
| `POST /api/v1/admin/returns/{returnId}/receipt` | `receiveAdminReturn` | administrator |
| `GET /api/v1/admin/returns/{returnId}/events` | `listAdminReturnEvents` | administrator |

## The request bodies

Every schema is **strict**, so an unexpected field is refused rather than ignored.

| Body | Fields | What a client can never supply |
| ---- | ------ | -------------------------------- |
| the shipping destination | `enabled`, `label`, `carrierCode` | the destination's country code is the path, and the amount never appears |
| the shipping method | `label`, `destinationCountryCode`, `amountMinor`, `currency`, `active` | the method's code is the path |
| the shipment | `orderId`, `methodCode` | the price, the rate, the delivery date, the carrier status |
| the shipment transition | `to`, `reason` | the shipment's state is validated against the lifecycle |
| the tracking reference | `trackingReference` | the carrier status |
| the return request | `orderId`, `reasonCode`, `lines[{orderLineId, quantity}]` | the amount the return covers |
| the return decision | `decision`, `reason` | the decision's effect |
| the return receipt | `restockLineIds`, `refund` | the restocked quantity and the refunded amount |

**A client never supplies a price, a rate, or a refund amount.** The shipping amount is an
administrator's configured value, the amount a return covers is computed from the order's own
figures, and the refunded amount is the return's computed amount.

## The error codes

| Code | Status | Meaning |
| ---- | ------ | ------- |
| `SHIPMENT_NOT_FOUND` | 404 | no such shipment for this caller |
| `RETURN_NOT_FOUND` | 404 | no such return for this caller |
| `SHIPPING_DESTINATION_NOT_FOUND` | 404 | the destination is not approved for shipping |
| `SHIPPING_METHOD_NOT_FOUND` | 404 | the method is unknown, inactive, or configured for another destination |
| `SHIPMENT_NOT_TRANSITIONABLE` | 409 | the lifecycle does not permit that transition |
| `SHIPMENT_ALREADY_EXISTS` | 409 | the order already has its shipment |
| `RETURN_NOT_TRANSITIONABLE` | 409 | the lifecycle does not permit that transition |

The refusals that a value would cause - a negative amount, an amount outside the stored money
bounds, a currency that is not the settlement currency, a quantity that the order does not hold - are
answered with the platform's existing `VALIDATION_ERROR` envelope, whose message never echoes a
submitted value.

## The response projections

The projections deliberately omit what the milestone does not have. There is **no** estimated
delivery date, **no** carrier service level, and **no** carrier-verified status in any response,
because no provider is activated and no delivery commitment is approved.

The shipment's `trackingReference` is documented as the administrator's own reference, and the
shipment's `amountMinor` is documented as the configured amount of the method, which is **recorded
and not collected**.
