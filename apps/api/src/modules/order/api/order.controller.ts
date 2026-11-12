import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppError } from '../../../platform/http/app-error';
import { errors } from '../../../platform/http/openapi-error-responses';
import { CurrentPrincipal, Roles } from '../../../platform/security/access.decorators';
import type { AuthenticatedPrincipal } from '../../../platform/security/principal';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { OrderService } from '../application/order.service';
import { PreOrderService } from '../application/pre-order.service';
import { ORDER_RATE_LIMITS } from './order.policies';
import {
  CreateOrderRequest,
  ConvertPreOrderRequest,
  CreatePreOrderRequest,
  OrderIdParam,
  PreOrderIdParam,
} from './order.request';
import {
  OrderResponse,
  OrdersResponse,
  PreOrderResponse,
  PreOrdersResponse,
  toOrderResponse,
  toOrdersResponse,
  toPreOrderResponse,
  toPreOrdersResponse,
} from './order.response';

/**
 * The authenticated customer's orders and pre-orders.
 *
 * Every route is scoped to the presented session's principal, so no request can name or reach
 * another customer's order, and the `CUSTOMER` role keeps an administrator account away from
 * storefront data. An order that belongs to another customer is answered exactly like one that
 * never existed, so the API never discloses whether an order exists.
 */
@ApiTags('Orders')
@Roles('CUSTOMER')
@Controller({ path: 'orders', version: '1' })
export class OrderController {
  public constructor(
    private readonly orders: OrderService,
    private readonly preOrders: PreOrderService,
  ) {}

  @Get()
  @RateLimit(ORDER_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listOrders',
    summary: "List the authenticated customer's orders",
    description: 'Newest first. Every order reports its own immutable price and tax snapshot.',
  })
  @ApiResponse({ status: 200, description: "The customer's orders.", type: OrdersResponse })
  @errors(400, 401, 403, 429, 500, 503)
  public async list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<OrdersResponse> {
    return toOrdersResponse(await this.orders.listForCustomer(principal.userId, 50));
  }

  @Post()
  @RateLimit(ORDER_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'createOrder',
    summary: 'Place an order from the current cart',
    description:
      'The server recalculates every amount and never trusts a client-supplied price or total. The `Idempotency-Key` header is the stable business key, so a repeated request returns the order the first one created and holds the stock only once. The ordered cart lines are removed once the order exists.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'The stable business key that makes a repeated request safe. It is scoped to the customer.',
  })
  @ApiBody({ type: CreateOrderRequest })
  @ApiResponse({ status: 201, description: 'The placed order.', type: OrderResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: CreateOrderRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<OrderResponse> {
    if (
      idempotencyKey === undefined ||
      idempotencyKey.trim().length < 8 ||
      idempotencyKey.trim().length > 200
    ) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [
          {
            path: 'Idempotency-Key',
            message: 'Invalid value',
          },
        ],
      });
    }
    const order = await this.orders.create({
      customerId: principal.userId,
      idempotencyKey: idempotencyKey.trim(),
      destinationCountryCode: body.destinationCountryCode,
      expectedFingerprint: body.expectedFingerprint,
    });
    const snapshot = await this.orders.read(order.id);
    if (snapshot === null) throw AppError.orderNotFound();
    return toOrderResponse(snapshot);
  }

  @Get('pre-orders')
  @RateLimit(ORDER_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listPreOrders',
    summary: "List the authenticated customer's pre-orders",
    description:
      'A pre-order records an intent to buy what is not yet available. Nothing is charged and no stock is held while it awaits stock.',
  })
  @ApiResponse({ status: 200, description: "The customer's pre-orders.", type: PreOrdersResponse })
  @errors(400, 401, 403, 429, 500, 503)
  public async listPreOrders(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<PreOrdersResponse> {
    return toPreOrdersResponse(await this.preOrders.listForCustomer(principal.userId, 50));
  }

  @Post('pre-orders')
  @RateLimit(ORDER_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'createPreOrder',
    summary: 'Record a pre-order for what the customer intends to buy',
    description:
      'The pre-order records what was intended and what it would cost. Nothing is charged, no stock is held, and the customer is not asked to pay until the stock is available and reserved.',
  })
  @ApiBody({ type: CreatePreOrderRequest })
  @ApiResponse({ status: 201, description: 'The recorded pre-order.', type: PreOrderResponse })
  @errors(400, 401, 403, 409, 429, 500, 503)
  public async createPreOrder(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: CreatePreOrderRequest,
  ): Promise<PreOrderResponse> {
    return toPreOrderResponse(
      await this.preOrders.create({
        customerId: principal.userId,
        destinationCountryCode: body.destinationCountryCode,
      }),
    );
  }

  @Get('pre-orders/:preOrderId')
  @RateLimit(ORDER_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'preOrderId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'getPreOrder',
    summary: 'Read one of the authenticated customer pre-orders',
    description:
      'The read also evaluates whether the stock has become available, so a pre-order that is ready says so without the customer having to ask twice.',
  })
  @ApiResponse({ status: 200, description: 'The pre-order.', type: PreOrderResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async readPreOrder(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: PreOrderIdParam,
  ): Promise<PreOrderResponse> {
    const preOrder = await this.preOrders.evaluateReadiness(params.preOrderId, principal.userId);
    if (preOrder.customerId !== principal.userId) throw AppError.preOrderNotFound();
    return toPreOrderResponse(preOrder);
  }

  @Post('pre-orders/:preOrderId/convert')
  @RateLimit(ORDER_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'preOrderId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'convertPreOrder',
    summary: 'Create one payable order from a reserved pre-order',
    description:
      'Current server prices and taxes are recomputed. The existing stock hold is transferred, never duplicated. This operation creates no payment and moves no money.',
  })
  @ApiBody({ type: ConvertPreOrderRequest })
  @ApiResponse({ status: 201, description: 'The payable order.', type: OrderResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async convertPreOrder(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: PreOrderIdParam,
    @Body() body: ConvertPreOrderRequest,
  ): Promise<OrderResponse> {
    const order = await this.preOrders.convert({
      preOrderId: params.preOrderId,
      customerId: principal.userId,
      expectedFingerprint: body.expectedFingerprint,
    });
    const snapshot = await this.orders.read(order.id, principal.userId);
    if (snapshot === null) throw AppError.orderNotFound();
    return toOrderResponse(snapshot);
  }

  @Delete('pre-orders/:preOrderId')
  @RateLimit(ORDER_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'preOrderId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'cancelPreOrder',
    summary: 'Cancel a pre-order',
  })
  @ApiResponse({ status: 200, description: 'The cancelled pre-order.', type: PreOrderResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async cancelPreOrder(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: PreOrderIdParam,
  ): Promise<PreOrderResponse> {
    return toPreOrderResponse(
      await this.preOrders.cancel({
        preOrderId: params.preOrderId,
        customerId: principal.userId,
        actor: 'CUSTOMER',
        actorUserId: principal.userId,
      }),
    );
  }

  @Get(':orderId')
  @RateLimit(ORDER_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'orderId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'getOrder',
    summary: 'Read one of the authenticated customer orders',
  })
  @ApiResponse({ status: 200, description: 'The order.', type: OrderResponse })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async read(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: OrderIdParam,
  ): Promise<OrderResponse> {
    const order = await this.orders.read(params.orderId, principal.userId);
    if (order === null || order.customerId !== principal.userId) {
      // An order that belongs to another customer is answered exactly like one that never existed.
      throw AppError.orderNotFound();
    }
    return toOrderResponse(order);
  }

  @Delete(':orderId')
  @RateLimit(ORDER_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'orderId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'cancelOrder',
    summary: 'Cancel an order that has not been paid',
    description:
      'The held stock is released. The cancellation is idempotent for an order that is already cancelled or expired, and it is refused for an order that has already been paid, because a paid order needs the refund workflow.',
  })
  @ApiResponse({ status: 200, description: 'The cancelled order.', type: OrderResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async cancel(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: OrderIdParam,
  ): Promise<OrderResponse> {
    await this.orders.cancel({
      orderId: params.orderId,
      customerId: principal.userId,
      actor: 'CUSTOMER',
      actorUserId: principal.userId,
    });
    const snapshot = await this.orders.read(params.orderId);
    if (snapshot === null) throw AppError.orderNotFound();
    return toOrderResponse(snapshot);
  }
}
