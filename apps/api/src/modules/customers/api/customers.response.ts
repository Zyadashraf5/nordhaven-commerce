import { ApiProperty } from '@nestjs/swagger';
import type { CustomerAddressView } from '../application/customer-address.service';
import type { CustomerProfileView } from '../application/customer-profile.service';
import type { WishlistItemView, WishlistView } from '../application/wishlist.service';
import { ADDRESS_COUNTRY_CODE_LENGTH } from '../application/customer.support';

/**
 * Response projections.
 *
 * The owning identity identifier and every Identity-owned attribute are deliberately absent, so a
 * response can only ever describe the customer's own storefront data.
 */
export class CustomerProfileResponse {
  @ApiProperty({ type: String, nullable: true })
  public displayName!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public phone!: string | null;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  public defaultAddressId!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  public updatedAt!: string;
}

export class CustomerAddressResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String })
  public recipientName!: string;

  @ApiProperty({ type: String })
  public line1!: string;

  @ApiProperty({ type: String, nullable: true })
  public line2!: string | null;

  @ApiProperty({ type: String })
  public city!: string;

  @ApiProperty({ type: String, nullable: true })
  public region!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public postalCode!: string | null;

  @ApiProperty({
    type: String,
    minLength: ADDRESS_COUNTRY_CODE_LENGTH,
    maxLength: ADDRESS_COUNTRY_CODE_LENGTH,
  })
  public countryCode!: string;

  @ApiProperty({ type: String, nullable: true })
  public phone!: string | null;

  @ApiProperty({ type: Boolean, description: 'Derived from the profile default selection.' })
  public isDefault!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  public updatedAt!: string;
}

export class CustomerAddressesResponse {
  @ApiProperty({ type: [CustomerAddressResponse] })
  public addresses!: CustomerAddressResponse[];
}

export class WishlistItemResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  public productId!: string;

  @ApiProperty({ type: String })
  public productName!: string;

  @ApiProperty({ type: String })
  public productSlug!: string;

  @ApiProperty({
    type: Number,
    description: 'The current effective price, in exact integer minor units.',
  })
  public currentPriceMinor!: number;

  @ApiProperty({ type: String, minLength: 3, maxLength: 3 })
  public currentCurrency!: string;

  @ApiProperty({
    type: Boolean,
    description:
      'False when the product is no longer published, so the item can no longer be bought.',
  })
  public purchasable!: boolean;

  @ApiProperty({ type: String, format: 'date-time' })
  public savedAt!: string;
}

export class WishlistResponse {
  @ApiProperty({ type: [WishlistItemResponse] })
  public items!: WishlistItemResponse[];
}

export function toCustomerProfileResponse(view: CustomerProfileView): CustomerProfileResponse {
  return {
    displayName: view.displayName,
    phone: view.phone,
    defaultAddressId: view.defaultAddressId,
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
  };
}

export function toCustomerAddressResponse(view: CustomerAddressView): CustomerAddressResponse {
  return {
    id: view.id,
    recipientName: view.recipientName,
    line1: view.line1,
    line2: view.line2,
    city: view.city,
    region: view.region,
    postalCode: view.postalCode,
    countryCode: view.countryCode,
    phone: view.phone,
    isDefault: view.isDefault,
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
  };
}

export function toCustomerAddressesResponse(
  views: readonly CustomerAddressView[],
): CustomerAddressesResponse {
  return { addresses: views.map((view) => toCustomerAddressResponse(view)) };
}

export function toWishlistItemResponse(view: WishlistItemView): WishlistItemResponse {
  return {
    id: view.id,
    productId: view.productId,
    productName: view.productName,
    productSlug: view.productSlug,
    currentPriceMinor: view.currentPriceMinor,
    currentCurrency: view.currentCurrency,
    purchasable: view.purchasable,
    savedAt: view.savedAt.toISOString(),
  };
}

export function toWishlistResponse(view: WishlistView): WishlistResponse {
  return { items: view.items.map(toWishlistItemResponse) };
}
