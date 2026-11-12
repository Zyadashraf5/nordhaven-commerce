import { Body, Controller, Delete, Get, Header, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppError } from '../../../platform/http/app-error';
import { errors } from '../../../platform/http/openapi-error-responses';
import { CurrentPrincipal, Roles } from '../../../platform/security/access.decorators';
import type { AuthenticatedPrincipal } from '../../../platform/security/principal';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { ShippingService } from '../application/shipping.service';
import { SHIPPING_RATE_LIMITS } from './shipping.policies';
import { RequestReturnRequest, ReturnIdParam, ShipmentIdParam } from './shipping.request';
import {
  ReturnEventsResponse,
  ReturnResponse,
  ReturnsResponse,
  ShipmentEventsResponse,
  ShipmentResponse,
  ShipmentsResponse,
  toReturnEventsResponse,
  toReturnResponse,
  toReturnsResponse,
  toShipmentEventsResponse,
  toShipmentResponse,
  toShipmentsResponse,
} from './shipping.response';

/**
 * The authenticated customer's shipments and returns.
 *
 * Every route is scoped to the presented session's principal, so no request can name or reach
 * another customer's shipment or return. A record that belongs to another customer is answered
 * exactly like one that never existed, so the API never discloses whether it exists.
 */
@ApiTags('Shipping')
@Roles('CUSTOMER')
@Controller({ version: '1' })
export class CustomerShippingController {
  public constructor(private readonly shipping: ShippingService) {}

  @Get('shipments')
  @RateLimit(SHIPPING_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listCustomerShipments',
    summary: "List the authenticated customer's shipments",
    description:
      'Newest first. A shipment reports the configured method and the tracking reference an administrator set; the platform promises no delivery date.',
  })
  @ApiResponse({ status: 200, description: "The customer's shipments.", type: ShipmentsResponse })
  @errors(400, 401, 403, 429, 500, 503)
  public async listShipments(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<ShipmentsResponse> {
    return toShipmentsResponse(await this.shipping.listShipmentsForCustomer(principal.userId, 50));
  }

  @Get('shipments/:shipmentId')
  @RateLimit(SHIPPING_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'shipmentId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'getCustomerShipment',
    summary: "Read one of the authenticated customer's shipments",
  })
  @ApiResponse({ status: 200, description: 'The shipment.', type: ShipmentResponse })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async readShipment(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: ShipmentIdParam,
  ): Promise<ShipmentResponse> {
    const shipment = await this.shipping.shipmentOf(params.shipmentId);
    if (shipment === null || shipment.customerId !== principal.userId) {
      throw AppError.shipmentNotFound();
    }
    return toShipmentResponse(shipment);
  }

  @Get('shipments/:shipmentId/events')
  @RateLimit(SHIPPING_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'shipmentId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'listCustomerShipmentEvents',
    summary: "List the recorded transitions of one of the customer's shipments",
    description:
      'The log is append-only, and a refused transition is recorded while the shipment itself stays unchanged.',
  })
  @ApiResponse({
    status: 200,
    description: 'The recorded transitions.',
    type: ShipmentEventsResponse,
  })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async listShipmentEvents(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: ShipmentIdParam,
  ): Promise<ShipmentEventsResponse> {
    const shipment = await this.shipping.shipmentOf(params.shipmentId);
    if (shipment === null || shipment.customerId !== principal.userId) {
      throw AppError.shipmentNotFound();
    }
    return toShipmentEventsResponse(await this.shipping.shipmentEvents(params.shipmentId));
  }

  @Get('returns')
  @RateLimit(SHIPPING_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listCustomerReturns',
    summary: "List the authenticated customer's returns",
    description:
      'A requested return holds no money and has moved no stock. The eligibility window and the conditions are the merchant’s policy, so a request is always accepted for review.',
  })
  @ApiResponse({ status: 200, description: "The customer's returns.", type: ReturnsResponse })
  @errors(400, 401, 403, 429, 500, 503)
  public async listReturns(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<ReturnsResponse> {
    return toReturnsResponse(await this.shipping.listReturnsForCustomer(principal.userId, 50));
  }

  @Post('returns')
  @RateLimit(SHIPPING_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'createReturn',
    summary: 'Request a return of part or all of an order',
    description:
      'The order must be one of the caller’s paid orders. The platform computes the exact amount the returned lines cover and refuses a request for more units than the order holds. Nothing is refunded and no stock moves until the return is received.',
  })
  @ApiResponse({ status: 201, description: 'The requested return.', type: ReturnResponse })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async createReturn(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: RequestReturnRequest,
  ): Promise<ReturnResponse> {
    return toReturnResponse(
      await this.shipping.requestReturn({
        orderId: body.orderId,
        customerId: principal.userId,
        reasonCode: body.reasonCode,
        lines: body.lines,
      }),
    );
  }

  @Get('returns/:returnId')
  @RateLimit(SHIPPING_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'returnId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'getCustomerReturn',
    summary: "Read one of the authenticated customer's returns",
  })
  @ApiResponse({ status: 200, description: 'The return.', type: ReturnResponse })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async readReturn(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: ReturnIdParam,
  ): Promise<ReturnResponse> {
    const record = await this.shipping.returnOf(params.returnId);
    if (record === null || record.customerId !== principal.userId) {
      throw AppError.returnNotFound();
    }
    return toReturnResponse(record);
  }

  @Delete('returns/:returnId')
  @RateLimit(SHIPPING_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'returnId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'cancelReturn',
    summary: 'Cancel a return that has not been received',
    description:
      'A return that has already been received cannot be cancelled, because the goods have already moved.',
  })
  @ApiResponse({ status: 200, description: 'The cancelled return.', type: ReturnResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async cancelReturn(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: ReturnIdParam,
  ): Promise<ReturnResponse> {
    const record = await this.shipping.cancelReturn({
      returnId: params.returnId,
      customerId: principal.userId,
      actor: 'CUSTOMER',
      actorUserId: principal.userId,
      reason: null,
    });
    if (record.customerId !== principal.userId) throw AppError.returnNotFound();
    return toReturnResponse(record);
  }

  @Get('returns/:returnId/events')
  @RateLimit(SHIPPING_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'returnId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'listCustomerReturnEvents',
    summary: "List the recorded transitions of one of the customer's returns",
  })
  @ApiResponse({
    status: 200,
    description: 'The recorded transitions.',
    type: ReturnEventsResponse,
  })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async listReturnEvents(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: ReturnIdParam,
  ): Promise<ReturnEventsResponse> {
    const record = await this.shipping.returnOf(params.returnId);
    if (record === null || record.customerId !== principal.userId) {
      throw AppError.returnNotFound();
    }
    return toReturnEventsResponse(await this.shipping.returnEvents(params.returnId));
  }
}
