import type { ZodType } from 'zod';
import { ZOD_VALIDATION_SCHEMA } from '../../../platform/validation/zod-validation.pipe';
import {
  CreateBundleRequest,
  CreateReservationRequest,
  ExtendReservationRequest,
  InventoryIdParam,
  ListInventoryQuery,
  ListReservationsQuery,
  SetInventoryRequest,
  UpdateBundleRequest,
  VariantIdParam,
} from './inventory.request';

const VARIANT_ID = '2f1e0d9c-8b7a-4695-8432-1f0e9d8c7b6a';
const OTHER_VARIANT_ID = '3f1e0d9c-8b7a-4695-8432-1f0e9d8c7b6b';
const PRODUCT_ID = '4f1e0d9c-8b7a-4695-8432-1f0e9d8c7b6c';

interface SchemaHolder {
  readonly [ZOD_VALIDATION_SCHEMA]: ZodType;
}

/** Exercises the boundary schema the validation pipe actually uses. */
function parse(holder: SchemaHolder, value: unknown) {
  return holder[ZOD_VALIDATION_SCHEMA].safeParse(value);
}

describe('inventory request schemas', () => {
  describe('SetInventoryRequest', () => {
    it('accepts a non-negative on-hand quantity with an optional reason', () => {
      expect(parse(SetInventoryRequest, { onHand: 25, reason: 'Goods received' })).toMatchObject({
        success: true,
        data: { onHand: 25, reason: 'Goods received' },
      });
      expect(parse(SetInventoryRequest, { onHand: 0 })).toMatchObject({ success: true });
    });

    it('rejects a negative, fractional, or non-integer quantity and an unknown field', () => {
      expect(parse(SetInventoryRequest, { onHand: -1 }).success).toBe(false);
      expect(parse(SetInventoryRequest, { onHand: 1.5 }).success).toBe(false);
      expect(parse(SetInventoryRequest, { onHand: 1, extra: true }).success).toBe(false);
    });
  });

  describe('path parameters', () => {
    it('requires a UUID', () => {
      expect(parse(VariantIdParam, { variantId: VARIANT_ID }).success).toBe(true);
      expect(parse(VariantIdParam, { variantId: 'not-a-uuid' }).success).toBe(false);
      expect(parse(InventoryIdParam, { inventoryId: VARIANT_ID }).success).toBe(true);
    });
  });

  describe('ListInventoryQuery', () => {
    it('coerces a limit and accepts an optional product filter', () => {
      expect(parse(ListInventoryQuery, { limit: '10', productId: PRODUCT_ID })).toMatchObject({
        success: true,
        data: { limit: 10, productId: PRODUCT_ID },
      });
    });

    it('rejects an out-of-range limit', () => {
      expect(parse(ListInventoryQuery, { limit: '0' }).success).toBe(false);
      expect(parse(ListInventoryQuery, { limit: '500' }).success).toBe(false);
    });
  });

  describe('CreateBundleRequest', () => {
    it('accepts a fixed composition with per-bundle quantities', () => {
      const result = parse(CreateBundleRequest, {
        productId: PRODUCT_ID,
        kind: 'FIXED',
        name: 'Table and chairs set',
        components: [
          { variantId: VARIANT_ID, quantity: 2 },
          { variantId: OTHER_VARIANT_ID, quantity: 1 },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('accepts a dynamic composition with a per-selection range', () => {
      expect(
        parse(CreateBundleRequest, {
          productId: PRODUCT_ID,
          kind: 'DYNAMIC',
          name: 'Pick your set',
          components: [{ variantId: VARIANT_ID, minQuantity: 2, maxQuantity: 4 }],
        }).success,
      ).toBe(true);
    });

    it('rejects a fixed component with no quantity and a dynamic component with no range', () => {
      expect(
        parse(CreateBundleRequest, {
          productId: PRODUCT_ID,
          kind: 'FIXED',
          name: 'Set',
          components: [{ variantId: VARIANT_ID }],
        }).success,
      ).toBe(false);
      expect(
        parse(CreateBundleRequest, {
          productId: PRODUCT_ID,
          kind: 'DYNAMIC',
          name: 'Set',
          components: [{ variantId: VARIANT_ID }],
        }).success,
      ).toBe(false);
    });

    it('rejects a duplicated component SKU and an inverted range', () => {
      expect(
        parse(CreateBundleRequest, {
          productId: PRODUCT_ID,
          kind: 'FIXED',
          name: 'Set',
          components: [
            { variantId: VARIANT_ID, quantity: 1 },
            { variantId: VARIANT_ID, quantity: 2 },
          ],
        }).success,
      ).toBe(false);
      expect(
        parse(CreateBundleRequest, {
          productId: PRODUCT_ID,
          kind: 'DYNAMIC',
          name: 'Set',
          components: [{ variantId: VARIANT_ID, minQuantity: 4, maxQuantity: 2 }],
        }).success,
      ).toBe(false);
    });

    it('rejects a fixed component that carries a range and an empty composition', () => {
      expect(
        parse(CreateBundleRequest, {
          productId: PRODUCT_ID,
          kind: 'FIXED',
          name: 'Set',
          components: [{ variantId: VARIANT_ID, quantity: 1, minQuantity: 1 }],
        }).success,
      ).toBe(false);
      expect(
        parse(CreateBundleRequest, {
          productId: PRODUCT_ID,
          kind: 'FIXED',
          name: 'Set',
          components: [],
        }).success,
      ).toBe(false);
    });
  });

  describe('UpdateBundleRequest', () => {
    it('accepts an empty update and a name-only update', () => {
      expect(parse(UpdateBundleRequest, {}).success).toBe(true);
      expect(parse(UpdateBundleRequest, { name: 'Renamed set' }).success).toBe(true);
    });

    it('rejects an unknown field', () => {
      expect(parse(UpdateBundleRequest, { kind: 'DYNAMIC' }).success).toBe(false);
    });
  });

  describe('CreateReservationRequest', () => {
    it('accepts a SKU-line reservation', () => {
      expect(
        parse(CreateReservationRequest, {
          idempotencyKey: 'checkout-42c1',
          lines: [{ sku: 'oak-table-01', quantity: 2 }],
        }),
      ).toMatchObject({ success: true, data: { lines: [{ sku: 'OAK-TABLE-01', quantity: 2 }] } });
    });

    it('accepts a bundle reservation', () => {
      expect(
        parse(CreateReservationRequest, {
          idempotencyKey: 'checkout-42c2',
          bundleId: VARIANT_ID,
          quantity: 3,
        }).success,
      ).toBe(true);
    });

    it('rejects a request that supplies both forms or neither', () => {
      expect(
        parse(CreateReservationRequest, {
          idempotencyKey: 'k',
          lines: [{ sku: 'A-01', quantity: 1 }],
          bundleId: VARIANT_ID,
          quantity: 1,
        }).success,
      ).toBe(false);
      expect(parse(CreateReservationRequest, { idempotencyKey: 'k' }).success).toBe(false);
      expect(
        parse(CreateReservationRequest, { idempotencyKey: 'k', bundleId: VARIANT_ID }).success,
      ).toBe(false);
    });

    it('rejects an empty line list and an out-of-range expiry', () => {
      expect(parse(CreateReservationRequest, { idempotencyKey: 'k', lines: [] }).success).toBe(
        false,
      );
      expect(
        parse(CreateReservationRequest, {
          idempotencyKey: 'k',
          expiresInSeconds: 5,
          lines: [{ sku: 'A-01', quantity: 1 }],
        }).success,
      ).toBe(false);
    });
  });

  describe('ExtendReservationRequest', () => {
    it('requires a positive extension', () => {
      expect(parse(ExtendReservationRequest, { extendBySeconds: 60 }).success).toBe(true);
      expect(parse(ExtendReservationRequest, { extendBySeconds: 0 }).success).toBe(false);
    });
  });

  describe('ListReservationsQuery', () => {
    it('accepts a lifecycle status and coerces a limit', () => {
      expect(parse(ListReservationsQuery, { status: 'ACTIVE', limit: '5' })).toMatchObject({
        success: true,
        data: { status: 'ACTIVE', limit: 5 },
      });
    });

    it('rejects an unknown status', () => {
      expect(parse(ListReservationsQuery, { status: 'PENDING' }).success).toBe(false);
    });
  });
});
