import { ReservationService } from './reservation.service';
import { Injectable } from '@nestjs/common';
import {
  type AvailabilityReading,
  type AvailabilityTarget,
  type InventoryAvailability,
  type ReservationHold,
} from '../contracts';
import { bundleAvailability } from '../api/inventory.support';
import { BundleRepository } from '../persistence/bundle.repository';
import { InventoryRepository } from '../persistence/inventory.repository';
import { ReservationRepository } from '../persistence/reservation.repository';

/**
 * Availability for other capabilities.
 *
 * The lapsed reservations are released first, because a hold whose window has passed no longer
 * occupies stock; without that step a quote would understate what can actually be reserved.
 *
 * A FIXED bundle's availability is its own finished-goods stock. A DYNAMIC bundle's availability is
 * derived from its component composition at the minimum quantities, because a dynamic bundle keeps
 * no stock of its own and a bundle may never imply stock its components cannot fulfil.
 */
@Injectable()
export class InventoryAvailabilityService implements InventoryAvailability {
  public constructor(
    private readonly inventory: InventoryRepository,
    private readonly bundles: BundleRepository,
    private readonly reservations: ReservationRepository,
    private readonly reservationService: ReservationService,
  ) {}

  public async canReserve(holds: readonly ReservationHold[]): Promise<boolean> {
    return this.reservationService.canHold(holds);
  }

  public async readAvailability(
    targets: readonly AvailabilityTarget[],
  ): Promise<readonly AvailabilityReading[]> {
    if (targets.length === 0) return [];
    await this.reservations.expireLapsed(new Date());
    return Promise.all(targets.map((target) => this.readOne(target)));
  }

  private async readOne(target: AvailabilityTarget): Promise<AvailabilityReading> {
    if (target.kind === 'VARIANT') {
      const item = await this.inventory.findByVariantId(target.variantId);
      return {
        target,
        available: item === null ? 0 : Math.max(0, item.onHand - item.reserved),
      };
    }

    const bundle = await this.bundles.findById(target.bundleId);
    if (bundle === null) return { target, available: 0 };

    if (bundle.kind === 'FIXED') {
      const item = await this.inventory.findByBundleId(target.bundleId);
      return {
        target,
        available: item === null ? 0 : Math.max(0, item.onHand - item.reserved),
      };
    }

    const measured = await Promise.all(
      bundle.components.map(async (component) => {
        const item = await this.inventory.findByVariantId(component.variantId);
        return {
          available: item === null ? 0 : Math.max(0, item.onHand - item.reserved),
          perBundleQuantity: component.minQuantity ?? 0,
        };
      }),
    );
    return { target, available: bundleAvailability(measured) };
  }
}
