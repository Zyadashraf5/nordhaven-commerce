import { AppError } from '../../../platform/http/app-error';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { DatabaseService } from '../../../platform/database/database.service';

/** The bundle composition kinds. */
export type BundleKindValue = 'FIXED' | 'DYNAMIC';

export interface BundleComponentRecord {
  readonly id: string;
  readonly variantId: string;
  readonly sku: string;
  readonly quantity: number | null;
  readonly minQuantity: number | null;
  readonly maxQuantity: number | null;
  readonly position: number;
}

export interface BundleRecord {
  readonly id: string;
  readonly productId: string;
  readonly kind: BundleKindValue;
  readonly name: string;
  readonly description: string | null;
  readonly components: readonly BundleComponentRecord[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface BundleComponentAttributes {
  readonly variantId: string;
  readonly quantity: number | null;
  readonly minQuantity: number | null;
  readonly maxQuantity: number | null;
  readonly position: number;
}

export interface BundleCreateAttributes {
  readonly productId: string;
  readonly kind: BundleKindValue;
  readonly name: string;
  readonly description: string | null;
  readonly components: readonly BundleComponentAttributes[];
}

export interface BundleUpdateAttributes {
  readonly name?: string;
  readonly description?: string | null;
  readonly components?: readonly BundleComponentAttributes[];
}

const BUNDLE_SELECT = {
  id: true,
  productId: true,
  kind: true,
  name: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  components: {
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      variantId: true,
      quantity: true,
      minQuantity: true,
      maxQuantity: true,
      position: true,
      variant: { select: { sku: true } },
    },
  },
} satisfies Prisma.BundleSelect;

type BundleRow = Prisma.BundleGetPayload<{ select: typeof BUNDLE_SELECT }>;

function toRecord(row: BundleRow): BundleRecord {
  return {
    id: row.id,
    productId: row.productId,
    kind: row.kind,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    components: row.components.map((component) => ({
      id: component.id,
      variantId: component.variantId,
      sku: component.variant.sku,
      quantity: component.quantity,
      minQuantity: component.minQuantity,
      maxQuantity: component.maxQuantity,
      position: component.position,
    })),
  };
}

/**
 * Persistence for bundles and their compositions.
 *
 * A bundle always writes its components in the same transaction as its own row, so a bundle can never
 * be observed with a stale or partial composition. FIXED bundles hold assembled finished-goods stock (HC-DEC-017).
 */
@Injectable()
export class BundleRepository {
  public constructor(private readonly database: DatabaseService) {}

  public async findById(id: string): Promise<BundleRecord | null> {
    const row = await this.database.prisma.bundle.findUnique({
      where: { id },
      select: BUNDLE_SELECT,
    });
    return row === null ? null : toRecord(row);
  }

  public async findByIdWithin(
    transaction: Prisma.TransactionClient,
    id: string,
  ): Promise<BundleRecord | null> {
    const row = await transaction.bundle.findUnique({ where: { id }, select: BUNDLE_SELECT });
    return row === null ? null : toRecord(row);
  }

  public async findByProductId(productId: string): Promise<BundleRecord | null> {
    const row = await this.database.prisma.bundle.findUnique({
      where: { productId },
      select: BUNDLE_SELECT,
    });
    return row === null ? null : toRecord(row);
  }

  public async list(): Promise<readonly BundleRecord[]> {
    const rows = await this.database.prisma.bundle.findMany({
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      select: BUNDLE_SELECT,
    });
    return rows.map(toRecord);
  }

  public async create(attributes: BundleCreateAttributes): Promise<BundleRecord> {
    const row = await this.database.prisma.bundle.create({
      data: {
        productId: attributes.productId,
        kind: attributes.kind,
        name: attributes.name,
        description: attributes.description,
        components: {
          create: attributes.components.map((component) => ({
            variantId: component.variantId,
            quantity: component.quantity,
            minQuantity: component.minQuantity,
            maxQuantity: component.maxQuantity,
            position: component.position,
          })),
        },
      },
      select: BUNDLE_SELECT,
    });
    return toRecord(row);
  }

  public async update(id: string, attributes: BundleUpdateAttributes): Promise<BundleRecord> {
    const row = await this.database.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM bundles WHERE id = ${id}::uuid FOR UPDATE`;
      if (attributes.components !== undefined) {
        const stock = await transaction.inventoryItem.findUnique({ where: { bundleId: id } });
        if (stock !== null && (stock.onHand > 0 || stock.reserved > 0))
          throw AppError.inventoryConflict();
        await transaction.bundleComponent.deleteMany({ where: { bundleId: id } });
        await transaction.bundleComponent.createMany({
          data: attributes.components.map((component) => ({
            bundleId: id,
            variantId: component.variantId,
            quantity: component.quantity,
            minQuantity: component.minQuantity,
            maxQuantity: component.maxQuantity,
            position: component.position,
          })),
        });
      }
      return transaction.bundle.update({
        where: { id },
        data: {
          ...(attributes.name === undefined ? {} : { name: attributes.name }),
          ...(attributes.description === undefined ? {} : { description: attributes.description }),
        },
        select: BUNDLE_SELECT,
      });
    });
    return toRecord(row);
  }

  public async delete(id: string): Promise<void> {
    await this.database.prisma.bundle.delete({ where: { id } });
  }
}
