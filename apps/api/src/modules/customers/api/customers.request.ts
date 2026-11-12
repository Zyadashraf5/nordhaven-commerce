import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { ZOD_VALIDATION_SCHEMA } from '../../../platform/validation/zod-validation.pipe';
import {
  ADDRESS_CITY_MAX_LENGTH,
  ADDRESS_COUNTRY_CODE_LENGTH,
  ADDRESS_LINE_MAX_LENGTH,
  ADDRESS_POSTAL_CODE_MAX_LENGTH,
  ADDRESS_RECIPIENT_NAME_MAX_LENGTH,
  ADDRESS_REGION_MAX_LENGTH,
  CONTACT_PHONE_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  countryCode,
  optionalText,
  requiredText,
} from '../application/customer.support';

/**
 * Boundary schemas for the Customer Profiles capability.
 *
 * Every object is strict, so an unexpected field is rejected instead of silently ignored, which is what
 * keeps the profile and address write paths free of mass assignment. Each schema also normalizes its
 * input, so the values that reach the application layer are already trimmed, cleared, and cased.
 */

/** An optional attribute that may be omitted or explicitly null; both mean "not provided". */
function absentableText(maxLength: number) {
  return optionalText(maxLength)
    .nullish()
    .transform((value) => value ?? null);
}

/** An optional attribute that may be omitted (leave unchanged) or nulled (clear). */
function clearableText(maxLength: number) {
  return optionalText(maxLength).nullable().optional();
}

export class UpdateCustomerProfileRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z
    .strictObject({
      displayName: clearableText(DISPLAY_NAME_MAX_LENGTH),
      phone: clearableText(CONTACT_PHONE_MAX_LENGTH),
    })
    .refine(
      (value) => value.displayName !== undefined || value.phone !== undefined,
      'At least one attribute must be supplied',
    );

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    maxLength: DISPLAY_NAME_MAX_LENGTH,
    description: 'Display name; null or blank clears it. Omit to leave it unchanged.',
  })
  public displayName?: string | null;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    maxLength: CONTACT_PHONE_MAX_LENGTH,
    description: 'Contact phone; null or blank clears it. Omit to leave it unchanged.',
  })
  public phone?: string | null;
}

export class CreateCustomerAddressRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    recipientName: requiredText(ADDRESS_RECIPIENT_NAME_MAX_LENGTH),
    line1: requiredText(ADDRESS_LINE_MAX_LENGTH),
    line2: absentableText(ADDRESS_LINE_MAX_LENGTH),
    city: requiredText(ADDRESS_CITY_MAX_LENGTH),
    region: absentableText(ADDRESS_REGION_MAX_LENGTH),
    postalCode: absentableText(ADDRESS_POSTAL_CODE_MAX_LENGTH),
    countryCode: countryCode(),
    phone: absentableText(CONTACT_PHONE_MAX_LENGTH),
  });

  @ApiProperty({ type: String, maxLength: ADDRESS_RECIPIENT_NAME_MAX_LENGTH })
  public recipientName!: string;

  @ApiProperty({ type: String, maxLength: ADDRESS_LINE_MAX_LENGTH })
  public line1!: string;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    maxLength: ADDRESS_LINE_MAX_LENGTH,
  })
  public line2!: string | null;

  @ApiProperty({ type: String, maxLength: ADDRESS_CITY_MAX_LENGTH })
  public city!: string;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    maxLength: ADDRESS_REGION_MAX_LENGTH,
  })
  public region!: string | null;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    maxLength: ADDRESS_POSTAL_CODE_MAX_LENGTH,
    description: 'Optional; mandatory-ness depends on the destination country (HC-DEC-005 Open).',
  })
  public postalCode!: string | null;

  @ApiProperty({
    type: String,
    minLength: ADDRESS_COUNTRY_CODE_LENGTH,
    maxLength: ADDRESS_COUNTRY_CODE_LENGTH,
    pattern: '^[A-Za-z]{2}$',
    description: 'ISO 3166-1 alpha-2 code, stored upper case. The supported set is not restricted.',
  })
  public countryCode!: string;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    maxLength: CONTACT_PHONE_MAX_LENGTH,
  })
  public phone!: string | null;
}

export class UpdateCustomerAddressRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z
    .strictObject({
      recipientName: requiredText(ADDRESS_RECIPIENT_NAME_MAX_LENGTH).optional(),
      line1: requiredText(ADDRESS_LINE_MAX_LENGTH).optional(),
      line2: clearableText(ADDRESS_LINE_MAX_LENGTH),
      city: requiredText(ADDRESS_CITY_MAX_LENGTH).optional(),
      region: clearableText(ADDRESS_REGION_MAX_LENGTH),
      postalCode: clearableText(ADDRESS_POSTAL_CODE_MAX_LENGTH),
      countryCode: countryCode().optional(),
      phone: clearableText(CONTACT_PHONE_MAX_LENGTH),
    })
    .refine(
      (value) =>
        value.recipientName !== undefined ||
        value.line1 !== undefined ||
        value.line2 !== undefined ||
        value.city !== undefined ||
        value.region !== undefined ||
        value.postalCode !== undefined ||
        value.countryCode !== undefined ||
        value.phone !== undefined,
      'At least one attribute must be supplied',
    );

  @ApiProperty({ type: String, required: false, maxLength: ADDRESS_RECIPIENT_NAME_MAX_LENGTH })
  public recipientName?: string;

  @ApiProperty({ type: String, required: false, maxLength: ADDRESS_LINE_MAX_LENGTH })
  public line1?: string;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    maxLength: ADDRESS_LINE_MAX_LENGTH,
  })
  public line2?: string | null;

  @ApiProperty({ type: String, required: false, maxLength: ADDRESS_CITY_MAX_LENGTH })
  public city?: string;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    maxLength: ADDRESS_REGION_MAX_LENGTH,
  })
  public region?: string | null;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    maxLength: ADDRESS_POSTAL_CODE_MAX_LENGTH,
  })
  public postalCode?: string | null;

  @ApiProperty({
    type: String,
    required: false,
    minLength: ADDRESS_COUNTRY_CODE_LENGTH,
    maxLength: ADDRESS_COUNTRY_CODE_LENGTH,
    pattern: '^[A-Za-z]{2}$',
  })
  public countryCode?: string;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    maxLength: CONTACT_PHONE_MAX_LENGTH,
  })
  public phone?: string | null;
}

export class CustomerAddressIdParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({ addressId: z.uuid() });

  @ApiProperty({ type: String, format: 'uuid' })
  public addressId!: string;
}

/**
 * The request bodies of the wishlist routes.
 *
 * The schema is strict, so an unexpected field is refused rather than ignored.
 */
export class SaveWishlistItemRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    productId: z.uuid(),
  });

  @ApiProperty({ type: String, format: 'uuid' })
  public productId!: string;
}

export class WishlistItemIdParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({ itemId: z.uuid() });

  @ApiProperty({ type: String, format: 'uuid' })
  public itemId!: string;
}
