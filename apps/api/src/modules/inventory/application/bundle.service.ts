import { ReservationRepository } from '../persistence/reservation.repository';
import { BadRequestException, Injectable } from '@nestjs/common';
import { AppError } from '../../../platform/http/app-error';
import { bundleAvailability } from '../api/inventory.support';
import {
  type BundleComponentAttributes,
  type BundleRecord,
  BundleRepository,
} from '../persistence/bundle.repository';
import { InventoryRepository } from '../persistence/inventory.repository';
import {
  isForeignKeyConstraintViolation,
  isUniqueConstraintViolation,
  isRecordNotFoundError,
} from '../persistence/prisma-errors';
import { DatabaseService } from '../../../platform/database/database.service';

export interface BundleComponentInput {
  readonly variantId: string;
  readonly quantity?: number | undefined;
  readonly minQuantity?: number | undefined;
  readonly maxQuantity?: number | undefined;
  readonly position?: number | undefined;
}

export interface BundleCreateInput {
  readonly productId: string;
  readonly kind: 'FIXED' | 'DYNAMIC';
  readonly name: string;
  readonly description?: string | null | undefined;
  readonly components: readonly BundleComponentInput[];
}

export interface BundleUpdateInput {
  readonly name?: string | undefined;
  readonly description?: string | null | undefined;
  readonly components?: readonly BundleComponentInput[] | undefined;
}

export interface BundleView {
  readonly record: BundleRecord;
  readonly available: number;
}

/**
 * Bundle administration and availability.
 *
 * FIXED bundles hold assembled finished goods; DYNAMIC bundles derive from selected components.
 */
@Injectable()
export class BundleService {
  public constructor(
    private readonly bundles: BundleRepository,
    private readonly inventory: InventoryRepository,
    private readonly database: DatabaseService,
    private readonly reservations: ReservationRepository,
  ) {}

  public async list(): Promise<readonly BundleView[]> {
    const records = await this.bundles.list();
    return Promise.all(records.map((record) => this.withAvailability(record)));
  }

  public async findById(id: string): Promise<BundleView> {
    const record = await this.bundles.findById(id);
    if (record === null) throw AppError.bundleNotFound();
    return this.withAvailability(record);
  }

  public async create(input: BundleCreateInput): Promise<BundleView> {
    const attributes = this.normalise(input.kind, input.components);
    await this.assertComponentsUsable(input.productId, input.kind, attributes);
    try {
      const record = await this.bundles.create({
        productId: input.productId,
        kind: input.kind,
        name: input.name,
        description: input.description ?? null,
        components: attributes,
      });
      return this.withAvailability(record);
    } catch (error) {
      if (isUniqueConstraintViolation(error)) throw AppError.inventoryConflict();
      if (isForeignKeyConstraintViolation(error)) throw AppError.variantNotFound();
      throw error;
    }
  }

  public async update(id: string, input: BundleUpdateInput): Promise<BundleView> {
    const existing = await this.bundles.findById(id);
    if (existing === null) throw AppError.bundleNotFound();
    const attributes =
      input.components === undefined ? undefined : this.normalise(existing.kind, input.components);
    if (attributes !== undefined) {
      await this.assertComponentsUsable(existing.productId, existing.kind, attributes);
    }
    try {
      const record = await this.bundles.update(id, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined ? {} : { description: input.description ?? null }),
        ...(attributes === undefined ? {} : { components: attributes }),
      });
      return this.withAvailability(record);
    } catch (error) {
      if (isForeignKeyConstraintViolation(error)) throw AppError.variantNotFound();
      throw error;
    }
  }

  /**
   * Assemble fixed bundles: consume component stock and create finished-goods stock atomically.
   * For FIXED bundles with independent stock, assembly produces finished bundle inventory.
   */
  public async assemble(
    bundleId: string,
    quantity: number,
    note?: string | null,
  ): Promise<BundleView> {
    return this.transform(bundleId, quantity, false, note);
  }

  public async disassemble(
    bundleId: string,
    quantity: number,
    note?: string | null,
  ): Promise<BundleView> {
    return this.transform(bundleId, quantity, true, note);
  }

  private async transform(
    bundleId: string,
    quantity: number,
    reverse: boolean,
    note?: string | null,
  ): Promise<BundleView> {
    if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 10_000)
      throw validationError('quantity', 'Quantity must be a positive integer up to 10000');
    await this.reservations.expireLapsed(new Date());
    return this.database.prisma.$transaction(async (transaction) => {
      // Serialize composition changes and assembly for this bundle, then read the locked composition.
      await transaction.$queryRaw`SELECT id FROM bundles WHERE id = ${bundleId}::uuid FOR UPDATE`;
      const record = await this.bundles.findByIdWithin(transaction, bundleId);
      if (record === null) throw AppError.bundleNotFound();
      if (record.kind !== 'FIXED' || record.components.length === 0)
        throw AppError.inventoryConflict();
      const finished =
        (await transaction.inventoryItem.findUnique({ where: { bundleId } })) ??
        (await transaction.inventoryItem.create({ data: { bundleId } }));
      const changes = [{ id: finished.id, delta: reverse ? -quantity : quantity }];
      for (const component of record.components) {
        const units = (component.quantity ?? 0) * quantity;
        if (!Number.isSafeInteger(units) || units <= 0 || units > 2_147_483_647)
          throw AppError.inventoryConflict();
        const stock = await transaction.inventoryItem.findUnique({
          where: { variantId: component.variantId },
        });
        if (stock === null) throw AppError.inventoryConflict();
        changes.push({ id: stock.id, delta: reverse ? units : -units });
      }
      // One global lock order also cooperates with concurrent reservations.
      changes.sort((a, b) => a.id.localeCompare(b.id));
      let available = 0;
      for (const change of changes) {
        const affected = await transaction.$executeRaw`
          UPDATE inventory_items SET on_hand = on_hand + ${change.delta}, updated_at = CURRENT_TIMESTAMP
          WHERE id = ${change.id}::uuid AND on_hand::bigint + ${change.delta} >= reserved
            AND on_hand::bigint + ${change.delta} <= 2147483647
        `;
        if (affected !== 1) throw AppError.inventoryConflict();
        const updated = await transaction.inventoryItem.findUniqueOrThrow({
          where: { id: change.id },
        });
        await transaction.stockMovement.create({
          data: {
            inventoryId: change.id,
            reason: 'ADJUSTMENT',
            note: [
              reverse ? 'DISASSEMBLY' : 'ASSEMBLY',
              bundleId,
              String(quantity),
              note ?? '',
            ].join(' '),
            onHandDelta: change.delta,
            reservedDelta: 0,
            onHandAfter: updated.onHand,
            reservedAfter: updated.reserved,
          },
        });
        if (change.id === finished.id) available = updated.onHand - updated.reserved;
      }
      return { record, available };
    });
  }

  public async delete(id: string): Promise<void> {
    try {
      await this.bundles.delete(id);
    } catch (error) {
      if (isRecordNotFoundError(error)) throw AppError.bundleNotFound();
      if (isForeignKeyConstraintViolation(error)) throw AppError.inventoryConflict();
      throw error;
    }
  }

  /** Normalises a request composition into stored attributes, rejecting an inconsistent shape. */
  private normalise(
    kind: 'FIXED' | 'DYNAMIC',
    components: readonly BundleComponentInput[],
  ): readonly BundleComponentAttributes[] {
    if (components.length === 0)
      throw validationError('components', 'At least one component is required');
    return components.map((component, index) => {
      const hasQuantity = component.quantity !== undefined;
      const hasRange = component.minQuantity !== undefined || component.maxQuantity !== undefined;
      if (hasQuantity && hasRange) {
        throw validationError(
          'components',
          'A component carries either a quantity or a range, not both',
        );
      }
      if (kind === 'FIXED' && !hasQuantity) {
        throw validationError('components', 'A FIXED component requires a quantity');
      }
      if (kind === 'DYNAMIC' && !hasRange) {
        throw validationError(
          'components',
          'A DYNAMIC component requires a minQuantity and maxQuantity',
        );
      }
      if (
        hasRange &&
        component.minQuantity !== undefined &&
        component.maxQuantity !== undefined &&
        component.maxQuantity < component.minQuantity
      ) {
        throw validationError('components', 'maxQuantity must not be less than minQuantity');
      }
      return {
        variantId: component.variantId,
        quantity: kind === 'FIXED' ? (component.quantity ?? null) : null,
        minQuantity: kind === 'DYNAMIC' ? (component.minQuantity ?? null) : null,
        maxQuantity: kind === 'DYNAMIC' ? (component.maxQuantity ?? null) : null,
        position: component.position ?? index,
      };
    });
  }

  /** Every component SKU must exist, appear once, and not belong to the bundle's own product. */
  private async assertComponentsUsable(
    productId: string,
    kind: 'FIXED' | 'DYNAMIC',
    components: readonly BundleComponentAttributes[],
  ): Promise<void> {
    const seen = new Set<string>();
    for (const component of components) {
      if (seen.has(component.variantId)) {
        throw validationError('components', 'A component SKU may appear at most once per bundle');
      }
      seen.add(component.variantId);
      if (kind === 'FIXED' && (component.quantity ?? 0) <= 0) {
        throw validationError('components', 'A FIXED component quantity must be positive');
      }
      const variant = await this.inventory.findVariant(component.variantId);
      if (variant === null) throw AppError.variantNotFound();
      // A bundle whose component belongs to its own product would imply stock the bundle implies.
      if (variant.productId === productId) {
        throw validationError(
          'components',
          'A component must not belong to the bundle product itself',
        );
      }
    }
  }

  private async withAvailability(record: BundleRecord): Promise<BundleView> {
    await this.reservations.expireLapsed(new Date());
    // For FIXED bundles, availability is based on finished goods inventory
    if (record.kind === 'FIXED') {
      const bundleInventory = await this.inventory.findByBundleId(record.id);
      const available =
        bundleInventory === null ? 0 : bundleInventory.onHand - bundleInventory.reserved;
      return { record, available };
    }
    // For DYNAMIC bundles, availability is based on component constraints
    const measured = await Promise.all(
      record.components.map(async (component) => {
        const inventory = await this.inventory.findByVariantId(component.variantId);
        const available = inventory === null ? 0 : inventory.onHand - inventory.reserved;
        return {
          available,
          perBundleQuantity: component.minQuantity ?? 0,
        };
      }),
    );
    return { record, available: bundleAvailability(measured) };
  }
}

function validationError(path: string, message: string): BadRequestException {
  return new BadRequestException({ code: 'VALIDATION_ERROR', details: [{ path, message }] });
}
