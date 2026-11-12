import { Module } from '@nestjs/common';
import { CartModule } from '../cart';
import { CheckoutModule } from '../checkout';
import { InventoryModule } from '../inventory';
import { AdminOrderController } from './api/admin-order.controller';
import { OrderController } from './api/order.controller';
import { OrderService } from './application/order.service';
import { PreOrderService } from './application/pre-order.service';
import { ORDER_LEDGER } from './contracts';
import { OrderRepository } from './persistence/order.repository';
import { PreOrderRepository } from './persistence/pre-order.repository';

/**
 * Orders module.
 *
 * Owns the order aggregate, its immutable commercial snapshots, its states, its recorded
 * transitions, and the pre-order intent. It references no other capability's tables: the customer's
 * identifier is a stable foreign identifier, the reservation is the Inventory capability's own
 * record, and the price, the tax, and the stock availability all come through the published
 * contracts of the Checkout, Cart, Inventory, and Tax capabilities.
 */
@Module({
  imports: [CartModule, CheckoutModule, InventoryModule],
  controllers: [OrderController, AdminOrderController],
  providers: [
    OrderRepository,
    PreOrderRepository,
    OrderService,
    PreOrderService,
    { provide: ORDER_LEDGER, useExisting: OrderService },
  ],
  exports: [ORDER_LEDGER],
})
export class OrderModule {}
