import { Injectable } from '@nestjs/common';
import { AppError } from '../../../platform/http/app-error';
import { type CategoryTreeNode, buildCategoryTree, slugify } from '../api/catalog.support';
import { type CategoryRecord, CategoryRepository } from '../persistence/category.repository';
import {
  isForeignKeyConstraintViolation,
  isRecordNotFoundError,
  isUniqueConstraintViolation,
} from '../persistence/prisma-errors';

export interface CategoryCreateInput {
  readonly name: string;
  readonly slug?: string;
  readonly parentId?: string | null;
  readonly position?: number;
}

export interface CategoryUpdateInput {
  readonly name?: string;
  readonly slug?: string;
  readonly parentId?: string | null;
  readonly position?: number;
}

/**
 * Category administration.
 *
 * The two-level rule (HC-CAT-002) is checked here and revalidated under the repository lock: a parent
 * must itself be a root, and a category that already has children may not be given a parent. A
 * refusal from the database (a child category or a product still references the row) is mapped to the
 * same stable conflict the rule violations use.
 */
@Injectable()
export class CategoryService {
  public constructor(private readonly categories: CategoryRepository) {}

  public async create(input: CategoryCreateInput): Promise<CategoryRecord> {
    const slug = resolvedSlug(input.slug, input.name);
    const parentId = input.parentId ?? null;
    if (parentId !== null) await this.assertRootParent(parentId);

    try {
      return await this.categories.create({
        name: input.name,
        slug,
        parentId,
        position: input.position ?? 0,
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) throw AppError.catalogConflict();
      if (isForeignKeyConstraintViolation(error)) throw AppError.catalogConflict();
      throw error;
    }
  }

  /** The flat list, in display order, for the administrative surface. */
  public async list(): Promise<CategoryRecord[]> {
    return this.categories.listAll();
  }

  /** The two-level tree for the public surface. */
  public async listTree(): Promise<CategoryTreeNode[]> {
    return buildCategoryTree(await this.categories.listAll());
  }

  public async update(categoryId: string, input: CategoryUpdateInput): Promise<CategoryRecord> {
    const existing = await this.categories.findById(categoryId);
    if (existing === null) throw AppError.categoryNotFound();

    const nextParent = input.parentId;
    if (nextParent !== undefined && nextParent !== null) {
      if (nextParent === categoryId) throw AppError.catalogConflict();
      await this.assertRootParent(nextParent);
      if (await this.categories.hasChildren(categoryId)) throw AppError.catalogConflict();
    }

    try {
      return await this.categories.update(categoryId, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.slug === undefined ? {} : { slug: input.slug }),
        ...(nextParent === undefined ? {} : { parentId: nextParent }),
        ...(input.position === undefined ? {} : { position: input.position }),
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) throw AppError.catalogConflict();
      if (isRecordNotFoundError(error)) throw AppError.categoryNotFound();
      throw error;
    }
  }

  public async remove(categoryId: string): Promise<void> {
    const existing = await this.categories.findById(categoryId);
    if (existing === null) throw AppError.categoryNotFound();

    try {
      await this.categories.delete(categoryId);
    } catch (error) {
      if (isForeignKeyConstraintViolation(error)) throw AppError.catalogConflict();
      if (isRecordNotFoundError(error)) throw AppError.categoryNotFound();
      throw error;
    }
  }

  private async assertRootParent(parentId: string): Promise<void> {
    const parent = await this.categories.findById(parentId);
    if (parent === null) throw AppError.categoryNotFound();
    if (parent.parentId !== null) throw AppError.catalogConflict();
  }
}

/**
 * Resolves the stored public identifier. The boundary schema already guarantees a derivable slug, so
 * the fallback is defensive: it can only be reached if a caller bypasses the boundary.
 */
export function resolvedSlug(explicit: string | undefined, name: string): string {
  const slug = explicit ?? slugify(name);
  if (slug === null) throw AppError.catalogConflict();
  return slug;
}
