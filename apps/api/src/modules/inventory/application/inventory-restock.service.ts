import { BadRequestException, Injectable } from '@nestjs/common';
import { type InventoryRestock, type RestockOutcome, type RestockRequest } from '../contracts';
import { InventoryRepository } from '../persistence/inventory.repository';

/**
 * The restock contract, for another capability that must put goods back into stock.
 *
 * The restock is the Inventory capability's own operation, because only this capability owns the
 * on-hand quantity and the movement ledger. The adapter validates the request and hands it to the
 * repository, which performs the increment and the movement in one transaction and makes the whole
 * operation idempotent on the caller's business key.
 */
@Injectable()
export class InventoryRestockService implements InventoryRestock {
  public constructor(private readonly inventory: InventoryRepository) {}

  public async restock(request: RestockRequest): Promise<RestockOutcome> {
    if (request.lines.length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        details: [{ path: 'lines', message: 'Invalid value' }],
      });
    }
    const references = new Set<string>();
    for (const line of request.lines) {
      if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || line.quantity > 2147483647) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          details: [{ path: 'quantity', message: 'Invalid value' }],
        });
      }
      if (line.reference.trim().length === 0) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          details: [{ path: 'reference', message: 'Invalid value' }],
        });
      }
      if (references.has(line.reference)) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          details: [{ path: 'reference', message: 'Invalid value' }],
        });
      }
      references.add(line.reference);
    }

    const outcome = await this.inventory.restock(
      request.lines.map((line) => ({
        variantId: line.target.kind === 'VARIANT' ? line.target.variantId : null,
        bundleId: line.target.kind === 'BUNDLE' ? line.target.bundleId : null,
        quantity: line.quantity,
        reference: line.reference,
      })),
      request.reason,
    );

    return {
      applied: outcome.applied,
      lines: outcome.lines.map((line) => ({
        target:
          line.bundleId !== null
            ? { kind: 'BUNDLE' as const, bundleId: line.bundleId }
            : { kind: 'VARIANT' as const, variantId: line.variantId ?? '' },
        quantity: line.quantity,
        reference: line.reference,
        applied: line.applied,
        onHand: line.onHand,
      })),
    };
  }
}
