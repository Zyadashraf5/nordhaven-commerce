-- Milestone 11: the shipping configuration, the shipment lifecycle, and the return intent.
--
-- Additive: seven new tables with their foreign keys, unique constraints, indexes, and CHECK
-- constraints. No table is dropped, no column is dropped, no business row is deleted, and no
-- existing row is rewritten.
--
-- The shipping destination and the shipping method are ADMINISTRATOR CONFIGURATION, not platform
-- rules. There is no country list, no carrier table, and no rate calculation: the amount is a
-- configured integer, and both rows are environment-scoped so a `TEST` configuration can never
-- enable a production checkout.
--
-- A shipment records what it is - the destination, the method, the items, and a free-form tracking
-- reference an administrator set. It carries no delivery estimate and no carrier-verified status,
-- because the absence of the field is what enforces the rule.
--
-- A return is a separate aggregate with its own lifecycle. It has no payment and no reservation, so
-- while it is requested it holds no money and has moved no stock.
--
-- The event logs are append-only: nothing in the application updates or deletes an event, so a
-- shipment's or a return's history is a fact rather than a summary.

CREATE TYPE "ShipmentStatus" AS ENUM (
    'PREPARED',
    'PACKED',
    'HANDED_OVER',
    'DELIVERED',
    'CANCELLED'
);

CREATE TYPE "ReturnStatus" AS ENUM (
    'REQUESTED',
    'APPROVED',
    'REJECTED',
    'RECEIVED',
    'REFUNDED',
    'CANCELLED'
);

CREATE TABLE "shipping_destinations" (
    "country_code" CHAR(2) NOT NULL,
    "environment" "EnvironmentScope" NOT NULL DEFAULT 'TEST',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "label" TEXT NOT NULL,
    "carrier_code" TEXT,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_destinations_pkey" PRIMARY KEY ("country_code", "environment")
);

CREATE TABLE "shipping_methods" (
    "id" UUID NOT NULL,
    "environment" "EnvironmentScope" NOT NULL DEFAULT 'TEST',
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "destination_country_code" CHAR(2),
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_user_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_methods_pkey" PRIMARY KEY ("id"),
    -- The configured amount is never negative and stays inside the platform's stored integer range.
    CONSTRAINT "shipping_methods_amount_nonnegative" CHECK ("amount_minor" >= 0),
    CONSTRAINT "shipping_methods_amount_within_range" CHECK ("amount_minor" <= 2000000000)
);

CREATE TABLE "shipments" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'PREPARED',
    "destination_country_code" CHAR(2) NOT NULL,
    "destination_label" TEXT NOT NULL,
    "method_code" TEXT NOT NULL,
    "method_label" TEXT NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "tracking_reference" TEXT,
    "carrier_code" TEXT,
    "dispatched_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "status_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id"),
    -- The snapshotted amount is never negative and stays inside the platform's stored integer range.
    CONSTRAINT "shipments_amount_nonnegative" CHECK ("amount_minor" >= 0),
    CONSTRAINT "shipments_amount_within_range" CHECK ("amount_minor" <= 2000000000)
);

CREATE TABLE "shipment_lines" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "order_line_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "shipment_lines_pkey" PRIMARY KEY ("id"),
    -- A shipment line always carries a positive whole quantity.
    CONSTRAINT "shipment_lines_quantity_positive" CHECK ("quantity" >= 1)
);

CREATE TABLE "shipment_events" (
    "id" UUID NOT NULL,
    "shipment_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "previous_status" "ShipmentStatus",
    "next_status" "ShipmentStatus",
    "actor" TEXT NOT NULL,
    "actor_user_id" UUID,
    "reason" TEXT,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "returns" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'REQUESTED',
    "reason_code" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "total_minor" INTEGER NOT NULL,
    "refund_id" UUID,
    "refund_status" TEXT,
    "received_at" TIMESTAMP(3),
    "decided_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "returns_pkey" PRIMARY KEY ("id"),
    -- The amount a return covers is never negative and stays inside the stored integer range.
    CONSTRAINT "returns_total_nonnegative" CHECK ("total_minor" >= 0),
    CONSTRAINT "returns_total_within_range" CHECK ("total_minor" <= 2000000000)
);

CREATE TABLE "return_lines" (
    "id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "order_line_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "restocked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "return_lines_pkey" PRIMARY KEY ("id"),
    -- A returned line always carries a positive whole quantity.
    CONSTRAINT "return_lines_quantity_positive" CHECK ("quantity" >= 1)
);

CREATE TABLE "return_events" (
    "id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "previous_status" "ReturnStatus",
    "next_status" "ReturnStatus",
    "actor" TEXT NOT NULL,
    "actor_user_id" UUID,
    "reason" TEXT,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_events_pkey" PRIMARY KEY ("id")
);

-- One method per code per environment.
CREATE UNIQUE INDEX "shipping_methods_environment_code_key" ON "shipping_methods"("environment", "code");

CREATE INDEX "shipping_methods_environment_destination_country_code_idx" ON "shipping_methods"("environment", "destination_country_code");

-- One shipment per order, so an accidental duplicate cannot send the goods twice.
CREATE UNIQUE INDEX "shipments_order_id_key" ON "shipments"("order_id");

CREATE INDEX "shipments_customer_id_created_at_id_idx" ON "shipments"("customer_id", "created_at", "id");

CREATE INDEX "shipments_status_created_at_idx" ON "shipments"("status", "created_at");

CREATE INDEX "shipment_lines_shipment_id_idx" ON "shipment_lines"("shipment_id");

CREATE INDEX "shipment_events_shipment_id_created_at_id_idx" ON "shipment_events"("shipment_id", "created_at", "id");

CREATE INDEX "returns_order_id_created_at_id_idx" ON "returns"("order_id", "created_at", "id");

CREATE INDEX "returns_customer_id_created_at_id_idx" ON "returns"("customer_id", "created_at", "id");

CREATE INDEX "returns_status_created_at_idx" ON "returns"("status", "created_at");

CREATE INDEX "return_lines_return_id_idx" ON "return_lines"("return_id");

CREATE INDEX "return_events_return_id_created_at_id_idx" ON "return_events"("return_id", "created_at", "id");

ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_fkey" FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "return_lines" ADD CONSTRAINT "return_lines_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "return_events" ADD CONSTRAINT "return_events_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
