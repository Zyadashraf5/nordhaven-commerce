/**
 * Detects the Prisma unique-constraint violation without importing generated runtime classes, so
 * persistence code stays decoupled from generator internals.
 */
export function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
