import { ApiProperty } from '@nestjs/swagger';
import type { BundleComponentRecord, BundleRecord } from '../persistence/bundle.repository';
import type {
  InventoryDetailRecord,
  StockMovementReasonValue,
  StockMovementRecord,
} from '../persistence/inventory.repository';
import type { ReservationRecord } from '../persistence/reservation.repository';

/**
 * Response projections.
 *
 * Each projection emits exactly the fields its DTO declares, and nothing else: no internal-only column
 * and never an echo of a rejected value. `available` is always derived (`onHand - reserved`), so a
 * client cannot be shown an inconsistent snapshot.
 */

export class InventoryResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  public variantId!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  public bundleId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public sku!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  public productId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public productName!: string | null;

  @ApiProperty({ type: Number })
  public onHand!: number;

  @ApiProperty({ type: Number })
  public reserved!: number;

  @ApiProperty({ type: Number, description: 'Derived: onHand - reserved, never negative.' })
  public available!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  public updatedAt!: string;
}

export class InventoriesResponse {
  @ApiProperty({ type: [InventoryResponse] })
  public items!: InventoryResponse[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Opaque cursor; null on the last page.',
  })
  public nextCursor!: string | null;
}

export class StockMovementResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({
    type: String,
    enum: [
      'ADJUSTMENT',
      'RESERVATION_CREATED',
      'RESERVATION_RELEASED',
      'RESERVATION_EXPIRED',
      'RESERVATION_CONFIRMED',
    ],
  })
  public reason!: StockMovementReasonValue;

  @ApiProperty({ type: Number })
  public onHandDelta!: number;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'The optional label recorded with the adjustment.',
  })
  public note!: string | null;

  @ApiProperty({ type: Number })
  public reservedDelta!: number;

  @ApiProperty({ type: Number })
  public onHandAfter!: number;

  @ApiProperty({ type: Number })
  public reservedAfter!: number;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  public reservationId!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;
}

export class StockMovementsResponse {
  @ApiProperty({ type: [StockMovementResponse] })
  public items!: StockMovementResponse[];

  @ApiProperty({ type: String, nullable: true })
  public nextCursor!: string | null;
}

export class BundleComponentResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  public variantId!: string;

  @ApiProperty({ type: String })
  public sku!: string;

  @ApiProperty({ type: Number, nullable: true })
  public quantity!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  public minQuantity!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  public maxQuantity!: number | null;

  @ApiProperty({ type: Number })
  public position!: number;
}

export class BundleResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  public productId!: string;

  @ApiProperty({ type: String, enum: ['FIXED', 'DYNAMIC'] })
  public kind!: string;

  @ApiProperty({ type: String })
  public name!: string;

  @ApiProperty({ type: String, nullable: true })
  public description!: string | null;

  @ApiProperty({ type: [BundleComponentResponse] })
  public components!: BundleComponentResponse[];

  @ApiProperty({
    type: Number,
    description:
      'FIXED: available finished goods. DYNAMIC: component-derived capacity at minimum quantities.',
  })
  public available!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  public updatedAt!: string;
}

export class BundlesResponse {
  @ApiProperty({ type: [BundleResponse] })
  public bundles!: BundleResponse[];
}

export class ReservationLineResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String, nullable: true })
  public sku!: string | null;

  @ApiProperty({ type: Number })
  public quantity!: number;
}

export class ReservationResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String, enum: ['ACTIVE', 'CONFIRMED', 'RELEASED', 'EXPIRED'] })
  public status!: string;

  @ApiProperty({ type: String })
  public idempotencyKey!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  public expiresAt!: string;

  @ApiProperty({ type: [ReservationLineResponse] })
  public lines!: ReservationLineResponse[];

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  public updatedAt!: string;
}

export class ReservationsResponse {
  @ApiProperty({ type: [ReservationResponse] })
  public items!: ReservationResponse[];

  @ApiProperty({ type: String, nullable: true })
  public nextCursor!: string | null;
}

export function toInventoryResponse(record: InventoryDetailRecord): InventoryResponse {
  return {
    id: record.id,
    variantId: record.variantId,
    bundleId: record.bundleId,
    sku: record.sku,
    productId: record.productId,
    productName: record.productName,
    onHand: record.onHand,
    reserved: record.reserved,
    available: record.onHand - record.reserved,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toInventoriesResponse(
  records: readonly InventoryDetailRecord[],
  nextCursor: string | null,
): InventoriesResponse {
  return { items: records.map((record) => toInventoryResponse(record)), nextCursor };
}

export function toStockMovementResponse(record: StockMovementRecord): StockMovementResponse {
  return {
    id: record.id,
    reason: record.reason,
    onHandDelta: record.onHandDelta,
    note: record.note,
    reservedDelta: record.reservedDelta,
    onHandAfter: record.onHandAfter,
    reservedAfter: record.reservedAfter,
    reservationId: record.reservationId,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toBundleResponse(record: BundleRecord, available: number): BundleResponse {
  return {
    id: record.id,
    productId: record.productId,
    kind: record.kind,
    name: record.name,
    description: record.description,
    components: record.components.map((component: BundleComponentRecord) => ({
      id: component.id,
      variantId: component.variantId,
      sku: component.sku,
      quantity: component.quantity,
      minQuantity: component.minQuantity,
      maxQuantity: component.maxQuantity,
      position: component.position,
    })),
    available,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toReservationResponse(record: ReservationRecord): ReservationResponse {
  return {
    id: record.id,
    status: record.status,
    idempotencyKey: record.idempotencyKey,
    expiresAt: record.expiresAt.toISOString(),
    lines: record.lines.map((line) => ({
      id: line.id,
      sku: line.sku,
      quantity: line.quantity,
    })),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
