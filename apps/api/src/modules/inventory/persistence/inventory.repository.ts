import { CATALOG_PURCHASE_READER, type CatalogPurchaseReader } from '../../catalog';
import { AppError } from '../../../platform/http/app-error';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { DatabaseService } from '../../../platform/database/database.service';

/** The reservation lifecycle states. */
export type ReservationStatusValue = 'ACTIVE' | 'CONFIRMED' | 'RELEASED' | 'EXPIRED';

/** Why a SKU's quantity changed. */
export type StockMovementReasonValue =
  | 'ADJUSTMENT'
  | 'RESERVATION_CREATED'
  | 'RESERVATION_RELEASED'
  | 'RESERVATION_EXPIRED'
  | 'RESERVATION_CONFIRMED'
  | 'RESTOCK';

export interface InventoryItemRecord {
  readonly id: string;
  readonly variantId: string | null;
  readonly bundleId: string | null;
  readonly onHand: number;
  readonly reserved: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** One inventory item joined to the SKU and product it belongs to, for the administrative surface. */
export interface InventoryDetailRecord extends InventoryItemRecord {
  readonly sku: string | null;
  readonly productId: string | null;
  readonly productName: string | null;
}

export interface StockMovementRecord {
  readonly id: string;
  readonly reason: StockMovementReasonValue;
  readonly note: string | null;
  readonly onHandDelta: number;
  readonly reservedDelta: number;
  readonly onHandAfter: number;
  readonly reservedAfter: number;
  readonly reservationId: string | null;
  readonly createdAt: Date;
}

export interface InventoryListPage {
  readonly records: readonly InventoryDetailRecord[];
  readonly hasMore: boolean;
}

export interface InventoryListCursor {
  readonly sku: string;
  readonly id: string;
}

/** One SKU hold a reservation resolves to, already joined to its inventory row. */
export interface StockHold {
  readonly inventoryId: string;
  readonly variantId: string;
  readonly quantity: number;
}

const INVENTORY_SELECT = {
  id: true,
  variantId: true,
  bundleId: true,
  onHand: true,
  reserved: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.InventoryItemSelect;

const INVENTORY_DETAIL_SELECT = {
  ...INVENTORY_SELECT,
  bundle: { select: { productId: true, product: { select: { name: true } } } },
  variant: { select: { sku: true, product: { select: { id: true, name: true } } } },
} satisfies Prisma.InventoryItemSelect;

const MOVEMENT_SELECT = {
  id: true,
  reason: true,
  note: true,
  onHandDelta: true,
  reservedDelta: true,
  onHandAfter: true,
  reservedAfter: true,
  reservationId: true,
  createdAt: true,
} satisfies Prisma.StockMovementSelect;

type InventoryDetailRow = Prisma.InventoryItemGetPayload<{
  select: typeof INVENTORY_DETAIL_SELECT;
}>;

/** Flattens the joined SKU and product so a projection never has to reach through a nested shape. */
function toDetailRecord(row: InventoryDetailRow): InventoryDetailRecord {
  return {
    id: row.id,
    variantId: row.variantId,
    bundleId: row.bundleId,
    onHand: row.onHand,
    reserved: row.reserved,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    sku: row.variant?.sku ?? null,
    productId: row.variant?.product.id ?? row.bundle?.productId ?? null,
    productName: row.variant?.product.name ?? row.bundle?.product.name ?? null,
  };
}

/**
 * Persistence for per-SKU stock.
 *
 * The concurrency guarantee lives here: `reserve` performs a single conditional update whose `WHERE`
 * clause expresses `on_hand - reserved >= quantity`, so two racing reservations cannot both observe the
 * same available count and both succeed (constitution principle IV). The update and the matching
 * movement are written inside one transaction, so a movement can never describe a change that did not
 * happen.
 */
@Injectable()
export class InventoryRepository {
  public constructor(
    private readonly database: DatabaseService,
    @Inject(CATALOG_PURCHASE_READER) private readonly catalog: CatalogPurchaseReader,
  ) {}

  public async findById(id: string): Promise<InventoryDetailRecord | null> {
    const row = await this.database.prisma.inventoryItem.findUnique({
      where: { id },
      select: INVENTORY_DETAIL_SELECT,
    });
    return row === null ? null : toDetailRecord(row);
  }

  public async findByVariantId(variantId: string): Promise<InventoryDetailRecord | null> {
    const row = await this.database.prisma.inventoryItem.findUnique({
      where: { variantId },
      select: INVENTORY_DETAIL_SELECT,
    });
    return row === null ? null : toDetailRecord(row);
  }

  /** The catalog SKU behind an identifier, if it exists. Used to tell a 404 from a 409. */
  public async findVariant(
    variantId: string,
  ): Promise<{ readonly id: string; readonly productId: string } | null> {
    return this.catalog.variantFactsOf(variantId);
  }

  public async ensureForBundle(bundleId: string): Promise<InventoryItemRecord> {
    return this.database.prisma.inventoryItem.upsert({
      where: { bundleId },
      create: { bundleId },
      update: {},
      select: INVENTORY_SELECT,
    });
  }

  public async findByBundleId(bundleId: string): Promise<InventoryDetailRecord | null> {
    const row = await this.database.prisma.inventoryItem.findUnique({
      where: { bundleId },
      select: INVENTORY_DETAIL_SELECT,
    });
    return row === null ? null : toDetailRecord(row);
  }

  public async findVariantIdBySku(sku: string): Promise<string | null> {
    return this.catalog.variantIdBySku(sku);
  }

  public async list(
    limit: number,
    cursor: InventoryListCursor | null,
    productId: string | null,
  ): Promise<InventoryListPage> {
    const rows = await this.database.prisma.inventoryItem.findMany({
      where: {
        ...(productId === null
          ? {}
          : { OR: [{ variant: { productId } }, { bundle: { productId } }] }),
        ...(cursor === null
          ? {}
          : {
              AND: [
                cursor.sku === ''
                  ? { variantId: null, id: { gt: cursor.id } }
                  : {
                      OR: [
                        { variant: { sku: { gt: cursor.sku } } },
                        { variant: { sku: cursor.sku }, id: { gt: cursor.id } },
                        { variantId: null },
                      ],
                    },
              ],
            }),
      },
      orderBy: [{ variant: { sku: 'asc' } }, { id: 'asc' }],
      take: limit + 1,
      select: INVENTORY_DETAIL_SELECT,
    });
    const hasMore = rows.length > limit;
    return { records: (hasMore ? rows.slice(0, limit) : rows).map(toDetailRecord), hasMore };
  }

  /**
   * Sets the on-hand quantity, creating the row on first use. The database's non-negative `CHECK` is
   * the backstop; the service refuses a value below the reserved quantity before reaching here.
   */
  public async setOnHand(
    variantId: string,
    onHand: number,
    reason: string | null,
  ): Promise<InventoryDetailRecord> {
    return this.database.prisma.$transaction(async (transaction) => {
      // Native upsert takes the row lock (including first creation) before measuring the delta.
      const existing = await transaction.inventoryItem.upsert({
        where: { variantId },
        create: { variantId },
        update: { updatedAt: new Date() },
        select: INVENTORY_SELECT,
      });
      if (onHand < existing.reserved) throw AppError.inventoryConflict();
      const record = await transaction.inventoryItem.update({
        where: { id: existing.id },
        data: { onHand },
        select: INVENTORY_SELECT,
      });

      await transaction.stockMovement.create({
        data: {
          inventoryId: record.id,
          reason: 'ADJUSTMENT',
          note: reason,
          onHandDelta: onHand - (existing?.onHand ?? 0),
          reservedDelta: 0,
          onHandAfter: record.onHand,
          reservedAfter: record.reserved,
        },
      });
      return this.requireDetail(transaction, record.id);
    });
  }

  /**
   * Holds a quantity of one SKU atomically.
   */
  public async hold(
    transaction: Prisma.TransactionClient,
    inventoryId: string,
    quantity: number,
    reservationId: string,
  ): Promise<boolean> {
    const affected = await transaction.$executeRaw`
      UPDATE "inventory_items"
      SET "reserved" = "reserved" + ${quantity}
      WHERE "id" = ${inventoryId}::uuid AND ("on_hand" - "reserved") >= ${quantity}
    `;
    if (affected === 0) return false;

    const record = await transaction.inventoryItem.findUniqueOrThrow({
      where: { id: inventoryId },
      select: INVENTORY_SELECT,
    });
    await transaction.stockMovement.create({
      data: {
        inventoryId,
        reason: 'RESERVATION_CREATED',
        onHandDelta: 0,
        reservedDelta: quantity,
        onHandAfter: record.onHand,
        reservedAfter: record.reserved,
        reservationId,
      },
    });
    return true;
  }

  /** Returns a held quantity to available stock, recording the reason. */
  public async release(
    transaction: Prisma.TransactionClient,
    inventoryId: string,
    quantity: number,
    reservationId: string,
    reason: 'RESERVATION_RELEASED' | 'RESERVATION_EXPIRED',
  ): Promise<void> {
    const record = await transaction.inventoryItem.update({
      where: { id: inventoryId },
      data: { reserved: { decrement: quantity } },
      select: INVENTORY_SELECT,
    });
    await transaction.stockMovement.create({
      data: {
        inventoryId,
        reason,
        onHandDelta: 0,
        reservedDelta: -quantity,
        onHandAfter: record.onHand,
        reservedAfter: record.reserved,
        reservationId,
      },
    });
  }

  /** Permanently deducts a confirmed hold from both on-hand and reserved. */
  public async confirm(
    transaction: Prisma.TransactionClient,
    inventoryId: string,
    quantity: number,
    reservationId: string,
  ): Promise<void> {
    const record = await transaction.inventoryItem.update({
      where: { id: inventoryId },
      data: { onHand: { decrement: quantity }, reserved: { decrement: quantity } },
      select: INVENTORY_SELECT,
    });
    await transaction.stockMovement.create({
      data: {
        inventoryId,
        reason: 'RESERVATION_CONFIRMED',
        onHandDelta: -quantity,
        reservedDelta: -quantity,
        onHandAfter: record.onHand,
        reservedAfter: record.reserved,
        reservationId,
      },
    });
  }

  public async listMovements(
    inventoryId: string,
    limit: number,
    cursor: { readonly createdAt: Date; readonly id: string } | null,
  ): Promise<{ records: readonly StockMovementRecord[]; hasMore: boolean }> {
    const rows = await this.database.prisma.stockMovement.findMany({
      where: {
        inventoryId,
        ...(cursor === null
          ? {}
          : {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: MOVEMENT_SELECT,
    });
    const hasMore = rows.length > limit;
    return { records: hasMore ? rows.slice(0, limit) : rows, hasMore };
  }

  /** The inventory row behind a SKU, created on demand so a reservation can always resolve it. */
  public async ensureForVariant(variantId: string): Promise<InventoryItemRecord> {
    return this.database.prisma.inventoryItem.upsert({
      where: { variantId },
      create: { variantId },
      update: {},
      select: INVENTORY_SELECT,
    });
  }

  /**
   * The inventory row id behind a SKU, created on demand **inside the caller's transaction**, so the
   * reservation and the row it holds stock on commit or roll back together.
   */
  public async ensureForVariantWithin(
    transaction: Prisma.TransactionClient,
    variantId: string,
  ): Promise<string> {
    let row = await transaction.inventoryItem.findUnique({
      where: { variantId },
      select: { id: true },
    });
    if (row === null) {
      await transaction.$executeRaw`INSERT INTO inventory_items (id, variant_id, on_hand, reserved, created_at, updated_at)
        VALUES (gen_random_uuid(), ${variantId}::uuid, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (variant_id) DO NOTHING`;
      row = await transaction.inventoryItem.findUniqueOrThrow({
        where: { variantId },
        select: { id: true },
      });
    }
    return row.id;
  }

  /**
   * Puts goods back into sellable stock, idempotently.
   *
   * The business key is unique on the movement, so the restock happens **once**: the movement is
   * inserted with `ON CONFLICT DO NOTHING`, and the on-hand quantity is only incremented when that
   * insert actually created a row. The inventory row is locked first, so the recorded "after"
   * quantity is exact and two concurrent restocks of the same key cannot both increment.
   */
  public async restock(
    lines: readonly {
      readonly variantId: string | null;
      readonly bundleId: string | null;
      readonly quantity: number;
      readonly reference: string;
    }[],
    reason: string,
  ): Promise<{
    readonly applied: boolean;
    readonly lines: readonly {
      readonly variantId: string | null;
      readonly bundleId: string | null;
      readonly quantity: number;
      readonly reference: string;
      readonly applied: boolean;
      readonly onHand: number;
    }[];
  }> {
    return this.database.prisma.$transaction(async (transaction) => {
      const outcomes = [];
      for (const line of [...lines].sort((a, b) =>
        (a.bundleId ?? a.variantId ?? '').localeCompare(b.bundleId ?? b.variantId ?? ''),
      )) {
        if (line.bundleId !== null) {
          const bundle = await transaction.bundle.findUnique({
            where: { id: line.bundleId },
            select: { kind: true },
          });
          if (bundle?.kind !== 'FIXED') throw AppError.inventoryConflict();
        }
        const inventoryId =
          line.bundleId !== null
            ? await this.ensureForBundleWithin(transaction, line.bundleId)
            : await this.ensureForVariantWithin(transaction, line.variantId ?? '');

        // The row lock serialises the restocks of this item, so the "after" figure is exact.
        const current = await transaction.$queryRaw<{ on_hand: number; reserved: number }[]>`
          SELECT "on_hand", "reserved" FROM "inventory_items" WHERE "id" = ${inventoryId}::uuid FOR UPDATE
        `;
        const onHandBefore = current[0]?.on_hand ?? 0;
        const reserved = current[0]?.reserved ?? 0;
        const onHandAfter = onHandBefore + line.quantity;
        if (!Number.isSafeInteger(onHandAfter) || onHandAfter > 2147483647)
          throw AppError.inventoryConflict();

        // The unique business key makes the restock happen once. A conflict means it already happened.
        const inserted = await transaction.$executeRaw`
          INSERT INTO "stock_movements"
            ("id", "inventory_id", "reason", "note", "on_hand_delta", "reserved_delta", "on_hand_after", "reserved_after", "reference", "created_at")
          VALUES
            (gen_random_uuid(), ${inventoryId}::uuid, 'RESTOCK'::"StockMovementReason", ${reason}, ${line.quantity}, 0, ${onHandAfter}, ${reserved}, ${line.reference}, CURRENT_TIMESTAMP)
          ON CONFLICT ("reference") WHERE "reference" IS NOT NULL DO NOTHING
        `;

        if (inserted === 0) {
          const previous = await transaction.stockMovement.findUnique({
            where: { reference: line.reference },
            select: { inventoryId: true, onHandDelta: true },
          });
          if (previous?.inventoryId !== inventoryId || previous.onHandDelta !== line.quantity)
            throw AppError.inventoryConflict();
          outcomes.push({
            variantId: line.variantId,
            bundleId: line.bundleId,
            quantity: line.quantity,
            reference: line.reference,
            applied: false,
            onHand: onHandBefore,
          });
          continue;
        }

        await transaction.inventoryItem.update({
          where: { id: inventoryId },
          data: { onHand: { increment: line.quantity } },
          select: { id: true },
        });
        outcomes.push({
          variantId: line.variantId,
          bundleId: line.bundleId,
          quantity: line.quantity,
          reference: line.reference,
          applied: true,
          onHand: onHandAfter,
        });
      }
      return { applied: outcomes.some((outcome) => outcome.applied), lines: outcomes };
    });
  }

  /**
   * The inventory row id behind a bundle, created on demand **inside the caller's transaction**.
   */
  public async ensureForBundleWithin(
    transaction: Prisma.TransactionClient,
    bundleId: string,
  ): Promise<string> {
    let row = await transaction.inventoryItem.findUnique({
      where: { bundleId },
      select: { id: true },
    });
    if (row === null) {
      await transaction.$executeRaw`INSERT INTO inventory_items (id, bundle_id, on_hand, reserved, created_at, updated_at)
        VALUES (gen_random_uuid(), ${bundleId}::uuid, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (bundle_id) DO NOTHING`;
      row = await transaction.inventoryItem.findUniqueOrThrow({
        where: { bundleId },
        select: { id: true },
      });
    }
    return row.id;
  }

  private async requireDetail(
    transaction: Prisma.TransactionClient,
    id: string,
  ): Promise<InventoryDetailRecord> {
    const record = await transaction.inventoryItem.findUnique({
      where: { id },
      select: INVENTORY_DETAIL_SELECT,
    });
    if (record === null) throw new Error('Inventory item disappeared during a stock change');
    return toDetailRecord(record);
  }
}
