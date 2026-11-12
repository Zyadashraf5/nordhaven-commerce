import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { ZOD_VALIDATION_SCHEMA } from '../../../platform/validation/zod-validation.pipe';
import {
  BUNDLE_DESCRIPTION_MAX_LENGTH,
  BUNDLE_NAME_MAX_LENGTH,
  DEFAULT_PAGE_SIZE,
  DEFAULT_RESERVATION_TTL_SECONDS,
  IDEMPOTENCY_KEY_MAX_LENGTH,
  MAX_BUNDLE_QUANTITY,
  MAX_COMPONENTS_PER_BUNDLE,
  MAX_PAGE_SIZE,
  MAX_QUANTITY,
  MAX_RESERVATION_EXTENSION_SECONDS,
  MAX_RESERVATION_LINES,
  MAX_RESERVATION_TTL_SECONDS,
  MIN_RESERVATION_TTL_SECONDS,
  REASON_MAX_LENGTH,
  bundleQuantity,
  optionalText,
  position,
  quantity,
  requiredText,
} from './inventory.support';

/**
 * Boundary schemas for the Inventory and Bundles capability.
 *
 * Every object is strict, so an unexpected field is rejected instead of silently ignored. Every
 * quantity is an exact integer; a floating-point value never reaches the application layer.
 */

const skuValue = z
  .string()
  .trim()
  .transform((value) => value.toUpperCase())
  .refine((value) => value.length <= 64);

const fixedComponent = z.strictObject({
  variantId: z.uuid(),
  quantity: bundleQuantity(),
  position: position().optional(),
});

const dynamicComponent = z.strictObject({
  variantId: z.uuid(),
  minQuantity: quantity(),
  maxQuantity: quantity(),
  position: position().optional(),
});

export class InventoryIdParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({ inventoryId: z.uuid() });

  @ApiProperty({ type: String, format: 'uuid' })
  public inventoryId!: string;
}

export class VariantIdParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({ variantId: z.uuid() });

  @ApiProperty({ type: String, format: 'uuid' })
  public variantId!: string;
}

export class BundleIdParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({ bundleId: z.uuid() });

  @ApiProperty({ type: String, format: 'uuid' })
  public bundleId!: string;
}

export class ReservationIdParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({ reservationId: z.uuid() });

  @ApiProperty({ type: String, format: 'uuid' })
  public reservationId!: string;
}

export class SetInventoryRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    onHand: quantity(),
    reason: optionalText(REASON_MAX_LENGTH).nullish(),
  });

  @ApiProperty({ type: Number, minimum: 0, maximum: MAX_QUANTITY })
  public onHand!: number;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    maxLength: REASON_MAX_LENGTH,
    description: 'Optional label recorded on the resulting ADJUSTMENT movement.',
  })
  public reason?: string | null;
}

export class ListInventoryQuery {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    productId: z.uuid().optional(),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
    cursor: z.string().trim().min(1).max(500).optional(),
  });

  @ApiProperty({ type: String, format: 'uuid', required: false })
  public productId?: string;

  @ApiProperty({ type: Number, required: false, minimum: 1, maximum: MAX_PAGE_SIZE })
  public limit?: number;

  @ApiProperty({ type: String, required: false })
  public cursor?: string;
}

export class ListMovementsQuery {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
    cursor: z.string().trim().min(1).max(500).optional(),
  });

  @ApiProperty({ type: Number, required: false, minimum: 1, maximum: MAX_PAGE_SIZE })
  public limit?: number;

  @ApiProperty({ type: String, required: false })
  public cursor?: string;
}

export class BundleFixedComponentRequest {
  @ApiProperty({ type: String, format: 'uuid' })
  public variantId!: string;

  @ApiProperty({ type: Number, minimum: 1, maximum: MAX_BUNDLE_QUANTITY })
  public quantity!: number;

  @ApiProperty({ type: Number, required: false, minimum: 0 })
  public position?: number;
}

export class BundleDynamicComponentRequest {
  @ApiProperty({ type: String, format: 'uuid' })
  public variantId!: string;

  @ApiProperty({ type: Number, minimum: 0, maximum: MAX_QUANTITY })
  public minQuantity!: number;

  @ApiProperty({ type: Number, minimum: 0, maximum: MAX_QUANTITY })
  public maxQuantity!: number;

  @ApiProperty({ type: Number, required: false, minimum: 0 })
  public position?: number;
}

function assertUniqueComponents(
  components: readonly { readonly variantId: string }[],
  context: z.RefinementCtx,
): void {
  if (new Set(components.map((component) => component.variantId)).size !== components.length) {
    context.addIssue({
      code: 'custom',
      message: 'A component SKU may appear at most once per bundle',
      path: ['components'],
    });
  }
}

/**
 * Enforces that the component shape matches the bundle kind: a `FIXED` bundle's components carry a
 * per-bundle quantity, a `DYNAMIC` bundle's carry an allowed range. The same rule is restated in the
 * service, so a caller cannot smuggle one shape into the other kind.
 */
function assertComponentShape(
  kind: 'FIXED' | 'DYNAMIC',
  components: readonly Record<string, unknown>[],
  context: z.RefinementCtx,
): void {
  components.forEach((component, index) => {
    const hasQuantity = component['quantity'] !== undefined;
    const hasRange =
      component['minQuantity'] !== undefined || component['maxQuantity'] !== undefined;
    if (kind === 'FIXED' && !hasQuantity) {
      context.addIssue({
        code: 'custom',
        message: 'A FIXED component requires a quantity',
        path: ['components', index],
      });
    }
    if (kind === 'DYNAMIC' && !hasRange) {
      context.addIssue({
        code: 'custom',
        message: 'A DYNAMIC component requires a minQuantity and maxQuantity',
        path: ['components', index],
      });
    }
    if (hasQuantity && hasRange) {
      context.addIssue({
        code: 'custom',
        message: 'A component carries either a quantity or a range, not both',
        path: ['components', index],
      });
    }
    const min = component['minQuantity'];
    const max = component['maxQuantity'];
    if (typeof min === 'number' && typeof max === 'number' && max < min) {
      context.addIssue({
        code: 'custom',
        message: 'maxQuantity must not be less than minQuantity',
        path: ['components', index],
      });
    }
  });
}

export class CreateBundleRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z
    .strictObject({
      productId: z.uuid(),
      kind: z.enum(['FIXED', 'DYNAMIC']),
      name: requiredText(BUNDLE_NAME_MAX_LENGTH),
      description: optionalText(BUNDLE_DESCRIPTION_MAX_LENGTH).nullish(),
      components: z
        .array(z.union([fixedComponent, dynamicComponent]))
        .min(1)
        .max(MAX_COMPONENTS_PER_BUNDLE),
    })
    .superRefine((value, context) => {
      assertUniqueComponents(value.components, context);
      assertComponentShape(value.kind, value.components, context);
    });

  @ApiProperty({ type: String, format: 'uuid' })
  public productId!: string;

  @ApiProperty({ type: String, enum: ['FIXED', 'DYNAMIC'] })
  public kind!: 'FIXED' | 'DYNAMIC';

  @ApiProperty({ type: String, maxLength: BUNDLE_NAME_MAX_LENGTH })
  public name!: string;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    maxLength: BUNDLE_DESCRIPTION_MAX_LENGTH,
  })
  public description?: string | null;

  @ApiProperty({
    type: [BundleFixedComponentRequest],
    minItems: 1,
    maxItems: MAX_COMPONENTS_PER_BUNDLE,
    description:
      'The composition. A FIXED component carries a per-bundle quantity; a DYNAMIC component carries an allowed per-selection range.',
  })
  public components!: (BundleFixedComponentRequest | BundleDynamicComponentRequest)[];
}

export class UpdateBundleRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    name: requiredText(BUNDLE_NAME_MAX_LENGTH).optional(),
    description: optionalText(BUNDLE_DESCRIPTION_MAX_LENGTH).nullish(),
    components: z
      .array(z.union([fixedComponent, dynamicComponent]))
      .min(1)
      .max(MAX_COMPONENTS_PER_BUNDLE)
      .optional(),
  });

  @ApiProperty({ type: String, required: false, maxLength: BUNDLE_NAME_MAX_LENGTH })
  public name?: string;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    maxLength: BUNDLE_DESCRIPTION_MAX_LENGTH,
  })
  public description?: string | null;

  @ApiProperty({
    type: [BundleFixedComponentRequest],
    required: false,
    minItems: 1,
    maxItems: MAX_COMPONENTS_PER_BUNDLE,
    description: 'When supplied, the whole composition is replaced.',
  })
  public components?: (BundleFixedComponentRequest | BundleDynamicComponentRequest)[];
}

export class ListBundlesQuery {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({});

  @ApiProperty({ required: false, description: 'Reserved for a later milestone.' })
  public readonly unused?: never;
}

export class ReservationLineRequest {
  @ApiProperty({ type: String, maxLength: 64 })
  public sku!: string;

  @ApiProperty({ type: Number, minimum: 1, maximum: MAX_QUANTITY })
  public quantity!: number;
}

export class CreateReservationRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z
    .strictObject({
      idempotencyKey: requiredText(IDEMPOTENCY_KEY_MAX_LENGTH),
      expiresInSeconds: z
        .number()
        .int()
        .min(MIN_RESERVATION_TTL_SECONDS)
        .max(MAX_RESERVATION_TTL_SECONDS)
        .optional(),
      lines: z
        .array(
          z.strictObject({
            sku: skuValue,
            quantity: quantity({ minimum: 1 }),
          }),
        )
        .min(1)
        .max(MAX_RESERVATION_LINES)
        .optional(),
      bundleId: z.uuid().optional(),
      quantity: bundleQuantity().optional(),
    })
    .refine(
      (value) =>
        value.lines !== undefined || (value.bundleId !== undefined && value.quantity !== undefined),
      'Provide either lines or a bundleId with a quantity',
    )
    .refine(
      (value) =>
        value.lines === undefined || (value.bundleId === undefined && value.quantity === undefined),
      'Provide either lines or a bundle, not both',
    );

  @ApiProperty({ type: String, maxLength: IDEMPOTENCY_KEY_MAX_LENGTH })
  public idempotencyKey!: string;

  @ApiProperty({
    type: Number,
    required: false,
    minimum: MIN_RESERVATION_TTL_SECONDS,
    maximum: MAX_RESERVATION_TTL_SECONDS,
    description: `Seconds until the hold expires. Defaults to ${DEFAULT_RESERVATION_TTL_SECONDS}.`,
  })
  public expiresInSeconds?: number;

  @ApiProperty({
    type: [ReservationLineRequest],
    required: false,
    minItems: 1,
    maxItems: MAX_RESERVATION_LINES,
    description: 'The SKU holds. Mutually exclusive with bundleId.',
  })
  public lines?: ReservationLineRequest[];

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    description: 'Reserve a bundle by identifier. Mutually exclusive with lines.',
  })
  public bundleId?: string;

  @ApiProperty({
    type: Number,
    required: false,
    minimum: 1,
    maximum: MAX_BUNDLE_QUANTITY,
    description: 'How many whole bundles to reserve. Required with bundleId.',
  })
  public quantity?: number;
}

export class AssembleBundleRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    quantity: quantity({ minimum: 1 }),
    note: optionalText(REASON_MAX_LENGTH).nullish(),
  });

  @ApiProperty({ type: Number, minimum: 1, maximum: MAX_QUANTITY })
  public quantity!: number;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    maxLength: REASON_MAX_LENGTH,
    description: 'Optional label recorded on stock movements.',
  })
  public note?: string | null;
}

export class DisassembleBundleRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    quantity: quantity({ minimum: 1 }),
    note: optionalText(REASON_MAX_LENGTH).nullish(),
  });

  @ApiProperty({ type: Number, minimum: 1, maximum: MAX_QUANTITY })
  public quantity!: number;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    maxLength: REASON_MAX_LENGTH,
    description: 'Optional label recorded on stock movements.',
  })
  public note?: string | null;
}

export class ListReservationsQuery {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    status: z.enum(['ACTIVE', 'CONFIRMED', 'RELEASED', 'EXPIRED']).optional(),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
    cursor: z.string().trim().min(1).max(500).optional(),
  });

  @ApiProperty({
    type: String,
    enum: ['ACTIVE', 'CONFIRMED', 'RELEASED', 'EXPIRED'],
    required: false,
  })
  public status?: 'ACTIVE' | 'CONFIRMED' | 'RELEASED' | 'EXPIRED';

  @ApiProperty({ type: Number, required: false, minimum: 1, maximum: MAX_PAGE_SIZE })
  public limit?: number;

  @ApiProperty({ type: String, required: false })
  public cursor?: string;
}

export class ExtendReservationRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    extendBySeconds: z.number().int().min(1).max(MAX_RESERVATION_EXTENSION_SECONDS),
  });

  @ApiProperty({ type: Number, minimum: 1, maximum: MAX_RESERVATION_EXTENSION_SECONDS })
  public extendBySeconds!: number;
}

export const LIST_INVENTORY_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;

/**
 * Converts a validated bundle component DTO into the service input shape.
 *
 * The boundary schemas already proved the component has either a `quantity` or a
 * `minQuantity`/`maxQuantity` pair, so this only copies the present fields — never inventing an
 * `undefined` one, because the platform compiles with `exactOptionalPropertyTypes`.
 */
export function toBundleComponentInput(
  component: BundleFixedComponentRequest | BundleDynamicComponentRequest,
): {
  readonly variantId: string;
  readonly quantity?: number;
  readonly minQuantity?: number;
  readonly maxQuantity?: number;
  readonly position?: number;
} {
  const quantity = 'quantity' in component ? component.quantity : undefined;
  const minQuantity = 'minQuantity' in component ? component.minQuantity : undefined;
  const maxQuantity = 'maxQuantity' in component ? component.maxQuantity : undefined;
  return {
    variantId: component.variantId,
    ...(quantity === undefined ? {} : { quantity }),
    ...(minQuantity === undefined ? {} : { minQuantity }),
    ...(maxQuantity === undefined ? {} : { maxQuantity }),
    ...(component.position === undefined ? {} : { position: component.position }),
  };
}
