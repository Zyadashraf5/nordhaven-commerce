-- Additive. Legacy per-line amounts remain unknown until explicitly reconciled; no guessed backfill.
ALTER TABLE "return_lines" ADD COLUMN "amount_minor" INTEGER;
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_amount_nonnegative" CHECK ("amount_minor" IS NULL OR "amount_minor" >= 0);
CREATE INDEX "returns_order_id_status_idx" ON "returns"("order_id", "status");
