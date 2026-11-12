import type { DatabaseService } from '../../apps/api/src/platform/database/database.service';

/**
 * Removes every Tax and Checkout row between tests.
 *
 * The suites only ever reach a dedicated, isolated test database (enforced by
 * `assertSafeTestDatabase`), so this cannot touch development or production data. A tax
 * classification references a catalog product and cascades, and a checkout destination references
 * nothing, so the order is the classification first.
 */
export async function resetCheckoutDatabase(database: DatabaseService): Promise<void> {
  const prisma = database.prisma;
  await prisma.taxConfigurationEvent.deleteMany();
  await prisma.checkoutConfigurationEvent.deleteMany();
  await prisma.taxClassification.deleteMany();
  await prisma.taxRule.deleteMany();
  await prisma.checkoutDestination.deleteMany();
}
