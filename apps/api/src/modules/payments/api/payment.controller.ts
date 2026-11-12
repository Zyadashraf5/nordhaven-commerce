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
import { errors } from '../../../platform/http/openapi-error-responses';
import { CurrentPrincipal, Roles } from '../../../platform/security/access.decorators';
import type { AuthenticatedPrincipal } from '../../../platform/security/principal';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { PaymentService } from '../application/payment.service';
import { PAYMENT_RATE_LIMITS } from './payment.policies';
import { CreatePaymentAttemptRequest, PaymentAttemptIdParam } from './payment.request';
import {
  PaymentAttemptResponse,
  PaymentAttemptsResponse,
  RefundsResponse,
  toPaymentAttemptResponse,
  toPaymentAttemptsResponse,
  toRefundsResponse,
} from './payment.response';

/**
 * The authenticated customer's payments.
 *
 * Every route is scoped to the presented session's principal, so no request can reach another
 * customer's payment, and the `CUSTOMER` role keeps an administrator account away from storefront
 * data.
 */
@ApiTags('Payments')
@Roles('CUSTOMER')
@Controller({ path: 'payments', version: '1' })
export class PaymentController {
  public constructor(private readonly payments: PaymentService) {}

  @Get()
  @RateLimit(PAYMENT_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listPayments',
    summary: "List the authenticated customer's payment attempts",
    description: 'Newest first. Every attempt reports its own amount and its own state.',
  })
  @ApiResponse({
    status: 200,
    description: "The customer's attempts.",
    type: PaymentAttemptsResponse,
  })
  @errors(400, 401, 403, 429, 500, 503)
  public async list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<PaymentAttemptsResponse> {
    return toPaymentAttemptsResponse(await this.payments.attemptsForCustomer(principal.userId, 50));
  }

  @Post('attempts')
  @RateLimit(PAYMENT_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'createPaymentAttempt',
    summary: 'Start a payment attempt for an order',
    description:
      'The `Idempotency-Key` header is the stable business key, scoped to the customer, so a repeated or a concurrent request returns the attempt the first one created. The amount is the order total; a client never supplies one.',
  })
  @ApiBody({ type: CreatePaymentAttemptRequest })
  @ApiResponse({ status: 201, description: 'The created attempt.', type: PaymentAttemptResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: CreatePaymentAttemptRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<PaymentAttemptResponse> {
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
    return toPaymentAttemptResponse(
      await this.payments.createAttempt({
        customerId: principal.userId,
        orderId: body.orderId,
        idempotencyKey: idempotencyKey.trim(),
      }),
    );
  }

  @Get('attempts/:paymentAttemptId/refunds')
  @RateLimit(PAYMENT_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'paymentAttemptId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'listPaymentRefunds',
    summary: 'List the refunds of one payment attempt',
  })
  @ApiResponse({ status: 200, description: 'The refunds.', type: RefundsResponse })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async listRefunds(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: PaymentAttemptIdParam,
  ): Promise<RefundsResponse> {
    const refunds = await this.payments.refundsForAttempt(params.paymentAttemptId);
    return toRefundsResponse(refunds.filter((refund) => refund.customerId === principal.userId));
  }
}
