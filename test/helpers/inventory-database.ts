import type { DatabaseService } from '../../apps/api/src/platform/database/database.service';

/**
 * Removes every Inventory and Bundles row, and the catalog rows they reference, between tests.
 *
 * The suites only ever reach a dedicated, isolated test database (enforced by `assertSafeTestDatabase`),
 * so this cannot touch development or production data. Deletion order follows the foreign keys:
 * movements and reservation lines reference a reservation or an inventory item, and a bundle component
 * references a bundle and a SKU, which in turn belongs to a product that references a category and a
 * brand.
 */
export async function resetInventoryDatabase(database: DatabaseService): Promise<void> {
  const prisma = database.prisma;
  await prisma.stockMovement.deleteMany();
  await prisma.reservationLine.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.bundleComponent.deleteMany();
  // A cart line references a variant or a bundle with ON DELETE RESTRICT, so the cart lines are
  // removed before either of the rows they hold.
  await prisma.cartItem.deleteMany();
  await prisma.bundle.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.productAttribute.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.updateMany({ data: { parentId: null } });
  await prisma.category.deleteMany();
  await prisma.brand.deleteMany();
}
