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
  Put,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { errors } from '../../../platform/http/openapi-error-responses';
import { Roles } from '../../../platform/security/access.decorators';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { ProductService } from '../application/product.service';
import { CATALOG_RATE_LIMITS } from './catalog.policies';
import {
  CreateProductRequest,
  CreateProductVariantRequest,
  ListProductsQuery,
  ProductIdParam,
  ReplaceProductAttributesRequest,
  ReplaceProductImagesRequest,
  SetProductDiscountRequest,
  SetProductStatusRequest,
  UpdateProductRequest,
} from './catalog.request';
import {
  ProductDetailResponse,
  ProductsResponse,
  VariantResponse,
  toProductDetailResponse,
  toProductsResponse,
} from './catalog.response';

/**
 * Administrative product management.
 *
 * Every route requires the `ADMIN` role. Images and attributes are replaced as whole collections
 * inside one transaction; a variant is created individually because it is the SKU that later
 * milestones track inventory against. A new product is not publicly visible until it is published.
 */
@ApiTags('Catalog')
@Roles('ADMIN')
@Controller({ path: 'admin/catalog/products', version: '1' })
export class AdminProductsController {
  public constructor(private readonly products: ProductService) {}

  @Post()
  @RateLimit(CATALOG_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'createAdminProduct',
    summary: 'Create a product',
    description:
      'The product belongs to exactly one category and one brand and is created in the DRAFT state. The base price is an exact integer count of minor units with an explicit currency.',
  })
  @ApiBody({ type: CreateProductRequest })
  @ApiResponse({ status: 201, description: 'The created product.', type: ProductDetailResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async create(@Body() body: CreateProductRequest): Promise<ProductDetailResponse> {
    return toProductDetailResponse(await this.products.create(body));
  }

  @Get()
  @RateLimit(CATALOG_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiOperation({
    operationId: 'listAdminProducts',
    summary: 'List products of every lifecycle state',
    description: 'A deterministic keyset page ordered by name and identifier.',
  })
  @ApiResponse({ status: 200, description: 'A page of products.', type: ProductsResponse })
  @errors(400, 401, 403, 429, 500, 503)
  public async list(@Query() query: ListProductsQuery): Promise<ProductsResponse> {
    const page = await this.products.listAdmin(query);
    return toProductsResponse(page.records, page.nextCursor);
  }

  @Get(':productId')
  @RateLimit(CATALOG_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'productId', type: String, format: 'uuid' })
  @ApiOperation({ operationId: 'getAdminProduct', summary: 'Read one product of any state' })
  @ApiResponse({ status: 200, description: 'The product.', type: ProductDetailResponse })
  @errors(400, 401, 403, 404, 429, 500, 503)
  public async get(@Param() params: ProductIdParam): Promise<ProductDetailResponse> {
    return toProductDetailResponse(await this.products.getDetail(params.productId));
  }

  @Patch(':productId')
  @RateLimit(CATALOG_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'productId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'updateAdminProduct',
    summary: 'Update a product',
    description: 'Applies only the supplied attributes. The lifecycle state is changed elsewhere.',
  })
  @ApiBody({ type: UpdateProductRequest })
  @ApiResponse({ status: 200, description: 'The persisted product.', type: ProductDetailResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async update(
    @Param() params: ProductIdParam,
    @Body() body: UpdateProductRequest,
  ): Promise<ProductDetailResponse> {
    return toProductDetailResponse(await this.products.update(params.productId, body));
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit(CATALOG_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'productId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'deleteAdminProduct',
    summary: 'Delete a product',
    description: 'Refused while a later dependent still references one of the product SKUs.',
  })
  @ApiResponse({ status: 204, description: 'The product was removed.' })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async remove(@Param() params: ProductIdParam): Promise<void> {
    await this.products.remove(params.productId);
  }

  @Put(':productId/images')
  @RateLimit(CATALOG_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'productId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'replaceAdminProductImages',
    summary: 'Replace a product image set',
    description: 'The whole collection is replaced atomically; image positions must be unique.',
  })
  @ApiBody({ type: ReplaceProductImagesRequest })
  @ApiResponse({
    status: 200,
    description: 'The product with its new images.',
    type: ProductDetailResponse,
  })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async replaceImages(
    @Param() params: ProductIdParam,
    @Body() body: ReplaceProductImagesRequest,
  ): Promise<ProductDetailResponse> {
    const images = body.images.map((image) => ({
      url: image.url,
      altText: image.altText ?? null,
      position: image.position,
    }));
    return toProductDetailResponse(await this.products.replaceImages(params.productId, images));
  }

  @Put(':productId/attributes')
  @RateLimit(CATALOG_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'productId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'replaceAdminProductAttributes',
    summary: 'Replace a product attribute set',
    description: 'The whole collection is replaced atomically; attribute names must be unique.',
  })
  @ApiBody({ type: ReplaceProductAttributesRequest })
  @ApiResponse({
    status: 200,
    description: 'The product with its new attributes.',
    type: ProductDetailResponse,
  })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async replaceAttributes(
    @Param() params: ProductIdParam,
    @Body() body: ReplaceProductAttributesRequest,
  ): Promise<ProductDetailResponse> {
    const attributes = body.attributes.map((attribute) => ({
      name: attribute.name,
      value: attribute.value,
      position: attribute.position,
    }));
    return toProductDetailResponse(
      await this.products.replaceAttributes(params.productId, attributes),
    );
  }

  @Put(':productId/status')
  @RateLimit(CATALOG_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'productId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'setAdminProductStatus',
    summary: 'Change a product lifecycle state',
    description: 'Publishing a product that has no sellable variant is refused.',
  })
  @ApiBody({ type: SetProductStatusRequest })
  @ApiResponse({ status: 200, description: 'The persisted product.', type: ProductDetailResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async setStatus(
    @Param() params: ProductIdParam,
    @Body() body: SetProductStatusRequest,
  ): Promise<ProductDetailResponse> {
    return toProductDetailResponse(await this.products.setStatus(params.productId, body.status));
  }

  @Post(':productId/variants')
  @RateLimit(CATALOG_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'productId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'createAdminProductVariant',
    summary: 'Add a sellable variant',
    description: 'The SKU is unique across the whole catalog and is normalized to upper case.',
  })
  @ApiBody({ type: CreateProductVariantRequest })
  @ApiResponse({ status: 201, description: 'The created variant.', type: VariantResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async createVariant(
    @Param() params: ProductIdParam,
    @Body() body: CreateProductVariantRequest,
  ): Promise<VariantResponse> {
    const variant = await this.products.createVariant(params.productId, body);
    return {
      ...variant,
      createdAt: variant.createdAt.toISOString(),
      updatedAt: variant.updatedAt.toISOString(),
    };
  }

  @Put(':productId/discount')
  @RateLimit(CATALOG_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'productId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'setAdminProductDiscount',
    summary: 'Set the direct product discount',
    description:
      'The discount is a whole number of basis points; one hundred is one percent and zero removes the discount. The effective price is recomputed from the base price in the same transaction.',
  })
  @ApiBody({ type: SetProductDiscountRequest })
  @ApiResponse({
    status: 200,
    description: 'The product with its new discount and effective price.',
    type: ProductDetailResponse,
  })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async setDiscount(
    @Param() params: ProductIdParam,
    @Body() body: SetProductDiscountRequest,
  ): Promise<ProductDetailResponse> {
    return toProductDetailResponse(
      await this.products.setDiscount(params.productId, body.basisPoints),
    );
  }
}
