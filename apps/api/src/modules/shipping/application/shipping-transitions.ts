import type { ShipmentStatusValue, ReturnStatusValue } from '../contracts';

/**
 * The shipment lifecycle, as data.
 *
 * The permitted transitions are one reviewable artifact rather than a chain of conditions, so a
 * transition that is not permitted is refused without touching the shipment, and the refusal is
 * recorded in the append-only event log.
 */
export const SHIPMENT_TRANSITIONS: Readonly<
  Record<ShipmentStatusValue, readonly ShipmentStatusValue[]>
> = {
  PREPARED: ['PACKED', 'CANCELLED'],
  PACKED: ['HANDED_OVER', 'CANCELLED'],
  HANDED_OVER: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

/** True when a shipment may move from one state to another. */
export function shipmentTransitionPermitted(
  from: ShipmentStatusValue,
  to: ShipmentStatusValue,
): boolean {
  return SHIPMENT_TRANSITIONS[from].includes(to);
}

/**
 * The return lifecycle, as data.
 *
 * A return that is `REQUESTED` holds no money and has moved no stock, and the states make that a
 * property of the record rather than of a code path.
 */
export const RETURN_TRANSITIONS: Readonly<Record<ReturnStatusValue, readonly ReturnStatusValue[]>> =
  {
    REQUESTED: ['APPROVED', 'REJECTED', 'CANCELLED'],
    APPROVED: ['RECEIVED', 'CANCELLED'],
    RECEIVED: ['REFUNDED'],
    REJECTED: [],
    REFUNDED: [],
    CANCELLED: [],
  };

/** True when a return may move from one state to another. */
export function returnTransitionPermitted(from: ReturnStatusValue, to: ReturnStatusValue): boolean {
  return RETURN_TRANSITIONS[from].includes(to);
}
