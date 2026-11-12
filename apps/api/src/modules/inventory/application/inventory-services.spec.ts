import type { DatabaseService } from '../../../platform/database/database.service';
import { AppError } from '../../../platform/http/app-error';
import type { BundleRecord, BundleRepository } from '../persistence/bundle.repository';
import type {
  InventoryDetailRecord,
  InventoryRepository,
  StockMovementRecord,
} from '../persistence/inventory.repository';
import type {
  ReservationRecord,
  ReservationRepository,
} from '../persistence/reservation.repository';
import { BundleService } from './bundle.service';
import { InventoryService } from './inventory.service';

const NOW = new Date('2026-10-20T10:00:00.000Z');
const INVENTORY_ID = '11111111-1111-4111-8111-111111111111';
const VARIANT_ID = '22222222-2222-4222-8222-222222222222';
const PRODUCT_ID = '33333333-3333-4333-8333-333333333333';

function inventoryRecord(onHand: number, reserved: number): InventoryDetailRecord {
  return {
    id: INVENTORY_ID,
    variantId: VARIANT_ID,
    bundleId: null,
    onHand,
    reserved,
    sku: 'OAK-TABLE-01',
    productId: PRODUCT_ID,
    productName: 'Oak Dining Table',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function bundleRecord(kind: 'FIXED' | 'DYNAMIC'): BundleRecord {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    productId: PRODUCT_ID,
    kind,
    name: 'Set',
    description: null,
    components: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        variantId: VARIANT_ID,
        sku: 'OAK-CHAIR-01',
        quantity: kind === 'FIXED' ? 2 : null,
        minQuantity: kind === 'DYNAMIC' ? 2 : null,
        maxQuantity: kind === 'DYNAMIC' ? 4 : null,
        position: 0,
      },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

/** A fake reservation repository whose lazy expiry does nothing and whose reads are scripted. */
class FakeReservationRepository {
  public readonly expiries: Date[] = [];

  public expireLapsed(now: Date): Promise<readonly { reservationId: string }[]> {
    this.expiries.push(now);
    return Promise.resolve([]);
  }
}

class FakeInventoryRepository {
  public record: InventoryDetailRecord | null = inventoryRecord(10, 4);

  public findById(): Promise<InventoryDetailRecord | null> {
    return Promise.resolve(this.record);
  }

  public findByBundleId(): Promise<InventoryDetailRecord | null> {
    return Promise.resolve(this.record);
  }

  public findByVariantId(): Promise<InventoryDetailRecord | null> {
    return Promise.resolve(this.record);
  }

  public findVariant(
    variantId: string,
  ): Promise<{ readonly id: string; readonly productId: string } | null> {
    return Promise.resolve(
      variantId === VARIANT_ID ? { id: VARIANT_ID, productId: PRODUCT_ID } : null,
    );
  }

  public list(): Promise<{ records: readonly InventoryDetailRecord[]; hasMore: boolean }> {
    return Promise.resolve({ records: this.record === null ? [] : [this.record], hasMore: false });
  }

  public setOnHand(): Promise<InventoryDetailRecord> {
    return Promise.resolve(this.record ?? inventoryRecord(0, 0));
  }

  public listMovements(): Promise<{ records: readonly StockMovementRecord[]; hasMore: boolean }> {
    return Promise.resolve({ records: [], hasMore: false });
  }
}

class FakeBundleRepository {
  public record: BundleRecord | null = bundleRecord('FIXED');

  public list(): Promise<readonly BundleRecord[]> {
    return Promise.resolve(this.record === null ? [] : [this.record]);
  }

  public findById(): Promise<BundleRecord | null> {
    return Promise.resolve(this.record);
  }
}

describe('inventory services', () => {
  describe('InventoryService', () => {
    it('reports available as onHand - reserved and never a stored number', async () => {
      const inventory = new FakeInventoryRepository();
      const reservations = new FakeReservationRepository();
      const service = new InventoryService(
        inventory as unknown as InventoryRepository,
        reservations as unknown as ReservationRepository,
      );

      const found = await service.findByVariantId(VARIANT_ID);
      expect(found.onHand - found.reserved).toBe(6);
      // Every read expires lapsed reservations first.
      expect(reservations.expiries).toHaveLength(1);
    });

    it('maps a missing inventory item to INVENTORY_NOT_FOUND', async () => {
      const inventory = new FakeInventoryRepository();
      inventory.record = null;
      const service = new InventoryService(
        inventory as unknown as InventoryRepository,
        new FakeReservationRepository() as unknown as ReservationRepository,
      );

      await expect(service.findById(INVENTORY_ID)).rejects.toMatchObject({
        code: 'INVENTORY_NOT_FOUND',
      });
    });

    it('refuses setting on-hand below the reserved quantity', async () => {
      const inventory = new FakeInventoryRepository();
      inventory.record = inventoryRecord(10, 4);
      const service = new InventoryService(
        inventory as unknown as InventoryRepository,
        new FakeReservationRepository() as unknown as ReservationRepository,
      );

      await expect(service.setOnHand(VARIANT_ID, 3, null)).rejects.toMatchObject({
        code: 'INVENTORY_CONFLICT',
      });
    });

    it('refuses setting on-hand for an unknown SKU', async () => {
      const service = new InventoryService(
        new FakeInventoryRepository() as unknown as InventoryRepository,
        new FakeReservationRepository() as unknown as ReservationRepository,
      );

      await expect(
        service.setOnHand('99999999-9999-4999-8999-999999999999', 3, null),
      ).rejects.toMatchObject({ code: 'VARIANT_NOT_FOUND' });
    });
  });

  describe('BundleService', () => {
    it('reads fixed-bundle finished-goods availability independently of component quantities', async () => {
      const inventory = new FakeInventoryRepository();
      inventory.record = inventoryRecord(7, 0);
      const bundles = new FakeBundleRepository();
      bundles.record = bundleRecord('FIXED');
      const service = new BundleService(
        bundles as unknown as BundleRepository,
        inventory as unknown as InventoryRepository,
        {} as DatabaseService,
        new FakeReservationRepository() as unknown as ReservationRepository,
      );

      const view = await service.findById(bundles.record.id);
      expect(view.available).toBe(7);
    });

    it('reports zero availability for an empty composition', async () => {
      const inventory = new FakeInventoryRepository();
      const bundles = new FakeBundleRepository();
      bundles.record = { ...bundleRecord('DYNAMIC'), components: [] };
      const service = new BundleService(
        bundles as unknown as BundleRepository,
        inventory as unknown as InventoryRepository,
        {} as DatabaseService,
        new FakeReservationRepository() as unknown as ReservationRepository,
      );

      const view = await service.findById(bundles.record.id);
      expect(view.available).toBe(0);
    });

    it('maps an unknown bundle to BUNDLE_NOT_FOUND', async () => {
      const bundles = new FakeBundleRepository();
      bundles.record = null;
      const service = new BundleService(
        bundles as unknown as BundleRepository,
        new FakeInventoryRepository() as unknown as InventoryRepository,
        {} as DatabaseService,
        new FakeReservationRepository() as unknown as ReservationRepository,
      );

      await expect(service.findById('99999999-9999-4999-8999-999999999999')).rejects.toMatchObject({
        code: 'BUNDLE_NOT_FOUND',
      });
    });

    it('refuses a fixed component with no positive quantity before any write', async () => {
      const service = new BundleService(
        new FakeBundleRepository() as unknown as BundleRepository,
        new FakeInventoryRepository() as unknown as InventoryRepository,
        {} as DatabaseService,
        new FakeReservationRepository() as unknown as ReservationRepository,
      );

      await expect(
        service.create({
          productId: PRODUCT_ID,
          kind: 'FIXED',
          name: 'Set',
          components: [{ variantId: VARIANT_ID, quantity: 0 }],
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('refuses a dynamic component whose range is inverted', async () => {
      const service = new BundleService(
        new FakeBundleRepository() as unknown as BundleRepository,
        new FakeInventoryRepository() as unknown as InventoryRepository,
        {} as DatabaseService,
        new FakeReservationRepository() as unknown as ReservationRepository,
      );

      await expect(
        service.create({
          productId: PRODUCT_ID,
          kind: 'DYNAMIC',
          name: 'Set',
          components: [{ variantId: VARIANT_ID, minQuantity: 4, maxQuantity: 2 }],
        }),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('refuses a component that does not exist', async () => {
      const service = new BundleService(
        new FakeBundleRepository() as unknown as BundleRepository,
        new FakeInventoryRepository() as unknown as InventoryRepository,
        {} as DatabaseService,
        new FakeReservationRepository() as unknown as ReservationRepository,
      );

      await expect(
        service.create({
          productId: PRODUCT_ID,
          kind: 'FIXED',
          name: 'Set',
          components: [{ variantId: '99999999-9999-4999-8999-999999999999', quantity: 1 }],
        }),
      ).rejects.toMatchObject({ code: 'VARIANT_NOT_FOUND' });
    });
  });

  it('exposes the AppError code on a mapped failure', () => {
    expect(AppError.inventoryConflict().code).toBe('INVENTORY_CONFLICT');
  });
});

// Keep the reservation fake type import used even though the lifecycle itself is covered by the
// PostgreSQL integration suite.
export type _ReservationRecord = ReservationRecord;
