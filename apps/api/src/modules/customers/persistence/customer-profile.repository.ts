import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service';
import { isUniqueConstraintViolation } from './prisma-errors';

/**
 * The Customers module's own view of one customer profile. `userId` is a stable foreign identifier of
 * the Identity-owned customer; the table deliberately holds no foreign key to it (HC-DEC-003 Open).
 */
export interface CustomerProfileRecord {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string | null;
  readonly phone: string | null;
  readonly defaultAddressId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Attributes a customer may change on their own profile. An omitted attribute is left unchanged. */
export interface ProfileAttributeUpdate {
  readonly displayName?: string | null;
  readonly phone?: string | null;
}

const PROFILE_SELECT = {
  id: true,
  userId: true,
  displayName: true,
  phone: true,
  defaultAddressId: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class CustomerProfileRepository {
  public constructor(private readonly database: DatabaseService) {}

  /**
   * Returns the customer's profile, creating the empty profile on first access.
   *
   * The fast path is a single read. When the profile is absent the insert can still lose a race against
   * a concurrent first request, so a unique-constraint violation is treated as "someone else just
   * created it" and the existing row is read back. That makes first access safe without failing a
   * legitimate request.
   */
  public async findOrCreateByUserId(userId: string): Promise<CustomerProfileRecord> {
    const existing = await this.database.prisma.customerProfile.findUnique({
      where: { userId },
      select: PROFILE_SELECT,
    });
    if (existing !== null) return existing;

    try {
      return await this.database.prisma.customerProfile.create({
        data: { userId },
        select: PROFILE_SELECT,
      });
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) throw error;
      const raced = await this.database.prisma.customerProfile.findUnique({
        where: { userId },
        select: PROFILE_SELECT,
      });
      if (raced === null) throw error;
      return raced;
    }
  }

  public async findByUserId(userId: string): Promise<CustomerProfileRecord | null> {
    return this.database.prisma.customerProfile.findUnique({
      where: { userId },
      select: PROFILE_SELECT,
    });
  }

  public async updateAttributes(
    profileId: string,
    update: ProfileAttributeUpdate,
  ): Promise<CustomerProfileRecord> {
    return this.database.prisma.customerProfile.update({
      where: { id: profileId },
      data: {
        ...(update.displayName === undefined ? {} : { displayName: update.displayName }),
        ...(update.phone === undefined ? {} : { phone: update.phone }),
      },
      select: PROFILE_SELECT,
    });
  }

  /**
   * Selects an owned address as the default. The caller has already verified ownership; the single
   * reference column makes "at most one default" structural, so this write cannot create a second one.
   */
  public async setDefaultAddress(
    profileId: string,
    addressId: string | null,
  ): Promise<CustomerProfileRecord> {
    return this.database.prisma.customerProfile.update({
      where: { id: profileId },
      data: { defaultAddressId: addressId },
      select: PROFILE_SELECT,
    });
  }

  /**
   * Promotes an address to the default only while the customer still has no default, in one conditional
   * statement. Returns false when a default already exists, including when a concurrent request won.
   */
  public async setDefaultAddressIfUnset(profileId: string, addressId: string): Promise<boolean> {
    const result = await this.database.prisma.customerProfile.updateMany({
      where: { id: profileId, defaultAddressId: null },
      data: { defaultAddressId: addressId },
    });
    return result.count > 0;
  }
}
