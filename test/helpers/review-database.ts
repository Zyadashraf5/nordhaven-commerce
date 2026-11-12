import type { DatabaseService } from '../../apps/api/src/platform/database/database.service';

/**
 * Removes every Reviews and Notifications row between tests.
 *
 * The suites only ever reach a dedicated, isolated test database (enforced by
 * `assertSafeTestDatabase`), so this cannot touch development or production data. Deletion order
 * follows the foreign keys: a review event belongs to a review, and a notification delivery belongs
 * to a notification.
 */
export async function resetReviewDatabase(database: DatabaseService): Promise<void> {
  const prisma = database.prisma;
  await prisma.reviewEvent.deleteMany();
  await prisma.review.deleteMany();
  await prisma.notificationDelivery.deleteMany();
  await prisma.notification.deleteMany();
}
