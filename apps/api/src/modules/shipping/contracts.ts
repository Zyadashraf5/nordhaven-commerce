/**
 * The Shipping and Fulfillment capability's published contract.
 *
 * The capability owns the shipping destinations, the shipping methods, the shipments, and the
 * returns, and it reaches no other capability's tables: the order is read through the Orders
 * capability's ledger, the restock goes through the Inventory capability's restock contract, and the
 * refund goes through the Payments capability's refund contract.
 *
 * **What the capability deliberately does not contain.** There is no carrier, no rate calculation,
 * no service level, and no delivery estimate. A shipping method's amount is a value an
 * administrator configured, and a shipment's tracking reference is a free-form value an
 * administrator set. HC-DEC-013 leaves the shipping providers, the rate calculation, and the
 * service areas open, so the capability records what the merchant configured and invents nothing.
 */

/** The states a shipment may hold. */
export type ShipmentStatusValue = 'PREPARED' | 'PACKED' | 'HANDED_OVER' | 'DELIVERED' | 'CANCELLED';

/** The states a return may hold. */
export type ReturnStatusValue =
  | 'REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'RECEIVED'
  | 'REFUNDED'
  | 'CANCELLED';

/** Who caused a transition. */
export type ShippingActorValue = 'CUSTOMER' | 'ADMIN' | 'SYSTEM';

/** One shipping destination, as the capability persists it. */
export interface ShippingDestinationRecord {
  readonly countryCode: string;
  readonly environment: string;
  readonly enabled: boolean;
  readonly label: string;
  /** The carrier, or null when no provider is activated. No provider is ever called. */
  readonly carrierCode: string | null;
  readonly updatedByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** One shipping method, as the capability persists it. */
export interface ShippingMethodRecord {
  readonly id: string;
  readonly environment: string;
  readonly code: string;
  readonly label: string;
  /** The destination the method applies to, or null when it applies to every enabled destination. */
  readonly destinationCountryCode: string | null;
  /** The configured amount, in exact integer minor units. The platform computes no rate. */
  readonly amountMinor: number;
  readonly currency: string;
  readonly active: boolean;
  readonly updatedByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** One line of a shipment. */
export interface ShipmentLineRecord {
  readonly id: string;
  readonly shipmentId: string;
  readonly orderLineId: string;
  readonly quantity: number;
}

/** One recorded shipment transition. */
export interface ShipmentEventRecord {
  readonly id: string;
  readonly shipmentId: string;
  readonly eventType: string;
  readonly previousStatus: ShipmentStatusValue | null;
  readonly nextStatus: ShipmentStatusValue | null;
  readonly actor: ShippingActorValue;
  readonly actorUserId: string | null;
  readonly reason: string | null;
  readonly detail: unknown;
  readonly createdAt: Date;
}

/** One shipment, as the capability persists it. */
export interface ShipmentRecord {
  readonly id: string;
  readonly orderId: string;
  readonly customerId: string;
  readonly status: ShipmentStatusValue;
  readonly destinationCountryCode: string;
  readonly destinationLabel: string;
  readonly methodCode: string;
  readonly methodLabel: string;
  /** The configured amount of the selected method, in exact integer minor units. */
  readonly amountMinor: number;
  readonly currency: string;
  /** A free-form reference an administrator set. No carrier is contacted or verified. */
  readonly trackingReference: string | null;
  readonly carrierCode: string | null;
  readonly dispatchedAt: Date | null;
  readonly deliveredAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly statusReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lines: readonly ShipmentLineRecord[];
}

/** One line of a return. */
export interface ReturnLineRecord {
  /** Exact allocated amount; null for unreconciled historical rows. */
  readonly amountMinor: number | null;
  readonly id: string;
  readonly returnId: string;
  readonly orderLineId: string;
  readonly quantity: number;
  /** Whether the units went back into stock, so a repeated receive cannot restock them again. */
  readonly restocked: boolean;
}

/** One recorded return transition. */
export interface ReturnEventRecord {
  readonly id: string;
  readonly returnId: string;
  readonly eventType: string;
  readonly previousStatus: ReturnStatusValue | null;
  readonly nextStatus: ReturnStatusValue | null;
  readonly actor: ShippingActorValue;
  readonly actorUserId: string | null;
  readonly reason: string | null;
  readonly detail: unknown;
  readonly createdAt: Date;
}

/** One return, as the capability persists it. */
export interface ReturnRecord {
  readonly id: string;
  readonly orderId: string;
  readonly customerId: string;
  readonly status: ReturnStatusValue;
  readonly reasonCode: string;
  readonly currency: string;
  /** The exact integer minor units the return covers. */
  readonly totalMinor: number;
  /** The Payments capability's refund, once one was requested. */
  readonly refundId: string | null;
  /** `REQUESTED`, `COMPLETED`, or `REFUSED`. */
  readonly refundStatus: string | null;
  readonly receivedAt: Date | null;
  readonly decidedAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lines: readonly ReturnLineRecord[];
}

/** One shipping option a customer may be offered for a destination. */
export interface ShippingOption {
  readonly code: string;
  readonly label: string;
  /** The configured amount, in exact integer minor units. */
  readonly amountMinor: number;
  readonly currency: string;
  /** The destination the option applies to, or null when it applies to every enabled destination. */
  readonly destinationCountryCode: string | null;
}

/**
 * The Shipping and Fulfillment capability's published contract.
 *
 * The administrative surface of the milestone reads and acts through it, and a later capability
 * that must ask what shipping options exist asks through it as well, so the configuration has one
 * owner and one reader.
 */
export interface ShippingFulfillment {
  shipmentStateCounts(): Promise<readonly { state: string; count: number }[]>;
  shipmentCustomerIdsAfter(cursor: string | null, limit: number): Promise<readonly string[]>;
  shipmentCustomerCounts(
    ids: readonly string[],
  ): Promise<readonly { customerId: string; count: number }[]>;
  shipmentIdsForCustomer(customerId: string, limit: number): Promise<readonly string[]>;
  returnStateCounts(): Promise<readonly { state: string; count: number }[]>;
  returnCustomerIdsAfter(cursor: string | null, limit: number): Promise<readonly string[]>;
  returnCustomerCounts(
    ids: readonly string[],
  ): Promise<readonly { customerId: string; count: number }[]>;
  returnIdsForCustomer(customerId: string, limit: number): Promise<readonly string[]>;

  /** The configured shipping options of a destination. It never invents one. */
  optionsFor(destinationCountryCode: string): Promise<readonly ShippingOption[]>;
  /** The shipment that fulfils an order, when one exists. */
  findShipmentForOrder(orderId: string): Promise<ShipmentRecord | null>;
  /** One shipment by its identifier. */
  shipmentOf(shipmentId: string): Promise<ShipmentRecord | null>;
  /** One return by its identifier. */
  returnOf(returnId: string): Promise<ReturnRecord | null>;
  /** Every shipment, newest first. */
  listAll(limit: number): Promise<readonly ShipmentRecord[]>;
  /** The shipments of one customer, newest first. */
  listForCustomerOf(customerId: string, limit: number): Promise<readonly ShipmentRecord[]>;
  /** Every return, newest first. */
  listAllReturns(limit: number): Promise<readonly ReturnRecord[]>;
  /** The returns of one customer, newest first. */
  listReturnsForCustomerOf(customerId: string, limit: number): Promise<readonly ReturnRecord[]>;
}

/** The injection token the Shipping capability publishes its fulfilment contract under. */
export const SHIPPING_FULFILLMENT = Symbol('SHIPPING_FULFILLMENT');
