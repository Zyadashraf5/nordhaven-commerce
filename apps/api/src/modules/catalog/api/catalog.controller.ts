import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { errors } from '../../../platform/http/openapi-error-responses';
import { Public } from '../../../platform/security/access.decorators';
import { RateLimit } from '../../../platform/security/rate-limit.decorator';
import { ProductService } from '../application/product.service';
import { CategoryService } from '../application/category.service';
import { BrandService } from '../application/brand.service';
import { CATALOG_RATE_LIMITS } from './catalog.policies';
import { ProductSlugParam, SearchProductsQuery } from './catalog.request';
import {
  BrandsResponse,
  CategoriesResponse,
  ProductDetailResponse,
  ProductsResponse,
  toBrandsResponse,
  toCategoriesResponse,
  toProductDetailResponse,
  toProductsResponse,
} from './catalog.response';

/**
 * Anonymous catalog browsing.
 *
 * These are the only catalog routes reachable without a credential, because HC-IAM-002 requires
 * authentication for a cart or checkout but not for browsing. Only published products are visible, and
 * a product that is not published answers exactly like a product that never existed, so the browsing
 * surface never discloses the commercial pipeline.
 */
@ApiTags('Catalog')
@Public()
@Controller({ path: 'catalog', version: '1' })
export class CatalogController {
  public constructor(
    private readonly products: ProductService,
    private readonly categories: CategoryService,
    private readonly brands: BrandService,
  ) {}

  @Get('categories')
  @RateLimit(CATALOG_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listCatalogCategories',
    summary: 'List the category tree',
    description: 'The two-level tree; each node carries its direct children.',
  })
  @ApiResponse({ status: 200, description: 'The category tree.', type: CategoriesResponse })
  @errors(400, 429, 500, 503)
  public async listCategories(): Promise<CategoriesResponse> {
    return toCategoriesResponse(await this.categories.listTree());
  }

  @Get('brands')
  @RateLimit(CATALOG_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ operationId: 'listCatalogBrands', summary: 'List the brands' })
  @ApiResponse({ status: 200, description: 'The brands.', type: BrandsResponse })
  @errors(400, 429, 500, 503)
  public async listBrands(): Promise<BrandsResponse> {
    return toBrandsResponse(await this.brands.list());
  }

  @Get('products')
  @RateLimit(CATALOG_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'brand', required: false, type: String })
  @ApiQuery({ name: 'attribute', required: false, type: String, isArray: true })
  @ApiQuery({ name: 'minPrice', required: false, type: Number })
  @ApiQuery({ name: 'maxPrice', required: false, type: Number })
  @ApiQuery({ name: 'currency', required: false, type: String })
  @ApiOperation({
    operationId: 'listCatalogProducts',
    summary: 'List and search published products',
    description:
      'A deterministic keyset page ordered by name and identifier. Every filter is optional and the criteria are combined with AND; a request that supplies none returns the unfiltered page.',
  })
  @ApiResponse({
    status: 200,
    description: 'A page of published products.',
    type: ProductsResponse,
  })
  @errors(400, 429, 500, 503)
  public async listProducts(@Query() query: SearchProductsQuery): Promise<ProductsResponse> {
    const page = await this.products.searchPublished(query);
    return toProductsResponse(page.records, page.nextCursor);
  }

  @Get('products/:slug')
  @RateLimit(CATALOG_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'slug', type: String })
  @ApiOperation({
    operationId: 'getCatalogProduct',
    summary: 'Read one published product by slug',
    description: 'An unpublished or unknown slug answers the same not-found response.',
  })
  @ApiResponse({ status: 200, description: 'The published product.', type: ProductDetailResponse })
  @errors(400, 404, 429, 500, 503)
  public async getProduct(@Param() params: ProductSlugParam): Promise<ProductDetailResponse> {
    return toProductDetailResponse(await this.products.getPublishedDetail(params.slug));
  }
}
