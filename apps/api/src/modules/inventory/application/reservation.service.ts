import type { ReservationHold } from '../contracts';
import { BadRequestException, Injectable } from '@nestjs/common';
import { AppError } from '../../../platform/http/app-error';
import { DatabaseService } from '../../../platform/database/database.service';
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_RESERVATION_TTL_SECONDS,
  MAX_RESERVATION_TTL_SECONDS,
  decodeTimeCursor,
  encodeTimeCursor,
} from '../api/inventory.support';
import { BundleRepository } from '../persistence/bundle.repository';
import { InventoryRepository } from '../persistence/inventory.repository';
import { isUniqueConstraintViolation } from '../persistence/prisma-errors';
import {
  type ReservationRecord,
  ReservationRepository,
} from '../persistence/reservation.repository';

export interface ReservationPage {
  readonly records: readonly ReservationRecord[];
  readonly nextCursor: string | null;
}

export interface ReservationLineRequestInput {
  readonly sku: string;
  readonly quantity: number;
}

export interface ReservationCreateInput {
  readonly holds?: readonly ReservationHold[];
  readonly idempotencyKey: string;
  readonly expiresInSeconds?: number | undefined;
  readonly lines?: readonly ReservationLineRequestInput[] | undefined;
  readonly bundleId?: string | undefined;
  readonly quantity?: number | undefined;
}

/** One resolved SKU hold, before it is attached to an inventory row. */
interface ResolvedHold {
  readonly variantId?: string;
  readonly bundleId?: string;
  readonly quantity: number;
}

/**
 * The reservation lifecycle.
 *
 * A reservation is the atomic promise that a set of quantities is held but not yet sold. Creating one
 * is idempotent on `idempotencyKey`, all-or-nothing across its lines, and safe under concurrency because
 * every hold is a single conditional database update. FIXED reservations hold finished goods; DYNAMIC selections hold explicit component SKU lines (HC-DEC-017).
 */
@Injectable()
export class ReservationService {
  public constructor(
    private readonly database: DatabaseService,
    private readonly inventory: InventoryRepository,
    private readonly bundles: BundleRepository,
    private readonly reservations: ReservationRepository,
  ) {}

  public async create(input: ReservationCreateInput): Promise<ReservationRecord> {
    // Idempotency first: a repeated key returns the original reservation and holds nothing more.
    const existing = await this.reservations.findByIdempotencyKey(input.idempotencyKey);
    if (existing !== null) return existing;

    await this.reservations.expireLapsed(new Date());

    const holds = [...(await this.resolveHolds(input))].sort((a, b) =>
      (a.bundleId ?? a.variantId ?? '').localeCompare(b.bundleId ?? b.variantId ?? ''),
    );
    const now = new Date();
    const ttl = input.expiresInSeconds ?? DEFAULT_RESERVATION_TTL_SECONDS;
    const expiresAt = new Date(now.getTime() + Math.min(ttl, MAX_RESERVATION_TTL_SECONDS) * 1000);

    try {
      return await this.database.prisma.$transaction(async (transaction) => {
        const reservation = await this.reservations.create(transaction, {
          idempotencyKey: input.idempotencyKey,
          expiresAt,
          lines: [],
        });

        const resolved: { inventoryId: string; quantity: number }[] = [];
        for (const hold of holds) {
          if (hold.bundleId !== undefined) {
            const item = await transaction.inventoryItem.findUnique({
              where: { bundleId: hold.bundleId },
            });
            if (item === null) throw AppError.inventoryConflict();
            resolved.push({ inventoryId: item.id, quantity: hold.quantity });
          } else if (hold.variantId !== undefined) {
            resolved.push({
              inventoryId: await this.inventory.ensureForVariantWithin(transaction, hold.variantId),
              quantity: hold.quantity,
            });
          }
        }
        // Every multi-row inventory writer uses inventory UUID order, never variant/line UUID order.
        resolved.sort((a, b) => a.inventoryId.localeCompare(b.inventoryId));
        for (const hold of resolved) {
          if (
            !(await this.inventory.hold(
              transaction,
              hold.inventoryId,
              hold.quantity,
              reservation.id,
            ))
          )
            throw AppError.inventoryConflict();
          await transaction.reservationLine.create({
            data: { reservationId: reservation.id, ...hold },
          });
        }

        const created = await this.reservations.findByIdWithin(transaction, reservation.id);
        if (created === null) throw new Error('Reservation disappeared during creation');
        return created;
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        // A concurrent request with the same key won the race; return its reservation.
        const winner = await this.reservations.findByIdempotencyKey(input.idempotencyKey);
        if (winner !== null) return winner;
      }
      throw error;
    }
  }

  public async canHold(holds: readonly ReservationHold[]): Promise<boolean> {
    if (holds.length === 0) return true;
    await this.reservations.expireLapsed(new Date());
    const combined = await this.resolveHolds({ idempotencyKey: 'availability-only', holds });
    for (const hold of combined) {
      const item =
        hold.bundleId !== undefined
          ? await this.inventory.findByBundleId(hold.bundleId)
          : await this.inventory.findByVariantId(hold.variantId ?? '');
      if (item === null || item.onHand - item.reserved < hold.quantity) return false;
    }
    return true;
  }

  public async matchesHolds(id: string, holds: readonly ReservationHold[]): Promise<boolean> {
    const reservation = await this.findById(id);
    if (reservation.status !== 'ACTIVE') return false;
    const resolved = await this.resolveHolds({ idempotencyKey: 'comparison-only', holds });
    const expected: { inventoryId: string; quantity: number }[] = [];
    for (const hold of resolved) {
      const item =
        hold.bundleId !== undefined
          ? await this.inventory.findByBundleId(hold.bundleId)
          : await this.inventory.findByVariantId(hold.variantId ?? '');
      if (item === null) return false;
      expected.push({ inventoryId: item.id, quantity: hold.quantity });
    }
    const key = (lines: readonly { inventoryId: string; quantity: number }[]) =>
      lines
        .map((line) => `${line.inventoryId}:${line.quantity}`)
        .sort()
        .join('|');
    return key(expected) === key(reservation.lines);
  }

  public async findById(id: string): Promise<ReservationRecord> {
    await this.reservations.expireLapsed(new Date());
    const reservation = await this.reservations.findById(id);
    if (reservation === null) throw AppError.reservationNotFound();
    return reservation;
  }

  public async list(input: {
    readonly status?: ReservationRecord['status'] | undefined;
    readonly limit?: number | undefined;
    readonly cursor?: string | undefined;
  }): Promise<ReservationPage> {
    await this.reservations.expireLapsed(new Date());
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
    const page = await this.reservations.list(limit, cursor, input.status ?? null);
    const last = page.records.at(-1);
    return {
      records: page.records,
      nextCursor:
        page.hasMore && last !== undefined
          ? encodeTimeCursor({ timestamp: last.createdAt.toISOString(), id: last.id })
          : null,
    };
  }

  /**
   * Extends an active reservation's expiry. A terminal reservation is refused: extending a released or
   * confirmed hold would imply stock that is no longer held.
   */
  public async extend(id: string, extendBySeconds: number): Promise<ReservationRecord> {
    const reservation = await this.findById(id);
    if (reservation.status !== 'ACTIVE') throw AppError.inventoryConflict();
    return this.reservations.extend(id, extendBySeconds);
  }

  /**
   * Confirms a reservation: the held stock is permanently deducted.
   *
   * Idempotent — confirming an already-confirmed reservation returns it unchanged; confirming a released
   * or expired reservation is refused rather than silently succeeding.
   */
  public async confirm(id: string): Promise<ReservationRecord> {
    await this.reservations.expireLapsed(new Date());
    const reservation = await this.requireReservation(id);
    if (reservation.status === 'CONFIRMED') return reservation;
    if (reservation.status !== 'ACTIVE') throw AppError.inventoryConflict();

    return this.database.prisma.$transaction(async (transaction) => {
      const claimed = await this.reservations.claimTerminal(transaction, id, 'CONFIRMED');
      if (claimed === 0) {
        const current = await this.reservations.findByIdWithin(transaction, id);
        if (current === null) throw AppError.reservationNotFound();
        if (current.status !== 'CONFIRMED') throw AppError.inventoryConflict();
        return current;
      }
      for (const line of reservation.lines) {
        await this.inventory.confirm(transaction, line.inventoryId, line.quantity, id);
      }
      const confirmed = await this.reservations.findByIdWithin(transaction, id);
      if (confirmed === null) throw AppError.reservationNotFound();
      return confirmed;
    });
  }

  /**
   * Releases a reservation: the held stock returns to available. Idempotent for a released reservation,
   * and a no-op for an already-expired one (its holds were returned by lazy expiry).
   */
  public async release(id: string): Promise<ReservationRecord> {
    await this.reservations.expireLapsed(new Date());
    const reservation = await this.requireReservation(id);
    if (reservation.status === 'RELEASED' || reservation.status === 'EXPIRED') return reservation;
    if (reservation.status !== 'ACTIVE') throw AppError.inventoryConflict();

    return this.database.prisma.$transaction(async (transaction) => {
      const claimed = await this.reservations.claimTerminal(transaction, id, 'RELEASED');
      if (claimed === 0) {
        const current = await this.reservations.findByIdWithin(transaction, id);
        if (current === null) throw AppError.reservationNotFound();
        if (current.status !== 'RELEASED' && current.status !== 'EXPIRED')
          throw AppError.inventoryConflict();
        return current;
      }
      for (const line of reservation.lines) {
        await this.inventory.release(
          transaction,
          line.inventoryId,
          line.quantity,
          id,
          'RESERVATION_RELEASED',
        );
      }
      const released = await this.reservations.findByIdWithin(transaction, id);
      if (released === null) throw AppError.reservationNotFound();
      return released;
    });
  }

  private async requireReservation(id: string): Promise<ReservationRecord> {
    const reservation = await this.reservations.findById(id);
    if (reservation === null) throw AppError.reservationNotFound();
    return reservation;
  }

  /** Resolves a request to SKU holds, refusing anything that references an unknown SKU or bundle. */
  private async resolveHolds(input: ReservationCreateInput): Promise<readonly ResolvedHold[]> {
    if (input.holds !== undefined) {
      if (input.holds.length === 0) throw AppError.inventoryConflict();
      const combined = new Map<string, ResolvedHold>();
      const add = (hold: ResolvedHold) => {
        const key = hold.bundleId ?? hold.variantId ?? '';
        const quantity = (combined.get(key)?.quantity ?? 0) + hold.quantity;
        if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 2_147_483_647)
          throw AppError.inventoryConflict();
        combined.set(key, { ...hold, quantity });
      };
      for (const hold of input.holds) {
        if (!Number.isSafeInteger(hold.quantity) || hold.quantity <= 0)
          throw AppError.inventoryConflict();
        if (hold.kind === 'VARIANT') {
          const variantId = await this.inventory.findVariantIdBySku(hold.sku);
          if (variantId === null) throw AppError.inventoryNotFound();
          add({ variantId, quantity: hold.quantity });
        } else {
          const bundle = await this.bundles.findById(hold.bundleId);
          if (bundle === null) throw AppError.bundleNotFound();
          if (bundle.kind === 'FIXED') add({ bundleId: bundle.id, quantity: hold.quantity });
          else
            for (const component of bundle.components) {
              add({
                variantId: component.variantId,
                quantity: (component.minQuantity ?? 0) * hold.quantity,
              });
            }
        }
      }
      return [...combined.values()];
    }
    if (input.bundleId !== undefined && input.quantity !== undefined) {
      const quantity = input.quantity;
      const bundle = await this.bundles.findById(input.bundleId);
      if (bundle === null) throw AppError.bundleNotFound();
      if (bundle.kind === 'FIXED') {
        // For FIXED bundles with independent stock, reserve the bundle inventory directly
        const bundleInventory = await this.inventory.findByBundleId(input.bundleId);
        if (bundleInventory === null) {
          throw AppError.inventoryConflict();
        }
        const available = bundleInventory.onHand - bundleInventory.reserved;
        if (available < quantity) throw AppError.inventoryConflict();
        return [{ bundleId: input.bundleId, quantity }];
      }
      // A DYNAMIC bundle needs explicit chosen SKU lines; quantity alone is ambiguous.
      throw AppError.inventoryConflict();
    }

    const lines = input.lines ?? [];
    const holds: ResolvedHold[] = [];
    for (const line of lines) {
      const variantId = await this.inventory.findVariantIdBySku(line.sku);
      if (variantId === null) throw AppError.inventoryNotFound();
      holds.push({ variantId, quantity: line.quantity });
    }
    return holds;
  }
}
