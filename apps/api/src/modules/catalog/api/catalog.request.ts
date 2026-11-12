import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';
import { ZOD_VALIDATION_SCHEMA } from '../../../platform/validation/zod-validation.pipe';
import {
  ATTRIBUTE_NAME_MAX_LENGTH,
  ATTRIBUTE_VALUE_MAX_LENGTH,
  BRAND_NAME_MAX_LENGTH,
  CATEGORY_NAME_MAX_LENGTH,
  CURRENCY_CODE_LENGTH,
  DEFAULT_PAGE_SIZE,
  IMAGE_ALT_TEXT_MAX_LENGTH,
  IMAGE_URL_MAX_LENGTH,
  MAX_ATTRIBUTES_PER_PRODUCT,
  MAX_DISCOUNT_BASIS_POINTS,
  MAX_IMAGES_PER_PRODUCT,
  MAX_PAGE_SIZE,
  MAX_PRICE_MINOR,
  MAX_SEARCH_TERM_LENGTH,
  PRODUCT_DESCRIPTION_MAX_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
  SKU_MAX_LENGTH,
  SLUG_MAX_LENGTH,
  VARIANT_DIMENSION_MAX_LENGTH,
  currencyCode,
  imageUrl,
  minorUnits,
  optionalText,
  parseAttributeFilter,
  position,
  requiredText,
  skuValue,
  slugValue,
  slugify,
} from './catalog.support';

/**
 * Boundary schemas for the Product Catalog capability.
 *
 * Every object is strict, so an unexpected field is rejected instead of silently ignored. Each schema
 * also normalizes its input, so the values that reach the application layer are already trimmed,
 * lower-cased, de-punctuated, and cased exactly as they are stored.
 */

/** A value that is absent when omitted and cleared when explicitly null. */
function clearableText(maxLength: number) {
  return optionalText(maxLength).nullish();
}

const imageItem = z.strictObject({
  url: imageUrl(),
  altText: optionalText(IMAGE_ALT_TEXT_MAX_LENGTH).nullish(),
  position: position(),
});

const attributeItem = z.strictObject({
  name: requiredText(ATTRIBUTE_NAME_MAX_LENGTH),
  value: requiredText(ATTRIBUTE_VALUE_MAX_LENGTH),
  position: position(),
});

export class CreateCategoryRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z
    .strictObject({
      name: requiredText(CATEGORY_NAME_MAX_LENGTH),
      slug: slugValue().optional(),
      parentId: z.uuid().nullish(),
      position: position().optional(),
    })
    .refine(
      (value) => value.slug !== undefined || slugify(value.name) !== null,
      'A name must contain at least one alphanumeric character when no slug is supplied',
    );

  @ApiProperty({ type: String, maxLength: CATEGORY_NAME_MAX_LENGTH })
  public name!: string;

  @ApiProperty({
    type: String,
    required: false,
    maxLength: SLUG_MAX_LENGTH,
    description: 'Optional; derived from the name when omitted.',
  })
  public slug?: string;

  @ApiProperty({
    type: String,
    format: 'uuid',
    required: false,
    nullable: true,
    description: 'Optional root category. The hierarchy has at most two levels (HC-CAT-002).',
  })
  public parentId?: string | null;

  @ApiProperty({ type: Number, required: false, minimum: 0 })
  public position?: number;
}

export class UpdateCategoryRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z
    .strictObject({
      name: requiredText(CATEGORY_NAME_MAX_LENGTH).optional(),
      slug: slugValue().optional(),
      parentId: z.uuid().nullish(),
      position: position().optional(),
    })
    .refine(
      (value) =>
        value.name !== undefined ||
        value.slug !== undefined ||
        value.parentId !== undefined ||
        value.position !== undefined,
      'At least one attribute must be supplied',
    );

  @ApiProperty({ type: String, required: false, maxLength: CATEGORY_NAME_MAX_LENGTH })
  public name?: string;

  @ApiProperty({ type: String, required: false, maxLength: SLUG_MAX_LENGTH })
  public slug?: string;

  @ApiProperty({ type: String, format: 'uuid', required: false, nullable: true })
  public parentId?: string | null;

  @ApiProperty({ type: Number, required: false, minimum: 0 })
  public position?: number;
}

export class CreateBrandRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z
    .strictObject({
      name: requiredText(BRAND_NAME_MAX_LENGTH),
      slug: slugValue().optional(),
    })
    .refine(
      (value) => value.slug !== undefined || slugify(value.name) !== null,
      'A name must contain at least one alphanumeric character when no slug is supplied',
    );

  @ApiProperty({ type: String, maxLength: BRAND_NAME_MAX_LENGTH })
  public name!: string;

  @ApiProperty({
    type: String,
    required: false,
    maxLength: SLUG_MAX_LENGTH,
    description: 'Optional; derived from the name when omitted.',
  })
  public slug?: string;
}

export class UpdateBrandRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z
    .strictObject({
      name: requiredText(BRAND_NAME_MAX_LENGTH).optional(),
      slug: slugValue().optional(),
    })
    .refine(
      (value) => value.name !== undefined || value.slug !== undefined,
      'At least one attribute must be supplied',
    );

  @ApiProperty({ type: String, required: false, maxLength: BRAND_NAME_MAX_LENGTH })
  public name?: string;

  @ApiProperty({ type: String, required: false, maxLength: SLUG_MAX_LENGTH })
  public slug?: string;
}

export class CreateProductRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z
    .strictObject({
      name: requiredText(PRODUCT_NAME_MAX_LENGTH),
      description: requiredText(PRODUCT_DESCRIPTION_MAX_LENGTH),
      categoryId: z.uuid(),
      brandId: z.uuid(),
      basePriceMinor: minorUnits(),
      baseCurrency: currencyCode(),
      slug: slugValue().optional(),
    })
    .refine(
      (value) => value.slug !== undefined || slugify(value.name) !== null,
      'A name must contain at least one alphanumeric character when no slug is supplied',
    );

  @ApiProperty({ type: String, maxLength: PRODUCT_NAME_MAX_LENGTH })
  public name!: string;

  @ApiProperty({ type: String, maxLength: PRODUCT_DESCRIPTION_MAX_LENGTH })
  public description!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  public categoryId!: string;

  @ApiProperty({ type: String, format: 'uuid' })
  public brandId!: string;

  @ApiProperty({
    type: Number,
    minimum: 0,
    maximum: MAX_PRICE_MINOR,
    description: 'Exact integer minor units. No floating-point value is accepted.',
  })
  public basePriceMinor!: number;

  @ApiProperty({
    type: String,
    minLength: CURRENCY_CODE_LENGTH,
    maxLength: CURRENCY_CODE_LENGTH,
    pattern: '^[A-Za-z]{3}$',
  })
  public baseCurrency!: string;

  @ApiProperty({
    type: String,
    required: false,
    maxLength: SLUG_MAX_LENGTH,
    description: 'Optional; derived from the name when omitted.',
  })
  public slug?: string;
}

export class UpdateProductRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z
    .strictObject({
      name: requiredText(PRODUCT_NAME_MAX_LENGTH).optional(),
      description: requiredText(PRODUCT_DESCRIPTION_MAX_LENGTH).optional(),
      categoryId: z.uuid().optional(),
      brandId: z.uuid().optional(),
      basePriceMinor: minorUnits().optional(),
      baseCurrency: currencyCode().optional(),
      slug: slugValue().optional(),
    })
    .refine(
      (value) =>
        value.name !== undefined ||
        value.description !== undefined ||
        value.categoryId !== undefined ||
        value.brandId !== undefined ||
        value.basePriceMinor !== undefined ||
        value.baseCurrency !== undefined ||
        value.slug !== undefined,
      'At least one attribute must be supplied',
    );

  @ApiProperty({ type: String, required: false, maxLength: PRODUCT_NAME_MAX_LENGTH })
  public name?: string;

  @ApiProperty({ type: String, required: false, maxLength: PRODUCT_DESCRIPTION_MAX_LENGTH })
  public description?: string;

  @ApiProperty({ type: String, format: 'uuid', required: false })
  public categoryId?: string;

  @ApiProperty({ type: String, format: 'uuid', required: false })
  public brandId?: string;

  @ApiProperty({ type: Number, required: false, minimum: 0, maximum: MAX_PRICE_MINOR })
  public basePriceMinor?: number;

  @ApiProperty({
    type: String,
    required: false,
    minLength: CURRENCY_CODE_LENGTH,
    maxLength: CURRENCY_CODE_LENGTH,
  })
  public baseCurrency?: string;

  @ApiProperty({ type: String, required: false, maxLength: SLUG_MAX_LENGTH })
  public slug?: string;
}

export class ProductImageRequest {
  @ApiProperty({ type: String, maxLength: IMAGE_URL_MAX_LENGTH })
  public url!: string;

  @ApiProperty({
    type: String,
    required: false,
    nullable: true,
    maxLength: IMAGE_ALT_TEXT_MAX_LENGTH,
  })
  public altText?: string | null;

  @ApiProperty({ type: Number, minimum: 0 })
  public position!: number;
}

export class ProductAttributeRequest {
  @ApiProperty({ type: String, maxLength: ATTRIBUTE_NAME_MAX_LENGTH })
  public name!: string;

  @ApiProperty({ type: String, maxLength: ATTRIBUTE_VALUE_MAX_LENGTH })
  public value!: string;

  @ApiProperty({ type: Number, minimum: 0 })
  public position!: number;
}

export class ReplaceProductImagesRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z
    .strictObject({
      images: z.array(imageItem).max(MAX_IMAGES_PER_PRODUCT),
    })
    .refine(
      (value) => new Set(value.images.map((image) => image.position)).size === value.images.length,
      'Image positions must be unique within a product',
    );

  @ApiProperty({
    type: [ProductImageRequest],
    maxItems: MAX_IMAGES_PER_PRODUCT,
    description: 'The complete image set; the previous set is replaced atomically.',
  })
  public images!: ProductImageRequest[];
}

export class ReplaceProductAttributesRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z
    .strictObject({
      attributes: z.array(attributeItem).max(MAX_ATTRIBUTES_PER_PRODUCT),
    })
    .refine(
      (value) =>
        new Set(value.attributes.map((attribute) => attribute.name.toLowerCase())).size ===
        value.attributes.length,
      'Attribute names must be unique within a product',
    );

  @ApiProperty({
    type: [ProductAttributeRequest],
    maxItems: MAX_ATTRIBUTES_PER_PRODUCT,
    description: 'The complete attribute set; the previous set is replaced atomically.',
  })
  public attributes!: ProductAttributeRequest[];
}

export class SetProductStatusRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']),
  });

  @ApiProperty({ type: String, enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] })
  public status!: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
}

export class CreateProductVariantRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    sku: skuValue(),
    color: clearableText(VARIANT_DIMENSION_MAX_LENGTH),
    size: clearableText(VARIANT_DIMENSION_MAX_LENGTH),
    material: clearableText(VARIANT_DIMENSION_MAX_LENGTH),
    position: position().optional(),
  });

  @ApiProperty({ type: String, maxLength: SKU_MAX_LENGTH })
  public sku!: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  public color?: string | null;

  @ApiProperty({ type: String, required: false, nullable: true })
  public size?: string | null;

  @ApiProperty({ type: String, required: false, nullable: true })
  public material?: string | null;

  @ApiProperty({ type: Number, required: false, minimum: 0 })
  public position?: number;
}

export class UpdateProductVariantRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z
    .strictObject({
      sku: skuValue().optional(),
      color: clearableText(VARIANT_DIMENSION_MAX_LENGTH),
      size: clearableText(VARIANT_DIMENSION_MAX_LENGTH),
      material: clearableText(VARIANT_DIMENSION_MAX_LENGTH),
      position: position().optional(),
    })
    .refine(
      (value) =>
        value.sku !== undefined ||
        value.color !== undefined ||
        value.size !== undefined ||
        value.material !== undefined ||
        value.position !== undefined,
      'At least one attribute must be supplied',
    );

  @ApiProperty({ type: String, required: false, maxLength: SKU_MAX_LENGTH })
  public sku?: string;

  @ApiProperty({ type: String, required: false, nullable: true })
  public color?: string | null;

  @ApiProperty({ type: String, required: false, nullable: true })
  public size?: string | null;

  @ApiProperty({ type: String, required: false, nullable: true })
  public material?: string | null;

  @ApiProperty({ type: Number, required: false, minimum: 0 })
  public position?: number;
}

export class CategoryIdParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({ categoryId: z.uuid() });

  @ApiProperty({ type: String, format: 'uuid' })
  public categoryId!: string;
}

export class BrandIdParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({ brandId: z.uuid() });

  @ApiProperty({ type: String, format: 'uuid' })
  public brandId!: string;
}

export class ProductIdParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({ productId: z.uuid() });

  @ApiProperty({ type: String, format: 'uuid' })
  public productId!: string;
}

export class VariantIdParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({ variantId: z.uuid() });

  @ApiProperty({ type: String, format: 'uuid' })
  public variantId!: string;
}

export class ProductSlugParam {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(SLUG_MAX_LENGTH),
  });

  @ApiProperty({ type: String, maxLength: SLUG_MAX_LENGTH })
  public slug!: string;
}

export class ListProductsQuery {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
    cursor: z.string().trim().min(1).max(500).optional(),
  });

  @ApiProperty({ type: Number, required: false, minimum: 1, maximum: MAX_PAGE_SIZE })
  public limit?: number;

  @ApiProperty({ type: String, required: false })
  public cursor?: string;
}

/**
 * The search and filter parameters of the public product listing.
 *
 * Every parameter is optional, so a request that supplies none of them returns exactly the page
 * the listing returned before the search capability existed. The schema stays strict: an unknown
 * query parameter is refused rather than ignored, so a mistyped filter is reported.
 */
export class SearchProductsQuery {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z
    .strictObject({
      limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
      cursor: z.string().trim().min(1).max(500).optional(),
      q: z
        .string()
        .trim()
        .min(1)
        .max(MAX_SEARCH_TERM_LENGTH)
        .refine((value) => /[\p{L}\p{N}]/u.test(value), {
          message: 'The search term must contain at least one alphanumeric character',
        })
        .optional(),
      category: z
        .string()
        .trim()
        .min(1)
        .max(SLUG_MAX_LENGTH)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .optional(),
      brand: z
        .string()
        .trim()
        .min(1)
        .max(SLUG_MAX_LENGTH)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .optional(),
      attribute: z
        .union([z.string(), z.array(z.string())])
        .transform((value) => (Array.isArray(value) ? value : [value]))
        .refine((values) => values.every((value) => parseAttributeFilter(value) !== null), {
          message: 'An attribute filter must be "name:value" with both parts present',
        })
        .optional(),
      minPrice: z.coerce.number().int().min(0).max(MAX_PRICE_MINOR).optional(),
      maxPrice: z.coerce.number().int().min(0).max(MAX_PRICE_MINOR).optional(),
      currency: z
        .string()
        .trim()
        .regex(/^[A-Za-z]{3}$/)
        .transform((value) => value.toUpperCase())
        .optional(),
    })
    .refine(
      (value) =>
        (value.minPrice === undefined && value.maxPrice === undefined) ||
        value.currency !== undefined,
      'A price range requires an explicit currency',
    )
    .refine(
      (value) =>
        value.minPrice === undefined ||
        value.maxPrice === undefined ||
        value.minPrice <= value.maxPrice,
      'The minimum price must not exceed the maximum price',
    );

  @ApiProperty({ type: Number, required: false, minimum: 1, maximum: MAX_PAGE_SIZE })
  public limit?: number;

  @ApiProperty({ type: String, required: false })
  public cursor?: string;

  @ApiProperty({
    type: String,
    required: false,
    maxLength: MAX_SEARCH_TERM_LENGTH,
    description: 'Free-text term matched case-insensitively against the product text.',
  })
  public q?: string;

  @ApiProperty({
    type: String,
    required: false,
    maxLength: SLUG_MAX_LENGTH,
    description: 'Category slug; the named category and its direct children are matched.',
  })
  public category?: string;

  @ApiProperty({
    type: String,
    required: false,
    maxLength: SLUG_MAX_LENGTH,
    description: 'Brand slug; exactly that brand is matched.',
  })
  public brand?: string;

  @ApiProperty({
    type: String,
    required: false,
    isArray: true,
    description: 'Attribute filter as "name:value"; repeatable, and combined with AND.',
  })
  public attribute?: string[];

  @ApiProperty({
    type: Number,
    required: false,
    minimum: 0,
    maximum: MAX_PRICE_MINOR,
    description: 'Lowest effective price, in exact integer minor units.',
  })
  public minPrice?: number;

  @ApiProperty({
    type: Number,
    required: false,
    minimum: 0,
    maximum: MAX_PRICE_MINOR,
    description: 'Highest effective price, in exact integer minor units.',
  })
  public maxPrice?: number;

  @ApiProperty({
    type: String,
    required: false,
    minLength: CURRENCY_CODE_LENGTH,
    maxLength: CURRENCY_CODE_LENGTH,
    pattern: '^[A-Za-z]{3}$',
    description: 'Required with a price range; only products in that base currency are matched.',
  })
  public currency?: string;
}

/**
 * The direct product discount an administrator sets.
 *
 * The value is a whole number of basis points: one hundred is one percent. Zero removes the
 * discount. No window, no stacking, and no other discount form exists (HC-DEC-018).
 */
export class SetProductDiscountRequest {
  public static readonly [ZOD_VALIDATION_SCHEMA] = z.strictObject({
    basisPoints: z.number().int().min(0).max(MAX_DISCOUNT_BASIS_POINTS),
  });

  @ApiProperty({
    type: Number,
    minimum: 0,
    maximum: MAX_DISCOUNT_BASIS_POINTS,
    description: 'The direct discount in basis points; one hundred is one percent.',
  })
  public basisPoints!: number;
}

export const LIST_PRODUCTS_DEFAULT_LIMIT = DEFAULT_PAGE_SIZE;
