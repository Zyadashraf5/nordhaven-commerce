import {
  Body,
  Controller,
  Delete,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { errors } from '../../../platform/http/openapi-error-responses';
import { Roles } from '../../../platform/security/access.decorators';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { ProductService } from '../application/product.service';
import { CATALOG_RATE_LIMITS } from './catalog.policies';
import { UpdateProductVariantRequest, VariantIdParam } from './catalog.request';
import { VariantResponse } from './catalog.response';

/**
 * Administrative variant management.
 *
 * Variants are addressed directly rather than through a whole-collection replacement, so removing a
 * SKU is always an explicit act. A SKU that a later dependent still references is refused with a
 * stable conflict.
 */
@ApiTags('Catalog')
@Roles('ADMIN')
@Controller({ path: 'admin/catalog/variants', version: '1' })
export class AdminVariantsController {
  public constructor(private readonly products: ProductService) {}

  @Patch(':variantId')
  @RateLimit(CATALOG_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'variantId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'updateAdminVariant',
    summary: 'Update a sellable variant',
    description: 'Applies only the supplied attributes. An explicit null clears a dimension.',
  })
  @ApiBody({ type: UpdateProductVariantRequest })
  @ApiResponse({ status: 200, description: 'The persisted variant.', type: VariantResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async update(
    @Param() params: VariantIdParam,
    @Body() body: UpdateProductVariantRequest,
  ): Promise<VariantResponse> {
    const variant = await this.products.updateVariant(params.variantId, body);
    return {
      ...variant,
      createdAt: variant.createdAt.toISOString(),
      updatedAt: variant.updatedAt.toISOString(),
    };
  }

  @Delete(':variantId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit(CATALOG_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'variantId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'deleteAdminVariant',
    summary: 'Delete a sellable variant',
    description: 'Refused while a later dependent still references the SKU.',
  })
  @ApiResponse({ status: 204, description: 'The variant was removed.' })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async remove(@Param() params: VariantIdParam): Promise<void> {
    await this.products.removeVariant(params.variantId);
  }
}
