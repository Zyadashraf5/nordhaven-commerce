import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service';

/** One catalog brand, owned exclusively by the Catalog module. */
export interface BrandRecord {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface BrandCreateAttributes {
  readonly name: string;
  readonly slug: string;
}

export interface BrandUpdateAttributes {
  readonly name?: string;
  readonly slug?: string;
}

const BRAND_SELECT = {
  id: true,
  name: true,
  slug: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Persistence for brands. */
@Injectable()
export class BrandRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async listAll(): Promise<BrandRecord[]> {
    return this.database.prisma.brand.findMany({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: BRAND_SELECT,
    });
  }

  public async findById(id: string): Promise<BrandRecord | null> {
    return this.database.prisma.brand.findUnique({ where: { id }, select: BRAND_SELECT });
  }

  public async findBySlug(slug: string): Promise<BrandRecord | null> {
    return this.database.prisma.brand.findUnique({ where: { slug }, select: BRAND_SELECT });
  }

  public async create(attributes: BrandCreateAttributes): Promise<BrandRecord> {
    return this.database.prisma.brand.create({ data: attributes, select: BRAND_SELECT });
  }

  public async update(id: string, attributes: BrandUpdateAttributes): Promise<BrandRecord> {
    return this.database.prisma.brand.update({
      where: { id },
      data: {
        ...(attributes.name === undefined ? {} : { name: attributes.name }),
        ...(attributes.slug === undefined ? {} : { slug: attributes.slug }),
      },
      select: BRAND_SELECT,
    });
  }

  /**
   * Deletes a brand. A brand still referenced by a product is refused by the database and surfaces as
   * a foreign-key violation that the application layer maps to a stable conflict.
   */
  public async delete(id: string): Promise<void> {
    await this.database.prisma.brand.delete({ where: { id } });
  }
}
