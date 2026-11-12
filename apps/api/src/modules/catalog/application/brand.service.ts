import { Injectable } from '@nestjs/common';
import { AppError } from '../../../platform/http/app-error';
import { type BrandRecord, BrandRepository } from '../persistence/brand.repository';
import {
  isForeignKeyConstraintViolation,
  isRecordNotFoundError,
  isUniqueConstraintViolation,
} from '../persistence/prisma-errors';
import { resolvedSlug } from './category.service';

export interface BrandCreateInput {
  readonly name: string;
  readonly slug?: string;
}

export interface BrandUpdateInput {
  readonly name?: string;
  readonly slug?: string;
}

/**
 * Brand administration.
 *
 * Deleting a brand a product still references is refused by the database and mapped to the same stable
 * conflict a duplicate public identifier produces.
 */
@Injectable()
export class BrandService {
  public constructor(private readonly brands: BrandRepository) {}

  public async create(input: BrandCreateInput): Promise<BrandRecord> {
    const slug = resolvedSlug(input.slug, input.name);
    try {
      return await this.brands.create({ name: input.name, slug });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) throw AppError.catalogConflict();
      throw error;
    }
  }

  public async list(): Promise<BrandRecord[]> {
    return this.brands.listAll();
  }

  public async update(brandId: string, input: BrandUpdateInput): Promise<BrandRecord> {
    const existing = await this.brands.findById(brandId);
    if (existing === null) throw AppError.brandNotFound();

    try {
      return await this.brands.update(brandId, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.slug === undefined ? {} : { slug: input.slug }),
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) throw AppError.catalogConflict();
      if (isRecordNotFoundError(error)) throw AppError.brandNotFound();
      throw error;
    }
  }

  public async remove(brandId: string): Promise<void> {
    const existing = await this.brands.findById(brandId);
    if (existing === null) throw AppError.brandNotFound();

    try {
      await this.brands.delete(brandId);
    } catch (error) {
      if (isForeignKeyConstraintViolation(error)) throw AppError.catalogConflict();
      if (isRecordNotFoundError(error)) throw AppError.brandNotFound();
      throw error;
    }
  }
}
