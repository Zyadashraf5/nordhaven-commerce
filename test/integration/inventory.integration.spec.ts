import { InventoryReservationService } from '../../apps/api/src/modules/inventory/application/inventory-reservation.service';
import { createApplication } from '../../apps/api/src/bootstrap/create-application';
import { BrandService } from '../../apps/api/src/modules/catalog/application/brand.service';
import { CategoryService } from '../../apps/api/src/modules/catalog/application/category.service';
import { ProductService } from '../../apps/api/src/modules/catalog/application/product.service';
import { BundleService } from '../../apps/api/src/modules/inventory/application/bundle.service';
import { InventoryService } from '../../apps/api/src/modules/inventory/application/inventory.service';
import { ReservationService } from '../../apps/api/src/modules/inventory/application/reservation.service';
import { DatabaseService } from '../../apps/api/src/platform/database/database.service';
import { resetInventoryDatabase } from '../helpers/inventory-database';
import { testConfigurationFor } from '../helpers/test-configuration';

type Application = Awaited<ReturnType<typeof createApplication>>['app'];

interface SeededSku {
  readonly productId: string;
  readonly variantId: string;
  readonly sku: string;
}

describe('Inventory and Bundles persistence integration', () => {
  let app: Application;
  let database: DatabaseService;
  let categories: CategoryService;
  let brands: BrandService;
  let products: ProductService;
  let inventory: InventoryService;
  let bundles: BundleService;
  let reservations: ReservationService;

  beforeAll(async () => {
    const created = await createApplication({ configuration: testConfigurationFor('integration') });
    app = created.app;
    database = app.get(DatabaseService);
    categories = app.get(CategoryService);
    brands = app.get(BrandService);
    products = app.get(ProductService);
    inventory = app.get(InventoryService);
    bundles = app.get(BundleService);
    reservations = app.get(ReservationService);
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetInventoryDatabase(database);
  });

  afterEach(async () => {
    await resetInventoryDatabase(database);
  });

  /** Seeds a published product with one sellable SKU. */
  async function seedSku(sku: string, name = 'Oak Dining Table'): Promise<SeededSku> {
    const category = await categories.create({ name: `Furniture ${sku}` });
    const brand = await brands.create({ name: `Northwind ${sku}` });
    const product = await products.create({
      name,
      description: 'Solid oak.',
      categoryId: category.id,
      brandId: brand.id,
      basePriceMinor: 129900,
      baseCurrency: 'GBP',
    });
    const variant = await products.createVariant(product.id, { sku });
    return { productId: product.id, variantId: variant.id, sku };
  }

  /** Seeds a distinct product to carry a bundle (its components are other products' SKUs). */
  async function seedBundleProduct(name = 'Table and chairs set'): Promise<string> {
    const category = await categories.create({ name: `Bundles ${name}` });
    const brand = await brands.create({ name: `Northwind bundles ${name}` });
    const product = await products.create({
      name,
      description: 'A set.',
      categoryId: category.id,
      brandId: brand.id,
      basePriceMinor: 259900,
      baseCurrency: 'GBP',
    });
    return product.id;
  }

  describe('independent mixed-cart stock regressions', () => {
    it('holds every fixed bundle and SKU, combines shared dynamic components, and releases all once', async () => {
      const component = await seedSku('MIX-COMPONENT');
      await inventory.setOnHand(component.variantId, 20, null);
      const fixed = await bundles.create({
        productId: await seedBundleProduct('Mixed fixed'),
        kind: 'FIXED',
        name: 'Fixed',
        components: [{ variantId: component.variantId, quantity: 2 }],
      });
      const second = await bundles.create({
        productId: await seedBundleProduct('Mixed second'),
        kind: 'FIXED',
        name: 'Second',
        components: [{ variantId: component.variantId, quantity: 1 }],
      });
      const dynamic = await bundles.create({
        productId: await seedBundleProduct('Mixed dynamic'),
        kind: 'DYNAMIC',
        name: 'Dynamic',
        components: [{ variantId: component.variantId, minQuantity: 2, maxQuantity: 3 }],
      });
      await bundles.assemble(fixed.record.id, 3);
      await bundles.assemble(second.record.id, 2);
      const adapter = app.get(InventoryReservationService);
      const hold = await adapter.hold({
        idempotencyKey: 'mixed-audit',
        holds: [
          { kind: 'BUNDLE', bundleId: fixed.record.id, quantity: 1 },
          { kind: 'BUNDLE', bundleId: second.record.id, quantity: 2 },
          { kind: 'BUNDLE', bundleId: dynamic.record.id, quantity: 2 },
          { kind: 'VARIANT', sku: component.sku, quantity: 3 },
        ],
      });
      expect((await inventory.findByVariantId(component.variantId)).reserved).toBe(7);
      expect((await bundles.findById(fixed.record.id)).available).toBe(2);
      expect((await bundles.findById(second.record.id)).available).toBe(0);
      expect(
        await database.prisma.reservationLine.count({ where: { reservationId: hold.id } }),
      ).toBe(3);
      await adapter.release(hold.id);
      await adapter.release(hold.id);
      expect((await inventory.findByVariantId(component.variantId)).reserved).toBe(0);
      expect((await bundles.findById(fixed.record.id)).available).toBe(3);
      expect((await bundles.findById(second.record.id)).available).toBe(2);
    });
    it('rolls back every mixed-cart hold if any target has insufficient stock', async () => {
      const sku = await seedSku('MIX-ROLLBACK');
      await inventory.setOnHand(sku.variantId, 10, null);
      const fixed = await bundles.create({
        productId: await seedBundleProduct('Mixed unavailable'),
        kind: 'FIXED',
        name: 'Empty',
        components: [{ variantId: sku.variantId, quantity: 1 }],
      });
      await expect(
        app.get(InventoryReservationService).hold({
          idempotencyKey: 'mixed-rollback',
          holds: [
            { kind: 'VARIANT', sku: sku.sku, quantity: 3 },
            { kind: 'BUNDLE', bundleId: fixed.record.id, quantity: 1 },
          ],
        }),
      ).rejects.toMatchObject({ code: 'INVENTORY_CONFLICT' });
      expect((await inventory.findByVariantId(sku.variantId)).reserved).toBe(0);
      expect(await database.prisma.reservation.count()).toBe(0);
    });
  });

  describe('per-SKU stock', () => {
    it('creates on first set and records a movement for every change', async () => {
      const { variantId } = await seedSku('OAK-TABLE-01');

      const created = await inventory.setOnHand(variantId, 25, 'Goods received');
      expect(created).toMatchObject({ onHand: 25, reserved: 0 });
      expect(created.onHand - created.reserved).toBe(25);

      await inventory.setOnHand(variantId, 10, 'Stock count');
      const movements = await inventory.listMovements(created.id, {});
      expect(movements.records.map((movement) => movement.reason)).toEqual([
        'ADJUSTMENT',
        'ADJUSTMENT',
      ]);
      expect(movements.records[0]).toMatchObject({
        onHandDelta: -15,
        onHandAfter: 10,
        note: 'Stock count',
      });
    });

    it('refuses an on-hand value below the reserved quantity', async () => {
      const { variantId, sku } = await seedSku('OAK-TABLE-01');
      await inventory.setOnHand(variantId, 5, null);
      await reservations.create({ idempotencyKey: 'k1', lines: [{ sku, quantity: 4 }] });

      await expect(inventory.setOnHand(variantId, 3, null)).rejects.toMatchObject({
        code: 'INVENTORY_CONFLICT',
      });
      const item = await inventory.findByVariantId(variantId);
      expect(item.onHand).toBe(5);
    });

    it('refuses an unknown SKU', async () => {
      await expect(
        inventory.setOnHand('99999999-9999-4999-8999-999999999999', 1, null),
      ).rejects.toMatchObject({ code: 'VARIANT_NOT_FOUND' });
    });

    it('rejects a negative on-hand value at the database level', async () => {
      const { variantId } = await seedSku('OAK-TABLE-01');
      await expect(
        database.prisma.inventoryItem.create({ data: { variantId, onHand: -1 } }),
      ).rejects.toBeDefined();
    });
  });

  describe('reservations', () => {
    it('holds stock and derives available consistently', async () => {
      const { variantId, sku } = await seedSku('OAK-TABLE-01');
      await inventory.setOnHand(variantId, 10, null);

      const reservation = await reservations.create({
        idempotencyKey: 'k1',
        lines: [{ sku, quantity: 4 }],
      });
      expect(reservation.status).toBe('ACTIVE');
      expect(reservation.lines).toHaveLength(1);

      const item = await inventory.findByVariantId(variantId);
      expect(item.reserved).toBe(4);
      expect(item.onHand - item.reserved).toBe(6);
    });

    it('is idempotent on the key: a repeat holds no additional stock', async () => {
      const { variantId, sku } = await seedSku('OAK-TABLE-01');
      await inventory.setOnHand(variantId, 10, null);

      const first = await reservations.create({
        idempotencyKey: 'same',
        lines: [{ sku, quantity: 3 }],
      });
      const second = await reservations.create({
        idempotencyKey: 'same',
        lines: [{ sku, quantity: 3 }],
      });

      expect(second.id).toBe(first.id);
      const item = await inventory.findByVariantId(variantId);
      expect(item.reserved).toBe(3);
    });

    it('leaves no partial hold when any line is unavailable (all-or-nothing)', async () => {
      const first = await seedSku('OAK-TABLE-01');
      const second = await seedSku('OAK-BENCH-01', 'Oak Bench');
      await inventory.setOnHand(first.variantId, 10, null);
      await inventory.setOnHand(second.variantId, 1, null);

      await expect(
        reservations.create({
          idempotencyKey: 'k1',
          lines: [
            { sku: first.sku, quantity: 5 },
            { sku: second.sku, quantity: 2 },
          ],
        }),
      ).rejects.toMatchObject({ code: 'INVENTORY_CONFLICT' });

      const firstItem = await inventory.findByVariantId(first.variantId);
      expect(firstItem.reserved).toBe(0);
      expect(await database.prisma.reservation.count()).toBe(0);
    });

    it('lets exactly M of N concurrent reservations win the last units', async () => {
      const { variantId, sku } = await seedSku('OAK-TABLE-01');
      await inventory.setOnHand(variantId, 5, null);

      const attempts = Array.from({ length: 12 }, (_, index) =>
        reservations.create({
          idempotencyKey: `concurrent-${index}`,
          lines: [{ sku, quantity: 1 }],
        }),
      );
      const results = await Promise.allSettled(attempts);
      const fulfilled = results.filter((result) => result.status === 'fulfilled').length;

      expect(fulfilled).toBe(5);
      const item = await inventory.findByVariantId(variantId);
      expect(item.reserved).toBe(5);
      expect(item.onHand - item.reserved).toBe(0);
      expect(item.reserved).toBeLessThanOrEqual(item.onHand);
    });

    it('confirms a reservation and permanently deducts stock', async () => {
      const { variantId, sku } = await seedSku('OAK-TABLE-01');
      await inventory.setOnHand(variantId, 10, null);
      const reservation = await reservations.create({
        idempotencyKey: 'k1',
        lines: [{ sku, quantity: 4 }],
      });

      const confirmed = await reservations.confirm(reservation.id);
      expect(confirmed.status).toBe('CONFIRMED');
      const item = await inventory.findByVariantId(variantId);
      expect(item.onHand).toBe(6);
      expect(item.reserved).toBe(0);
    });

    it('confirming twice is an idempotent no-op', async () => {
      const { variantId, sku } = await seedSku('OAK-TABLE-01');
      await inventory.setOnHand(variantId, 10, null);
      const reservation = await reservations.create({
        idempotencyKey: 'k1',
        lines: [{ sku, quantity: 4 }],
      });

      await reservations.confirm(reservation.id);
      const second = await reservations.confirm(reservation.id);
      expect(second.status).toBe('CONFIRMED');
      const item = await inventory.findByVariantId(variantId);
      expect(item.onHand).toBe(6);
    });

    it('releases a reservation and returns the held stock', async () => {
      const { variantId, sku } = await seedSku('OAK-TABLE-01');
      await inventory.setOnHand(variantId, 10, null);
      const reservation = await reservations.create({
        idempotencyKey: 'k1',
        lines: [{ sku, quantity: 4 }],
      });

      const released = await reservations.release(reservation.id);
      expect(released.status).toBe('RELEASED');
      const item = await inventory.findByVariantId(variantId);
      expect(item.reserved).toBe(0);
      expect(item.onHand).toBe(10);
    });

    it('releasing twice is an idempotent no-op', async () => {
      const { variantId, sku } = await seedSku('OAK-TABLE-01');
      await inventory.setOnHand(variantId, 10, null);
      const reservation = await reservations.create({
        idempotencyKey: 'k1',
        lines: [{ sku, quantity: 4 }],
      });

      await reservations.release(reservation.id);
      const second = await reservations.release(reservation.id);
      expect(second.status).toBe('RELEASED');
      const item = await inventory.findByVariantId(variantId);
      expect(item.reserved).toBe(0);
    });

    it('refuses confirming a released reservation', async () => {
      const { variantId, sku } = await seedSku('OAK-TABLE-01');
      await inventory.setOnHand(variantId, 10, null);
      const reservation = await reservations.create({
        idempotencyKey: 'k1',
        lines: [{ sku, quantity: 4 }],
      });
      await reservations.release(reservation.id);

      await expect(reservations.confirm(reservation.id)).rejects.toMatchObject({
        code: 'INVENTORY_CONFLICT',
      });
    });

    it('expires a lapsed reservation lazily and returns the held stock', async () => {
      const { variantId, sku } = await seedSku('OAK-TABLE-01');
      await inventory.setOnHand(variantId, 10, null);
      const reservation = await reservations.create({
        idempotencyKey: 'k1',
        expiresInSeconds: 60,
        lines: [{ sku, quantity: 4 }],
      });
      await database.prisma.reservation.update({
        where: { id: reservation.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const item = await inventory.findByVariantId(variantId);
      expect(item.reserved).toBe(0);

      const expired = await reservations.findById(reservation.id);
      expect(expired.status).toBe('EXPIRED');
    });

    it('refuses extending a terminal reservation', async () => {
      const { variantId, sku } = await seedSku('OAK-TABLE-01');
      await inventory.setOnHand(variantId, 10, null);
      const reservation = await reservations.create({
        idempotencyKey: 'k1',
        lines: [{ sku, quantity: 4 }],
      });
      await reservations.release(reservation.id);

      await expect(reservations.extend(reservation.id, 60)).rejects.toMatchObject({
        code: 'INVENTORY_CONFLICT',
      });
    });

    it('extends an active reservation', async () => {
      const { variantId, sku } = await seedSku('OAK-TABLE-01');
      await inventory.setOnHand(variantId, 10, null);
      const reservation = await reservations.create({
        idempotencyKey: 'k1',
        lines: [{ sku, quantity: 4 }],
      });

      const extended = await reservations.extend(reservation.id, 120);
      expect(extended.expiresAt.getTime()).toBeGreaterThan(reservation.expiresAt.getTime());
    });

    it('refuses a reservation for an unknown SKU', async () => {
      await expect(
        reservations.create({ idempotencyKey: 'k1', lines: [{ sku: 'MISSING-01', quantity: 1 }] }),
      ).rejects.toMatchObject({ code: 'INVENTORY_NOT_FOUND' });
    });
  });

  describe('bundles', () => {
    it('starts fixed bundles empty and makes stock available only after assembly', async () => {
      const chair = await seedSku('OAK-CHAIR-01', 'Oak Chair');
      const table = await seedSku('OAK-TABLE-01');
      await inventory.setOnHand(chair.variantId, 10, null);
      await inventory.setOnHand(table.variantId, 4, null);

      const bundle = await bundles.create({
        productId: await seedBundleProduct(),
        kind: 'FIXED',
        name: 'Table and two chairs',
        components: [
          { variantId: table.variantId, quantity: 1 },
          { variantId: chair.variantId, quantity: 2 },
        ],
      });
      expect(bundle.available).toBe(0);
      const assembled = await bundles.assemble(bundle.record.id, 4);
      expect(assembled.available).toBe(4);
      expect((await inventory.findByVariantId(table.variantId)).onHand).toBe(0);
      expect((await inventory.findByVariantId(chair.variantId)).onHand).toBe(2);
    });

    it('reserves finished fixed goods without holding components twice', async () => {
      const chair = await seedSku('OAK-CHAIR-01', 'Oak Chair');
      const table = await seedSku('OAK-TABLE-01');
      await inventory.setOnHand(chair.variantId, 10, null);
      await inventory.setOnHand(table.variantId, 10, null);

      const bundle = await bundles.create({
        productId: await seedBundleProduct(),
        kind: 'FIXED',
        name: 'Table and two chairs',
        components: [
          { variantId: table.variantId, quantity: 1 },
          { variantId: chair.variantId, quantity: 2 },
        ],
      });

      await bundles.assemble(bundle.record.id, 3);
      const reservation = await reservations.create({
        idempotencyKey: 'bundle-1',
        bundleId: bundle.record.id,
        quantity: 3,
      });
      expect(reservation.lines).toHaveLength(1);
      expect(reservation.lines[0]?.variantId).toBeNull();
      const finished = await database.prisma.inventoryItem.findUniqueOrThrow({
        where: { bundleId: bundle.record.id },
      });
      expect(finished).toMatchObject({ onHand: 3, reserved: 3 });
      const tableItem = await inventory.findByVariantId(table.variantId);
      const chairItem = await inventory.findByVariantId(chair.variantId);
      expect(tableItem).toMatchObject({ onHand: 7, reserved: 0 });
      expect(chairItem).toMatchObject({ onHand: 4, reserved: 0 });
    });

    it('leaves no partial hold when a bundle component is unavailable', async () => {
      const chair = await seedSku('OAK-CHAIR-01', 'Oak Chair');
      const table = await seedSku('OAK-TABLE-01');
      await inventory.setOnHand(chair.variantId, 1, null);
      await inventory.setOnHand(table.variantId, 10, null);

      const bundle = await bundles.create({
        productId: await seedBundleProduct(),
        kind: 'FIXED',
        name: 'Table and two chairs',
        components: [
          { variantId: table.variantId, quantity: 1 },
          { variantId: chair.variantId, quantity: 2 },
        ],
      });

      await expect(
        reservations.create({
          idempotencyKey: 'bundle-1',
          bundleId: bundle.record.id,
          quantity: 1,
        }),
      ).rejects.toMatchObject({ code: 'INVENTORY_CONFLICT' });

      const tableItem = await inventory.findByVariantId(table.variantId);
      expect(tableItem.reserved).toBe(0);
    });

    it('conserves components across assembly/disassembly, audits deltas, and protects reserved goods', async () => {
      const chair = await seedSku('CONSERVATION');
      await inventory.setOnHand(chair.variantId, 10, null);
      const bundle = await bundles.create({
        productId: await seedBundleProduct(),
        kind: 'FIXED',
        name: 'Set',
        components: [{ variantId: chair.variantId, quantity: 2 }],
      });
      const id = bundle.record.id;
      await bundles.assemble(id, 4, 'tracked');
      const hold = await reservations.create({
        idempotencyKey: 'fixed-hold',
        bundleId: id,
        quantity: 3,
      });
      const count = await database.prisma.stockMovement.count();
      await expect(bundles.disassemble(id, 2)).rejects.toMatchObject({
        code: 'INVENTORY_CONFLICT',
      });
      expect(await database.prisma.stockMovement.count()).toBe(count);
      expect((await bundles.disassemble(id, 1)).available).toBe(0);
      expect((await inventory.findByVariantId(chair.variantId)).onHand).toBe(4);
      await reservations.release(hold.id);
      expect((await bundles.disassemble(id, 3)).available).toBe(0);
      expect((await inventory.findByVariantId(chair.variantId)).onHand).toBe(10);
      const moves = await database.prisma.stockMovement.findMany();
      expect(moves.reduce((sum, m) => sum + m.onHandDelta, 0)).toBe(10);
      expect(moves.filter((m) => m.note?.includes(id))).toHaveLength(6);
      for (const m of moves) {
        expect(m.onHandAfter).toBeGreaterThanOrEqual(m.reservedAfter);
        expect(m.reservedAfter).toBeGreaterThanOrEqual(0);
      }
    });

    it('rolls back inventory creation, all component changes and audit on insufficient components', async () => {
      const a = await seedSku('ROLLBACK-A');
      const b = await seedSku('ROLLBACK-B', 'Rollback B');
      await inventory.setOnHand(a.variantId, 8, null);
      await inventory.setOnHand(b.variantId, 0, null);
      const bundle = await bundles.create({
        productId: await seedBundleProduct(),
        kind: 'FIXED',
        name: 'Set',
        components: [
          { variantId: a.variantId, quantity: 2 },
          { variantId: b.variantId, quantity: 1 },
        ],
      });
      const snapshot = await database.prisma.inventoryItem.findMany({ orderBy: { id: 'asc' } });
      const count = await database.prisma.stockMovement.count();
      await expect(bundles.assemble(bundle.record.id, 1)).rejects.toMatchObject({
        code: 'INVENTORY_CONFLICT',
      });
      expect(await database.prisma.inventoryItem.findMany({ orderBy: { id: 'asc' } })).toEqual(
        snapshot,
      );
      expect(await database.prisma.stockMovement.count()).toBe(count);
    });

    it('allows only available concurrent assemblies and disassemblies with no negative stock', async () => {
      const chair = await seedSku('RACE');
      await inventory.setOnHand(chair.variantId, 10, null);
      const bundle = await bundles.create({
        productId: await seedBundleProduct(),
        kind: 'FIXED',
        name: 'Set',
        components: [{ variantId: chair.variantId, quantity: 2 }],
      });
      const assembled = await Promise.allSettled(
        Array.from({ length: 12 }, () => bundles.assemble(bundle.record.id, 1)),
      );
      expect(assembled.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
      for (const r of assembled)
        if (r.status === 'rejected') expect(r.reason).toMatchObject({ code: 'INVENTORY_CONFLICT' });
      expect((await inventory.findByVariantId(chair.variantId)).onHand).toBe(0);
      const holds = await Promise.allSettled(
        Array.from({ length: 12 }, (_, i) =>
          reservations.create({
            idempotencyKey: 'fixed-race-' + i,
            bundleId: bundle.record.id,
            quantity: 1,
          }),
        ),
      );
      expect(holds.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
      await expect(bundles.disassemble(bundle.record.id, 1)).rejects.toMatchObject({
        code: 'INVENTORY_CONFLICT',
      });
      for (const r of holds) if (r.status === 'fulfilled') await reservations.release(r.value.id);
      const reversed = await Promise.allSettled(
        Array.from({ length: 12 }, () => bundles.disassemble(bundle.record.id, 1)),
      );
      expect(reversed.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
      expect((await inventory.findByVariantId(chair.variantId)).onHand).toBe(10);
      expect((await bundles.findById(bundle.record.id)).available).toBe(0);
    });

    it('prevents changing stocked composition and rejects non-integer operations and dynamic assembly', async () => {
      const chair = await seedSku('IMMUTABLE');
      await inventory.setOnHand(chair.variantId, 10, null);
      const bundle = await bundles.create({
        productId: await seedBundleProduct(),
        kind: 'FIXED',
        name: 'Set',
        components: [{ variantId: chair.variantId, quantity: 2 }],
      });
      await bundles.assemble(bundle.record.id, 1);
      await expect(
        bundles.update(bundle.record.id, {
          components: [{ variantId: chair.variantId, quantity: 1 }],
        }),
      ).rejects.toMatchObject({ code: 'INVENTORY_CONFLICT' });
      for (const quantity of [0, -1, 0.5, NaN, 10001])
        await expect(bundles.assemble(bundle.record.id, quantity)).rejects.toMatchObject({
          status: 400,
        });
      const dynamic = await bundles.create({
        productId: await seedBundleProduct('Dynamic'),
        kind: 'DYNAMIC',
        name: 'Dynamic',
        components: [{ variantId: chair.variantId, minQuantity: 2, maxQuantity: 4 }],
      });
      expect(dynamic.available).toBe(4);
      await expect(bundles.assemble(dynamic.record.id, 1)).rejects.toMatchObject({
        code: 'INVENTORY_CONFLICT',
      });
      await expect(bundles.disassemble(dynamic.record.id, 1)).rejects.toMatchObject({
        code: 'INVENTORY_CONFLICT',
      });
      const chosen = await reservations.create({
        idempotencyKey: 'chosen',
        lines: [{ sku: chair.sku, quantity: 3 }],
      });
      expect(chosen.lines[0]?.quantity).toBe(3);
    });

    it('paginates finished goods without skipping null SKUs and filters by bundle product', async () => {
      const chair = await seedSku('PAGING');
      await inventory.setOnHand(chair.variantId, 10, null);
      const ids: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        const productId = await seedBundleProduct('Page ' + i);
        const bundle = await bundles.create({
          productId,
          kind: 'FIXED',
          name: 'Page ' + i,
          components: [{ variantId: chair.variantId, quantity: 1 }],
        });
        await bundles.assemble(bundle.record.id, 1);
        const filtered = await inventory.list({ productId });
        expect(filtered.records).toHaveLength(1);
        expect(filtered.records[0]).toMatchObject({
          bundleId: bundle.record.id,
          productId,
          sku: null,
        });
      }
      let cursor: string | undefined;
      for (let i = 0; i < 5; i += 1) {
        const page = await inventory.list({
          limit: 1,
          ...(cursor === undefined ? {} : { cursor }),
        });
        ids.push(...page.records.map((r) => r.id));
        if (page.nextCursor === null) break;
        cursor = page.nextCursor;
      }
      expect(ids).toHaveLength(4);
      expect(new Set(ids).size).toBe(4);
    });

    it('protects shared components across different concurrent fixed bundles', async () => {
      const chair = await seedSku('SHARED');
      await inventory.setOnHand(chair.variantId, 3, null);
      const sets = await Promise.all(
        [0, 1].map(async (i) =>
          bundles.create({
            productId: await seedBundleProduct('Shared ' + i),
            kind: 'FIXED',
            name: 'Shared ' + i,
            components: [{ variantId: chair.variantId, quantity: 2 }],
          }),
        ),
      );
      const results = await Promise.allSettled(sets.map((b) => bundles.assemble(b.record.id, 1)));
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect((await inventory.findByVariantId(chair.variantId)).onHand).toBe(1);
      expect(
        await database.prisma.inventoryItem.count({ where: { bundleId: { not: null } } }),
      ).toBe(1);
    });

    it('expires finished-goods reservations before bundle availability and disassembly', async () => {
      const chair = await seedSku('EXPIRY');
      await inventory.setOnHand(chair.variantId, 2, null);
      const bundle = await bundles.create({
        productId: await seedBundleProduct(),
        kind: 'FIXED',
        name: 'Expiry',
        components: [{ variantId: chair.variantId, quantity: 2 }],
      });
      await bundles.assemble(bundle.record.id, 1);
      const held = await reservations.create({
        idempotencyKey: 'expiry-fixed',
        bundleId: bundle.record.id,
        quantity: 1,
      });
      expect((await bundles.findById(bundle.record.id)).available).toBe(0);
      await database.prisma.reservation.update({
        where: { id: held.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect((await bundles.findById(bundle.record.id)).available).toBe(1);
      await bundles.disassemble(bundle.record.id, 1);
      expect((await inventory.findByVariantId(chair.variantId)).onHand).toBe(2);
      expect((await reservations.findById(held.id)).status).toBe('EXPIRED');
    });

    it('enforces owner and available-stock invariants in PostgreSQL as well as services', async () => {
      const chair = await seedSku('DB-CONSTRAINT');
      await inventory.setOnHand(chair.variantId, 2, null);
      await expect(database.prisma.inventoryItem.create({ data: {} })).rejects.toThrow();
      await expect(
        database.prisma.inventoryItem.update({
          where: { variantId: chair.variantId },
          data: { reserved: 3 },
        }),
      ).rejects.toThrow();
      const bundle = await bundles.create({
        productId: await seedBundleProduct(),
        kind: 'FIXED',
        name: 'Constraints',
        components: [{ variantId: chair.variantId, quantity: 1 }],
      });
      await expect(
        database.prisma.inventoryItem.update({
          where: { variantId: chair.variantId },
          data: { bundleId: bundle.record.id },
        }),
      ).rejects.toThrow();
      expect((await inventory.findByVariantId(chair.variantId)).reserved).toBe(0);
    });

    it('refuses a bundle for a product that already has one', async () => {
      const chair = await seedSku('OAK-CHAIR-01', 'Oak Chair');
      const bundleProductId = await seedBundleProduct();
      await bundles.create({
        productId: bundleProductId,
        kind: 'FIXED',
        name: 'Set',
        components: [{ variantId: chair.variantId, quantity: 1 }],
      });

      await expect(
        bundles.create({
          productId: bundleProductId,
          kind: 'FIXED',
          name: 'Another set',
          components: [{ variantId: chair.variantId, quantity: 1 }],
        }),
      ).rejects.toMatchObject({ code: 'INVENTORY_CONFLICT' });
    });

    it('refuses a component SKU that does not exist', async () => {
      await expect(
        bundles.create({
          productId: await seedBundleProduct(),
          kind: 'FIXED',
          name: 'Set',
          components: [{ variantId: '99999999-9999-4999-8999-999999999999', quantity: 1 }],
        }),
      ).rejects.toMatchObject({ code: 'VARIANT_NOT_FOUND' });
    });

    it('replaces a bundle composition atomically', async () => {
      const chair = await seedSku('OAK-CHAIR-01', 'Oak Chair');
      const stool = await seedSku('OAK-STOOL-01', 'Oak Stool');
      await inventory.setOnHand(stool.variantId, 8, null);
      const bundle = await bundles.create({
        productId: await seedBundleProduct(),
        kind: 'FIXED',
        name: 'Set',
        components: [{ variantId: chair.variantId, quantity: 2 }],
      });

      const updated = await bundles.update(bundle.record.id, {
        components: [{ variantId: stool.variantId, quantity: 1 }],
      });
      expect(updated.record.components.map((component) => component.sku)).toEqual(['OAK-STOOL-01']);
      expect(updated.available).toBe(0);
      expect((await bundles.assemble(bundle.record.id, 8)).available).toBe(8);
    });

    it('refuses reserving a dynamic bundle by quantity', async () => {
      const chair = await seedSku('OAK-CHAIR-01', 'Oak Chair');
      const bundle = await bundles.create({
        productId: await seedBundleProduct('Pick your set'),
        kind: 'DYNAMIC',
        name: 'Pick your set',
        components: [{ variantId: chair.variantId, minQuantity: 2, maxQuantity: 4 }],
      });

      await expect(
        reservations.create({ idempotencyKey: 'dyn-1', bundleId: bundle.record.id, quantity: 1 }),
      ).rejects.toMatchObject({ code: 'INVENTORY_CONFLICT' });
    });
  });
});
