-- Milestone 11: the stock movement's business reference, and the restock reason.
--
-- A restock that comes back from a received return must happen **once**. The Shipping capability
-- cannot decide that by itself, because it does not own the inventory table, so the idempotency has
-- to live here: the movement carries the stable business key of the restock, and the key is unique.
--
-- A repeated restock therefore collides on the key inside the same transaction that increments the
-- on-hand quantity, and the increment is skipped. The movement ledger stays complete, because the
-- skipped movement was never created.
--
-- The new reason is added in its own migration, because a value that was added to an enum type
-- cannot be used in the same transaction that added it.

ALTER TYPE "StockMovementReason" ADD VALUE 'RESTOCK';

ALTER TABLE "stock_movements" ADD COLUMN "reference" TEXT;

-- The business key is unique, and only when it is present, so the existing movements are unaffected.
CREATE UNIQUE INDEX "stock_movements_reference_key" ON "stock_movements"("reference") WHERE "reference" IS NOT NULL;
