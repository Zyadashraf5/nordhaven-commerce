import { Body, Controller, Get, Header, Patch } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { errors } from '../../../platform/http/openapi-error-responses';
import { CurrentPrincipal, Roles } from '../../../platform/security/access.decorators';
import type { AuthenticatedPrincipal } from '../../../platform/security/principal';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { CustomerProfileService } from '../application/customer-profile.service';
import { CUSTOMER_RATE_LIMITS } from './customers.policies';
import { UpdateCustomerProfileRequest } from './customers.request';
import { CustomerProfileResponse, toCustomerProfileResponse } from './customers.response';

/**
 * The authenticated customer's own profile.
 *
 * The route carries no customer identifier: the scope is always the presented session's principal, so
 * no request can name another customer. Administrators are refused, keeping the MFA-protected
 * administrative role away from storefront data.
 */
@ApiTags('Customers')
@Roles('CUSTOMER')
@Controller({ path: 'customers/me/profile', version: '1' })
export class ProfileController {
  public constructor(private readonly profiles: CustomerProfileService) {}

  @Get()
  @RateLimit(CUSTOMER_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'getCustomerProfile',
    summary: "Read the authenticated customer's own profile",
    description:
      'Creates the empty profile on first access, so a customer never needs a separate creation step.',
  })
  @ApiResponse({
    status: 200,
    description: "The authenticated customer's own profile.",
    type: CustomerProfileResponse,
  })
  @errors(401, 403, 429, 500, 503)
  public async read(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<CustomerProfileResponse> {
    return toCustomerProfileResponse(await this.profiles.read(principal));
  }

  @Patch()
  @RateLimit(CUSTOMER_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'updateCustomerProfile',
    summary: "Update the authenticated customer's own profile",
    description:
      'Applies only the supplied attributes. An omitted attribute is left unchanged; null or a blank value clears an optional attribute.',
  })
  @ApiBody({ type: UpdateCustomerProfileRequest })
  @ApiResponse({
    status: 200,
    description: 'The persisted profile.',
    type: CustomerProfileResponse,
  })
  @errors(400, 401, 403, 429, 500, 503)
  public async update(
    @Body() body: UpdateCustomerProfileRequest,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<CustomerProfileResponse> {
    return toCustomerProfileResponse(await this.profiles.update(principal, body));
  }
}
