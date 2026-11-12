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
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { errors } from '../../../platform/http/openapi-error-responses';
import { Roles } from '../../../platform/security/access.decorators';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { BundleService } from '../application/bundle.service';
import { INVENTORY_RATE_LIMITS } from './inventory.policies';
import {
  AssembleBundleRequest,
  BundleIdParam,
  CreateBundleRequest,
  DisassembleBundleRequest,
  UpdateBundleRequest,
  toBundleComponentInput,
} from './inventory.request';
import { BundleResponse, BundlesResponse, toBundleResponse } from './inventory.response';

/**
 * Administrative bundle management.
 *
 * A bundle resolves to its constituent SKUs and holds no stock of its own, so its availability is
 * derived from its components. Every route requires the `ADMIN` role.
 */
@ApiTags('Inventory')
@Roles('ADMIN')
@Controller({ path: 'admin/bundles', version: '1' })
export class AdminBundlesController {
  public constructor(private readonly bundles: BundleService) {}

  @Post()
  @RateLimit(INVENTORY_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'createBundle',
    summary: 'Create a bundle with its components',
    description:
      'One bundle per product. A FIXED component carries a per-bundle quantity; a DYNAMIC component carries an allowed per-selection range.',
  })
  @ApiBody({ type: CreateBundleRequest })
  @ApiResponse({ status: 201, description: 'The created bundle.', type: BundleResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async create(@Body() body: CreateBundleRequest): Promise<BundleResponse> {
    const view = await this.bundles.create({
      productId: body.productId,
      kind: body.kind,
      name: body.name,
      description: body.description ?? null,
      components: body.components.map((component) => toBundleComponentInput(component)),
    });
    return toBundleResponse(view.record, view.available);
  }

  @Get()
  @RateLimit(INVENTORY_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ operationId: 'listBundles', summary: 'List bundles' })
  @ApiResponse({ status: 200, description: 'The bundles.', type: BundlesResponse })
  @errors(400, 401, 403, 429, 500, 503)
  public async list(): Promise<BundlesResponse> {
    const views = await this.bundles.list();
    return { bundles: views.map((view) => toBundleResponse(view.record, view.available)) };
  }

  @Get(':bundleId')
  @RateLimit(INVENTORY_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'bundleId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'getBundle',
    summary: 'Read one bundle with its components and availability',
  })
  @ApiResponse({ status: 200, description: 'The bundle.', type: BundleResponse })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async get(@Param() params: BundleIdParam): Promise<BundleResponse> {
    const view = await this.bundles.findById(params.bundleId);
    return toBundleResponse(view.record, view.available);
  }

  @Patch(':bundleId')
  @RateLimit(INVENTORY_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'bundleId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'updateBundle',
    summary: 'Update a bundle and optionally replace its components',
    description: 'When components are supplied, the whole composition is replaced atomically.',
  })
  @ApiBody({ type: UpdateBundleRequest })
  @ApiResponse({ status: 200, description: 'The persisted bundle.', type: BundleResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async update(
    @Param() params: BundleIdParam,
    @Body() body: UpdateBundleRequest,
  ): Promise<BundleResponse> {
    const view = await this.bundles.update(params.bundleId, {
      ...(body.name === undefined ? {} : { name: body.name }),
      ...(body.description === undefined ? {} : { description: body.description ?? null }),
      ...(body.components === undefined
        ? {}
        : { components: body.components.map((component) => toBundleComponentInput(component)) }),
    });
    return toBundleResponse(view.record, view.available);
  }

  @Post(':bundleId/assemble')
  @HttpCode(HttpStatus.OK)
  @RateLimit(INVENTORY_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'bundleId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'assembleBundle',
    summary: 'Assemble fixed bundles from components',
    description:
      'For FIXED bundles with independent stock, consumes component stock and produces finished-goods stock atomically.',
  })
  @ApiBody({ type: AssembleBundleRequest })
  @ApiResponse({ status: 200, description: 'The bundle after assembly.', type: BundleResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async assemble(
    @Param() params: BundleIdParam,
    @Body() body: AssembleBundleRequest,
  ): Promise<BundleResponse> {
    const view = await this.bundles.assemble(params.bundleId, body.quantity, body.note ?? null);
    return toBundleResponse(view.record, view.available);
  }

  @Post(':bundleId/disassemble')
  @HttpCode(HttpStatus.OK)
  @RateLimit(INVENTORY_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'bundleId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'disassembleBundle',
    summary: 'Disassemble fixed bundles to components',
    description: 'Returns finished goods to component stock. Cannot disassemble reserved stock.',
  })
  @ApiBody({ type: DisassembleBundleRequest })
  @ApiResponse({ status: 200, description: 'The bundle after disassembly.', type: BundleResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async disassemble(
    @Param() params: BundleIdParam,
    @Body() body: DisassembleBundleRequest,
  ): Promise<BundleResponse> {
    const view = await this.bundles.disassemble(params.bundleId, body.quantity, body.note ?? null);
    return toBundleResponse(view.record, view.available);
  }

  @Delete(':bundleId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit(INVENTORY_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'bundleId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'deleteBundle',
    summary: 'Delete a bundle without inventory history',
  })
  @ApiResponse({ status: 204, description: 'The bundle was removed.' })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async remove(@Param() params: BundleIdParam): Promise<void> {
    await this.bundles.delete(params.bundleId);
  }
}
