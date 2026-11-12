import type { DatabaseService } from '../../apps/api/src/platform/database/database.service';

/**
 * Removes every Payment and Refund row between tests.
 *
 * The suites only ever reach a dedicated, isolated test database (enforced by
 * `assertSafeTestDatabase`), so this cannot touch development or production data. Deletion order
 * follows the foreign keys: a refund belongs to a payment attempt, and a provider event refers to
 * a payment attempt.
 */
export async function resetPaymentDatabase(database: DatabaseService): Promise<void> {
  const prisma = database.prisma;
  await prisma.refundEvent.deleteMany();
  await prisma.providerEvent.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.paymentAttempt.deleteMany();
}
