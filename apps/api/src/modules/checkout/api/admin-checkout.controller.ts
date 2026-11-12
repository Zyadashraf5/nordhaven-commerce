import { Body, Controller, Get, Header, Param, Put } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { errors } from '../../../platform/http/openapi-error-responses';
import { CurrentPrincipal, Roles } from '../../../platform/security/access.decorators';
import type { AuthenticatedPrincipal } from '../../../platform/security/principal';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { CheckoutService } from '../application/checkout.service';
import { CHECKOUT_RATE_LIMITS } from './checkout.policies';
import { ConfigureDestinationRequest, DestinationCountryParam } from './checkout.request';
import { CheckoutDestinationResponse, CheckoutDestinationsResponse } from './checkout.response';

/**
 * Administrative checkout configuration.
 *
 * Every route requires the `ADMIN` role. A destination is approved for checkout by configuration,
 * and it carries both the tax jurisdiction its rules are looked up under and whether an approved
 * shipping rule covers it, because a destination needs both before a customer may check out.
 */
@ApiTags('Checkout')
@Roles('ADMIN')
@Controller({ path: 'admin/checkout', version: '1' })
export class AdminCheckoutController {
  public constructor(private readonly checkout: CheckoutService) {}

  @Get('destinations')
  @RateLimit(CHECKOUT_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listCheckoutDestinations',
    summary: 'List the approved checkout destinations',
  })
  @ApiResponse({
    status: 200,
    description: 'The approved destinations of the current environment.',
    type: CheckoutDestinationsResponse,
  })
  @errors(400, 401, 403, 429, 500, 503)
  public async list(): Promise<CheckoutDestinationsResponse> {
    return { destinations: [...(await this.checkout.listDestinations())] };
  }

  @Put('destinations/:countryCode')
  @RateLimit(CHECKOUT_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'countryCode', type: String })
  @ApiOperation({
    operationId: 'configureCheckoutDestination',
    summary: 'Approve or change a checkout destination',
    description:
      'An idempotent upsert: the first call creates the destination and later calls replace its configuration.',
  })
  @ApiBody({ type: ConfigureDestinationRequest })
  @ApiResponse({
    status: 200,
    description: 'The persisted destination.',
    type: CheckoutDestinationResponse,
  })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async configure(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: DestinationCountryParam,
    @Body() body: ConfigureDestinationRequest,
  ): Promise<CheckoutDestinationResponse> {
    return this.checkout.configureDestination({
      countryCode: params.countryCode,
      enabled: body.enabled,
      taxJurisdiction: body.taxJurisdiction,
      shippingApproved: body.shippingApproved,
      label: body.label,
      updatedByUserId: principal.userId,
    });
  }
}
