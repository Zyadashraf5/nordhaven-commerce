-- Additive forward correction; no applied migration is rewritten and no historical data is changed.
CREATE UNIQUE INDEX "pre_orders_order_id_key" ON "pre_orders"("order_id");
CREATE TABLE "pre_order_events" (
 "id" UUID NOT NULL, "pre_order_id" UUID NOT NULL, "previous_status" TEXT,
 "next_status" TEXT NOT NULL, "actor" TEXT NOT NULL, "actor_user_id" UUID,
 "reason" TEXT, "reservation_id" UUID, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "pre_order_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pre_order_events_pre_order_id_created_at_id_idx" ON "pre_order_events"("pre_order_id", "created_at", "id");
CREATE TABLE "refund_events" (
 "id" UUID NOT NULL, "refund_id" UUID NOT NULL, "previous_status" TEXT,
 "next_status" TEXT NOT NULL, "actor_user_id" UUID, "reason" TEXT,
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "refund_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "refund_events_refund_id_created_at_id_idx" ON "refund_events"("refund_id", "created_at", "id");
