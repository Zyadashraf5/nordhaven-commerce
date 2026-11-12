import { type DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AdministrationModule } from './modules/administration';
import { CartModule } from './modules/cart';
import { CatalogModule } from './modules/catalog';
import { CheckoutModule } from './modules/checkout';
import { CustomersModule } from './modules/customers';
import { HealthModule } from './modules/health';
import { IdentityModule } from './modules/identity';
import { InventoryModule } from './modules/inventory';
import { NotificationModule } from './modules/notification';
import { OrderModule } from './modules/order';
import { PaymentModule } from './modules/payments';
import { ReviewModule } from './modules/review';
import { ShippingModule } from './modules/shipping';
import { TaxModule } from './modules/tax';
import { AvailabilityGuard } from './platform/availability/availability.guard';
import type { EnvironmentConfiguration } from './platform/config/environment';
import { EnvironmentModule } from './platform/config/environment.module';
import { DatabaseModule } from './platform/database/database.module';
import { PlatformModule } from './platform/platform.module';
import { RateLimitGuard } from './platform/security/rate-limit.guard';
import { RolesGuard } from './platform/security/roles.guard';
import { SessionAuthGuard } from './platform/security/session-auth.guard';

@Module({})
export class AppModule {
  public static register(configuration: EnvironmentConfiguration): DynamicModule {
    return {
      module: AppModule,
      imports: [
        EnvironmentModule.forRoot(configuration),
        PlatformModule,
        DatabaseModule,
        IdentityModule,
        CustomersModule,
        CatalogModule,
        InventoryModule,
        TaxModule,
        CartModule,
        CheckoutModule,
        OrderModule,
        PaymentModule,
        ShippingModule,
        NotificationModule,
        ReviewModule,
        AdministrationModule,
        HealthModule,
      ],
      /**
       * Global guard order is part of the contract and is therefore explicit:
       *
       * 1. availability — an outage is never reported as an authentication failure (503 before 401);
       * 2. rate limit   — bounds load before any credential work happens;
       * 3. session auth — resolves the principal, or rejects with 401;
       * 4. roles        — decides authorization and records the decision.
       */
      providers: [
        { provide: APP_GUARD, useClass: AvailabilityGuard },
        { provide: APP_GUARD, useClass: RateLimitGuard },
        { provide: APP_GUARD, useClass: SessionAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    };
  }
}
