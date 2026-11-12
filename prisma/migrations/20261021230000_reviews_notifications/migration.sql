-- Milestone 12: the customer reviews and the notification delivery records.
--
-- Additive: four new tables with their foreign keys, unique constraints, indexes, and CHECK
-- constraints. No table is dropped, no column is dropped, no business row is deleted, and no
-- existing row is rewritten.
--
-- A review is HELD for moderation before it is public, and it may only be written by a customer
-- who holds a **paid** order that contains the reviewed product. The order that proves the purchase
-- is recorded, so the verified-purchase fact is a property of the record rather than of a code
-- path. One review per product per customer is a unique key, so a customer cannot flood a product.
--
-- A notification is a **delivery attempt** of a message the platform produced. It is delivered
-- through a provider behind a narrow interface, and HC-DEC-014 leaves the channel open, so the
-- only shipped transports are local test transports and the production transport sends nothing.

CREATE TYPE "ReviewStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);

CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "order_id" UUID,
    "rating" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "verified_purchase" BOOLEAN NOT NULL DEFAULT false,
    "moderated_by_user_id" UUID,
    "moderated_at" TIMESTAMP(3),
    "moderation_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id"),
    -- A rating is a whole number from one to five.
    CONSTRAINT "reviews_rating_range" CHECK ("rating" >= 1 AND "rating" <= 5),
    -- A review always carries a title and a body, both non-empty.
    CONSTRAINT "reviews_title_not_empty" CHECK (length(btrim("title")) > 0),
    CONSTRAINT "reviews_body_not_empty" CHECK (length(btrim("body")) > 0)
);

CREATE TABLE "review_events" (
    "id" UUID NOT NULL,
    "review_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "previous_status" "ReviewStatus",
    "next_status" "ReviewStatus",
    "actor" TEXT NOT NULL,
    "actor_user_id" UUID,
    "reason" TEXT,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "recipient_user_id" UUID NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT,
    "provider_reference" TEXT,
    "failure_reason" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
    -- The status is one of the four known states.
    CONSTRAINT "notifications_status_known" CHECK ("status" IN ('PENDING', 'DELIVERED', 'FAILED', 'SKIPPED'))
);

CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "attempt" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "delivered" BOOLEAN NOT NULL,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id"),
    -- An attempt number is a positive whole number.
    CONSTRAINT "notification_deliveries_attempt_positive" CHECK ("attempt" >= 1)
);

-- One review per product per customer, so a customer cannot flood a product with statements.
CREATE UNIQUE INDEX "reviews_product_id_customer_id_key" ON "reviews"("product_id", "customer_id");

CREATE INDEX "reviews_product_id_status_created_at_idx" ON "reviews"("product_id", "status", "created_at");

CREATE INDEX "reviews_customer_id_created_at_id_idx" ON "reviews"("customer_id", "created_at", "id");

CREATE INDEX "review_events_review_id_created_at_id_idx" ON "review_events"("review_id", "created_at", "id");

CREATE INDEX "notifications_kind_created_at_id_idx" ON "notifications"("kind", "created_at", "id");

-- One notification per business key, so a retried workflow delivers the message exactly once.
CREATE UNIQUE INDEX "notifications_idempotency_key_key" ON "notifications"("idempotency_key");
CREATE INDEX "notifications_recipient_user_id_created_at_id_idx" ON "notifications"("recipient_user_id", "created_at", "id");

CREATE INDEX "notification_deliveries_notification_id_attempt_idx" ON "notification_deliveries"("notification_id", "attempt");

ALTER TABLE "review_events" ADD CONSTRAINT "review_events_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
