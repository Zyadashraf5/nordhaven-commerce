import { Body, Controller, Get, Header, Param, Put, Query } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { errors } from '../../../platform/http/openapi-error-responses';
import { Roles } from '../../../platform/security/access.decorators';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { InventoryService } from '../application/inventory.service';
import { INVENTORY_RATE_LIMITS } from './inventory.policies';
import {
  InventoryIdParam,
  ListInventoryQuery,
  ListMovementsQuery,
  SetInventoryRequest,
  VariantIdParam,
} from './inventory.request';
import {
  InventoriesResponse,
  InventoryResponse,
  StockMovementsResponse,
  toInventoriesResponse,
  toInventoryResponse,
  toStockMovementResponse,
} from './inventory.response';

/**
 * Administrative per-SKU stock management.
 *
 * Every route requires the `ADMIN` role. Stock is tracked per SKU; setting the on-hand quantity is an
 * idempotent upsert that records a movement, and a reduction below the reserved quantity is refused.
 */
@ApiTags('Inventory')
@Roles('ADMIN')
@Controller({ path: 'admin/inventory', version: '1' })
export class AdminInventoryController {
  public constructor(private readonly inventory: InventoryService) {}

  @Get()
  @RateLimit(INVENTORY_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiQuery({ name: 'productId', required: false, type: String, format: 'uuid' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOperation({
    operationId: 'listInventory',
    summary: 'List inventory items',
    description:
      'A deterministic keyset page ordered by SKU and identifier, optionally filtered by product.',
  })
  @ApiResponse({
    status: 200,
    description: 'A page of inventory items.',
    type: InventoriesResponse,
  })
  @errors(400, 401, 403, 429, 500, 503)
  public async list(@Query() query: ListInventoryQuery): Promise<InventoriesResponse> {
    const page = await this.inventory.list(query);
    return toInventoriesResponse(page.records, page.nextCursor);
  }

  @Get('variants/:variantId')
  @RateLimit(INVENTORY_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'variantId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'getInventoryByVariant',
    summary: 'Read the inventory item for one SKU',
  })
  @ApiResponse({ status: 200, description: 'The inventory item.', type: InventoryResponse })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async getByVariant(@Param() params: VariantIdParam): Promise<InventoryResponse> {
    return toInventoryResponse(await this.inventory.findByVariantId(params.variantId));
  }

  @Put('variants/:variantId')
  @RateLimit(INVENTORY_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'variantId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'setInventoryByVariant',
    summary: 'Set the on-hand quantity for one SKU',
    description:
      'An idempotent upsert: the first call creates the inventory item, later calls replace the on-hand quantity. Refused when the value would drop on-hand below the reserved quantity.',
  })
  @ApiBody({ type: SetInventoryRequest })
  @ApiResponse({
    status: 200,
    description: 'The persisted inventory item.',
    type: InventoryResponse,
  })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async setByVariant(
    @Param() params: VariantIdParam,
    @Body() body: SetInventoryRequest,
  ): Promise<InventoryResponse> {
    return toInventoryResponse(
      await this.inventory.setOnHand(params.variantId, body.onHand, body.reason ?? null),
    );
  }

  @Get(':inventoryId')
  @RateLimit(INVENTORY_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'inventoryId', type: String, format: 'uuid' })
  @ApiOperation({ operationId: 'getInventory', summary: 'Read one inventory item' })
  @ApiResponse({ status: 200, description: 'The inventory item.', type: InventoryResponse })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async get(@Param() params: InventoryIdParam): Promise<InventoryResponse> {
    return toInventoryResponse(await this.inventory.findById(params.inventoryId));
  }

  @Get(':inventoryId/movements')
  @RateLimit(INVENTORY_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'inventoryId', type: String, format: 'uuid' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOperation({
    operationId: 'listInventoryMovements',
    summary: 'List the stock-movement history of an inventory item',
    description: 'An append-only audit, newest first, as a deterministic keyset page.',
  })
  @ApiResponse({ status: 200, description: 'A page of movements.', type: StockMovementsResponse })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async listMovements(
    @Param() params: InventoryIdParam,
    @Query() query: ListMovementsQuery,
  ): Promise<StockMovementsResponse> {
    const page = await this.inventory.listMovements(params.inventoryId, query);
    return {
      items: page.records.map((record) => toStockMovementResponse(record)),
      nextCursor: page.nextCursor,
    };
  }
}
