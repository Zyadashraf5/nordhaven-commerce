import type { ZodType } from 'zod';
import { ZOD_VALIDATION_SCHEMA } from '../../../platform/validation/zod-validation.pipe';
import {
  CreateCustomerAddressRequest,
  CustomerAddressIdParam,
  UpdateCustomerAddressRequest,
  UpdateCustomerProfileRequest,
} from './customers.request';

const ADDRESS_ID = '2f1e0d9c-8b7a-4695-8432-1f0e9d8c7b6a';

interface SchemaHolder {
  readonly [ZOD_VALIDATION_SCHEMA]: ZodType;
}

/** Exercises the boundary schema the validation pipe actually uses. */
function parse(holder: SchemaHolder, value: unknown) {
  return holder[ZOD_VALIDATION_SCHEMA].safeParse(value);
}

describe('customer request schemas', () => {
  describe('UpdateCustomerProfileRequest', () => {
    it('accepts a single supplied attribute and trims it', () => {
      expect(parse(UpdateCustomerProfileRequest, { displayName: '  Ada  ' })).toMatchObject({
        success: true,
        data: { displayName: 'Ada' },
      });
      expect(parse(UpdateCustomerProfileRequest, { phone: ' +44 20 7946 0000 ' })).toMatchObject({
        success: true,
        data: { phone: '+44 20 7946 0000' },
      });
    });

    it('clears an attribute with null or a blank value', () => {
      expect(parse(UpdateCustomerProfileRequest, { displayName: null })).toMatchObject({
        success: true,
        data: { displayName: null },
      });
      expect(parse(UpdateCustomerProfileRequest, { displayName: '   ' })).toMatchObject({
        success: true,
        data: { displayName: null },
      });
    });

    it('rejects an empty body, so a meaningless write is not accepted', () => {
      expect(parse(UpdateCustomerProfileRequest, {}).success).toBe(false);
    });

    it('rejects an unknown field instead of ignoring it', () => {
      expect(
        parse(UpdateCustomerProfileRequest, { displayName: 'Ada', role: 'ADMIN' }).success,
      ).toBe(false);
    });
  });

  describe('CreateCustomerAddressRequest', () => {
    const minimal = {
      recipientName: 'Ada Lovelace',
      line1: '1 Analytical Engine Way',
      city: 'London',
      countryCode: 'gb',
    };

    it('accepts the required attributes and fills absent optional ones with not-provided', () => {
      expect(parse(CreateCustomerAddressRequest, minimal)).toMatchObject({
        success: true,
        data: {
          recipientName: 'Ada Lovelace',
          line1: '1 Analytical Engine Way',
          city: 'London',
          countryCode: 'GB',
          line2: null,
          region: null,
          postalCode: null,
          phone: null,
        },
      });
    });

    it('accepts explicit null and blank optional attributes as not-provided', () => {
      expect(
        parse(CreateCustomerAddressRequest, {
          ...minimal,
          line2: null,
          region: '   ',
          postalCode: 'SW1A 1AA',
        }),
      ).toMatchObject({
        success: true,
        data: { line2: null, region: null, postalCode: 'SW1A 1AA' },
      });
    });

    it('rejects a missing required attribute', () => {
      expect(parse(CreateCustomerAddressRequest, { ...minimal, line1: undefined }).success).toBe(
        false,
      );
      expect(parse(CreateCustomerAddressRequest, { ...minimal, city: '' }).success).toBe(false);
      expect(parse(CreateCustomerAddressRequest, { ...minimal, countryCode: 'GBR' }).success).toBe(
        false,
      );
    });

    it('rejects an unknown field instead of ignoring it', () => {
      expect(parse(CreateCustomerAddressRequest, { ...minimal, isDefault: true }).success).toBe(
        false,
      );
      expect(
        parse(CreateCustomerAddressRequest, { ...minimal, customerId: ADDRESS_ID }).success,
      ).toBe(false);
    });
  });

  describe('UpdateCustomerAddressRequest', () => {
    it('accepts a partial update', () => {
      expect(parse(UpdateCustomerAddressRequest, { city: '  Paris ' })).toMatchObject({
        success: true,
        data: { city: 'Paris' },
      });
    });

    it('accepts a single-field clear of an optional attribute', () => {
      expect(parse(UpdateCustomerAddressRequest, { line2: null })).toMatchObject({
        success: true,
        data: { line2: null },
      });
      expect(parse(UpdateCustomerAddressRequest, { phone: '  ' })).toMatchObject({
        success: true,
        data: { phone: null },
      });
    });

    it('rejects clearing a required attribute', () => {
      expect(parse(UpdateCustomerAddressRequest, { recipientName: null }).success).toBe(false);
      expect(parse(UpdateCustomerAddressRequest, { line1: '   ' }).success).toBe(false);
      expect(parse(UpdateCustomerAddressRequest, { city: '' }).success).toBe(false);
      expect(parse(UpdateCustomerAddressRequest, { countryCode: null }).success).toBe(false);
    });

    it('rejects an empty body', () => {
      expect(parse(UpdateCustomerAddressRequest, {}).success).toBe(false);
    });

    it('rejects an unknown field instead of ignoring it', () => {
      expect(parse(UpdateCustomerAddressRequest, { isDefault: false }).success).toBe(false);
    });
  });

  describe('CustomerAddressIdParam', () => {
    it('accepts a UUID and rejects anything else', () => {
      expect(parse(CustomerAddressIdParam, { addressId: ADDRESS_ID }).success).toBe(true);
      expect(parse(CustomerAddressIdParam, { addressId: 'not-a-uuid' }).success).toBe(false);
      expect(parse(CustomerAddressIdParam, { addressId: ADDRESS_ID, extra: true }).success).toBe(
        false,
      );
    });
  });
});
