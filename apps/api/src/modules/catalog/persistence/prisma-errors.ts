/**
 * Detects Prisma constraint failures without importing generated runtime classes, so persistence code
 * stays decoupled from generator internals.
 *
 * This module is intentionally separate from the Identity and Customers equivalents: module boundaries
 * forbid reaching into another capability's internals, and a short infrastructure predicate is cheaper
 * than a cross-module contract.
 */

export function isUniqueConstraintViolation(error: unknown): boolean {
  return hasPrismaCode(error, 'P2002');
}

/** A foreign-key refusal, which is how a delete that something still references is reported. */
export function isForeignKeyConstraintViolation(error: unknown): boolean {
  return hasPrismaCode(error, 'P2003');
}

/** A record expected to exist was not found by an update or delete. */
export function isRecordNotFoundError(error: unknown): boolean {
  return hasPrismaCode(error, 'P2025');
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === code
  );
}
