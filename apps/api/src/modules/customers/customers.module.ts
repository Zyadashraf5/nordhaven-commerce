import { CatalogModule } from '../catalog';
import { Module } from '@nestjs/common';
import { AddressesController } from './api/addresses.controller';
import { ProfileController } from './api/profile.controller';
import { WishlistController } from './api/wishlist.controller';
import { CustomerAddressService } from './application/customer-address.service';
import { CustomerProfileService } from './application/customer-profile.service';
import { WishlistService } from './application/wishlist.service';
import { CustomerAddressRepository } from './persistence/customer-address.repository';
import { CustomerProfileRepository } from './persistence/customer-profile.repository';
import { WishlistRepository } from './persistence/wishlist.repository';

/**
 * Customer Profiles module.
 *
 * Owns the storefront-facing customer profile, the customer's saved shipping addresses, and the
 * customer's wishlist, and nothing else. It integrates with Identity and Access only through the
 * platform authorization contract (`@Roles`, `@CurrentPrincipal`, and the global guard chain): it
 * never imports the Identity module and never reads or writes the Identity tables, keeping the
 * customer's account identifier as a stable foreign identifier only.
 *
 * The wishlist references the catalog's products through a declared database foreign key
 * (specs/007-cart-wishlist research R3). Purchase lookup uses the published Catalog reader.
 */
@Module({
  imports: [CatalogModule],
  controllers: [ProfileController, AddressesController, WishlistController],
  providers: [
    CustomerProfileRepository,
    CustomerAddressRepository,
    WishlistRepository,
    CustomerProfileService,
    CustomerAddressService,
    WishlistService,
  ],
})
export class CustomersModule {}
