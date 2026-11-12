import type { DatabaseService } from '../../apps/api/src/platform/database/database.service';

/**
 * Removes every Cart and Wishlist row between tests.
 *
 * The suites only ever reach a dedicated, isolated test database (enforced by
 * `assertSafeTestDatabase`), so this cannot touch development or production data. Deletion order
 * follows the foreign keys: a cart line belongs to a cart, a wishlist item belongs to a customer
 * profile, and both reference catalog rows.
 *
 * A cart line references a variant or a bundle with ON DELETE RESTRICT, so the lines are removed
 * before either of the rows they hold.
 */
export async function resetCartDatabase(database: DatabaseService): Promise<void> {
  const prisma = database.prisma;
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.customerWishlistItem.deleteMany();
}
