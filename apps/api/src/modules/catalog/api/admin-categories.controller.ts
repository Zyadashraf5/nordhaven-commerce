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
import { CategoryService } from '../application/category.service';
import { CATALOG_RATE_LIMITS } from './catalog.policies';
import { CategoryIdParam, CreateCategoryRequest, UpdateCategoryRequest } from './catalog.request';
import {
  CategoriesResponse,
  CategoryResponse,
  toCategoriesResponse,
  toCategoryResponse,
} from './catalog.response';

/**
 * Administrative category management.
 *
 * Every route requires the `ADMIN` role, and the global role guard records each grant and denial
 * through the authorization audit boundary. The two-level hierarchy rule (HC-CAT-002) is enforced in
 * the application layer and reported as a stable conflict.
 */
@ApiTags('Catalog')
@Roles('ADMIN')
@Controller({ path: 'admin/catalog/categories', version: '1' })
export class AdminCategoriesController {
  public constructor(private readonly categories: CategoryService) {}

  @Post()
  @RateLimit(CATALOG_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'createAdminCategory',
    summary: 'Create a category',
    description:
      'The slug is derived from the name when omitted. A category may be created at the root or beneath a root; the hierarchy never exceeds two levels.',
  })
  @ApiBody({ type: CreateCategoryRequest })
  @ApiResponse({ status: 201, description: 'The created category.', type: CategoryResponse })
  @errors(400, 401, 403, 409, 429, 500, 503)
  public async create(@Body() body: CreateCategoryRequest): Promise<CategoryResponse> {
    return toCategoryResponse({ ...(await this.categories.create(body)), children: [] });
  }

  @Get()
  @RateLimit(CATALOG_RATE_LIMITS.read)
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    operationId: 'listAdminCategories',
    summary: 'List every category as a two-level tree',
  })
  @ApiResponse({ status: 200, description: 'The category tree.', type: CategoriesResponse })
  @errors(400, 401, 403, 429, 500, 503)
  public async list(): Promise<CategoriesResponse> {
    return toCategoriesResponse(await this.categories.listTree());
  }

  @Patch(':categoryId')
  @RateLimit(CATALOG_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'categoryId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'updateAdminCategory',
    summary: 'Update a category',
    description:
      'Applies only the supplied attributes. Setting a parent on a category that has children, or beneath a non-root category, is refused.',
  })
  @ApiBody({ type: UpdateCategoryRequest })
  @ApiResponse({ status: 200, description: 'The persisted category.', type: CategoryResponse })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async update(
    @Param() params: CategoryIdParam,
    @Body() body: UpdateCategoryRequest,
  ): Promise<CategoryResponse> {
    return toCategoryResponse({
      ...(await this.categories.update(params.categoryId, body)),
      children: [],
    });
  }

  @Delete(':categoryId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit(CATALOG_RATE_LIMITS.write)
  @Header('Cache-Control', 'no-store')
  @ApiParam({ name: 'categoryId', type: String, format: 'uuid' })
  @ApiOperation({
    operationId: 'deleteAdminCategory',
    summary: 'Delete a category',
    description: 'Refused while the category still has children or products.',
  })
  @ApiResponse({ status: 204, description: 'The category was removed.' })
  @errors(400, 401, 403, 404, 409, 429, 500, 503)
  public async remove(@Param() params: CategoryIdParam): Promise<void> {
    await this.categories.remove(params.categoryId);
  }
}
