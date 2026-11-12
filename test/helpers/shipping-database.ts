import type { DatabaseService } from '../../apps/api/src/platform/database/database.service';

/**
 * Removes every Shipping and Fulfillment row between tests.
 *
 * The suites only ever reach a dedicated, isolated test database (enforced by
 * `assertSafeTestDatabase`), so this cannot touch development or production data. Deletion order
 * follows the foreign keys: a shipment line and a shipment event belong to a shipment, and a return
 * line and a return event belong to a return.
 */
export async function resetShippingDatabase(database: DatabaseService): Promise<void> {
  const prisma = database.prisma;
  await prisma.shippingConfigurationEvent.deleteMany();
  await prisma.shipmentEvent.deleteMany();
  await prisma.shipmentLine.deleteMany();
  await prisma.shipment.deleteMany();
  await prisma.returnEvent.deleteMany();
  await prisma.returnLine.deleteMany();
  await prisma.returnRequest.deleteMany();
  await prisma.shippingMethod.deleteMany();
  await prisma.shippingDestination.deleteMany();
}
