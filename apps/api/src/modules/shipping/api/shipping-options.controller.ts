import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { errors } from '../../../platform/http/openapi-error-responses';
import { Public } from '../../../platform/security/access.decorators';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { ShippingService } from '../application/shipping.service';
import { SHIPPING_RATE_LIMITS } from './shipping.policies';
import { ShippingDestinationQuery } from './shipping.request';
import { ShippingOptionsResponse, toShippingOptionResponse } from './shipping.response';

/**
 * The shipping options a customer may be offered.
 *
 * The route is anonymous, because a guest must be able to see what shipping exists before they
 * have an account, exactly as the catalog's browsing routes are anonymous.
 *
 * The route **never invents** an option. It reports the methods an administrator configured for
 * that destination, and a destination with no configured method has no options.
 */
@ApiTags('Shipping')
@Public()
@Controller({ path: 'shipping', version: '1' })
export class ShippingOptionsController {
  public constructor(private readonly shipping: ShippingService) {}

  @Get('options')
  @RateLimit(SHIPPING_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listShippingOptions',
    summary: 'List the shipping options configured for a destination',
    description:
      'The options are administrator configuration. The platform computes no rate and promises no delivery date, because no shipping provider or rate is approved yet.',
  })
  @ApiResponse({
    status: 200,
    description: 'The configured options.',
    type: ShippingOptionsResponse,
  })
  @errors(400, 429, 500, 503)
  public async listOptions(
    @Query() query: ShippingDestinationQuery,
  ): Promise<ShippingOptionsResponse> {
    const options = await this.shipping.optionsFor(query.destinationCountryCode);
    return {
      environment: this.shipping.environment,
      chargeCollected: false,
      options: options.map(toShippingOptionResponse),
    };
  }
}
