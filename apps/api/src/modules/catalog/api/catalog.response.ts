import { ApiProperty } from '@nestjs/swagger';
import type { BrandRecord } from '../persistence/brand.repository';
import type { CategoryRecord } from '../persistence/category.repository';
import type { ProductDetailRecord, ProductRecord } from '../persistence/product.repository';
import { CURRENCY_CODE_LENGTH, type CategoryTreeNode } from './catalog.support';

/**
 * Response projections.
 *
 * Each projection emits exactly the fields its DTO declares, and nothing else: no internal-only column,
 * no other module's data, and never an echo of a rejected value.
 */

export class CategoryResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String })
  public name!: string;

  @ApiProperty({ type: String })
  public slug!: string;

  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  public parentId!: string | null;

  @ApiProperty({ type: Number })
  public position!: number;

  @ApiProperty({
    type: () => [CategoryResponse],
    description: 'Direct children (at most one level).',
  })
  public children!: CategoryResponse[];

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  public updatedAt!: string;
}

export class CategoriesResponse {
  @ApiProperty({ type: [CategoryResponse] })
  public categories!: CategoryResponse[];
}

export class BrandResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String })
  public name!: string;

  @ApiProperty({ type: String })
  public slug!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  public updatedAt!: string;
}

export class BrandsResponse {
  @ApiProperty({ type: [BrandResponse] })
  public brands!: BrandResponse[];
}

export class CategoryRefResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String })
  public name!: string;

  @ApiProperty({ type: String })
  public slug!: string;
}

export class BrandRefResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String })
  public name!: string;

  @ApiProperty({ type: String })
  public slug!: string;
}

export class ImageResponse {
  @ApiProperty({ type: String })
  public url!: string;

  @ApiProperty({ type: String, nullable: true })
  public altText!: string | null;

  @ApiProperty({ type: Number })
  public position!: number;
}

export class AttributeResponse {
  @ApiProperty({ type: String })
  public name!: string;

  @ApiProperty({ type: String })
  public value!: string;

  @ApiProperty({ type: Number })
  public position!: number;
}

export class VariantResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String })
  public sku!: string;

  @ApiProperty({ type: String, nullable: true })
  public color!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public size!: string | null;

  @ApiProperty({ type: String, nullable: true })
  public material!: string | null;

  @ApiProperty({ type: Number })
  public position!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  public updatedAt!: string;
}

export class ProductSummaryResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String })
  public name!: string;

  @ApiProperty({ type: String })
  public slug!: string;

  @ApiProperty({ type: String, enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] })
  public status!: string;

  @ApiProperty({ type: Number, description: 'Exact integer minor units.' })
  public basePriceMinor!: number;

  @ApiProperty({
    type: String,
    minLength: CURRENCY_CODE_LENGTH,
    maxLength: CURRENCY_CODE_LENGTH,
  })
  public baseCurrency!: string;

  @ApiProperty({
    type: Number,
    minimum: 0,
    maximum: 10000,
    description:
      'The direct discount in basis points; one hundred is one percent. Zero is no discount.',
  })
  public discountBasisPoints!: number;

  @ApiProperty({
    type: Number,
    description: 'The price the customer pays, in exact integer minor units of the base currency.',
  })
  public effectivePriceMinor!: number;

  @ApiProperty({ type: CategoryRefResponse })
  public category!: CategoryRefResponse;

  @ApiProperty({ type: BrandRefResponse })
  public brand!: BrandRefResponse;

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  public updatedAt!: string;
}

export class ProductDetailResponse {
  @ApiProperty({ type: String, format: 'uuid' })
  public id!: string;

  @ApiProperty({ type: String })
  public name!: string;

  @ApiProperty({ type: String })
  public slug!: string;

  @ApiProperty({ type: String })
  public description!: string;

  @ApiProperty({ type: String, enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] })
  public status!: string;

  @ApiProperty({ type: Number, description: 'Exact integer minor units.' })
  public basePriceMinor!: number;

  @ApiProperty({
    type: String,
    minLength: CURRENCY_CODE_LENGTH,
    maxLength: CURRENCY_CODE_LENGTH,
  })
  public baseCurrency!: string;

  @ApiProperty({
    type: Number,
    minimum: 0,
    maximum: 10000,
    description:
      'The direct discount in basis points; one hundred is one percent. Zero is no discount.',
  })
  public discountBasisPoints!: number;

  @ApiProperty({
    type: Number,
    description: 'The price the customer pays, in exact integer minor units of the base currency.',
  })
  public effectivePriceMinor!: number;

  @ApiProperty({ type: CategoryRefResponse })
  public category!: CategoryRefResponse;

  @ApiProperty({ type: BrandRefResponse })
  public brand!: BrandRefResponse;

  @ApiProperty({ type: [ImageResponse] })
  public images!: ImageResponse[];

  @ApiProperty({ type: [AttributeResponse] })
  public attributes!: AttributeResponse[];

  @ApiProperty({ type: [VariantResponse] })
  public variants!: VariantResponse[];

  @ApiProperty({ type: String, format: 'date-time' })
  public createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  public updatedAt!: string;
}

export class ProductsResponse {
  @ApiProperty({ type: [ProductSummaryResponse] })
  public items!: ProductSummaryResponse[];

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Opaque cursor; null on the last page.',
  })
  public nextCursor!: string | null;
}

export function toCategoryResponse(node: CategoryTreeNode): CategoryResponse {
  return {
    id: node.id,
    name: node.name,
    slug: node.slug,
    parentId: node.parentId,
    position: node.position,
    children: node.children.map((child: CategoryRecord) => ({
      id: child.id,
      name: child.name,
      slug: child.slug,
      parentId: child.parentId,
      position: child.position,
      children: [],
      createdAt: child.createdAt.toISOString(),
      updatedAt: child.updatedAt.toISOString(),
    })),
    createdAt: node.createdAt.toISOString(),
    updatedAt: node.updatedAt.toISOString(),
  };
}

export function toCategoriesResponse(nodes: readonly CategoryTreeNode[]): CategoriesResponse {
  return { categories: nodes.map((node) => toCategoryResponse(node)) };
}

export function toBrandResponse(record: BrandRecord): BrandResponse {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toBrandsResponse(records: readonly BrandRecord[]): BrandsResponse {
  return { brands: records.map((record) => toBrandResponse(record)) };
}

export function toProductSummaryResponse(record: ProductRecord): ProductSummaryResponse {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    status: record.status,
    basePriceMinor: record.basePriceMinor,
    baseCurrency: record.baseCurrency,
    discountBasisPoints: record.discountBasisPoints,
    effectivePriceMinor: record.effectivePriceMinor,
    category: { ...record.category },
    brand: { ...record.brand },
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toProductDetailResponse(record: ProductDetailRecord): ProductDetailResponse {
  return {
    ...toProductSummaryResponse(record),
    description: record.description,
    images: record.images.map((image) => ({ ...image })),
    attributes: record.attributes.map((attribute) => ({ ...attribute })),
    variants: record.variants.map((variant) => ({
      ...variant,
      createdAt: variant.createdAt.toISOString(),
      updatedAt: variant.updatedAt.toISOString(),
    })),
  };
}

export function toProductsResponse(
  records: readonly ProductRecord[],
  nextCursor: string | null,
): ProductsResponse {
  return { items: records.map((record) => toProductSummaryResponse(record)), nextCursor };
}
