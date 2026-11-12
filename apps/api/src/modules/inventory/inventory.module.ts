import { CatalogModule } from '../catalog';
import { Module } from '@nestjs/common';
import { AdminBundlesController } from './api/admin-bundles.controller';
import { AdminInventoryController } from './api/admin-inventory.controller';
import { AdminReservationsController } from './api/admin-reservations.controller';
import { BundleService } from './application/bundle.service';
import { InventoryAvailabilityService } from './application/inventory-availability.service';
import {
  InventoryBundleService,
  InventoryReservationService,
} from './application/inventory-reservation.service';
import { InventoryService } from './application/inventory.service';
import { InventoryRestockService } from './application/inventory-restock.service';
import { ReservationService } from './application/reservation.service';
import {
  INVENTORY_AVAILABILITY,
  INVENTORY_BUNDLES,
  INVENTORY_RESERVATION,
  INVENTORY_RESTOCK,
} from './contracts';
import { BundleRepository } from './persistence/bundle.repository';
import { InventoryRepository } from './persistence/inventory.repository';
import { ReservationRepository } from './persistence/reservation.repository';

/**
 * Inventory and Bundles module.
 *
 * Owns per-SKU stock, the reservation lifecycle, the append-only movement audit, and bundles, and
 * nothing else. It references the catalog's sellable SKUs only through database foreign keys
 * (research R2); identifier lookups use the published Catalog reader. Catalog does not depend on Inventory.
 *
 * The module publishes its availability reader so another capability can ask what can be reserved
 * without reading the inventory rows.
 */
@Module({
  imports: [CatalogModule],
  controllers: [AdminBundlesController, AdminInventoryController, AdminReservationsController],
  providers: [
    BundleRepository,
    InventoryRepository,
    ReservationRepository,
    BundleService,
    InventoryService,
    ReservationService,
    InventoryAvailabilityService,
    InventoryReservationService,
    InventoryBundleService,
    InventoryRestockService,
    { provide: INVENTORY_AVAILABILITY, useExisting: InventoryAvailabilityService },
    { provide: INVENTORY_RESERVATION, useExisting: InventoryReservationService },
    { provide: INVENTORY_BUNDLES, useExisting: InventoryBundleService },
    { provide: INVENTORY_RESTOCK, useExisting: InventoryRestockService },
  ],
  exports: [INVENTORY_AVAILABILITY, INVENTORY_RESERVATION, INVENTORY_BUNDLES, INVENTORY_RESTOCK],
})
export class InventoryModule {}
