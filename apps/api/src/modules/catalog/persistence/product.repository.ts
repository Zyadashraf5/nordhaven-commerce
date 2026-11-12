import { AppError } from '../../../platform/http/app-error';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { DatabaseService } from '../../../platform/database/database.service';
import { effectivePriceMinor } from '../pricing';

/** The product lifecycle states. A new product starts in `DRAFT` (assumption M04-ASM-001). */
export type ProductStatusValue = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface CategoryRefRecord {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

export interface BrandRefRecord {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

export interface ProductRecord {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly status: ProductStatusValue;
  readonly basePriceMinor: number;
  readonly baseCurrency: string;
  readonly discountBasisPoints: number;
  readonly effectivePriceMinor: number;
  readonly category: CategoryRefRecord;
  readonly brand: BrandRefRecord;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProductDetailRecord extends ProductRecord {
  readonly description: string;
  readonly images: readonly ProductImageRecord[];
  readonly attributes: readonly ProductAttributeRecord[];
  readonly variants: readonly ProductVariantRecord[];
}

export interface ProductImageRecord {
  readonly url: string;
  readonly altText: string | null;
  readonly position: number;
}

export interface ProductAttributeRecord {
  readonly name: string;
  readonly value: string;
  readonly position: number;
}

export interface ProductVariantRecord {
  readonly id: string;
  readonly sku: string;
  readonly color: string | null;
  readonly size: string | null;
  readonly material: string | null;
  readonly position: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ProductCreateAttributes {
  readonly name: string;
  readonly slug: string;
  readonly description: string;
  readonly categoryId: string;
  readonly brandId: string;
  readonly basePriceMinor: number;
  readonly baseCurrency: string;
}

export interface ProductUpdateAttributes {
  readonly name?: string;
  readonly slug?: string;
  readonly description?: string;
  readonly categoryId?: string;
  readonly brandId?: string;
  readonly basePriceMinor?: number;
  readonly baseCurrency?: string;
  readonly status?: ProductStatusValue;
}

/** One attribute a product must carry, matched case-insensitively on both sides. */
export interface AttributeFilter {
  readonly name: string;
  readonly value: string;
}

/** The search and filter criteria of the public product listing. */
export interface ProductSearchFilter {
  /** A free-text term matched case-insensitively against the product text. */
  readonly term?: string;
  /** A category and its direct children, already resolved to identifiers. */
  readonly categoryIds?: readonly string[];
  /** Exactly one brand, already resolved to an identifier. */
  readonly brandId?: string;
  /** Attribute pairs that must all be present on the product. */
  readonly attributes?: readonly AttributeFilter[];
  /** The lowest effective price, in exact integer minor units. */
  readonly minPriceMinor?: number;
  /** The highest effective price, in exact integer minor units. */
  readonly maxPriceMinor?: number;
  /** The base currency a price range is expressed in. */
  readonly currency?: string;
}

export interface ImageAttributes {
  readonly url: string;
  readonly altText: string | null;
  readonly position: number;
}

export interface AttributeAttributes {
  readonly name: string;
  readonly value: string;
  readonly position: number;
}

export interface VariantCreateAttributes {
  readonly sku: string;
  readonly color: string | null;
  readonly size: string | null;
  readonly material: string | null;
  readonly position: number;
}

export interface VariantUpdateAttributes {
  readonly sku?: string;
  readonly color?: string | null;
  readonly size?: string | null;
  readonly material?: string | null;
  readonly position?: number;
}

/** A keyset position for the `(name, id)` ordering used by both product listings. */
export interface ProductListCursor {
  readonly name: string;
  readonly id: string;
}

export interface ProductListPage {
  readonly records: readonly ProductRecord[];
  /** True when more rows exist beyond the requested page. */
  readonly hasMore: boolean;
}

const PRODUCT_SUMMARY_SELECT = {
  id: true,
  name: true,
  slug: true,
  status: true,
  basePriceMinor: true,
  baseCurrency: true,
  discountBasisPoints: true,
  effectivePriceMinor: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true, slug: true } },
  brand: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.ProductSelect;

const PRODUCT_DETAIL_SELECT = {
  ...PRODUCT_SUMMARY_SELECT,
  description: true,
  images: {
    orderBy: { position: 'asc' },
    select: { url: true, altText: true, position: true },
  },
  attributes: {
    orderBy: { position: 'asc' },
    select: { name: true, value: true, position: true },
  },
  variants: {
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      sku: true,
      color: true,
      size: true,
      material: true,
      position: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} satisfies Prisma.ProductSelect;

/**
 * Persistence for products and their parts.
 *
 * All listing goes through the `(status, name, id)` index so the anonymous listing and the
 * administrative listing share one stable keyset order. Collection replacement and the product's own
 * parts are always written inside a transaction, so a partially replaced set can never be observed.
 */
@Injectable()
export class ProductRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async findDetailById(id: string): Promise<ProductDetailRecord | null> {
    return this.database.prisma.product.findUnique({
      where: { id },
      select: PRODUCT_DETAIL_SELECT,
    });
  }

  public async findPublishedDetailBySlug(slug: string): Promise<ProductDetailRecord | null> {
    return this.database.prisma.product.findFirst({
      where: { slug, status: 'PUBLISHED' },
      select: PRODUCT_DETAIL_SELECT,
    });
  }

  public async listAdmin(
    limit: number,
    cursor: ProductListCursor | null,
  ): Promise<ProductListPage> {
    return this.page({}, limit, cursor);
  }

  public async listPublished(
    limit: number,
    cursor: ProductListCursor | null,
    filter: ProductSearchFilter = {},
  ): Promise<ProductListPage> {
    return this.page({ status: 'PUBLISHED' }, limit, cursor, filter);
  }

  public async create(attributes: ProductCreateAttributes): Promise<ProductDetailRecord> {
    return this.database.prisma.product.create({
      data: {
        ...attributes,
        // A new product has no discount, so its effective price is its base price.
        discountBasisPoints: 0,
        effectivePriceMinor: attributes.basePriceMinor,
      },
      select: PRODUCT_DETAIL_SELECT,
    });
  }

  public async update(
    id: string,
    attributes: ProductUpdateAttributes,
  ): Promise<ProductDetailRecord> {
    return this.database.prisma.$transaction(async (tx) => {
      // Publication and SKU removal share the parent lock before checking current variants.
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${id}::uuid FOR UPDATE`;
      if (
        attributes.status === 'PUBLISHED' &&
        (await tx.productVariant.count({ where: { productId: id } })) === 0
      ) {
        throw AppError.catalogConflict();
      }
      // The effective price is derived from the base price and the discount, so it is recomputed
      // here, in the same transaction as the base price it depends on. The database constrains the
      // stored value to the same expression and refuses any inconsistent write.
      const current = await tx.product.findUnique({
        where: { id },
        select: { basePriceMinor: true, discountBasisPoints: true },
      });
      const basePriceMinor = attributes.basePriceMinor ?? current?.basePriceMinor ?? 0;
      const discountBasisPoints = current?.discountBasisPoints ?? 0;
      return tx.product.update({
        where: { id },
        data: {
          ...(attributes.name === undefined ? {} : { name: attributes.name }),
          ...(attributes.slug === undefined ? {} : { slug: attributes.slug }),
          ...(attributes.description === undefined ? {} : { description: attributes.description }),
          ...(attributes.categoryId === undefined ? {} : { categoryId: attributes.categoryId }),
          ...(attributes.brandId === undefined ? {} : { brandId: attributes.brandId }),
          ...(attributes.basePriceMinor === undefined
            ? {}
            : { basePriceMinor: attributes.basePriceMinor }),
          ...(attributes.baseCurrency === undefined
            ? {}
            : { baseCurrency: attributes.baseCurrency }),
          ...(attributes.status === undefined ? {} : { status: attributes.status }),
          effectivePriceMinor: effectivePriceMinor(basePriceMinor, discountBasisPoints),
        },
        select: PRODUCT_DETAIL_SELECT,
      });
    });
  }

  /**
   * Sets, replaces, or removes a product's direct discount.
   *
   * The effective price is recomputed from the current base price and the new discount inside the
   * same transaction, so a reader never observes a price that disagrees with its own inputs.
   */
  public async setDiscountBasisPoints(
    id: string,
    discountBasisPoints: number,
  ): Promise<ProductDetailRecord> {
    return this.database.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.product.findUnique({
        where: { id },
        select: { basePriceMinor: true },
      });
      if (current === null) throw AppError.productNotFound();
      return tx.product.update({
        where: { id },
        data: {
          discountBasisPoints,
          effectivePriceMinor: effectivePriceMinor(current.basePriceMinor, discountBasisPoints),
        },
        select: PRODUCT_DETAIL_SELECT,
      });
    });
  }

  /** Deletes a product; its images, attributes, and variants cascade. */
  public async deleteById(id: string): Promise<void> {
    await this.database.prisma.product.delete({ where: { id } });
  }

  public async countVariants(productId: string): Promise<number> {
    return this.database.prisma.productVariant.count({ where: { productId } });
  }

  /** Replaces the whole image set atomically. */
  public async replaceImages(
    productId: string,
    images: readonly ImageAttributes[],
  ): Promise<ProductDetailRecord> {
    await this.database.prisma.$transaction([
      this.database.prisma.productImage.deleteMany({ where: { productId } }),
      this.database.prisma.productImage.createMany({
        data: images.map((image) => ({ ...image, productId })),
      }),
    ]);
    return this.requireDetail(productId);
  }

  /** Replaces the whole attribute set atomically. */
  public async replaceAttributes(
    productId: string,
    attributes: readonly AttributeAttributes[],
  ): Promise<ProductDetailRecord> {
    await this.database.prisma.$transaction([
      this.database.prisma.productAttribute.deleteMany({ where: { productId } }),
      this.database.prisma.productAttribute.createMany({
        data: attributes.map((attribute) => ({ ...attribute, productId })),
      }),
    ]);
    return this.requireDetail(productId);
  }

  public async findVariantById(variantId: string): Promise<ProductVariantRecord | null> {
    return this.database.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: {
        id: true,
        sku: true,
        color: true,
        size: true,
        material: true,
        position: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  public async createVariant(
    productId: string,
    attributes: VariantCreateAttributes,
  ): Promise<ProductVariantRecord> {
    return this.database.prisma.productVariant.create({
      data: { ...attributes, productId },
      select: {
        id: true,
        sku: true,
        color: true,
        size: true,
        material: true,
        position: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  public async updateVariant(
    variantId: string,
    attributes: VariantUpdateAttributes,
  ): Promise<ProductVariantRecord> {
    return this.database.prisma.productVariant.update({
      where: { id: variantId },
      data: {
        ...(attributes.sku === undefined ? {} : { sku: attributes.sku }),
        ...(attributes.color === undefined ? {} : { color: attributes.color }),
        ...(attributes.size === undefined ? {} : { size: attributes.size }),
        ...(attributes.material === undefined ? {} : { material: attributes.material }),
        ...(attributes.position === undefined ? {} : { position: attributes.position }),
      },
      select: {
        id: true,
        sku: true,
        color: true,
        size: true,
        material: true,
        position: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /** Deletes a variant. A refusal from a later dependent (for example reserved stock) surfaces as a
   * foreign-key violation that the application layer maps to a stable conflict. */
  public async deleteVariant(variantId: string): Promise<void> {
    await this.database.prisma.$transaction(async (tx) => {
      const variant = await tx.productVariant.findUniqueOrThrow({
        where: { id: variantId },
        select: { productId: true },
      });
      await tx.$queryRaw`SELECT id FROM products WHERE id = ${variant.productId}::uuid FOR UPDATE`;
      const product = await tx.product.findUnique({
        where: { id: variant.productId },
        select: { status: true },
      });
      if (
        product?.status === 'PUBLISHED' &&
        (await tx.productVariant.count({ where: { productId: variant.productId } })) <= 1
      ) {
        throw AppError.catalogConflict();
      }
      await tx.productVariant.delete({ where: { id: variantId } });
    });
  }

  private async requireDetail(productId: string): Promise<ProductDetailRecord> {
    const product = await this.findDetailById(productId);
    if (product === null) throw new Error('Product disappeared during a collection replacement');
    return product;
  }

  private async page(
    where: Record<string, unknown>,
    limit: number,
    cursor: ProductListCursor | null,
    filter: ProductSearchFilter = {},
  ): Promise<ProductListPage> {
    const conditions: Prisma.ProductWhereInput[] = [where];
    conditions.push(...this.filterConditions(filter));
    if (cursor !== null) {
      // The cursor continues the same deterministic ordering, so a filtered page neither repeats
      // nor skips a product.
      conditions.push({
        OR: [{ name: { gt: cursor.name } }, { name: cursor.name, id: { gt: cursor.id } }],
      });
    }
    const rows = await this.database.prisma.product.findMany({
      where: { AND: conditions },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      select: PRODUCT_SUMMARY_SELECT,
    });
    const hasMore = rows.length > limit;
    return { records: hasMore ? rows.slice(0, limit) : rows, hasMore };
  }

  /**
   * The search and filter criteria, each one combined with AND.
   *
   * The free-text term is matched case-insensitively against the product name, the product
   * description, and the name and value of any attribute, so a shopper can find a product by any of
   * the words the catalog actually stores.
   */
  private filterConditions(filter: ProductSearchFilter): Prisma.ProductWhereInput[] {
    const conditions: Prisma.ProductWhereInput[] = [];

    if (filter.term !== undefined) {
      const term = filter.term;
      conditions.push({
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
          {
            attributes: {
              some: {
                OR: [
                  { name: { contains: term, mode: 'insensitive' } },
                  { value: { contains: term, mode: 'insensitive' } },
                ],
              },
            },
          },
        ],
      });
    }

    if (filter.categoryIds !== undefined) {
      // An empty list means the named category does not exist, which matches no product.
      conditions.push({ categoryId: { in: [...filter.categoryIds] } });
    }

    if (filter.brandId !== undefined) {
      conditions.push({ brandId: filter.brandId });
    }

    for (const attribute of filter.attributes ?? []) {
      conditions.push({
        attributes: {
          some: {
            name: { equals: attribute.name, mode: 'insensitive' },
            value: { equals: attribute.value, mode: 'insensitive' },
          },
        },
      });
    }

    if (filter.minPriceMinor !== undefined || filter.maxPriceMinor !== undefined) {
      conditions.push({
        effectivePriceMinor: {
          ...(filter.minPriceMinor === undefined ? {} : { gte: filter.minPriceMinor }),
          ...(filter.maxPriceMinor === undefined ? {} : { lte: filter.maxPriceMinor }),
        },
      });
      if (filter.currency !== undefined) {
        conditions.push({ baseCurrency: filter.currency });
      }
    }

    return conditions;
  }
}
