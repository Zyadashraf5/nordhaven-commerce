import type { Prisma } from '../../../generated/prisma/client';
import { AppError } from '../../../platform/http/app-error';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../../platform/database/database.service';

/** One catalog category, owned exclusively by the Catalog module. */
export interface CategoryRecord {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly parentId: string | null;
  readonly position: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CategoryCreateAttributes {
  readonly name: string;
  readonly slug: string;
  readonly parentId: string | null;
  readonly position: number;
}

export interface CategoryUpdateAttributes {
  readonly name?: string;
  readonly slug?: string;
  readonly parentId?: string | null;
  readonly position?: number;
}

const CATEGORY_SELECT = {
  id: true,
  name: true,
  slug: true,
  parentId: true,
  position: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Persistence for the category tree.
 *
 * Hierarchy writers share a transaction-scoped lock and revalidate HC-CAT-002 under it.
 * Service prechecks give early errors; only the locked check protects concurrent changes.
 */
@Injectable()
export class CategoryRepository {
  public constructor(private readonly database: DatabaseService) {}

  /** Every category in a deterministic display order. */
  public async listAll(): Promise<CategoryRecord[]> {
    return this.database.prisma.category.findMany({
      orderBy: [{ position: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      select: CATEGORY_SELECT,
    });
  }

  public async findById(id: string): Promise<CategoryRecord | null> {
    return this.database.prisma.category.findUnique({ where: { id }, select: CATEGORY_SELECT });
  }

  public async findBySlug(slug: string): Promise<CategoryRecord | null> {
    return this.database.prisma.category.findUnique({ where: { slug }, select: CATEGORY_SELECT });
  }

  /**
   * The identifiers of a category and its direct children.
   *
   * The approved hierarchy has at most two levels (HC-CAT-002), so this set is complete: a shopper
   * who filters by a parent category also sees the products of its children.
   */
  public async findIdsWithChildren(slug: string): Promise<string[]> {
    const rows = await this.database.prisma.category.findMany({
      where: { OR: [{ slug }, { parent: { is: { slug } } }] },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  public async hasChildren(id: string): Promise<boolean> {
    const child = await this.database.prisma.category.findFirst({
      where: { parentId: id },
      select: { id: true },
    });
    return child !== null;
  }

  public async create(attributes: CategoryCreateAttributes): Promise<CategoryRecord> {
    return this.database.prisma.$transaction(async (tx) => {
      await this.lockHierarchy(tx);
      await this.assertParent(tx, null, attributes.parentId);
      return tx.category.create({ data: attributes, select: CATEGORY_SELECT });
    });
  }

  public async update(id: string, attributes: CategoryUpdateAttributes): Promise<CategoryRecord> {
    return this.database.prisma.$transaction(async (tx) => {
      await this.lockHierarchy(tx);
      if (attributes.parentId !== undefined) await this.assertParent(tx, id, attributes.parentId);
      return tx.category.update({
        where: { id },
        data: {
          ...(attributes.name === undefined ? {} : { name: attributes.name }),
          ...(attributes.slug === undefined ? {} : { slug: attributes.slug }),
          ...(attributes.parentId === undefined ? {} : { parentId: attributes.parentId }),
          ...(attributes.position === undefined ? {} : { position: attributes.position }),
        },
        select: CATEGORY_SELECT,
      });
    });
  }

  /**
   * Deletes a category. A refusal from the database (a child category or a product still references it)
   * surfaces as a foreign-key violation that the application layer maps to a stable conflict.
   */
  public async delete(id: string): Promise<void> {
    await this.database.prisma.$transaction(async (tx) => {
      await this.lockHierarchy(tx);
      await tx.category.delete({ where: { id } });
    });
  }

  private async lockHierarchy(tx: Prisma.TransactionClient): Promise<void> {
    // Stable namespace for Catalog hierarchy writes; also covers concurrently inserted children.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(71404, 1)`;
  }

  private async assertParent(
    tx: Prisma.TransactionClient,
    id: string | null,
    parentId: string | null,
  ): Promise<void> {
    if (parentId === null) return;
    if (parentId === id) throw AppError.catalogConflict();
    const parent = await tx.category.findUnique({
      where: { id: parentId },
      select: { parentId: true },
    });
    if (parent === null) throw AppError.categoryNotFound();
    if (parent.parentId !== null) throw AppError.catalogConflict();
    if (id !== null && (await tx.category.count({ where: { parentId: id } })) > 0) {
      throw AppError.catalogConflict();
    }
  }
}
