import { Body, Controller, Delete, Get, Header, Param, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { errors } from '../../../platform/http/openapi-error-responses';
import { CurrentPrincipal, Roles } from '../../../platform/security/access.decorators';
import type { AuthenticatedPrincipal } from '../../../platform/security/principal';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { WishlistService } from '../application/wishlist.service';
import { CUSTOMER_RATE_LIMITS } from './customers.policies';
import { SaveWishlistItemRequest, WishlistItemIdParam } from './customers.request';
import { WishlistResponse, toWishlistResponse } from './customers.response';

/**
 * The authenticated customer's wishlist.
 *
 * The route carries no customer identifier: the scope is always the presented session's principal,
 * so no request can name another customer's wishlist. Administrators are refused, keeping the
 * MFA-protected administrative role away from storefront data.
 */
@ApiTags('Customers')
@Roles('CUSTOMER')
@Controller({ path: 'customers/me/wishlist', version: '1' })
export class WishlistController {
  public constructor(private readonly wishlists: WishlistService) {}

  @Get()
  @RateLimit(CUSTOMER_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'getCustomerWishlist',
    summary: "Read the authenticated customer's wishlist",
    description:
      'Each item reports the product and its current effective price, and whether the product is still published.',
  })
  @ApiResponse({ status: 200, description: 'The wishlist.', type: WishlistResponse })
  @errors(401, 403, 429, 500, 503)
  public async read(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<WishlistResponse> {
    return toWishlistResponse(await this.wishlists.read(principal));
  }

  @Post()
  @RateLimit(CUSTOMER_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'saveCustomerWishlistItem',
    summary: 'Save a product to the wishlist',
    description:
      'Saving a product that is already saved leaves the wishlist holding it exactly once.',
  })
  @ApiBody({ type: SaveWishlistItemRequest })
  @ApiResponse({
    status: 201,
    description: 'The wishlist after the change.',
    type: WishlistResponse,
  })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async save(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: SaveWishlistItemRequest,
  ): Promise<WishlistResponse> {
    return toWishlistResponse(await this.wishlists.save(principal, body.productId));
  }

  @Delete(':itemId')
  @RateLimit(CUSTOMER_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'itemId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'removeCustomerWishlistItem',
    summary: 'Remove a product from the wishlist',
  })
  @ApiResponse({
    status: 200,
    description: 'The wishlist after the change.',
    type: WishlistResponse,
  })
  @errors(401, 403, 404, 429, 500, 503)
  public async remove(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: WishlistItemIdParam,
  ): Promise<WishlistResponse> {
    return toWishlistResponse(await this.wishlists.remove(principal, params.itemId));
  }
}
