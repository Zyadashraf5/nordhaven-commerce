import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service';

/**
 * One saved shipping address owned by exactly one customer profile. Every read and write in this
 * repository is scoped by the owning profile identifier, so a foreign or unknown address identifier
 * has no observable difference from a missing one.
 */
export interface CustomerAddressRecord {
  readonly id: string;
  readonly customerId: string;
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
}

/** Attributes a customer may set when saving an address. */
export interface CustomerAddressAttributes {
  readonly recipientName: string;
  readonly line1: string;
  readonly line2: string | null;
  readonly city: string;
  readonly region: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string;
  readonly phone: string | null;
}

/** Attributes a customer may change on an owned address. An omitted attribute is left unchanged. */
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

const ADDRESS_SELECT = {
  id: true,
  customerId: true,
  recipientName: true,
  line1: true,
  line2: true,
  city: true,
  region: true,
  postalCode: true,
  countryCode: true,
  phone: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class CustomerAddressRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async create(
    customerId: string,
    attributes: CustomerAddressAttributes,
  ): Promise<CustomerAddressRecord> {
    return this.database.prisma.customerAddress.create({
      data: { customerId, ...attributes },
      select: ADDRESS_SELECT,
    });
  }

  /** Deterministic order so a list response is reproducible. */
  public async listByCustomerId(customerId: string): Promise<readonly CustomerAddressRecord[]> {
    return this.database.prisma.customerAddress.findMany({
      where: { customerId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: ADDRESS_SELECT,
    });
  }

  public async findOwnedById(
    addressId: string,
    customerId: string,
  ): Promise<CustomerAddressRecord | null> {
    return this.database.prisma.customerAddress.findFirst({
      where: { id: addressId, customerId },
      select: ADDRESS_SELECT,
    });
  }

  /**
   * Applies a partial update only to an address the customer owns. The ownership predicate is part of
   * the write itself, so a foreign identifier cannot be modified even transiently. Returns null when
   * nothing matched — an unknown address, another customer's address, or one already deleted.
   */
  public async updateOwned(
    addressId: string,
    customerId: string,
    update: CustomerAddressUpdate,
  ): Promise<CustomerAddressRecord | null> {
    const result = await this.database.prisma.customerAddress.updateMany({
      where: { id: addressId, customerId },
      data: {
        ...(update.recipientName === undefined ? {} : { recipientName: update.recipientName }),
        ...(update.line1 === undefined ? {} : { line1: update.line1 }),
        ...(update.line2 === undefined ? {} : { line2: update.line2 }),
        ...(update.city === undefined ? {} : { city: update.city }),
        ...(update.region === undefined ? {} : { region: update.region }),
        ...(update.postalCode === undefined ? {} : { postalCode: update.postalCode }),
        ...(update.countryCode === undefined ? {} : { countryCode: update.countryCode }),
        ...(update.phone === undefined ? {} : { phone: update.phone }),
      },
    });
    if (result.count === 0) return null;
    return this.findOwnedById(addressId, customerId);
  }

  /**
   * Deletes an address the customer owns. When the address was the selected default, the database's
   * `ON DELETE SET NULL` clears the profile's reference, so no other address is silently promoted.
   */
  public async deleteOwned(addressId: string, customerId: string): Promise<boolean> {
    const result = await this.database.prisma.customerAddress.deleteMany({
      where: { id: addressId, customerId },
    });
    return result.count > 0;
  }
}
