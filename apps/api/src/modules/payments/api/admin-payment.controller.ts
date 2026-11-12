import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppError } from '../../../platform/http/app-error';
import { errors } from '../../../platform/http/openapi-error-responses';
import type { AuthenticatedPrincipal } from '../../../platform/security/principal';
import { CurrentPrincipal, Roles } from '../../../platform/security/access.decorators';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { PaymentService } from '../application/payment.service';
import { PAYMENT_RATE_LIMITS } from './payment.policies';
import { CreateRefundRequest, PaymentAttemptIdParam } from './payment.request';
import {
  PaymentAttemptsResponse,
  ProviderEventsResponse,
  RefundCreatedResponse,
  RefundsResponse,
  ReconciliationResponse,
  toPaymentAttemptsResponse,
  toRefundsResponse,
} from './payment.response';

/**
 * Administrative payment and refund management.
 *
 * Every route requires the `ADMIN` role. A refund is an administrative action, so it is
 * deliberately **not** on the customer surface: a customer asks for a cancellation, and the
 * platform decides whether money is returned.
 */
@ApiTags('Payments')
@Roles('ADMIN')
@Controller({ path: 'admin/payments', version: '1' })
export class AdminPaymentController {
  public constructor(private readonly payments: PaymentService) {}

  @Get()
  @RateLimit(PAYMENT_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listAdminPayments',
    summary: 'List every payment attempt',
    description:
      'Newest first. The administrative surface reads payments and never collects money.',
  })
  @ApiResponse({ status: 200, description: 'The attempts.', type: PaymentAttemptsResponse })
  @errors(400, 401, 403, 429, 500, 503)
  public async list(): Promise<PaymentAttemptsResponse> {
    return toPaymentAttemptsResponse(await this.payments.allAttempts(50));
  }

  @Get('events')
  @RateLimit(PAYMENT_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listAdminProviderEvents',
    summary: 'List the recorded provider events',
    description:
      'Every delivered event is recorded whatever its outcome, so a rejected, a duplicated, or an unknown event is auditable.',
  })
  @ApiResponse({ status: 200, description: 'The recorded events.', type: ProviderEventsResponse })
  @errors(400, 401, 403, 429, 500, 503)
  public async listEvents(): Promise<ProviderEventsResponse> {
    const events = await this.payments.events(null, 50);
    return {
      events: events.map((event) => ({
        id: event.id,
        provider: event.provider,
        providerEventId: event.providerEventId,
        eventType: event.eventType,
        outcome: event.outcome,
        orderId: event.orderId,
        paymentAttemptId: event.paymentAttemptId,
        reason: event.reason,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }

  @Post('refunds')
  @RateLimit(PAYMENT_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'createRefund',
    summary: 'Refund a payment, in full or in part',
    description:
      'The `Idempotency-Key` header is the stable business key, so a repeated request returns the refund the first one created. The refunds for one payment can never exceed the amount that was paid, even when two refunds race.',
  })
  @ApiBody({ type: CreateRefundRequest })
  @ApiResponse({ status: 201, description: 'The refund.', type: RefundCreatedResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async refund(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: CreateRefundRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<RefundCreatedResponse> {
    if (
      idempotencyKey === undefined ||
      idempotencyKey.trim().length < 8 ||
      idempotencyKey.trim().length > 200
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [{ path: 'Idempotency-Key', message: 'Invalid value' }],
      });
    }
    const attempt = await this.payments.attemptOf(body.paymentAttemptId);
    if (attempt === null) throw AppError.paymentNotFound();
    const result = await this.payments.refund({
      customerId: attempt.customerId,
      actorUserId: principal.userId,
      paymentAttemptId: body.paymentAttemptId,
      idempotencyKey: idempotencyKey.trim(),
      amountMinor: body.amountMinor,
      reason: body.reason,
    });
    return {
      refundId: result.refundId,
      status: result.status,
      amountMinor: result.amountMinor,
    };
  }

  @Get('attempts/:paymentAttemptId/refunds')
  @RateLimit(PAYMENT_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'paymentAttemptId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'listAdminPaymentRefunds',
    summary: 'List the refunds of one payment attempt',
  })
  @ApiResponse({ status: 200, description: 'The refunds.', type: RefundsResponse })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async listRefunds(@Param() params: PaymentAttemptIdParam): Promise<RefundsResponse> {
    return toRefundsResponse(await this.payments.refundsForAttempt(params.paymentAttemptId));
  }

  @Get('reconciliation')
  @RateLimit(PAYMENT_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'reconcilePayments',
    summary: 'Compare the platform records with the provider records',
    description:
      'The provider is the authority, so a difference is reported rather than silently resolved in the platform favour. The operation is a read: it reports and records, and it never moves money.',
  })
  @ApiResponse({
    status: 200,
    description: 'The reconciliation result.',
    type: ReconciliationResponse,
  })
  @errors(400, 401, 403, 429, 500, 503)
  public async reconcile(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<ReconciliationResponse> {
    const result = await this.payments.reconcile(principal.userId);
    return {
      checked: result.checked,
      differences: result.differences.map((difference) => ({
        attemptId: difference.attemptId,
        orderId: difference.orderId,
        platformStatus: difference.platformStatus,
        providerStatus: difference.providerStatus,
        reason: difference.reason,
      })),
    };
  }
}
