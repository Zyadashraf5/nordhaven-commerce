import { BadRequestException, Injectable } from '@nestjs/common';
import { AppError } from '../../../platform/http/app-error';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_RESERVATION_TTL_SECONDS,
  decodeInventoryCursor,
  decodeTimeCursor,
  encodeInventoryCursor,
  encodeTimeCursor,
} from '../api/inventory.support';
import {
  type InventoryDetailRecord,
  type InventoryListCursor,
  InventoryRepository,
  type StockMovementRecord,
} from '../persistence/inventory.repository';
import { ReservationRepository } from '../persistence/reservation.repository';
import { isRecordNotFoundError } from '../persistence/prisma-errors';

export interface InventoryPage {
  readonly records: readonly InventoryDetailRecord[];
  readonly nextCursor: string | null;
}

export interface MovementsPage {
  readonly records: readonly StockMovementRecord[];
  readonly nextCursor: string | null;
}

/**
 * Per-SKU stock administration.
 *
 * The service owns the business rules; the repository owns the atomicity. Every read expires lapsed
 * reservations first (lazy expiry, research R5), so an expired hold never reduces availability and no
 * scheduler is required.
 */
@Injectable()
export class InventoryService {
  public constructor(
    private readonly inventory: InventoryRepository,
    private readonly reservations: ReservationRepository,
  ) {}

  public async list(input: {
    readonly productId?: string | undefined;
    readonly limit?: number | undefined;
    readonly cursor?: string | undefined;
  }): Promise<InventoryPage> {
    await this.reservations.expireLapsed(new Date());
    const limit = input.limit ?? DEFAULT_PAGE_SIZE;
    const cursor: InventoryListCursor | null =
      input.cursor === undefined ? null : decodeInventoryCursor(input.cursor);
    if (input.cursor !== undefined && cursor === null) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [{ path: 'cursor', message: 'Invalid value' }],
      });
    }
    const page = await this.inventory.list(limit, cursor, input.productId ?? null);
    const last = page.records.at(-1);
    return {
      records: page.records,
      nextCursor:
        page.hasMore && last !== undefined
          ? encodeInventoryCursor({ sku: last.sku ?? '', id: last.id })
          : null,
    };
  }

  public async findById(id: string): Promise<InventoryDetailRecord> {
    await this.reservations.expireLapsed(new Date());
    const record = await this.inventory.findById(id);
    if (record === null) throw AppError.inventoryNotFound();
    return record;
  }

  public async findByVariantId(variantId: string): Promise<InventoryDetailRecord> {
    await this.reservations.expireLapsed(new Date());
    const record = await this.inventory.findByVariantId(variantId);
    if (record === null) throw AppError.inventoryNotFound();
    return record;
  }

  /**
   * Sets the on-hand quantity for one SKU.
   *
   * A reduction below what is already reserved is refused: it would leave held stock that does not
   * exist, so on-hand may never drop below reserved (research R4).
   */
  public async setOnHand(
    variantId: string,
    onHand: number,
    reason: string | null,
  ): Promise<InventoryDetailRecord> {
    await this.reservations.expireLapsed(new Date());
    if ((await this.inventory.findVariant(variantId)) === null) throw AppError.variantNotFound();
    const existing = await this.inventory.findByVariantId(variantId);
    if (existing !== null && onHand < existing.reserved) throw AppError.inventoryConflict();
    try {
      return await this.inventory.setOnHand(variantId, onHand, reason);
    } catch (error) {
      if (isRecordNotFoundError(error)) throw AppError.variantNotFound();
      throw error;
    }
  }

  public async listMovements(
    inventoryId: string,
    input: { readonly limit?: number | undefined; readonly cursor?: string | undefined },
  ): Promise<MovementsPage> {
    const inventory = await this.inventory.findById(inventoryId);
    if (inventory === null) throw AppError.inventoryNotFound();
    const limit = input.limit ?? DEFAULT_PAGE_SIZE;
    const decoded = input.cursor === undefined ? null : decodeTimeCursor(input.cursor);
    if (input.cursor !== undefined && decoded === null) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [{ path: 'cursor', message: 'Invalid value' }],
      });
    }
    const cursor =
      decoded === null ? null : { createdAt: new Date(decoded.timestamp), id: decoded.id };
    const page = await this.inventory.listMovements(inventoryId, limit, cursor);
    const last = page.records.at(-1);
    return {
      records: page.records,
      nextCursor:
        page.hasMore && last !== undefined
          ? encodeTimeCursor({ timestamp: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }
}

export const INVENTORY_DEFAULT_RESERVATION_TTL_SECONDS = DEFAULT_RESERVATION_TTL_SECONDS;
