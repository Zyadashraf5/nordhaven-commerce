-- Additive representation for approved M10 full/partial refund visibility.
ALTER TYPE "OrderStatus" ADD VALUE 'REFUNDED';
ALTER TABLE "orders" ADD COLUMN "refunded_minor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD CONSTRAINT "orders_refunded_bounds" CHECK ("refunded_minor" >= 0 AND "refunded_minor" <= "total_minor");
-- Historical refunds are intentionally not invented or inferred by migration. Reconcile them explicitly.
