import { CatalogModule } from '../catalog';
import { InventoryModule } from '../inventory';
import { Module } from '@nestjs/common';
import { CartController } from './api/cart.controller';
import { CartService } from './application/cart.service';
import { CART_READER, CART_WRITER } from './contracts';
import { CartRepository } from './persistence/cart.repository';

/**
 * Cart module.
 *
 * Owns the authenticated customer's cart, its lines, and the last-known prices they carry, and
 * nothing else. It references the catalog's sellable SKUs and the inventory's bundles only through
 * declared database foreign keys (research R2).
 * Catalog and Inventory facts are resolved through published owner contracts; neither depends on Cart.
 *
 * A cart is an intent record, not a commitment. It never reserves or holds stock, and it creates
 * no checkout, order, or payment.
 */
@Module({
  imports: [CatalogModule, InventoryModule],
  controllers: [CartController],
  providers: [
    CartRepository,
    CartService,
    { provide: CART_READER, useExisting: CartService },
    { provide: CART_WRITER, useExisting: CartService },
  ],
  exports: [CART_READER, CART_WRITER],
})
export class CartModule {}
