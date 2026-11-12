import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity';
import { NotificationModule } from '../notification';
import { OrderModule } from '../order';
import { PaymentModule } from '../payments';
import { ReviewModule } from '../review';
import { ShippingModule } from '../shipping';
import { AdministrationController } from './api/administration.controller';
import { AdministrationService } from './application/administration.service';
import { ADMINISTRATION_VIEW } from './contracts';

/**
 * Administration module.
 *
 * A **thin orchestration layer** over the completed platform. It presents the catalog's, the
 * inventory's, the orders', the shipping's, the reviews', the notifications', the payments', and
 * the identity's own facts through their published contracts, and it owns **no** table and **no**
 * business rule.
 *
 * The capability therefore has no bypass path into another capability's persistence, and an
 * operational action always stays in the capability that owns the rule.
 */
@Module({
  imports: [
    OrderModule,
    ShippingModule,
    ReviewModule,
    NotificationModule,
    PaymentModule,
    IdentityModule,
  ],
  controllers: [AdministrationController],
  providers: [
    AdministrationService,
    { provide: ADMINISTRATION_VIEW, useExisting: AdministrationService },
  ],
  exports: [ADMINISTRATION_VIEW],
})
export class AdministrationModule {}
