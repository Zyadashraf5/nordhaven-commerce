import type { DatabaseService } from '../../apps/api/src/platform/database/database.service';

/**
 * Removes every Product Catalog row between tests.
 *
 * The suites only ever reach a dedicated, isolated test database (enforced by `assertSafeTestDatabase`),
 * so this cannot touch development or production data. Deletion order follows the foreign keys: images,
 * attributes, and variants belong to a product, and a product references a category and a brand.
 *
 * A cart line references a variant or a bundle with ON DELETE RESTRICT, and an inventory item and a
 * bundle component reference a SKU with ON DELETE RESTRICT, so those rows are removed before the
 * catalog rows they hold. Otherwise a cart left over from an earlier suite would block the deletion
 * of the variant it holds.
 */
export async function resetCatalogDatabase(database: DatabaseService): Promise<void> {
  const prisma = database.prisma;
  await prisma.stockMovement.deleteMany();
  await prisma.reservationLine.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.bundleComponent.deleteMany();
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
