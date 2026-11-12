-- HC-DEC-017: reconcile databases whose earlier migration was recorded without its DDL.
-- Additive and idempotent: no rows, tables or databases are removed.
ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "bundle_id" UUID;
ALTER TABLE "inventory_items" ALTER COLUMN "variant_id" DROP NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_items_bundle_id_key" ON "inventory_items"("bundle_id");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'inventory_items'::regclass AND conname = 'inventory_items_bundle_id_fkey') THEN
    ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "bundles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_exactly_one_owner" CHECK (("variant_id" IS NULL) <> ("bundle_id" IS NULL));
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_reserved_within_on_hand" CHECK ("reserved" <= "on_hand");
