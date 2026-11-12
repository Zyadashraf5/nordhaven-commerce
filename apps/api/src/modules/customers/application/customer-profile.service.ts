import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../platform/security/principal';
import { CustomerProfileRepository } from '../persistence/customer-profile.repository';

/**
 * The customer's own profile as the HTTP layer presents it. The Identity-owned account identifier is
 * deliberately absent: it is not the customer's to read or change here (HC-ASM-M03-004).
 */
export interface CustomerProfileView {
  readonly displayName: string | null;
  readonly phone: string | null;
  readonly defaultAddressId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CustomerProfileUpdate {
  readonly displayName?: string | null;
  readonly phone?: string | null;
}

@Injectable()
export class CustomerProfileService {
  public constructor(private readonly profiles: CustomerProfileRepository) {}

  /**
   * Reads the principal's own profile, creating the empty profile on first access. The scope is the
   * authenticated principal alone, so no request can reach another customer's profile.
   */
  public async read(principal: AuthenticatedPrincipal): Promise<CustomerProfileView> {
    const profile = await this.profiles.findOrCreateByUserId(principal.userId);
    return {
      displayName: profile.displayName,
      phone: profile.phone,
      defaultAddressId: profile.defaultAddressId,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
    };
  }

  /**
   * Applies only the supplied attributes to the principal's own profile. An attribute that was not
   * supplied is left unchanged; an explicit `null` clears an optional attribute.
   */
  public async update(
    principal: AuthenticatedPrincipal,
    update: CustomerProfileUpdate,
  ): Promise<CustomerProfileView> {
    const profile = await this.profiles.findOrCreateByUserId(principal.userId);
    const updated = await this.profiles.updateAttributes(profile.id, {
      ...(update.displayName === undefined ? {} : { displayName: update.displayName }),
      ...(update.phone === undefined ? {} : { phone: update.phone }),
    });
    return {
      displayName: updated.displayName,
      phone: updated.phone,
      defaultAddressId: updated.defaultAddressId,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }
}
