import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { errors } from '../../../platform/http/openapi-error-responses';
import { Roles } from '../../../platform/security/access.decorators';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { ReservationService } from '../application/reservation.service';
import { INVENTORY_RATE_LIMITS } from './inventory.policies';
import {
  CreateReservationRequest,
  ExtendReservationRequest,
  ListReservationsQuery,
  ReservationIdParam,
} from './inventory.request';
import {
  ReservationResponse,
  ReservationsResponse,
  toReservationResponse,
} from './inventory.response';

/**
 * Administrative reservation management.
 *
 * A reservation is the operational primitive that holds stock for a short window. Every route requires
 * the `ADMIN` role; there is deliberately no customer-facing route because the checkout boundary
 * (HC-DEC-004) is unresolved. Creation is idempotent on the supplied key and all-or-nothing across its
 * lines.
 */
@ApiTags('Inventory')
@Roles('ADMIN')
@Controller({ path: 'admin/reservations', version: '1' })
export class AdminReservationsController {
  public constructor(private readonly reservations: ReservationService) {}

  @Post()
  @RateLimit(INVENTORY_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'createReservation',
    summary: 'Create a reservation for SKUs or a fixed bundle',
    description:
      'Idempotent on idempotencyKey: a repeated key returns the original reservation and holds no additional stock. Insufficient availability for any line is a conflict and leaves no partial hold.',
  })
  @ApiBody({ type: CreateReservationRequest })
  @ApiResponse({ status: 201, description: 'The reservation.', type: ReservationResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async create(@Body() body: CreateReservationRequest): Promise<ReservationResponse> {
    return toReservationResponse(
      await this.reservations.create({
        idempotencyKey: body.idempotencyKey,
        ...(body.expiresInSeconds === undefined ? {} : { expiresInSeconds: body.expiresInSeconds }),
        ...(body.lines === undefined ? {} : { lines: body.lines }),
        ...(body.bundleId === undefined ? {} : { bundleId: body.bundleId }),
        ...(body.quantity === undefined ? {} : { quantity: body.quantity }),
      }),
    );
  }

  @Get()
  @RateLimit(INVENTORY_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiQuery({
    name: 'status',
    required: false,
    type: String,
    enum: ['ACTIVE', 'CONFIRMED', 'RELEASED', 'EXPIRED'],
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOperation({
    operationId: 'listReservations',
    summary: 'List reservations',
    description:
      'A deterministic keyset page ordered by creation time, optionally filtered by status.',
  })
  @ApiResponse({ status: 200, description: 'A page of reservations.', type: ReservationsResponse })
  @errors(400, 401, 403, 429, 500, 503)
  public async list(@Query() query: ListReservationsQuery): Promise<ReservationsResponse> {
    const page = await this.reservations.list(query);
    return {
      items: page.records.map((record) => toReservationResponse(record)),
      nextCursor: page.nextCursor,
    };
  }

  @Get(':reservationId')
  @RateLimit(INVENTORY_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'reservationId', type: String, format: 'uuid' })
  @ApiOperation({ operationId: 'getReservation', summary: 'Read one reservation' })
  @ApiResponse({ status: 200, description: 'The reservation.', type: ReservationResponse })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async get(@Param() params: ReservationIdParam): Promise<ReservationResponse> {
    return toReservationResponse(await this.reservations.findById(params.reservationId));
  }

  @Patch(':reservationId')
  @RateLimit(INVENTORY_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'reservationId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'extendReservation',
    summary: 'Extend the expiry of an active reservation',
    description: 'Refused for a reservation that is already confirmed, released, or expired.',
  })
  @ApiBody({ type: ExtendReservationRequest })
  @ApiResponse({ status: 200, description: 'The extended reservation.', type: ReservationResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async extend(
    @Param() params: ReservationIdParam,
    @Body() body: ExtendReservationRequest,
  ): Promise<ReservationResponse> {
    return toReservationResponse(
      await this.reservations.extend(params.reservationId, body.extendBySeconds),
    );
  }

  @Post(':reservationId/confirmation')
  @HttpCode(HttpStatus.OK)
  @RateLimit(INVENTORY_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'reservationId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'confirmReservation',
    summary: 'Confirm a reservation and deduct the held stock',
    description: 'Idempotent: confirming an already-confirmed reservation returns it unchanged.',
  })
  @ApiResponse({
    status: 200,
    description: 'The confirmed reservation.',
    type: ReservationResponse,
  })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async confirm(@Param() params: ReservationIdParam): Promise<ReservationResponse> {
    return toReservationResponse(await this.reservations.confirm(params.reservationId));
  }

  @Post(':reservationId/release')
  @HttpCode(HttpStatus.OK)
  @RateLimit(INVENTORY_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'reservationId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'releaseReservation',
    summary: 'Release a reservation and return the held stock',
    description: 'Idempotent: releasing an already-released reservation returns it unchanged.',
  })
  @ApiResponse({ status: 200, description: 'The released reservation.', type: ReservationResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async release(@Param() params: ReservationIdParam): Promise<ReservationResponse> {
    return toReservationResponse(await this.reservations.release(params.reservationId));
  }
}
