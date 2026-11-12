import { NotificationModule } from '../notification';
import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory';
import { OrderModule } from '../order';
import { PaymentModule } from '../payments';
import { AdminShippingController } from './api/admin-shipping.controller';
import { CustomerShippingController } from './api/customer-shipping.controller';
import { ShippingOptionsController } from './api/shipping-options.controller';
import { ShippingService } from './application/shipping.service';
import { SHIPPING_FULFILLMENT } from './contracts';
import { ShippingRepository } from './persistence/shipping.repository';

/**
 * Shipping and Fulfillment module.
 *
 * Owns the shipping destinations, the shipping methods, the shipments, and the returns, and
 * nothing else. It reads an order through the Orders capability's published ledger, puts returned
 * goods back into stock through the Inventory capability's published restock contract, and returns
 * the money through the Payments capability's published refund contract, so it never reaches into
 * another capability's tables.
 *
 * The module deliberately has **no shipping provider**. HC-DEC-013 leaves the providers, the rate
 * calculation, and the service areas open, so a method's amount is administrator configuration, a
 * tracking reference is administrator text, and the model has no delivery estimate at all.
 */
@Module({
  imports: [OrderModule, InventoryModule, PaymentModule, NotificationModule],
  controllers: [ShippingOptionsController, CustomerShippingController, AdminShippingController],
  providers: [
    ShippingRepository,
    ShippingService,
    { provide: SHIPPING_FULFILLMENT, useExisting: ShippingService },
  ],
  exports: [SHIPPING_FULFILLMENT],
})
export class ShippingModule {}
