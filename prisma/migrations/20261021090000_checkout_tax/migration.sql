-- Milestone 08: the configurable tax engine, the approved checkout destinations, and the cart
-- line's ability to name a bundle.
--
-- Additive: three new tables with their foreign keys, unique constraints, indexes, and CHECK
-- constraints; one altered column; one new column. No table is dropped, no column is dropped, no
-- business row is deleted, and no existing data is reinterpreted.
--
-- The tax rules are configuration data rather than code, because the approved decision forbids
-- hardcoding a rate as a universal rate. Every rule carries an environment scope, so a TEST rule can
-- never apply to a production request and a production request finds no rule until a production
-- rule is approved and configured. That makes "no production tax without an approved configuration"
-- structural rather than a convention.
--
-- `tax_classifications.product_id` is a deliberate cross-module foreign key to the catalog's
-- products, the same pattern the Cart and Wishlist capabilities use. It cascades, so a
-- classification never outlives its product.
--
-- The cart line may now name a SKU or a bundle. The exactly-one-owner CHECK is hand-added because
-- Prisma cannot express it; it is the same pattern `inventory_items` already uses. The two compound
-- unique indexes are effective because PostgreSQL treats NULLs as distinct in a unique index: two
-- SKU lines in one cart collide on the first, two bundle lines collide on the second, and a SKU
-- line never collides with a bundle line.

CREATE TYPE "EnvironmentScope" AS ENUM ('TEST', 'PRODUCTION');

CREATE TABLE "tax_rules" (
    "id" UUID NOT NULL,
    "environment" "EnvironmentScope" NOT NULL DEFAULT 'TEST',
    "jurisdiction" CHAR(2) NOT NULL,
    "classification" TEXT NOT NULL DEFAULT 'STANDARD',
    "rate_basis_points" INTEGER NOT NULL,
    "tax_inclusive" BOOLEAN NOT NULL DEFAULT false,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" UUID,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_rules_pkey" PRIMARY KEY ("id"),
    -- A rate is an exact number of basis points, so no rounding happens before the calculation.
    CONSTRAINT "tax_rules_rate_basis_points_range" CHECK ("rate_basis_points" >= 0 AND "rate_basis_points" <= 10000),
    -- An effective window must end after it starts.
    CONSTRAINT "tax_rules_effective_window" CHECK ("effective_to" IS NULL OR "effective_to" > "effective_from")
);

CREATE TABLE "tax_classifications" (
    "product_id" UUID NOT NULL,
    "classification" TEXT NOT NULL DEFAULT 'STANDARD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_classifications_pkey" PRIMARY KEY ("product_id")
);

CREATE TABLE "checkout_destinations" (
    "country_code" CHAR(2) NOT NULL,
    "environment" "EnvironmentScope" NOT NULL DEFAULT 'TEST',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "tax_jurisdiction" CHAR(2) NOT NULL,
    "shipping_approved" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT NOT NULL,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "checkout_destinations_pkey" PRIMARY KEY ("country_code", "environment"),
    -- An approved destination names the jurisdiction its tax rules are looked up under.
    CONSTRAINT "checkout_destinations_tax_jurisdiction_present" CHECK ("tax_jurisdiction" IS NOT NULL)
);

CREATE UNIQUE INDEX "tax_rules_environment_jurisdiction_classification_effective_from_key" ON "tax_rules"("environment", "jurisdiction", "classification", "effective_from");

CREATE INDEX "tax_rules_environment_jurisdiction_classification_idx" ON "tax_rules"("environment", "jurisdiction", "classification");

ALTER TABLE "tax_classifications" ADD CONSTRAINT "tax_classifications_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The cart line may name a SKU or a bundle, never both and never neither.
ALTER TABLE "cart_items" ALTER COLUMN "variant_id" DROP NOT NULL;
ALTER TABLE "cart_items" ADD COLUMN "bundle_id" UUID;

-- Every existing cart line names a variant, so the pair constraint holds for all of them.
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_exactly_one_owner" CHECK (("variant_id" IS NULL) <> ("bundle_id" IS NULL));

CREATE UNIQUE INDEX "cart_items_cart_id_bundle_id_key" ON "cart_items"("cart_id", "bundle_id");

CREATE INDEX "cart_items_bundle_id_idx" ON "cart_items"("bundle_id");

ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_bundle_id_fkey" FOREIGN KEY ("bundle_id") REFERENCES "bundles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
