import { Body, Controller, Header, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { errors } from '../../../platform/http/openapi-error-responses';
import { CurrentPrincipal, Roles } from '../../../platform/security/access.decorators';
import type { AuthenticatedPrincipal } from '../../../platform/security/principal';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { CheckoutService } from '../application/checkout.service';
import { CHECKOUT_RATE_LIMITS } from './checkout.policies';
import { QuoteCheckoutRequest } from './checkout.request';
import { CheckoutQuoteResponse, toCheckoutQuoteResponse } from './checkout.response';

/**
 * The authenticated customer's checkout.
 *
 * Every route is scoped to the presented session's principal, so no request can quote another
 * customer's cart, and the `CUSTOMER` role keeps an administrator account away from storefront
 * data.
 *
 * A quote is a calculation, not a commitment: it reserves no stock, creates no order, and takes no
 * payment.
 */
@ApiTags('Checkout')
@Roles('CUSTOMER')
@Controller({ path: 'checkout', version: '1' })
export class CheckoutController {
  public constructor(private readonly checkout: CheckoutService) {}

  @Post('quotes')
  @RateLimit(CHECKOUT_RATE_LIMITS.quote)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'quoteCheckout',
    summary: 'Quote the cart for a destination',
    description:
      'The server recalculates every amount from the cart and its own configuration. A client-supplied price or total is never used, and a quote that is not ready names every reason why.',
  })
  @ApiBody({ type: QuoteCheckoutRequest })
  @ApiResponse({
    status: 201,
    description: 'The quote, which reports its readiness and its blockers.',
    type: CheckoutQuoteResponse,
  })
  @errors(400, 401, 403, 429, 500, 503)
  public async quote(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: QuoteCheckoutRequest,
  ): Promise<CheckoutQuoteResponse> {
    return toCheckoutQuoteResponse(
      await this.checkout.quote({
        customerId: principal.userId,
        destinationCountryCode: body.destinationCountryCode,
      }),
    );
  }
}
