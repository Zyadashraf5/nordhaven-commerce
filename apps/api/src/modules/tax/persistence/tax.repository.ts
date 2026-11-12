import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { DatabaseService } from '../../../platform/database/database.service';
import { isUniqueConstraintViolation } from '../persistence/prisma-errors';

/** One tax rule as the Tax capability persists it. */
export interface TaxRuleRecord {
  readonly id: string;
  readonly environment: 'TEST' | 'PRODUCTION';
  readonly jurisdiction: string;
  readonly classification: string;
  readonly rateBasisPoints: number;
  readonly taxInclusive: boolean;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly priority: number;
  readonly createdByUserId: string | null;
  readonly updatedByUserId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** The attributes an administrator may set on a tax rule. */
export interface TaxRuleAttributes {
  readonly environment: 'TEST' | 'PRODUCTION';
  readonly jurisdiction: string;
  readonly classification: string;
  readonly rateBasisPoints: number;
  readonly taxInclusive: boolean;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  readonly priority: number;
  readonly updatedByUserId: string | null;
}

const TAX_RULE_SELECT = {
  id: true,
  environment: true,
  jurisdiction: true,
  classification: true,
  rateBasisPoints: true,
  taxInclusive: true,
  effectiveFrom: true,
  effectiveTo: true,
  priority: true,
  createdByUserId: true,
  updatedByUserId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TaxRuleSelect;

/**
 * Persistence for the tax configuration.
 *
 * The Tax module owns its own tables. It references the catalog's products through the
 * `tax_classifications` foreign key, exactly as the Cart and Wishlist capabilities reference the
 * catalog, and it imports no catalog code.
 */
@Injectable()
export class TaxRepository {
  public constructor(private readonly database: DatabaseService) {}

  /** Every rule, in a deterministic order. */
  public async listRules(): Promise<TaxRuleRecord[]> {
    return this.database.prisma.taxRule.findMany({
      orderBy: [
        { jurisdiction: 'asc' },
        { classification: 'asc' },
        { effectiveFrom: 'desc' },
        { id: 'asc' },
      ],
      select: TAX_RULE_SELECT,
    });
  }

  /**
   * The rules that could apply to a jurisdiction in an environment.
   *
   * The effective window is filtered in the engine, not here, so the selection stays in one place and
   * the deterministic tie-break can be applied over the complete candidate set.
   */
  public async listRulesFor(
    environment: 'TEST' | 'PRODUCTION',
    jurisdiction: string,
  ): Promise<TaxRuleRecord[]> {
    return this.database.prisma.taxRule.findMany({
      where: { environment, jurisdiction },
      orderBy: [{ priority: 'desc' }, { effectiveFrom: 'desc' }, { id: 'asc' }],
      select: TAX_RULE_SELECT,
    });
  }

  public async findRuleById(id: string): Promise<TaxRuleRecord | null> {
    return this.database.prisma.taxRule.findUnique({ where: { id }, select: TAX_RULE_SELECT });
  }

  /** Creates a rule, refusing a duplicate of an existing one. */
  public async createRule(attributes: TaxRuleAttributes): Promise<TaxRuleRecord> {
    try {
      return await this.database.transaction(async () => {
        const rule = await this.database.prisma.taxRule.create({
          data: {
            ...attributes,
            createdByUserId: attributes.updatedByUserId,
            effectiveTo: attributes.effectiveTo,
          },
          select: TAX_RULE_SELECT,
        });
        await this.record(`rule:${rule.id}`, 'CREATE', attributes.updatedByUserId, null, rule);
        return rule;
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) throw new TaxRuleConflictError();
      throw error;
    }
  }

  /** Removes a rule. */
  public async deleteRule(id: string, actorUserId: string | null = null): Promise<void> {
    await this.database.transaction(async () => {
      const previous = await this.database.prisma.taxRule.delete({ where: { id } });
      await this.record(`rule:${id}`, 'DELETE', actorUserId, previous, null);
    });
  }

  /** The classification of a product, or null when the product has no explicit one. */
  public async findClassification(productId: string): Promise<string | null> {
    const row = await this.database.prisma.taxClassification.findUnique({
      where: { productId },
      select: { classification: true },
    });
    return row?.classification ?? null;
  }

  /** The classifications of a set of products, in one query. */
  public async findClassifications(productIds: readonly string[]): Promise<Map<string, string>> {
    if (productIds.length === 0) return new Map();
    const rows = await this.database.prisma.taxClassification.findMany({
      where: { productId: { in: [...productIds] } },
      select: { productId: true, classification: true },
    });
    return new Map(rows.map((row) => [row.productId, row.classification]));
  }

  /** Sets the classification of a product, replacing any previous one. */
  public async setClassification(
    productId: string,
    classification: string,
    actorUserId: string | null = null,
  ): Promise<string> {
    return this.database.transaction(async () => {
      await this.database.lock(`tax-classification:${productId}`);
      const previous = await this.database.prisma.taxClassification.findUnique({
        where: { productId },
      });
      const current = await this.database.prisma.taxClassification.upsert({
        where: { productId },
        create: { productId, classification },
        update: { classification },
      });
      await this.record(`classification:${productId}`, 'SET', actorUserId, previous, current);
      return classification;
    });
  }

  public async clearClassification(
    productId: string,
    actorUserId: string | null = null,
  ): Promise<void> {
    await this.database.transaction(async () => {
      await this.database.lock(`tax-classification:${productId}`);
      const previous = await this.database.prisma.taxClassification.findUnique({
        where: { productId },
      });
      await this.database.prisma.taxClassification.deleteMany({ where: { productId } });
      if (previous !== null)
        await this.record(`classification:${productId}`, 'CLEAR', actorUserId, previous, null);
    });
  }

  private async record(
    target: string,
    action: string,
    actorUserId: string | null,
    before: unknown,
    after: unknown,
  ): Promise<void> {
    await this.database.prisma.taxConfigurationEvent.create({
      data: {
        target,
        action,
        actorUserId,
        before:
          before === null
            ? Prisma.JsonNull
            : (JSON.parse(JSON.stringify(before)) as Prisma.InputJsonValue),
        after:
          after === null
            ? Prisma.JsonNull
            : (JSON.parse(JSON.stringify(after)) as Prisma.InputJsonValue),
      },
    });
  }
}

/** Raised when a tax rule would duplicate an existing one. */
export class TaxRuleConflictError extends Error {
  public constructor() {
    super('A tax rule already exists for that jurisdiction, classification, and start date');
    this.name = 'TaxRuleConflictError';
  }
}
