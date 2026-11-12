import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { ZOD_VALIDATION_SCHEMA } from '../../../platform/validation/zod-validation.pipe';

/**
 * The request bodies of the shipping and return routes.
 *
 * Every schema is strict, so an unexpected field is refused rather than ignored. A request that
 * carries a price, a rate, or a total is therefore impossible to make: a shipping method's amount
 * is an administrator's configured value, and a client never supplies one.
 */

/** A destination country code: exactly two letters. */
function countryCode() {
  return z
    .string()
    .trim()
    .length(2)
    .regex(/^[A-Za-z]{2}$/)
    .transform((value) => value.toUpperCase());
}

/** The settlement currency, as the approved decision fixes it. */
const settlementCurrency = z
  .string()
  .trim()
  .length(3)
  .regex(/^[A-Za-z]{3}$/);

/** A method's code: a short, stable name an administrator chose. */
function methodCode() {
  return z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/)
    .transform((value) => value.toUpperCase());
}

export class ConfigureShippingDestinationRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    enabled: z.boolean(),
    label: z.string().trim().min(1).max(120),
    /** The carrier, or null when no provider is activated. */
    carrierCode: z.string().trim().min(1).max(64).nullable().default(null),
  });

  @ApiProperty({ type: Boolean })
  public enabled!: boolean;

  @ApiProperty({ type: String, minLength: 1, maxLength: 120 })
  public label!: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 64, nullable: true })
  public carrierCode!: string | null;
}

export class ConfigureShippingMethodRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    label: z.string().trim().min(1).max(120),
    /** The destination the method applies to, or null for every enabled destination. */
    destinationCountryCode: countryCode().nullable().default(null),
    /** The configured amount, in exact integer minor units. */
    amountMinor: z.number().int().min(0).max(2_147_483_647),
    currency: settlementCurrency,
    active: z.boolean().default(true),
  });

  @ApiProperty({ type: String, minLength: 1, maxLength: 120 })
  public label!: string;

  @ApiProperty({ type: String, minLength: 2, maxLength: 2, nullable: true })
  public destinationCountryCode!: string | null;

  @ApiProperty({ type: Number, minimum: 0 })
  public amountMinor!: number;

  @ApiProperty({ type: String, minLength: 3, maxLength: 3 })
  public currency!: string;

  @ApiProperty({ type: Boolean })
  public active!: boolean;
}

export class ShippingDestinationQuery {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    destinationCountryCode: countryCode(),
  });

  @ApiProperty({ type: String, minLength: 2, maxLength: 2 })
  public destinationCountryCode!: string;
}

export class CountryCodeParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({ countryCode: countryCode() });

  @ApiProperty({ type: String, minLength: 2, maxLength: 2 })
  public countryCode!: string;
}

export class MethodCodeParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({ code: methodCode() });

  @ApiProperty({ type: String, minLength: 1, maxLength: 64 })
  public code!: string;
}

export class CreateShipmentRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    orderId: z.uuid(),
    /** The configured method the shipment is sent with. */
    methodCode: methodCode(),
  });

  @ApiProperty({ type: String, format: 'uuid' })
  public orderId!: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 64 })
  public methodCode!: string;
}

export class ShipmentIdParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({ shipmentId: z.uuid() });

  @ApiProperty({ type: String, format: 'uuid' })
  public shipmentId!: string;
}

export class OrderIdParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({ orderId: z.uuid() });

  @ApiProperty({ type: String, format: 'uuid' })
  public orderId!: string;
}

export class TransitionShipmentRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    /** The state the shipment moves to. */
    to: z.enum(['PACKED', 'HANDED_OVER', 'DELIVERED', 'CANCELLED']),
    reason: z.string().trim().min(1).max(200).nullable().default(null),
  });

  @ApiProperty({ type: 'string', enum: ['PACKED', 'HANDED_OVER', 'DELIVERED', 'CANCELLED'] })
  public to!: 'PACKED' | 'HANDED_OVER' | 'DELIVERED' | 'CANCELLED';

  @ApiProperty({ type: String, minLength: 1, maxLength: 200, nullable: true })
  public reason!: string | null;
}

export class SetTrackingRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    /** The administrator's own reference. No carrier is contacted. */
    trackingReference: z.string().trim().min(1).max(200),
  });

  @ApiProperty({ type: String, minLength: 1, maxLength: 200 })
  public trackingReference!: string;
}

export class RequestReturnRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    orderId: z.uuid(),
    reasonCode: z.string().trim().min(1).max(64),
    lines: z
      .array(
        z.strictObject({
          orderLineId: z.uuid(),
          quantity: z.number().int().min(1).max(999),
        }),
      )
      .min(1)
      .max(50),
  });

  @ApiProperty({ type: String, format: 'uuid' })
  public orderId!: string;

  @ApiProperty({ type: String, minLength: 1, maxLength: 64 })
  public reasonCode!: string;

  @ApiProperty({ type: 'array', items: { type: 'object' } })
  public lines!: { orderLineId: string; quantity: number }[];
}

export class ReturnIdParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({ returnId: z.uuid() });

  @ApiProperty({ type: String, format: 'uuid' })
  public returnId!: string;
}

export class DecideReturnRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    decision: z.enum(['APPROVED', 'REJECTED']),
    reason: z.string().trim().min(1).max(200).nullable().default(null),
  });

  @ApiProperty({ type: 'string', enum: ['APPROVED', 'REJECTED'] })
  public decision!: 'APPROVED' | 'REJECTED';

  @ApiProperty({ type: String, minLength: 1, maxLength: 200, nullable: true })
  public reason!: string | null;
}

export class ReceiveReturnRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    /** The returned lines whose goods go back into sellable stock. */
    restockLineIds: z.array(z.uuid()).max(50).default([]),
    /** Whether the money is returned through the Payments capability. */
    refund: z.boolean().default(true),
  });

  @ApiProperty({ type: 'array', items: { type: 'string', format: 'uuid' } })
  public restockLineIds!: string[];

  @ApiProperty({ type: Boolean })
  public refund!: boolean;
}
