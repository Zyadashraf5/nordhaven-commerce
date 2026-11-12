import { Module } from '@nestjs/common';
import { CartModule } from '../cart';
import { InventoryModule } from '../inventory';
import { TaxModule } from '../tax';
import { AdminCheckoutController } from './api/admin-checkout.controller';
import { CheckoutController } from './api/checkout.controller';
import { CheckoutService } from './application/checkout.service';
import { CHECKOUT_QUOTER } from './contracts';
import { CheckoutDestinationRepository } from './persistence/checkout-destination.repository';

/**
 * Checkout module.
 *
 * Owns the approved checkout destinations and the checkout calculation, and nothing else. It reads
 * the cart, the inventory, and the tax configuration through those capabilities' published
 * contracts, so no feature module reaches into another one's tables.
 *
 * A checkout is a calculation, not a commitment: it reserves no stock, creates no order, and takes
 * no payment.
 */
@Module({
  imports: [CartModule, InventoryModule, TaxModule],
  controllers: [CheckoutController, AdminCheckoutController],
  providers: [
    CheckoutDestinationRepository,
    CheckoutService,
    { provide: CHECKOUT_QUOTER, useExisting: CheckoutService },
  ],
  exports: [CHECKOUT_QUOTER],
})
export class CheckoutModule {}
