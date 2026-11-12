-- Milestone 10: the payment attempt, the provider event, and the refund.
--
-- Additive: three new tables with their foreign keys, unique constraints, indexes, and CHECK
-- constraints. No table is dropped, no column is dropped, no business row is deleted, and no
-- existing row is rewritten.
--
-- The payment attempt stores the amount, the currency, the provider, and the provider's reference.
-- It stores **no** card number, credential, or other payment material, and the platform has no
-- column in which to put one.
--
-- The provider event's identifier is unique per provider, so a repeated, a delayed, or an
-- out-of-order delivery is applied exactly once.
--
-- The refund's cumulative constraint is enforced in the write, and the CHECK below makes a
-- negative amount or a negative refunded total impossible to store.

CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED');

CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

CREATE TYPE "ProviderEventOutcome" AS ENUM ('APPLIED', 'DUPLICATE', 'REJECTED', 'UNKNOWN_ORDER');

CREATE TABLE "payment_attempts" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_reference" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "refunded_minor" INTEGER NOT NULL DEFAULT 0,
    "last_event_id" TEXT,
    "status_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "succeeded_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id"),
    -- Defence in depth for exact money: an attempt never stores a negative amount.
    CONSTRAINT "payment_attempts_amount_nonnegative" CHECK ("amount_minor" >= 0),
    -- The amount already refunded can never be negative.
    CONSTRAINT "payment_attempts_refunded_nonnegative" CHECK ("refunded_minor" >= 0),
    -- The refunded total can never exceed the amount that was paid.
    CONSTRAINT "payment_attempts_refunded_within_amount" CHECK ("refunded_minor" <= "amount_minor")
);

CREATE TABLE "provider_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "outcome" "ProviderEventOutcome" NOT NULL,
    "order_id" UUID,
    "payment_attempt_id" UUID,
    "reason" TEXT,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "refunds" (
    "id" UUID NOT NULL,
    "payment_attempt_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "reason" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "provider_reference" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "succeeded_at" TIMESTAMP(3),

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id"),
    -- Defence in depth for exact money: a refund never stores a negative amount.
    CONSTRAINT "refunds_amount_positive" CHECK ("amount_minor" > 0)
);

-- One attempt per idempotency key per customer, so a repeated request finds the first attempt.
CREATE UNIQUE INDEX "payment_attempts_customer_id_idempotency_key_key" ON "payment_attempts"("customer_id", "idempotency_key");

CREATE INDEX "payment_attempts_order_id_created_at_id_idx" ON "payment_attempts"("order_id", "created_at", "id");

CREATE INDEX "payment_attempts_provider_provider_reference_idx" ON "payment_attempts"("provider", "provider_reference");

-- The provider's own event identifier is unique per provider, so the event is applied once.
CREATE UNIQUE INDEX "provider_events_provider_provider_event_id_key" ON "provider_events"("provider", "provider_event_id");

CREATE INDEX "provider_events_order_id_created_at_id_idx" ON "provider_events"("order_id", "created_at", "id");

-- One refund per idempotency key per customer, so a repeated request finds the first refund.
CREATE UNIQUE INDEX "refunds_customer_id_idempotency_key_key" ON "refunds"("customer_id", "idempotency_key");

CREATE INDEX "refunds_payment_attempt_id_created_at_id_idx" ON "refunds"("payment_attempt_id", "created_at", "id");

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_attempt_id_fkey" FOREIGN KEY ("payment_attempt_id") REFERENCES "payment_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
