import { Controller, Headers, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppError } from '../../../platform/http/app-error';
import { errors } from '../../../platform/http/openapi-error-responses';
import { Public } from '../../../platform/security/access.decorators';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { PaymentService } from '../application/payment.service';
import { PAYMENT_RATE_LIMITS } from './payment.policies';
import { ProviderWebhookBody, ProviderWebhookResponse } from './payment.webhook.response';

/**
 * The provider event intake.
 *
 * The route is **public**, because a provider is not an authenticated customer, and it is exactly
 * that which makes the verification load-bearing: the platform never trusts the body before the
 * provider adapter has verified the signature, the timestamp, and the shape.
 *
 * The body is the **provider's own** format. The platform verifies it and maps it into its own
 * vocabulary, so a provider's types never become a core domain model, which is what the payment
 * provider abstraction requires.
 */
@ApiTags('Payments')
@Controller({ path: 'payments/webhooks', version: '1' })
export class PaymentWebhookController {
  public constructor(private readonly payments: PaymentService) {}

  @Post(':provider')
  @Public()
  @RateLimit(PAYMENT_RATE_LIMITS.webhook)
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'provider', type: String })
  @ApiOperation({
    operationId: 'receiveProviderPaymentEvent',
    summary: 'Deliver a provider payment event',
    description:
      'The event is verified before anything changes: a valid signature over the raw body, a timestamp inside the accepted window, and an unconsumed event identifier. An event that fails any check is refused with `401` and changes nothing, and every refusal is recorded so an attempt to forge a payment is visible. The body is the provider’s own format; the platform maps it into its own vocabulary.',
  })
  @ApiBody({ type: ProviderWebhookBody })
  @ApiResponse({
    status: 200,
    description: 'The event was received.',
    type: ProviderWebhookResponse,
  })
  @errors(400, 401, 429, 500, 503)
  public async receive(
    @Req() request: { readonly rawBody?: Buffer },
    @Headers() headers: Record<string, string | undefined>,
    @Param('provider') provider: string,
  ): Promise<ProviderWebhookResponse> {
    if (request.rawBody === undefined) throw AppError.paymentEventUnverified('RAW_BODY_MISSING');
    const rawBody = request.rawBody.toString('utf8');
    if (!Buffer.from(rawBody, 'utf8').equals(request.rawBody))
      throw AppError.paymentEventUnverified('BODY_ENCODING_INVALID');
    const outcome = await this.payments.handleProviderEvent(provider, rawBody, headers);
    if (!outcome.verified) {
      // A forged, an unsigned, a stale, or a malformed event changes nothing, and the refusal is
      // recorded so an operator can see it.
      throw AppError.paymentEventUnverified(outcome.reason);
    }
    return { received: true, outcome: outcome.result };
  }
}
