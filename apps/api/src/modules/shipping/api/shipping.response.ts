import { ApiProperty } from '@nestjs/swagger';
import type {
  ReturnEventRecord,
  ReturnRecord,
  ShipmentEventRecord,
  ShipmentRecord,
  ShippingDestinationRecord,
  ShippingMethodRecord,
  ShippingOption,
} from '../contracts';

/**
 * Response projections.
 *
 * Each projection emits exactly the fields its DTO declares, and nothing else: no internal-only
 * column, no other capability's data, and never an echo of a rejected value.
 *
 * The projections deliberately omit the things the milestone does not have: there is no estimated
 * delivery date, no carrier service level, and no carrier-verified status, because no provider is
 * activated and no delivery commitment is approved.
 */

export class ShippingDestinationResponse {
  @ApiProperty({ type: String, minLength: 2, maxLength: 2 })
  public countryCode!: string;

  @ApiProperty({ type: Boolean })
  public enabled!: boolean;

  @ApiProperty({ type: String })
  public label!: string;

  @ApiProperty({ type: String, nullable: true })
  public carrierCode!: string | null;

  @ApiProperty({ type: String })
  public environment!: string;
}

export class ShippingMethodResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String })
  public code!: string;

  @ApiProperty({ type: String })
  public label!: string;

  @ApiProperty({ type: String, minLength: 2, maxLength: 2, nullable: true })
  public destinationCountryCode!: string | null;

  @ApiProperty({ type: Number, minimum: 0 })
  public amountMinor!: number;

  @ApiProperty({ type: String, minLength: 3, maxLength: 3 })
  public currency!: string;

  @ApiProperty({ type: Boolean })
  public active!: boolean;

  @ApiProperty({ type: String })
  public environment!: string;
}

export class ShippingOptionResponse {
  @ApiProperty({ type: String })
  public code!: string;

  @ApiProperty({ type: String })
  public label!: string;

  @ApiProperty({
    type: Number,
    minimum: 0,
    description:
      'The configured amount of the method, in exact integer minor units. The platform computes no rate.',
  })
  public amountMinor!: number;

  @ApiProperty({ type: String, minLength: 3, maxLength: 3 })
  public currency!: string;

  @ApiProperty({ type: String, minLength: 2, maxLength: 2, nullable: true })
  public destinationCountryCode!: string | null;
}

export class ShipmentLineResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public orderLineId!: string;

  @ApiProperty({ type: Number, minimum: 1 })
  public quantity!: number;
}

export class ShipmentResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  public orderId!: string;

  @ApiProperty({
    type: 'string',
    enum: ['PREPARED', 'PACKED', 'HANDED_OVER', 'DELIVERED', 'CANCELLED'],
  })
  public status!: string;

  @ApiProperty({ type: String, minLength: 2, maxLength: 2 })
  public destinationCountryCode!: string;

  @ApiProperty({ type: String })
  public destinationLabel!: string;

  @ApiProperty({ type: String })
  public methodCode!: string;

  @ApiProperty({ type: String })
  public methodLabel!: string;

  @ApiProperty({
    type: Number,
    minimum: 0,
    description:
      'The configured amount of the selected method. It is recorded, not collected: no shipping rate is approved yet.',
  })
  public amountMinor!: number;

  @ApiProperty({ type: String, minLength: 3, maxLength: 3 })
  public currency!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description:
      "The administrator's own tracking reference. No carrier is contacted, so it is not carrier-verified tracking.",
  })
  public trackingReference!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public carrierCode!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  public dispatchedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  public deliveredAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  public cancelledAt!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public statusReason!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;

  @ApiProperty({ type: [ShipmentLineResponse] })
  public lines!: ShipmentLineResponse[];
}

export class ShipmentsResponse {
  @ApiProperty({ type: [ShipmentResponse] })
  public shipments!: ShipmentResponse[];
}

export class ShipmentEventResponse {
  @ApiProperty({ type: String })
  public eventType!: string;

  @ApiProperty({ type: String, nullable: true })
  public previousStatus!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public nextStatus!: string | null;

  @ApiProperty({ type: 'string', enum: ['CUSTOMER', 'ADMIN', 'SYSTEM'] })
  public actor!: string;

  @ApiProperty({ type: String, nullable: true })
  public reason!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;
}

export class ShipmentEventsResponse {
  @ApiProperty({ type: [ShipmentEventResponse] })
  public events!: ShipmentEventResponse[];
}

export class ReturnLineResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  public orderLineId!: string;

  @ApiProperty({ type: Number, minimum: 1 })
  public quantity!: number;

  @ApiProperty({ type: Boolean })
  public restocked!: boolean;
}

export class ReturnResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  public orderId!: string;

  @ApiProperty({
    type: 'string',
    enum: ['REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'REFUNDED', 'CANCELLED'],
  })
  public status!: string;

  @ApiProperty({ type: String })
  public reasonCode!: string;

  @ApiProperty({ type: Number, minimum: 0 })
  public totalMinor!: number;

  @ApiProperty({ type: String, minLength: 3, maxLength: 3 })
  public currency!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  public refundId!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public refundStatus!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  public receivedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  public decidedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;

  @ApiProperty({ type: [ReturnLineResponse] })
  public lines!: ReturnLineResponse[];
}

export class ReturnsResponse {
  @ApiProperty({ type: [ReturnResponse] })
  public returns!: ReturnResponse[];
}

export class ReturnEventResponse {
  @ApiProperty({ type: String })
  public eventType!: string;

  @ApiProperty({ type: String, nullable: true })
  public previousStatus!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public nextStatus!: string | null;

  @ApiProperty({ type: 'string', enum: ['CUSTOMER', 'ADMIN', 'SYSTEM'] })
  public actor!: string;

  @ApiProperty({ type: String, nullable: true })
  public reason!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;
}

export class ReturnEventsResponse {
  @ApiProperty({ type: [ReturnEventResponse] })
  public events!: ReturnEventResponse[];
}

export class ShippingDestinationsResponse {
  @ApiProperty({ type: [ShippingDestinationResponse] })
  public destinations!: ShippingDestinationResponse[];
}

export class ShippingMethodsResponse {
  @ApiProperty({ type: [ShippingMethodResponse] })
  public methods!: ShippingMethodResponse[];
}

export class ShippingOptionsResponse {
  @ApiProperty({ enum: ['TEST', 'PRODUCTION'] })
  public environment!: 'TEST' | 'PRODUCTION';
  @ApiProperty({
    type: Boolean,
    example: false,
    description: 'Informational configuration; no shipping charge is collected.',
  })
  public chargeCollected!: false;

  @ApiProperty({ type: [ShippingOptionResponse] })
  public options!: ShippingOptionResponse[];
}

export function toShippingDestinationResponse(
  record: ShippingDestinationRecord,
): ShippingDestinationResponse {
  return {
    countryCode: record.countryCode,
    enabled: record.enabled,
    label: record.label,
    carrierCode: record.carrierCode,
    environment: record.environment,
  };
}

export function toShippingMethodResponse(record: ShippingMethodRecord): ShippingMethodResponse {
  return {
    id: record.id,
    code: record.code,
    label: record.label,
    destinationCountryCode: record.destinationCountryCode,
    amountMinor: record.amountMinor,
    currency: record.currency,
    active: record.active,
    environment: record.environment,
  };
}

export function toShippingOptionResponse(option: ShippingOption): ShippingOptionResponse {
  return {
    code: option.code,
    label: option.label,
    amountMinor: option.amountMinor,
    currency: option.currency,
    destinationCountryCode: option.destinationCountryCode,
  };
}

export function toShipmentResponse(record: ShipmentRecord): ShipmentResponse {
  return {
    id: record.id,
    orderId: record.orderId,
    status: record.status,
    destinationCountryCode: record.destinationCountryCode,
    destinationLabel: record.destinationLabel,
    methodCode: record.methodCode,
    methodLabel: record.methodLabel,
    amountMinor: record.amountMinor,
    currency: record.currency,
    trackingReference: record.trackingReference,
    carrierCode: record.carrierCode,
    dispatchedAt: record.dispatchedAt === null ? null : record.dispatchedAt.toISOString(),
    deliveredAt: record.deliveredAt === null ? null : record.deliveredAt.toISOString(),
    cancelledAt: record.cancelledAt === null ? null : record.cancelledAt.toISOString(),
    statusReason: record.statusReason,
    createdAt: record.createdAt.toISOString(),
    lines: record.lines.map((line) => ({
      orderLineId: line.orderLineId,
      quantity: line.quantity,
    })),
  };
}

export function toShipmentsResponse(records: readonly ShipmentRecord[]): ShipmentsResponse {
  return { shipments: records.map(toShipmentResponse) };
}

export function toShipmentEventResponse(record: ShipmentEventRecord): ShipmentEventResponse {
  return {
    eventType: record.eventType,
    previousStatus: record.previousStatus,
    nextStatus: record.nextStatus,
    actor: record.actor,
    reason: record.reason,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toShipmentEventsResponse(
  records: readonly ShipmentEventRecord[],
): ShipmentEventsResponse {
  return { events: records.map(toShipmentEventResponse) };
}

export function toReturnResponse(record: ReturnRecord): ReturnResponse {
  return {
    id: record.id,
    orderId: record.orderId,
    status: record.status,
    reasonCode: record.reasonCode,
    totalMinor: record.totalMinor,
    currency: record.currency,
    refundId: record.refundId,
    refundStatus: record.refundStatus,
    receivedAt: record.receivedAt === null ? null : record.receivedAt.toISOString(),
    decidedAt: record.decidedAt === null ? null : record.decidedAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    lines: record.lines.map((line) => ({
      id: line.id,
      orderLineId: line.orderLineId,
      quantity: line.quantity,
      restocked: line.restocked,
    })),
  };
}

export function toReturnsResponse(records: readonly ReturnRecord[]): ReturnsResponse {
  return { returns: records.map(toReturnResponse) };
}

export function toReturnEventResponse(record: ReturnEventRecord): ReturnEventResponse {
  return {
    eventType: record.eventType,
    previousStatus: record.previousStatus,
    nextStatus: record.nextStatus,
    actor: record.actor,
    reason: record.reason,
    createdAt: record.createdAt.toISOString(),
  };
}

export function toReturnEventsResponse(
  records: readonly ReturnEventRecord[],
): ReturnEventsResponse {
  return { events: records.map(toReturnEventResponse) };
}
