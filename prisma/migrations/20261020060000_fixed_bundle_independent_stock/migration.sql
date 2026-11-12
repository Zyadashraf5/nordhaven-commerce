-- AlterTable
ALTER TABLE "inventory_items" ADD COLUMN "bundle_id" UUID;
ALTER TABLE "inventory_items" ALTER COLUMN "variant_id" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_bundle_id_key" ON "inventory_items"("bundle_id");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "bundles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
