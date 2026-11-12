import { Body, Controller, Delete, Get, Header, Param, Patch, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { errors } from '../../../platform/http/openapi-error-responses';
import { CurrentPrincipal, Roles } from '../../../platform/security/access.decorators';
import type { AuthenticatedPrincipal } from '../../../platform/security/principal';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { CartService } from '../application/cart.service';
import { CART_RATE_LIMITS } from './cart.policies';
import {
  AddCartBundleRequest,
  AddCartItemRequest,
  CartItemIdParam,
  SetCartItemQuantityRequest,
} from './cart.request';
import { CartResponse, toCartResponse } from './cart.response';

/**
 * The authenticated customer's cart.
 *
 * Every route is scoped to the presented session's principal, so no request can name or reach
 * another customer's cart, and the `CUSTOMER` role keeps an administrator account away from
 * storefront data. A cart is an intent record: it holds no stock and creates no reservation.
 */
@ApiTags('Cart')
@Roles('CUSTOMER')
@Controller({ path: 'cart', version: '1' })
export class CartController {
  public constructor(private readonly carts: CartService) {}

  @Get()
  @RateLimit(CART_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'getCart',
    summary: "Read the authenticated customer's cart",
    description:
      'Every line reports the price the customer last agreed to, the current effective price, and whether the two differ.',
  })
  @ApiResponse({ status: 200, description: 'The cart, which may be empty.', type: CartResponse })
  @errors(401, 403, 429, 500, 503)
  public async read(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<CartResponse> {
    return toCartResponse(await this.carts.read(principal));
  }

  @Post('items')
  @RateLimit(CART_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'addCartItem',
    summary: 'Add a SKU to the cart',
    description:
      'Adding a SKU that is already in the cart increases that line instead of creating a second one.',
  })
  @ApiBody({ type: AddCartItemRequest })
  @ApiResponse({ status: 201, description: 'The cart after the change.', type: CartResponse })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async add(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: AddCartItemRequest,
  ): Promise<CartResponse> {
    return toCartResponse(await this.carts.addItem(principal, body.variantId, body.quantity));
  }

  @Post('bundle-items')
  @RateLimit(CART_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'addCartBundleItem',
    summary: 'Add a bundle to the cart',
    description:
      'A bundle is sold as one unit: a FIXED bundle is an independently stocked finished good, and a DYNAMIC bundle resolves to its approved component composition. Adding a bundle that is already in the cart increases that line instead of creating a second one.',
  })
  @ApiBody({ type: AddCartBundleRequest })
  @ApiResponse({ status: 201, description: 'The cart after the change.', type: CartResponse })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async addBundle(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: AddCartBundleRequest,
  ): Promise<CartResponse> {
    return toCartResponse(await this.carts.addBundle(principal, body.bundleId, body.quantity));
  }

  @Patch('items/:itemId')
  @RateLimit(CART_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'itemId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'setCartItemQuantity',
    summary: 'Set the quantity of a cart line',
    description:
      'The line is refreshed to the current effective price, because the customer has just made a fresh decision about it.',
  })
  @ApiBody({ type: SetCartItemQuantityRequest })
  @ApiResponse({ status: 200, description: 'The cart after the change.', type: CartResponse })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async setQuantity(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: CartItemIdParam,
    @Body() body: SetCartItemQuantityRequest,
  ): Promise<CartResponse> {
    return toCartResponse(
      await this.carts.setItemQuantity(principal, params.itemId, body.quantity),
    );
  }

  @Delete('items/:itemId')
  @RateLimit(CART_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'itemId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'removeCartItem',
    summary: 'Remove a line from the cart',
  })
  @ApiResponse({ status: 200, description: 'The cart after the change.', type: CartResponse })
  @errors(401, 403, 404, 429, 500, 503)
  public async remove(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: CartItemIdParam,
  ): Promise<CartResponse> {
    return toCartResponse(await this.carts.removeItem(principal, params.itemId));
  }
}
