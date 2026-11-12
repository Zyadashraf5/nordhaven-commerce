import { Controller, Get, Header, Param } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppError } from '../../../platform/http/app-error';
import { errors } from '../../../platform/http/openapi-error-responses';
import { Roles } from '../../../platform/security/access.decorators';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { OrderService } from '../application/order.service';
import { PreOrderService } from '../application/pre-order.service';
import { ORDER_RATE_LIMITS } from './order.policies';
import { OrderIdParam } from './order.request';
import {
  OrderResponse,
  OrdersResponse,
  PreOrdersResponse,
  toOrderResponse,
  toOrdersResponse,
  toPreOrdersResponse,
} from './order.response';

/**
 * Administrative order and pre-order visibility.
 *
 * Every route requires the `ADMIN` role. The administrative surface **reads** orders; it never
 * changes one, because every state change is a customer action or a payment outcome, and a
 * hand-edited order would break the audit trail the order's own event log provides.
 */
@ApiTags('Orders')
@Roles('ADMIN')
@Controller({ path: 'admin/orders', version: '1' })
export class AdminOrderController {
  public constructor(
    private readonly orders: OrderService,
    private readonly preOrders: PreOrderService,
  ) {}

  @Get()
  @RateLimit(ORDER_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listAdminOrders',
    summary: 'List every order',
    description: 'Newest first. The administrative surface reads orders and never changes one.',
  })
  @ApiResponse({ status: 200, description: 'The orders.', type: OrdersResponse })
  @errors(400, 401, 403, 429, 500, 503)
  public async list(): Promise<OrdersResponse> {
    return toOrdersResponse(await this.orders.listAll(50));
  }

  @Get('pre-orders')
  @RateLimit(ORDER_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listAdminPreOrders',
    summary: 'List every pre-order',
  })
  @ApiResponse({ status: 200, description: 'The pre-orders.', type: PreOrdersResponse })
  @errors(400, 401, 403, 429, 500, 503)
  public async listPreOrders(): Promise<PreOrdersResponse> {
    return toPreOrdersResponse(await this.preOrders.listAll(50));
  }

  @Get(':orderId')
  @RateLimit(ORDER_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'orderId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'getAdminOrder',
    summary: 'Read one order of any customer',
  })
  @ApiResponse({ status: 200, description: 'The order.', type: OrderResponse })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async read(@Param() params: OrderIdParam): Promise<OrderResponse> {
    const order = await this.orders.read(params.orderId);
    if (order === null) throw AppError.orderNotFound();
    return toOrderResponse(order);
  }
}
