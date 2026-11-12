-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'CONFIRMED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StockMovementReason" AS ENUM ('ADJUSTMENT', 'RESERVATION_CREATED', 'RESERVATION_RELEASED', 'RESERVATION_EXPIRED', 'RESERVATION_CONFIRMED');

-- CreateEnum
CREATE TYPE "BundleKind" AS ENUM ('FIXED', 'DYNAMIC');

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "on_hand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "inventory_id" UUID NOT NULL,
    "reason" "StockMovementReason" NOT NULL,
    "on_hand_delta" INTEGER NOT NULL,
    "reserved_delta" INTEGER NOT NULL,
    "on_hand_after" INTEGER NOT NULL,
    "reserved_after" INTEGER NOT NULL,
    "reservation_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'ACTIVE',
    "idempotency_key" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_lines" (
    "id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "inventory_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "reservation_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bundles" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "kind" "BundleKind" NOT NULL DEFAULT 'FIXED',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bundle_components" (
    "id" UUID NOT NULL,
    "bundle_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER,
    "min_quantity" INTEGER,
    "max_quantity" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bundle_components_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_variant_id_key" ON "inventory_items"("variant_id");

-- CreateIndex
CREATE INDEX "stock_movements_inventory_id_idx" ON "stock_movements"("inventory_id");

-- CreateIndex
CREATE INDEX "stock_movements_created_at_idx" ON "stock_movements"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_idempotency_key_key" ON "reservations"("idempotency_key");

-- CreateIndex
CREATE INDEX "reservations_status_expires_at_idx" ON "reservations"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_lines_reservation_id_inventory_id_key" ON "reservation_lines"("reservation_id", "inventory_id");

-- CreateIndex
CREATE UNIQUE INDEX "bundles_product_id_key" ON "bundles"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "bundle_components_bundle_id_variant_id_key" ON "bundle_components"("bundle_id", "variant_id");

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_lines" ADD CONSTRAINT "reservation_lines_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_lines" ADD CONSTRAINT "reservation_lines_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundles" ADD CONSTRAINT "bundles_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_components" ADD CONSTRAINT "bundle_components_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "bundles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bundle_components" ADD CONSTRAINT "bundle_components_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-added CHECK constraints (Prisma does not model CHECK constraints). They are the database-level
-- backstop for the exact non-negative integer guarantees: available stock can never become negative,
-- and a reservation line or a fixed bundle component can never hold a non-positive quantity.
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_on_hand_nonnegative" CHECK ("on_hand" >= 0);
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_reserved_nonnegative" CHECK ("reserved" >= 0);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_on_hand_after_nonnegative" CHECK ("on_hand_after" >= 0);
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reserved_after_nonnegative" CHECK ("reserved_after" >= 0);
ALTER TABLE "reservation_lines" ADD CONSTRAINT "reservation_lines_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "bundle_components" ADD CONSTRAINT "bundle_components_quantity_positive" CHECK ("quantity" IS NULL OR "quantity" > 0);
ALTER TABLE "bundle_components" ADD CONSTRAINT "bundle_components_dynamic_bounds" CHECK ("min_quantity" IS NULL OR "max_quantity" IS NULL OR "max_quantity" >= "min_quantity");
