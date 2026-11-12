import type { DatabaseService } from '../../apps/api/src/platform/database/database.service';

/**
 * Removes every Customer Profiles row between tests.
 *
 * The suites only ever reach a dedicated, isolated test database (enforced by
 * `assertSafeTestDatabase`), so this cannot touch development or production data. Addresses are
 * removed before profiles, and the profile's `default_address_id` reference is cleared first, so the
 * reset stays valid regardless of the foreign-key rules.
 */
export async function resetCustomerDatabase(database: DatabaseService): Promise<void> {
  const prisma = database.prisma;
  await prisma.customerProfile.updateMany({ data: { defaultAddressId: null } });
  await prisma.customerAddress.deleteMany();
  await prisma.customerProfile.deleteMany();
}
