/**
 * Detects the Prisma unique-constraint violation without importing generated runtime classes, so
 * persistence code stays decoupled from generator internals.
 *
 * This module is intentionally separate from the Identity module's equivalent helper: module
 * boundaries forbid reaching into another capability's internals, and a ten-line infrastructure
 * predicate is cheaper than a cross-module contract.
 */
export function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
