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
import { BrandService } from '../application/brand.service';
import { CATALOG_RATE_LIMITS } from './catalog.policies';
import { BrandIdParam, CreateBrandRequest, UpdateBrandRequest } from './catalog.request';
import {
  BrandResponse,
  BrandsResponse,
  toBrandResponse,
  toBrandsResponse,
} from './catalog.response';

/**
 * Administrative brand management.
 *
 * Every route requires the `ADMIN` role. Deleting a brand a product still references is refused with a
 * stable conflict.
 */
@ApiTags('Catalog')
@Roles('ADMIN')
@Controller({ path: 'admin/catalog/brands', version: '1' })
export class AdminBrandsController {
  public constructor(private readonly brands: BrandService) {}

  @Post()
  @RateLimit(CATALOG_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'createAdminBrand',
    summary: 'Create a brand',
    description: 'The slug is derived from the name when omitted.',
  })
  @ApiBody({ type: CreateBrandRequest })
  @ApiResponse({ status: 201, description: 'The created brand.', type: BrandResponse })
  @errors(400, 401, 403, 409, 429, 500, 503)
  public async create(@Body() body: CreateBrandRequest): Promise<BrandResponse> {
    return toBrandResponse(await this.brands.create(body));
  }

  @Get()
  @RateLimit(CATALOG_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ operationId: 'listAdminBrands', summary: 'List every brand' })
  @ApiResponse({ status: 200, description: 'The brands.', type: BrandsResponse })
  @errors(400, 401, 403, 429, 500, 503)
  public async list(): Promise<BrandsResponse> {
    return toBrandsResponse(await this.brands.list());
  }

  @Patch(':brandId')
  @RateLimit(CATALOG_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'brandId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'updateAdminBrand',
    summary: 'Update a brand',
    description: 'Applies only the supplied attributes.',
  })
  @ApiBody({ type: UpdateBrandRequest })
  @ApiResponse({ status: 200, description: 'The persisted brand.', type: BrandResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async update(
    @Param() params: BrandIdParam,
    @Body() body: UpdateBrandRequest,
  ): Promise<BrandResponse> {
    return toBrandResponse(await this.brands.update(params.brandId, body));
  }

  @Delete(':brandId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit(CATALOG_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'brandId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'deleteAdminBrand',
    summary: 'Delete a brand',
    description: 'Refused while any product still references the brand.',
  })
  @ApiResponse({ status: 204, description: 'The brand was removed.' })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async remove(@Param() params: BrandIdParam): Promise<void> {
    await this.brands.remove(params.brandId);
  }
}
