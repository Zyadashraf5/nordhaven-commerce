import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { errors } from '../../../platform/http/openapi-error-responses';
import { CurrentPrincipal, Roles } from '../../../platform/security/access.decorators';
import type { AuthenticatedPrincipal } from '../../../platform/security/principal';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { CustomerAddressService } from '../application/customer-address.service';
import { CUSTOMER_RATE_LIMITS } from './customers.policies';
import {
  CreateCustomerAddressRequest,
  CustomerAddressIdParam,
  UpdateCustomerAddressRequest,
} from './customers.request';
import {
  CustomerAddressResponse,
  CustomerAddressesResponse,
  toCustomerAddressResponse,
  toCustomerAddressesResponse,
} from './customers.response';

/**
 * The authenticated customer's own saved shipping addresses.
 *
 * Every operation resolves the caller's own profile first and then filters by it, so an address
 * identifier that belongs to another customer is answered exactly like one that never existed.
 */
@ApiTags('Customers')
@Roles('CUSTOMER')
@Controller({ path: 'customers/me/addresses', version: '1' })
export class AddressesController {
  public constructor(private readonly addresses: CustomerAddressService) {}

  @Get()
  @RateLimit(CUSTOMER_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listCustomerAddresses',
    summary: "List the authenticated customer's saved addresses",
  })
  @ApiResponse({
    status: 200,
    description: "The authenticated customer's own saved addresses, in a deterministic order.",
    type: CustomerAddressesResponse,
  })
  @errors(401, 403, 429, 500, 503)
  public async list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<CustomerAddressesResponse> {
    return toCustomerAddressesResponse(await this.addresses.list(principal));
  }

  @Post()
  @RateLimit(CUSTOMER_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'createCustomerAddress',
    summary: 'Save a new shipping address',
    description:
      'The first address a customer saves becomes the default; later addresses do not change the selection.',
  })
  @ApiBody({ type: CreateCustomerAddressRequest })
  @ApiResponse({
    status: 201,
    description: 'The saved address.',
    type: CustomerAddressResponse,
  })
  @errors(400, 401, 403, 429, 500, 503)
  public async create(
    @Body() body: CreateCustomerAddressRequest,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<CustomerAddressResponse> {
    return toCustomerAddressResponse(await this.addresses.create(principal, body));
  }

  @Get(':addressId')
  @RateLimit(CUSTOMER_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'addressId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'getCustomerAddress',
    summary: 'Read one owned address',
  })
  @ApiResponse({ status: 200, description: 'The owned address.', type: CustomerAddressResponse })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async read(
    @Param() params: CustomerAddressIdParam,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<CustomerAddressResponse> {
    return toCustomerAddressResponse(await this.addresses.read(principal, params.addressId));
  }

  @Patch(':addressId')
  @RateLimit(CUSTOMER_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'addressId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'updateCustomerAddress',
    summary: 'Update one owned address',
    description:
      'Applies only the supplied attributes. A required attribute may not be cleared; an optional attribute is cleared with null or a blank value.',
  })
  @ApiBody({ type: UpdateCustomerAddressRequest })
  @ApiResponse({
    status: 200,
    description: 'The persisted address.',
    type: CustomerAddressResponse,
  })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async update(
    @Param() params: CustomerAddressIdParam,
    @Body() body: UpdateCustomerAddressRequest,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<CustomerAddressResponse> {
    return toCustomerAddressResponse(
      await this.addresses.update(principal, params.addressId, body),
    );
  }

  @Delete(':addressId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit(CUSTOMER_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'addressId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'deleteCustomerAddress',
    summary: 'Delete one owned address',
    description: 'Deleting the default address clears the default selection.',
  })
  @ApiResponse({ status: 204, description: 'The address was removed.' })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async remove(
    @Param() params: CustomerAddressIdParam,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<void> {
    await this.addresses.remove(principal, params.addressId);
  }

  @Put(':addressId/default')
  @RateLimit(CUSTOMER_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'addressId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'setDefaultCustomerAddress',
    summary: 'Select one owned address as the default',
    description:
      'Idempotent. Exactly one address is the default afterwards, including under concurrent selection.',
  })
  @ApiResponse({
    status: 200,
    description: 'The selected address.',
    type: CustomerAddressResponse,
  })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async setDefault(
    @Param() params: CustomerAddressIdParam,
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<CustomerAddressResponse> {
    return toCustomerAddressResponse(await this.addresses.setDefault(principal, params.addressId));
  }
}
