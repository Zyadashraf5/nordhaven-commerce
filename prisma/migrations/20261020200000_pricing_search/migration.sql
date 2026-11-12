-- Milestone 06: direct product discounts and the effective price a customer pays.
--
-- Additive: two columns on `products`, their CHECK constraints, and one supporting index.
-- No table, column, or business row is dropped, renamed, or rewritten. The only data change is the
-- backfill of the derived `effective_price_minor` column, which is set to the existing
-- `base_price_minor` because every existing product has no discount (basis points zero).
--
-- The CHECK constraints are added by hand because Prisma does not model CHECK constraints. They make
-- the database, not the application, the authority on the effective price: any writer that stores an
-- effective price that does not equal the base price reduced by the half-up rounded discount is
-- refused by PostgreSQL.
--
-- The half-up rounding of the discounted amount is expressed here in exact integer arithmetic:
--   discounted_amount = (base_price_minor * discount_basis_points + 5000) / 10000
-- The multiplication is performed in the database's 64-bit integer arithmetic, so it cannot overflow
-- for the bounded amounts the platform stores.

ALTER TABLE "products" ADD COLUMN "discount_basis_points" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "products" ADD COLUMN "effective_price_minor" INTEGER NOT NULL DEFAULT 0;

-- Every pre-existing product has no discount, so its effective price is its base price.
UPDATE "products" SET "effective_price_minor" = "base_price_minor";

-- Defence in depth for exact money: the discount is a bounded percentage of the base price.
ALTER TABLE "products" ADD CONSTRAINT "products_discount_basis_points_range" CHECK ("discount_basis_points" >= 0 AND "discount_basis_points" <= 10000);

-- The effective price always equals the base price reduced by the half-up rounded discount.
ALTER TABLE "products" ADD CONSTRAINT "products_effective_price_consistent" CHECK ("effective_price_minor" = "base_price_minor" - (("base_price_minor" * "discount_basis_points" + 5000) / 10000));

-- A price is never negative, whatever the discount.
ALTER TABLE "products" ADD CONSTRAINT "products_effective_price_nonnegative" CHECK ("effective_price_minor" >= 0);

-- Serves the price-range filter over published products.
CREATE INDEX "products_status_effective_price_idx" ON "products"("status", "effective_price_minor");
