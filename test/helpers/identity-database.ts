import type { DatabaseService } from '../../apps/api/src/platform/database/database.service';

/**
 * Removes every Identity row between tests.
 *
 * The suites only ever reach a dedicated, isolated test database (enforced by
 * `assertSafeTestDatabase`), so this cannot touch development or production data. Children are
 * removed first so the operation stays valid regardless of the foreign-key cascade rules.
 */
export async function resetIdentityDatabase(database: DatabaseService): Promise<void> {
  const prisma = database.prisma;
  await prisma.adminMfaRecoveryCode.deleteMany();
  await prisma.adminMfaCredential.deleteMany();
  await prisma.identityToken.deleteMany();
  await prisma.securityEvent.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}
