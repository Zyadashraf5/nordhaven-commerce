-- Pending/unknown refund budget is distinct from money actually refunded.
-- Existing installations with historical refunds need controlled reconciliation before adoption.
ALTER TABLE "payment_attempts" ADD COLUMN "pending_refund_minor" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_total_refund_budget" CHECK (
  "pending_refund_minor" >= 0 AND "refunded_minor"::bigint + "pending_refund_minor"::bigint <= "amount_minor"::bigint
);
