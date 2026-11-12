import type { DatabaseService } from '../../apps/api/src/platform/database/database.service';
/** Fixture-only cleanup; callers construct an explicitly isolated, guard-verified application. */
export async function resetNotificationDatabase(database: DatabaseService): Promise<void> {
  await database.prisma.notificationDelivery.deleteMany();
  await database.prisma.notification.deleteMany();
}
