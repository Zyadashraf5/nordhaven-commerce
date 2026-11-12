-- Milestone 09: the order aggregate and the pre-order intent.
--
-- Additive: four new tables with their foreign keys, unique constraints, indexes, and CHECK
-- constraints. No table is dropped, no column is dropped, no business row is deleted, and no
-- existing row is rewritten.
--
-- The order stores an immutable snapshot of every figure the customer confirmed, so the CHECK
-- constraints below make an internally inconsistent order impossible to store: the subtotal plus the
-- tax must equal the total, and no amount may be negative.
--
-- The idempotency key is scoped to the customer, so two different customers who happen to send the
-- same key text each get their own order, while one customer who retries always finds the first.
--
-- The order's event log is append-only: nothing in the application updates or deletes an event, so
-- the history of an order is a fact rather than a summary.

CREATE TYPE "OrderStatus" AS ENUM (
    'PENDING_PAYMENT',
    'PAID',
    'PAID_PENDING_ALLOCATION',
    'PAYMENT_FAILED',
    'CANCELLED',
    'EXPIRED',
    'FULFILLED'
);

CREATE TYPE "OrderActor" AS ENUM ('CUSTOMER', 'ADMIN', 'SYSTEM');

CREATE TYPE "PreOrderStatus" AS ENUM (
    'AWAITING_STOCK',
    'STOCK_RESERVED',
    'AWAITING_PAYMENT',
    'CONVERTED',
    'CANCELLED',
    'EXPIRED'
);

CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "currency" CHAR(3) NOT NULL,
    "subtotal_minor" INTEGER NOT NULL,
    "tax_total_minor" INTEGER NOT NULL,
    "total_minor" INTEGER NOT NULL,
    "destination_country_code" CHAR(2) NOT NULL,
    "tax_jurisdiction" CHAR(2) NOT NULL,
    "quote_fingerprint" TEXT NOT NULL,
    "reservation_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "status_reason" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "fulfilled_at" TIMESTAMP(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),
    -- Defence in depth for exact money: the order's own figures must be internally consistent, so
    -- the storage layer refuses an order whose subtotal plus its tax is not its total.
    CONSTRAINT "orders_amounts_consistent" CHECK ("subtotal_minor" + "tax_total_minor" = "total_minor"),
    -- No amount is ever negative.
    CONSTRAINT "orders_amounts_nonnegative" CHECK (
        "subtotal_minor" >= 0 AND "tax_total_minor" >= 0 AND "total_minor" >= 0
    ),
    -- The order's window must end after it starts.
    CONSTRAINT "orders_expiry_after_creation" CHECK ("expires_at" > "created_at")
);

CREATE TABLE "order_lines" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "variant_id" UUID,
    "bundle_id" UUID,
    "source_line_id" UUID,
    "sku" TEXT NOT NULL,
    "product_id" UUID NOT NULL,
    "product_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_minor" INTEGER NOT NULL,
    "unit_currency" CHAR(3) NOT NULL,
    "discount_basis_points" INTEGER NOT NULL,
    "tax_rate_basis_points" INTEGER NOT NULL,
    "tax_inclusive" BOOLEAN NOT NULL DEFAULT false,
    "tax_classification" TEXT NOT NULL DEFAULT 'STANDARD',
    "net_minor" INTEGER NOT NULL,
    "tax_minor" INTEGER NOT NULL,
    "total_minor" INTEGER NOT NULL,
    "composition" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id"),
    -- A line names a SKU or a bundle, never both and never neither, exactly as a cart line does.
    CONSTRAINT "order_lines_exactly_one_owner" CHECK (("variant_id" IS NULL) <> ("bundle_id" IS NULL)),
    -- The quantity is a positive whole number within the same bound the Cart enforces.
    CONSTRAINT "order_lines_quantity_in_range" CHECK ("quantity" >= 1 AND "quantity" <= 999),
    -- Defence in depth for exact money: a line never stores a negative amount.
    CONSTRAINT "order_lines_amounts_nonnegative" CHECK (
        "unit_price_minor" >= 0 AND "net_minor" >= 0 AND "tax_minor" >= 0 AND "total_minor" >= 0
    ),
    -- The line's own figures must be internally consistent.
    CONSTRAINT "order_lines_amounts_consistent" CHECK ("net_minor" + "tax_minor" = "total_minor"),
    -- The snapshotted discount and tax rate are basis points, so neither can exceed one hundred
    -- percent.
    CONSTRAINT "order_lines_rates_in_range" CHECK (
        "discount_basis_points" >= 0 AND "discount_basis_points" <= 10000
        AND "tax_rate_basis_points" >= 0 AND "tax_rate_basis_points" <= 10000
    )
);

CREATE TABLE "order_events" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "previous_status" "OrderStatus",
    "next_status" "OrderStatus",
    "actor" "OrderActor" NOT NULL,
    "actor_user_id" UUID,
    "external_event_id" TEXT,
    "reason" TEXT,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pre_orders" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "PreOrderStatus" NOT NULL DEFAULT 'AWAITING_STOCK',
    "total_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "lines" JSONB NOT NULL,
    "order_id" UUID,
    "reservation_id" UUID,
    "status_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "pre_orders_pkey" PRIMARY KEY ("id"),
    -- Defence in depth for exact money.
    CONSTRAINT "pre_orders_total_nonnegative" CHECK ("total_minor" >= 0)
);

-- One order per idempotency key per customer, so a repeated request finds the first order.
CREATE UNIQUE INDEX "orders_customer_id_idempotency_key_key" ON "orders"("customer_id", "idempotency_key");

CREATE INDEX "orders_customer_id_created_at_id_idx" ON "orders"("customer_id", "created_at", "id");

CREATE INDEX "orders_status_expires_at_idx" ON "orders"("status", "expires_at");

CREATE INDEX "order_lines_order_id_idx" ON "order_lines"("order_id");

CREATE INDEX "order_events_order_id_created_at_id_idx" ON "order_events"("order_id", "created_at", "id");

-- An external event's identifier is unique, so a repeated or a delayed payment event is applied
-- exactly once.
CREATE UNIQUE INDEX "order_events_external_event_id_key" ON "order_events"("external_event_id");

CREATE INDEX "pre_orders_customer_id_created_at_id_idx" ON "pre_orders"("customer_id", "created_at", "id");

CREATE INDEX "pre_orders_status_created_at_idx" ON "pre_orders"("status", "created_at");

ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pre_orders" ADD CONSTRAINT "pre_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
