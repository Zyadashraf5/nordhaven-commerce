import type { DatabaseService } from '../../apps/api/src/platform/database/database.service';

/**
 * Removes every Order and Pre-order row between tests.
 *
 * The suites only ever reach a dedicated, isolated test database (enforced by
 * `assertSafeTestDatabase`), so this cannot touch development or production data. Deletion order
 * follows the foreign keys: an order line and an order event belong to an order, and a pre-order
 * references an order.
 */
export async function resetOrderDatabase(database: DatabaseService): Promise<void> {
  const prisma = database.prisma;
  await prisma.preOrderEvent.deleteMany();
  await prisma.orderEvent.deleteMany();
  await prisma.orderLine.deleteMany();
  await prisma.preOrder.deleteMany();
  await prisma.order.deleteMany();
}
