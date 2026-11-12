import { Injectable } from '@nestjs/common';
import { AppError } from '../../../platform/http/app-error';
import {
  type BundleComposition,
  type InventoryBundles,
  type InventoryReservation,
  type ReservationHoldRequest,
  type ReservationHold,
  type ReservationState,
} from '../contracts';
import { BundleRepository } from '../persistence/bundle.repository';
import { ReservationService } from './reservation.service';

/**
 * The reservation contract, for another capability that must hold stock.
 *
 * The hold is the Inventory capability's own atomic primitive, and this adapter only translates
 * the request into it. The idempotency key is the caller's business key, so a repeated request
 * holds the stock exactly once, and the confirmation of a hold that is no longer active is refused
 * rather than silently succeeding.
 */
@Injectable()
export class InventoryReservationService implements InventoryReservation {
  public constructor(private readonly reservations: ReservationService) {}

  public async hold(request: ReservationHoldRequest): Promise<ReservationState> {
    const created = await this.reservations.create({
      idempotencyKey: request.idempotencyKey,
      holds: request.holds,
      ...(request.expiresInSeconds === undefined
        ? {}
        : { expiresInSeconds: request.expiresInSeconds }),
    });

    return { id: created.id, status: created.status, expiresAt: created.expiresAt };
  }

  public async matches(reservationId: string, holds: readonly ReservationHold[]): Promise<boolean> {
    return this.reservations.matchesHolds(reservationId, holds);
  }

  public async read(reservationId: string): Promise<ReservationState> {
    const reservation = await this.reservations.findById(reservationId);
    return { id: reservation.id, status: reservation.status, expiresAt: reservation.expiresAt };
  }

  public async confirm(reservationId: string): Promise<ReservationState> {
    const confirmed = await this.reservations.confirm(reservationId);
    return { id: confirmed.id, status: confirmed.status, expiresAt: confirmed.expiresAt };
  }

  public async release(reservationId: string): Promise<ReservationState> {
    const released = await this.reservations.release(reservationId);
    return { id: released.id, status: released.status, expiresAt: released.expiresAt };
  }
}

/**
 * The bundle contract, for another capability that must record what a bundle resolves to.
 *
 * A FIXED bundle's composition is its own components, because it is an independently stocked
 * finished good. A DYNAMIC bundle's composition is its components at the **approved minimum
 * quantities**, because a customer may not select components arbitrarily in this phase and the
 * minimum is the composition the platform can always fulfil.
 */
@Injectable()
export class InventoryBundleService implements InventoryBundles {
  public constructor(private readonly bundles: BundleRepository) {}

  public async purchaseReferenceOf(
    id: string,
  ): Promise<{ id: string; name: string; productId: string } | null> {
    const bundle = await this.bundles.findById(id);
    return bundle === null
      ? null
      : { id: bundle.id, name: bundle.name, productId: bundle.productId };
  }

  public async compositionOf(bundleId: string): Promise<BundleComposition | null> {
    const bundle = await this.bundles.findById(bundleId);
    if (bundle === null) throw AppError.bundleNotFound();
    return {
      bundleId,
      kind: bundle.kind,
      lines: bundle.components.map((component) => ({
        variantId: component.variantId,
        sku: component.sku,
        quantity:
          bundle.kind === 'FIXED' ? (component.quantity ?? 0) : (component.minQuantity ?? 0),
      })),
    };
  }
}
