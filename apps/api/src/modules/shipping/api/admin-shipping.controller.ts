import { Body, Controller, Get, Header, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppError } from '../../../platform/http/app-error';
import { errors } from '../../../platform/http/openapi-error-responses';
import { CurrentPrincipal, Roles } from '../../../platform/security/access.decorators';
import type { AuthenticatedPrincipal } from '../../../platform/security/principal';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { ShippingService } from '../application/shipping.service';
import { SHIPPING_RATE_LIMITS } from './shipping.policies';
import {
  ConfigureShippingDestinationRequest,
  ConfigureShippingMethodRequest,
  CountryCodeParam,
  CreateShipmentRequest,
  DecideReturnRequest,
  MethodCodeParam,
  ReceiveReturnRequest,
  ReturnIdParam,
  SetTrackingRequest,
  ShipmentIdParam,
  TransitionShipmentRequest,
} from './shipping.request';
import {
  ReturnEventsResponse,
  ReturnResponse,
  ReturnsResponse,
  ShipmentEventsResponse,
  ShipmentResponse,
  ShipmentsResponse,
  ShippingDestinationsResponse,
  ShippingMethodsResponse,
  toReturnEventsResponse,
  toReturnResponse,
  toReturnsResponse,
  toShipmentEventsResponse,
  toShipmentResponse,
  toShipmentsResponse,
  toShippingDestinationResponse,
  toShippingMethodResponse,
} from './shipping.response';

/**
 * The administrative shipping and returns surface.
 *
 * Every route requires the `ADMIN` role and every change is attributable to the administrator who
 * made it. The surface configures the shipping options, moves the shipments, and decides the
 * returns, and it never invents a commercial fact: the amount of a method is the administrator's
 * own figure, the tracking reference is the administrator's own text, and the delivery commitment
 * does not exist in the model at all.
 */
@ApiTags('Shipping')
@Roles('ADMIN')
@Controller({ path: 'admin', version: '1' })
export class AdminShippingController {
  public constructor(private readonly shipping: ShippingService) {}

  @Get('shipping/destinations')
  @RateLimit(SHIPPING_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listAdminShippingDestinations',
    summary: 'List the configured shipping destinations',
    description:
      'The destinations are administrator configuration. The platform carries no built-in country list, so a destination exists only once it has been approved here.',
  })
  @ApiResponse({
    status: 200,
    description: 'The configured destinations.',
    type: ShippingDestinationsResponse,
  })
  @errors(400, 401, 403, 429, 500, 503)
  public async listDestinations(): Promise<ShippingDestinationsResponse> {
    const destinations = await this.shipping.listDestinations();
    return { destinations: destinations.map(toShippingDestinationResponse) };
  }

  @Put('shipping/destinations/:countryCode')
  @RateLimit(SHIPPING_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'countryCode', type: String })
  @ApiOperation({
    operationId: 'configureAdminShippingDestination',
    summary: 'Approve or withdraw a shipping destination',
  })
  @ApiResponse({
    status: 200,
    description: 'The configured destination.',
    type: ShippingDestinationsResponse,
  })
  @errors(400, 401, 403, 429, 500, 503)
  public async configureDestination(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: CountryCodeParam,
    @Body() body: ConfigureShippingDestinationRequest,
  ): Promise<ShippingDestinationsResponse> {
    const destination = await this.shipping.configureDestination({
      countryCode: params.countryCode,
      enabled: body.enabled,
      label: body.label,
      carrierCode: body.carrierCode,
      updatedByUserId: principal.userId,
    });
    return { destinations: [toShippingDestinationResponse(destination)] };
  }

  @Get('shipping/methods')
  @RateLimit(SHIPPING_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listAdminShippingMethods',
    summary: 'List the configured shipping methods',
    description:
      'Each method carries the administrator’s own amount. The platform computes no rate and calls no carrier.',
  })
  @ApiResponse({
    status: 200,
    description: 'The configured methods.',
    type: ShippingMethodsResponse,
  })
  @errors(400, 401, 403, 429, 500, 503)
  public async listMethods(): Promise<ShippingMethodsResponse> {
    const methods = await this.shipping.listMethods();
    return { methods: methods.map(toShippingMethodResponse) };
  }

  @Put('shipping/methods/:code')
  @RateLimit(SHIPPING_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'code', type: String })
  @ApiOperation({
    operationId: 'configureAdminShippingMethod',
    summary: 'Create or replace a shipping method',
  })
  @ApiResponse({
    status: 200,
    description: 'The configured method.',
    type: ShippingMethodsResponse,
  })
  @errors(400, 401, 403, 429, 500, 503)
  public async configureMethod(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: MethodCodeParam,
    @Body() body: ConfigureShippingMethodRequest,
  ): Promise<ShippingMethodsResponse> {
    const method = await this.shipping.configureMethod({
      code: params.code,
      label: body.label,
      destinationCountryCode: body.destinationCountryCode,
      amountMinor: body.amountMinor,
      currency: body.currency,
      active: body.active,
      updatedByUserId: principal.userId,
    });
    return { methods: [toShippingMethodResponse(method)] };
  }

  @Get('shipments')
  @RateLimit(SHIPPING_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listAdminShipments',
    summary: 'List every shipment',
  })
  @ApiResponse({ status: 200, description: 'The shipments.', type: ShipmentsResponse })
  @errors(400, 401, 403, 429, 500, 503)
  public async listShipments(): Promise<ShipmentsResponse> {
    return toShipmentsResponse(await this.shipping.listShipments(50));
  }

  @Post('shipments')
  @RateLimit(SHIPPING_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'createAdminShipment',
    summary: 'Create the shipment that fulfils an order',
    description:
      'The order must be paid, and only one shipment may exist for an order, so the goods are never sent twice.',
  })
  @ApiResponse({ status: 201, description: 'The shipment.', type: ShipmentResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async createShipment(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: CreateShipmentRequest,
  ): Promise<ShipmentResponse> {
    return toShipmentResponse(
      await this.shipping.createShipment({
        orderId: body.orderId,
        methodCode: body.methodCode,
        actorUserId: principal.userId,
      }),
    );
  }

  @Get('shipments/:shipmentId')
  @RateLimit(SHIPPING_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'shipmentId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'getAdminShipment',
    summary: 'Read one shipment of any customer',
  })
  @ApiResponse({ status: 200, description: 'The shipment.', type: ShipmentResponse })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async readShipment(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: ShipmentIdParam,
  ): Promise<ShipmentResponse> {
    void principal;
    const shipment = await this.shipping.shipmentOf(params.shipmentId);
    if (shipment === null) throw AppError.shipmentNotFound();
    return toShipmentResponse(shipment);
  }

  @Patch('shipments/:shipmentId')
  @RateLimit(SHIPPING_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'shipmentId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'transitionAdminShipment',
    summary: 'Move a shipment to the next state of its lifecycle',
    description:
      'A transition that is not permitted is refused and recorded, while the shipment itself stays unchanged.',
  })
  @ApiResponse({ status: 200, description: 'The shipment.', type: ShipmentResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async transitionShipment(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: ShipmentIdParam,
    @Body() body: TransitionShipmentRequest,
  ): Promise<ShipmentResponse> {
    return toShipmentResponse(
      await this.shipping.transitionShipment({
        shipmentId: params.shipmentId,
        to: body.to,
        actorUserId: principal.userId,
        reason: body.reason,
      }),
    );
  }

  @Put('shipments/:shipmentId/tracking')
  @RateLimit(SHIPPING_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'shipmentId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'setAdminShipmentTracking',
    summary: 'Set the tracking reference of a shipment',
    description:
      'The reference is the administrator’s own text. No carrier is contacted, so it is never carrier-verified tracking.',
  })
  @ApiResponse({ status: 200, description: 'The shipment.', type: ShipmentResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async setTracking(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: ShipmentIdParam,
    @Body() body: SetTrackingRequest,
  ): Promise<ShipmentResponse> {
    return toShipmentResponse(
      await this.shipping.setTracking({
        shipmentId: params.shipmentId,
        trackingReference: body.trackingReference,
        actorUserId: principal.userId,
      }),
    );
  }

  @Get('shipments/:shipmentId/events')
  @RateLimit(SHIPPING_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'shipmentId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'listAdminShipmentEvents',
    summary: 'List the recorded transitions of a shipment',
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
    void principal;
    const shipment = await this.shipping.shipmentOf(params.shipmentId);
    if (shipment === null) throw AppError.shipmentNotFound();
    return toShipmentEventsResponse(await this.shipping.shipmentEvents(params.shipmentId));
  }

  @Get('returns')
  @RateLimit(SHIPPING_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listAdminReturns',
    summary: 'List every return',
  })
  @ApiResponse({ status: 200, description: 'The returns.', type: ReturnsResponse })
  @errors(400, 401, 403, 429, 500, 503)
  public async listReturns(): Promise<ReturnsResponse> {
    return toReturnsResponse(await this.shipping.listReturns(50));
  }

  @Get('returns/:returnId')
  @RateLimit(SHIPPING_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'returnId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'getAdminReturn',
    summary: 'Read one return of any customer',
  })
  @ApiResponse({ status: 200, description: 'The return.', type: ReturnResponse })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async readReturn(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: ReturnIdParam,
  ): Promise<ReturnResponse> {
    void principal;
    const record = await this.shipping.returnOf(params.returnId);
    if (record === null) throw AppError.returnNotFound();
    return toReturnResponse(record);
  }

  @Post('returns/:returnId/decision')
  @HttpCode(200)
  @RateLimit(SHIPPING_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'returnId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'decideAdminReturn',
    summary: 'Approve or reject a requested return',
    description:
      'The decision is the administrator’s, because the eligibility window and the conditions are a merchant policy that is not approved yet.',
  })
  @ApiResponse({ status: 200, description: 'The return.', type: ReturnResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async decideReturn(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: ReturnIdParam,
    @Body() body: DecideReturnRequest,
  ): Promise<ReturnResponse> {
    return toReturnResponse(
      await this.shipping.decideReturn({
        returnId: params.returnId,
        decision: body.decision,
        actorUserId: principal.userId,
        reason: body.reason,
      }),
    );
  }

  @Post('returns/:returnId/receipt')
  @HttpCode(200)
  @RateLimit(SHIPPING_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'returnId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'receiveAdminReturn',
    summary: 'Receive a return, restock the goods, and return the money',
    description:
      'The restock goes through the Inventory capability and the refund through the Payments capability, and both are keyed by the return, so a repeated receipt restocks nothing and refunds nothing a second time.',
  })
  @ApiResponse({ status: 200, description: 'The return.', type: ReturnResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async receiveReturn(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() params: ReturnIdParam,
    @Body() body: ReceiveReturnRequest,
  ): Promise<ReturnResponse> {
    return toReturnResponse(
      await this.shipping.receiveReturn({
        returnId: params.returnId,
        actorUserId: principal.userId,
        restockLineIds: body.restockLineIds,
        refund: body.refund,
      }),
    );
  }

  @Get('returns/:returnId/events')
  @RateLimit(SHIPPING_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'returnId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'listAdminReturnEvents',
    summary: 'List the recorded transitions of a return',
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
    void principal;
    const record = await this.shipping.returnOf(params.returnId);
    if (record === null) throw AppError.returnNotFound();
    return toReturnEventsResponse(await this.shipping.returnEvents(params.returnId));
  }
}
