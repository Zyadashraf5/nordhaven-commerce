/**
 * The Inventory capability's published contract.
 *
 * Availability is not a column: it is `on_hand - reserved` after the lapsed reservations have been
 * released, and for a DYNAMIC bundle it is derived from the component composition. Both are the
 * Inventory capability's rules, so another capability asks for availability through this contract
 * rather than reading the inventory rows itself.
 */

/** What an availability question is about. */
export type AvailabilityTarget =
  | { readonly kind: 'VARIANT'; readonly variantId: string }
  | { readonly kind: 'BUNDLE'; readonly bundleId: string };

/** The availability of one target. */
export interface AvailabilityReading {
  readonly target: AvailabilityTarget;
  /** The number of whole units that can be reserved right now. */
  readonly available: number;
}

/**
 * Reads the availability of sellable targets.
 *
 * A target that has no stock row at all reads as zero available, so a caller never has to
 * distinguish "no stock" from "unknown".
 */
export interface InventoryAvailability {
  canReserve(holds: readonly ReservationHold[]): Promise<boolean>;
  readAvailability(targets: readonly AvailabilityTarget[]): Promise<readonly AvailabilityReading[]>;
}

/** The injection token the Inventory module publishes its availability reader under. */
export const INVENTORY_AVAILABILITY = Symbol('INVENTORY_AVAILABILITY');

// ---------------------------------------------------------------------------------------------
// The reservation contract.
//
// A reservation is the Inventory capability's own record, and the atomic hold is its rule. Another
// capability that must hold stock - the Orders capability, when it creates an order - asks for the
// hold through this contract rather than writing the inventory rows itself.
// ---------------------------------------------------------------------------------------------

/** One thing to hold. */
export type ReservationHold =
  | { readonly kind: 'VARIANT'; readonly sku: string; readonly quantity: number }
  | { readonly kind: 'BUNDLE'; readonly bundleId: string; readonly quantity: number };

/** A request to hold stock. */
export interface ReservationHoldRequest {
  /** The stable business key, so a repeated request holds the stock exactly once. */
  readonly idempotencyKey: string;
  /** The things to hold. */
  readonly holds: readonly ReservationHold[];
  /** How long the hold lives, in seconds. */
  readonly expiresInSeconds?: number | undefined;
}

/** The state of a hold. */
export interface ReservationState {
  readonly id: string;
  readonly status: 'ACTIVE' | 'CONFIRMED' | 'RELEASED' | 'EXPIRED';
  readonly expiresAt: Date;
}

/**
 * Holds, confirms, and releases stock.
 *
 * The confirmation of a hold that is no longer active is refused rather than silently succeeding,
 * so a late payment event can never consume stock that is not held.
 */
export interface InventoryReservation {
  matches(reservationId: string, holds: readonly ReservationHold[]): Promise<boolean>;
  read(reservationId: string): Promise<ReservationState>;
  hold(request: ReservationHoldRequest): Promise<ReservationState>;
  confirm(reservationId: string): Promise<ReservationState>;
  release(reservationId: string): Promise<ReservationState>;
}

/** The injection token the Inventory module publishes its reservation contract under. */
export const INVENTORY_RESERVATION = Symbol('INVENTORY_RESERVATION');

// ---------------------------------------------------------------------------------------------
// The restock contract.
//
// A restock puts goods **back** into sellable stock. It is not the release of a hold: the hold of
// a sold order is already terminal, and the stock of that order was already deducted, so returning
// the goods increases the on-hand quantity exactly as a warehouse receipt does.
//
// The restock is idempotent on a stable business key, because the caller that owns the return is not
// this capability and the two live in different tables: only the Inventory capability can decide,
// atomically, that a given key was already applied.
// ---------------------------------------------------------------------------------------------

/** One thing to put back into stock. */
export type RestockTarget =
  | { readonly kind: 'VARIANT'; readonly variantId: string }
  | { readonly kind: 'BUNDLE'; readonly bundleId: string };

/** One thing to put back into stock, with the key that makes the restock happen once. */
export interface RestockLine {
  readonly target: RestockTarget;
  /** The number of whole units that came back. */
  readonly quantity: number;
  /** The stable business key of this line's restock. It must be unique across every restock. */
  readonly reference: string;
}

/** A request to put goods back into stock. */
export interface RestockRequest {
  readonly lines: readonly RestockLine[];
  /** Why the goods came back, recorded on the movement. */
  readonly reason: string;
}

/** The outcome of one line's restock. */
export interface RestockLineOutcome {
  readonly target: RestockTarget;
  readonly quantity: number;
  readonly reference: string;
  /** True when this call performed the restock, and false when the key had already been applied. */
  readonly applied: boolean;
  /** The on-hand quantity after the restock. */
  readonly onHand: number;
}

/** The outcome of a restock request. */
export interface RestockOutcome {
  /** True when at least one line was restocked by this call. */
  readonly applied: boolean;
  readonly lines: readonly RestockLineOutcome[];
}

/**
 * Puts goods back into sellable stock.
 *
 * A repeated request with the same business key changes nothing the second time, so a retried
 * receipt can never double the stock.
 */
export interface InventoryRestock {
  restock(request: RestockRequest): Promise<RestockOutcome>;
}

/** The injection token the Inventory module publishes its restock contract under. */
export const INVENTORY_RESTOCK = Symbol('INVENTORY_RESTOCK');

/** One component of a bundle's resolved composition. */
export interface BundleCompositionLine {
  readonly variantId: string;
  readonly sku: string;
  /** The units of the component one bundle consumes. */
  readonly quantity: number;
}

/**
 * The composition a bundle resolves to.
 *
 * A FIXED bundle's composition is its own components, because it is an independently stocked
 * finished good. A DYNAMIC bundle's composition is its components at the approved minimum
 * quantities, because a customer may not select components arbitrarily.
 */
export interface BundleComposition {
  readonly bundleId: string;
  readonly kind: 'FIXED' | 'DYNAMIC';
  readonly lines: readonly BundleCompositionLine[];
}

/** Reads a bundle's resolved composition. */
export interface InventoryBundles {
  purchaseReferenceOf(id: string): Promise<{ id: string; name: string; productId: string } | null>;
  compositionOf(bundleId: string): Promise<BundleComposition | null>;
}

/** The injection token the Inventory module publishes its bundle contract under. */
export const INVENTORY_BUNDLES = Symbol('INVENTORY_BUNDLES');
