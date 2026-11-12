-- Milestone 07: the authenticated customer's cart and wishlist.
--
-- Additive: two new tables for the Cart module and one for the Customers module, with their
-- foreign keys, unique constraints, indexes, and CHECK constraints. No existing table is altered,
-- no column is dropped, and no application row is rewritten.
--
-- The `cart_items.variant_id` foreign key to the catalog's SKUs is a deliberate cross-module
-- reference, the same pattern the Inventory module uses. ON DELETE RESTRICT means a SKU that is in
-- someone's cart cannot be deleted out from under them, which matches the Catalog's existing rule
-- that a variant a later dependent references is not removed.
--
-- The `customer_wishlist_items.product_id` foreign key to the catalog's products cascades, so a
-- wishlist can never reference a product that no longer exists.
--
-- The CHECK constraints are hand-added because Prisma does not model them.

CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cart_items" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_minor" INTEGER NOT NULL,
    "unit_currency" CHAR(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id"),
    -- Defence in depth for exact money: a line never stores a negative price.
    CONSTRAINT "cart_items_unit_price_nonnegative" CHECK ("unit_price_minor" >= 0),
    -- The quantity is a positive whole number within the declared per-line maximum. The same bound
    -- is asserted at the request boundary, so a writer can never store a quantity outside it.
    CONSTRAINT "cart_items_quantity_in_range" CHECK ("quantity" >= 1 AND "quantity" <= 999)
);

CREATE TABLE "customer_wishlist_items" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_wishlist_items_pkey" PRIMARY KEY ("id")
);

-- One cart per customer: the unique constraint makes that structural rather than a convention.
CREATE UNIQUE INDEX "carts_user_id_key" ON "carts"("user_id");

-- One line per SKU within a cart, so adding the same SKU again increases the existing line.
CREATE UNIQUE INDEX "cart_items_cart_id_variant_id_key" ON "cart_items"("cart_id", "variant_id");

CREATE INDEX "cart_items_variant_id_idx" ON "cart_items"("variant_id");

-- One wishlist entry per product per customer.
CREATE UNIQUE INDEX "customer_wishlist_items_customer_id_product_id_key" ON "customer_wishlist_items"("customer_id", "product_id");

CREATE INDEX "customer_wishlist_items_product_id_idx" ON "customer_wishlist_items"("product_id");

ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customer_wishlist_items" ADD CONSTRAINT "customer_wishlist_items_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_wishlist_items" ADD CONSTRAINT "customer_wishlist_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;
