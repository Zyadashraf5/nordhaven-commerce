import { CreateRefundRequest } from '../../apps/api/src/modules/payments/api/payment.request';
import { ZOD_VALIDATION_SCHEMA } from '../../apps/api/src/platform/validation/zod-validation.pipe';
import { OrderController } from '../../apps/api/src/modules/order/api/order.controller';
import type { OrderService } from '../../apps/api/src/modules/order/application/order.service';
import type { PreOrderService } from '../../apps/api/src/modules/order/application/pre-order.service';
import { PaymentController } from '../../apps/api/src/modules/payments/api/payment.controller';
import { AdminPaymentController } from '../../apps/api/src/modules/payments/api/admin-payment.controller';
import type { PaymentService } from '../../apps/api/src/modules/payments/application/payment.service';
const principal = {
  userId: '11111111-1111-4111-8111-111111111111',
  role: 'CUSTOMER' as const,
  sessionId: 's',
  sessionExpiresAt: new Date(),
};
describe('bounded business idempotency headers', () => {
  it.each([undefined, 'short', 'x'.repeat(201)])(
    'rejects an invalid order key before persistence',
    async (key) => {
      const controller = new OrderController({} as OrderService, {} as PreOrderService);
      await expect(
        controller.create(
          principal,
          { destinationCountryCode: 'EG', expectedFingerprint: null },
          key,
        ),
      ).rejects.toMatchObject({ status: 400 });
    },
  );
  it('rejects oversized payment and refund keys before persistence', async () => {
    const payment = new PaymentController({} as PaymentService);
    const refund = new AdminPaymentController({} as PaymentService);
    await expect(
      payment.create(principal, { orderId: principal.userId }, 'x'.repeat(201)),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      refund.refund(
        { ...principal, role: 'ADMIN' },
        { paymentAttemptId: principal.userId, amountMinor: 1, reason: null },
        'x'.repeat(201),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('refund amount representation', () => {
  it('can refund the full amount of every representable order', () => {
    const schema = CreateRefundRequest[ZOD_VALIDATION_SCHEMA];
    expect(
      schema.safeParse({ paymentAttemptId: principal.userId, amountMinor: 2_100_000_000 }).success,
    ).toBe(true);
    expect(
      schema.safeParse({ paymentAttemptId: principal.userId, amountMinor: 2_147_483_648 }).success,
    ).toBe(false);
  });
});
