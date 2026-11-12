import { Module } from '@nestjs/common';
import { ENVIRONMENT_CONFIGURATION } from '../../platform/config/environment';
import { OrderModule } from '../order';
import { AdminPaymentController } from './api/admin-payment.controller';
import { PaymentWebhookController } from './api/payment-webhook.controller';
import { PaymentController } from './api/payment.controller';
import { LocalTestPaymentProvider } from './application/local-test-payment.provider';
import { PaymentOperationsService } from './application/payment-operations.service';
import { PaymentRefundService } from './application/payment-refund.service';
import { PaymentService } from './application/payment.service';
import { PAYMENT_OPERATIONS, PAYMENT_PROVIDER, PAYMENT_REFUNDS } from './contracts';
import { PaymentOperationsRepository } from './persistence/payment-operations.repository';
import { PaymentRepository } from './persistence/payment.repository';

/**
 * Payments module.
 *
 * Owns the payment attempt, the provider event, the refund, and the provider abstraction, and
 * nothing else. It changes an order's state through the Orders capability's published contract
 * rather than by writing the Orders capability's tables, so the two capabilities do not depend on
 * each other.
 *
 * The only shipped provider is a **non-production** simulation that refuses to operate in a
 * production environment, so a production request can never collect money. The provider is bound
 * through the `PAYMENT_PROVIDER` token, so a new provider is a binding and not a change to the
 * payment rules.
 */
@Module({
  imports: [OrderModule],
  controllers: [PaymentController, AdminPaymentController, PaymentWebhookController],
  providers: [
    PaymentRepository,
    PaymentService,
    PaymentRefundService,
    PaymentOperationsRepository,
    PaymentOperationsService,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ENVIRONMENT_CONFIGURATION],
      useFactory: (configuration: { readonly nodeEnv: string }) =>
        new LocalTestPaymentProvider(configuration.nodeEnv),
    },
    { provide: PAYMENT_REFUNDS, useExisting: PaymentRefundService },
    { provide: PAYMENT_OPERATIONS, useExisting: PaymentOperationsService },
  ],
  exports: [PAYMENT_PROVIDER, PAYMENT_REFUNDS, PAYMENT_OPERATIONS],
})
export class PaymentModule {}
