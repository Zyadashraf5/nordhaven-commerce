import { Injectable } from '@nestjs/common';
import { AppError } from '../../../platform/http/app-error';
import type { AuthenticatedPrincipal } from '../../../platform/security/principal';
import { CustomerAddressRepository } from '../persistence/customer-address.repository';
import { CustomerProfileRepository } from '../persistence/customer-profile.repository';

/** One owned address as the HTTP layer presents it; `isDefault` is derived from the profile. */
export interface CustomerAddressView {
  readonly id: string;
  readonly recipientName: string;
  readonly line1: string;
  readonly line2: string | null;
  readonly city: string;
  readonly region: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string;
  readonly phone: string | null;
  readonly isDefault: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CustomerAddressInput {
  readonly recipientName: string;
  readonly line1: string;
  readonly line2: string | null;
  readonly city: string;
  readonly region: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string;
  readonly phone: string | null;
}

export interface CustomerAddressUpdate {
  readonly recipientName?: string;
  readonly line1?: string;
  readonly line2?: string | null;
  readonly city?: string;
  readonly region?: string | null;
  readonly postalCode?: string | null;
  readonly countryCode?: string;
  readonly phone?: string | null;
}

interface OwnedAddress {
  readonly address: {
    readonly id: string;
    readonly recipientName: string;
    readonly line1: string;
    readonly line2: string | null;
    readonly city: string;
    readonly region: string | null;
    readonly postalCode: string | null;
    readonly countryCode: string;
    readonly phone: string | null;
    readonly createdAt: Date;
    readonly updatedAt: Date;
  };
  readonly defaultAddressId: string | null;
}

/**
 * Saved shipping addresses, always scoped to the authenticated principal. Every method resolves the
 * caller's own profile first and then filters by it, so an address identifier that belongs to another
 * customer has exactly the same outcome as one that never existed.
 */
@Injectable()
export class CustomerAddressService {
  public constructor(
    private readonly profiles: CustomerProfileRepository,
    private readonly addresses: CustomerAddressRepository,
  ) {}

  public async list(principal: AuthenticatedPrincipal): Promise<readonly CustomerAddressView[]> {
    const profile = await this.profiles.findOrCreateByUserId(principal.userId);
    const rows = await this.addresses.listByCustomerId(profile.id);
    return rows.map((row) => present({ address: row, defaultAddressId: profile.defaultAddressId }));
  }

  /**
   * Saves an address for the principal. When the customer has no default yet, the new address becomes
   * the default (HC-ASM-M03-001); the promotion is a single conditional write, so two concurrent
   * creations cannot both be promoted.
   */
  public async create(
    principal: AuthenticatedPrincipal,
    input: CustomerAddressInput,
  ): Promise<CustomerAddressView> {
    const profile = await this.profiles.findOrCreateByUserId(principal.userId);
    const created = await this.addresses.create(profile.id, input);
    const promoted = await this.profiles.setDefaultAddressIfUnset(profile.id, created.id);
    return present({ address: created, defaultAddressId: promoted ? created.id : null });
  }

  public async read(
    principal: AuthenticatedPrincipal,
    addressId: string,
  ): Promise<CustomerAddressView> {
    const profile = await this.profiles.findOrCreateByUserId(principal.userId);
    const address = await this.requireOwned(profile.id, addressId);
    return present({ address, defaultAddressId: profile.defaultAddressId });
  }

  public async update(
    principal: AuthenticatedPrincipal,
    addressId: string,
    update: CustomerAddressUpdate,
  ): Promise<CustomerAddressView> {
    const profile = await this.profiles.findOrCreateByUserId(principal.userId);
    const updated = await this.addresses.updateOwned(addressId, profile.id, update);
    if (updated === null) throw AppError.addressNotFound();
    return present({ address: updated, defaultAddressId: profile.defaultAddressId });
  }

  /**
   * Deletes an owned address. When it was the selected default, the database clears the profile's
   * reference instead of promoting another address, so the reported state stays truthful.
   */
  public async remove(principal: AuthenticatedPrincipal, addressId: string): Promise<void> {
    const profile = await this.profiles.findOrCreateByUserId(principal.userId);
    const deleted = await this.addresses.deleteOwned(addressId, profile.id);
    if (!deleted) throw AppError.addressNotFound();
  }

  /**
   * Designates an owned address as the default. The ownership check happens first, so selecting another
   * customer's address is indistinguishable from selecting a non-existent one.
   */
  public async setDefault(
    principal: AuthenticatedPrincipal,
    addressId: string,
  ): Promise<CustomerAddressView> {
    const profile = await this.profiles.findOrCreateByUserId(principal.userId);
    const address = await this.requireOwned(profile.id, addressId);
    await this.profiles.setDefaultAddress(profile.id, address.id);
    return present({ address, defaultAddressId: address.id });
  }

  private async requireOwned(
    profileId: string,
    addressId: string,
  ): Promise<OwnedAddress['address']> {
    const address = await this.addresses.findOwnedById(addressId, profileId);
    if (address === null) throw AppError.addressNotFound();
    return address;
  }
}

function present(owned: OwnedAddress): CustomerAddressView {
  return {
    id: owned.address.id,
    recipientName: owned.address.recipientName,
    line1: owned.address.line1,
    line2: owned.address.line2,
    city: owned.address.city,
    region: owned.address.region,
    postalCode: owned.address.postalCode,
    countryCode: owned.address.countryCode,
    phone: owned.address.phone,
    isDefault: owned.defaultAddressId === owned.address.id,
    createdAt: owned.address.createdAt,
    updatedAt: owned.address.updatedAt,
  };
}
