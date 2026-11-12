import { BadRequestException, Injectable } from '@nestjs/common';
import { AppError } from '../../../platform/http/app-error';
import {
  DEFAULT_PAGE_SIZE,
  decodeProductCursor,
  encodeProductCursor,
  normalizeSearchTerm,
  parseAttributeFilter,
} from '../api/catalog.support';
import { BrandRepository } from '../persistence/brand.repository';
import { CategoryRepository } from '../persistence/category.repository';
import {
  type AttributeAttributes,
  type ImageAttributes,
  type ProductCreateAttributes,
  type ProductDetailRecord,
  type ProductRecord,
  type ProductSearchFilter,
  ProductRepository,
  type ProductStatusValue,
  type ProductUpdateAttributes,
  type VariantCreateAttributes,
  type VariantUpdateAttributes,
  type ProductVariantRecord,
} from '../persistence/product.repository';
import {
  isForeignKeyConstraintViolation,
  isRecordNotFoundError,
  isUniqueConstraintViolation,
} from '../persistence/prisma-errors';
import { resolvedSlug } from './category.service';

export interface ProductCreateInput {
  readonly name: string;
  readonly description: string;
  readonly categoryId: string;
  readonly brandId: string;
  readonly basePriceMinor: number;
  readonly baseCurrency: string;
  readonly slug?: string;
}

export interface ProductUpdateInput {
  readonly name?: string;
  readonly description?: string;
  readonly categoryId?: string;
  readonly brandId?: string;
  readonly basePriceMinor?: number;
  readonly baseCurrency?: string;
  readonly slug?: string;
}

export interface ProductListQuery {
  readonly limit?: number;
  readonly cursor?: string;
}

/**
 * The search and filter criteria of the public product listing.
 *
 * The values arrive already validated and normalized by the request boundary; the service resolves
 * the named category and brand to identifiers and passes the criteria to the repository.
 */
export interface ProductSearchQuery extends ProductListQuery {
  readonly q?: string;
  readonly category?: string;
  readonly brand?: string;
  readonly attribute?: readonly string[];
  readonly minPrice?: number;
  readonly maxPrice?: number;
  readonly currency?: string;
}

export interface ProductListView {
  readonly records: readonly ProductRecord[];
  readonly nextCursor: string | null;
}

export interface VariantCreateInput {
  readonly sku: string;
  readonly color?: string | null;
  readonly size?: string | null;
  readonly material?: string | null;
  readonly position?: number;
}

export interface VariantUpdateInput {
  readonly sku?: string;
  readonly color?: string | null;
  readonly size?: string | null;
  readonly material?: string | null;
  readonly position?: number;
}

/**
 * Product administration and browsing.
 *
 * A duplicate public identifier or SKU, a deletion the database refuses, and an attempt to publish a
 * product with no SKU all answer the same stable conflict, so the public contract never leaks a
 * database detail. A product that is not published is answered exactly like a product that never
 * existed, so browsing cannot disclose the commercial pipeline.
 */
@Injectable()
export class ProductService {
  public constructor(
    private readonly products: ProductRepository,
    private readonly categories: CategoryRepository,
    private readonly brands: BrandRepository,
  ) {}

  public async create(input: ProductCreateInput): Promise<ProductDetailRecord> {
    const slug = resolvedSlug(input.slug, input.name);
    await this.assertCategoryExists(input.categoryId);
    await this.assertBrandExists(input.brandId);

    const attributes: ProductCreateAttributes = {
      name: input.name,
      slug,
      description: input.description,
      categoryId: input.categoryId,
      brandId: input.brandId,
      basePriceMinor: input.basePriceMinor,
      baseCurrency: input.baseCurrency,
    };
    try {
      return await this.products.create(attributes);
    } catch (error) {
      throw this.translate(error);
    }
  }

  public async listAdmin(query: ProductListQuery): Promise<ProductListView> {
    return this.page(query, (limit, cursor) => this.products.listAdmin(limit, cursor));
  }

  public async listPublished(query: ProductListQuery): Promise<ProductListView> {
    return this.page(query, (limit, cursor) => this.products.listPublished(limit, cursor));
  }

  /**
   * The published products that match the search and filter criteria.
   *
   * The named category is resolved to itself and its direct children, and the named brand to its
   * identifier, so the repository performs one indexed query. A named category or brand that does
   * not exist matches nothing, so the filter surface cannot be used to probe for identifiers and an
   * unknown name never widens the result set.
   */
  public async searchPublished(query: ProductSearchQuery): Promise<ProductListView> {
    const categoryIds =
      query.category === undefined
        ? undefined
        : await this.categories.findIdsWithChildren(query.category);
    const brandId =
      query.brand === undefined ? undefined : (await this.brands.findBySlug(query.brand))?.id;

    // A filter that names a category or brand which does not exist matches no product at all.
    if (
      (categoryIds !== undefined && categoryIds.length === 0) ||
      (query.brand !== undefined && brandId === undefined)
    ) {
      return { records: [], nextCursor: null };
    }

    const attributes = (query.attribute ?? [])
      .map((value) => parseAttributeFilter(value))
      .filter((value): value is { name: string; value: string } => value !== null);

    const filter: ProductSearchFilter = {
      ...(query.q === undefined ? {} : { term: normalizeSearchTerm(query.q) ?? query.q }),
      ...(categoryIds === undefined ? {} : { categoryIds }),
      ...(brandId === undefined ? {} : { brandId }),
      ...(attributes.length === 0 ? {} : { attributes }),
      ...(query.minPrice === undefined ? {} : { minPriceMinor: query.minPrice }),
      ...(query.maxPrice === undefined ? {} : { maxPriceMinor: query.maxPrice }),
      ...(query.currency === undefined ? {} : { currency: query.currency }),
    };

    return this.page(query, (limit, cursor) => this.products.listPublished(limit, cursor, filter));
  }

  public async getDetail(productId: string): Promise<ProductDetailRecord> {
    const product = await this.products.findDetailById(productId);
    if (product === null) throw AppError.productNotFound();
    return product;
  }

  public async getPublishedDetail(slug: string): Promise<ProductDetailRecord> {
    const product = await this.products.findPublishedDetailBySlug(slug);
    if (product === null) throw AppError.productNotFound();
    return product;
  }

  public async update(productId: string, input: ProductUpdateInput): Promise<ProductDetailRecord> {
    await this.getDetail(productId);
    if (input.categoryId !== undefined) await this.assertCategoryExists(input.categoryId);
    if (input.brandId !== undefined) await this.assertBrandExists(input.brandId);

    const attributes: ProductUpdateAttributes = {
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
      ...(input.brandId === undefined ? {} : { brandId: input.brandId }),
      ...(input.basePriceMinor === undefined ? {} : { basePriceMinor: input.basePriceMinor }),
      ...(input.baseCurrency === undefined ? {} : { baseCurrency: input.baseCurrency }),
      ...(input.slug === undefined ? {} : { slug: input.slug }),
    };
    try {
      return await this.products.update(productId, attributes);
    } catch (error) {
      throw this.translate(error);
    }
  }

  public async remove(productId: string): Promise<void> {
    await this.getDetail(productId);
    try {
      await this.products.deleteById(productId);
    } catch (error) {
      if (isForeignKeyConstraintViolation(error)) throw AppError.catalogConflict();
      if (isRecordNotFoundError(error)) throw AppError.productNotFound();
      throw error;
    }
  }

  public async replaceImages(
    productId: string,
    images: readonly ImageAttributes[],
  ): Promise<ProductDetailRecord> {
    await this.getDetail(productId);
    try {
      return await this.products.replaceImages(productId, images);
    } catch (error) {
      throw this.translate(error);
    }
  }

  public async replaceAttributes(
    productId: string,
    attributes: readonly AttributeAttributes[],
  ): Promise<ProductDetailRecord> {
    await this.getDetail(productId);
    try {
      return await this.products.replaceAttributes(productId, attributes);
    } catch (error) {
      throw this.translate(error);
    }
  }

  public async setStatus(
    productId: string,
    status: ProductStatusValue,
  ): Promise<ProductDetailRecord> {
    await this.getDetail(productId);
    if (status === 'PUBLISHED' && (await this.products.countVariants(productId)) === 0) {
      throw AppError.catalogConflict();
    }
    try {
      return await this.products.update(productId, { status });
    } catch (error) {
      throw this.translate(error);
    }
  }

  /**
   * Sets, replaces, or removes a product's direct product discount.
   *
   * The effective price is recomputed from the current base price inside the same transaction as the
   * discount, so the stored price never disagrees with its own inputs.
   */
  public async setDiscount(productId: string, basisPoints: number): Promise<ProductDetailRecord> {
    await this.getDetail(productId);
    try {
      return await this.products.setDiscountBasisPoints(productId, basisPoints);
    } catch (error) {
      throw this.translate(error, AppError.productNotFound());
    }
  }

  public async createVariant(
    productId: string,
    input: VariantCreateInput,
  ): Promise<ProductVariantRecord> {
    await this.getDetail(productId);
    const attributes: VariantCreateAttributes = {
      sku: input.sku,
      color: input.color ?? null,
      size: input.size ?? null,
      material: input.material ?? null,
      position: input.position ?? 0,
    };
    try {
      return await this.products.createVariant(productId, attributes);
    } catch (error) {
      throw this.translate(error);
    }
  }

  public async updateVariant(
    variantId: string,
    input: VariantUpdateInput,
  ): Promise<ProductVariantRecord> {
    const existing = await this.products.findVariantById(variantId);
    if (existing === null) throw AppError.variantNotFound();

    const attributes: VariantUpdateAttributes = {
      ...(input.sku === undefined ? {} : { sku: input.sku }),
      ...(input.color === undefined ? {} : { color: input.color }),
      ...(input.size === undefined ? {} : { size: input.size }),
      ...(input.material === undefined ? {} : { material: input.material }),
      ...(input.position === undefined ? {} : { position: input.position }),
    };
    try {
      return await this.products.updateVariant(variantId, attributes);
    } catch (error) {
      throw this.translate(error, AppError.variantNotFound());
    }
  }

  public async removeVariant(variantId: string): Promise<void> {
    const existing = await this.products.findVariantById(variantId);
    if (existing === null) throw AppError.variantNotFound();
    try {
      await this.products.deleteVariant(variantId);
    } catch (error) {
      if (isForeignKeyConstraintViolation(error)) throw AppError.catalogConflict();
      if (isRecordNotFoundError(error)) throw AppError.variantNotFound();
      throw error;
    }
  }

  private async page(
    query: ProductListQuery,
    load: (
      limit: number,
      cursor: { name: string; id: string } | null,
    ) => Promise<{ records: readonly ProductRecord[]; hasMore: boolean }>,
  ): Promise<ProductListView> {
    const limit = query.limit ?? DEFAULT_PAGE_SIZE;
    const cursor = this.decodeCursor(query.cursor);
    const page = await load(limit, cursor);
    if (!page.hasMore) return { records: page.records, nextCursor: null };
    const last = page.records[page.records.length - 1];
    if (last === undefined) return { records: page.records, nextCursor: null };
    return {
      records: page.records,
      nextCursor: encodeProductCursor({ name: last.name, id: last.id }),
    };
  }

  private decodeCursor(value: string | undefined): { name: string; id: string } | null {
    if (value === undefined) return null;
    const decoded = decodeProductCursor(value);
    if (decoded === null) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [{ path: 'cursor', message: 'Invalid value' }],
      });
    }
    return decoded;
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    if ((await this.categories.findById(categoryId)) === null) throw AppError.categoryNotFound();
  }

  private async assertBrandExists(brandId: string): Promise<void> {
    if ((await this.brands.findById(brandId)) === null) throw AppError.brandNotFound();
  }

  /**
   * Maps a failed catalog write to the stable conflict the contract documents. An unrecognized failure
   * is rethrown unchanged so the platform's safe error filter answers a non-sensitive 500.
   */
  private translate(error: unknown, notFound?: AppError): AppError {
    if (isUniqueConstraintViolation(error) || isForeignKeyConstraintViolation(error)) {
      return AppError.catalogConflict();
    }
    if (notFound !== undefined && isRecordNotFoundError(error)) return notFound;
    throw error;
  }
}
