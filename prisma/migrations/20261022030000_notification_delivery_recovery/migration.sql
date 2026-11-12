-- Additive recovery metadata. Historical unknown metadata is not reconstructed.
ALTER TABLE "notifications" ADD COLUMN "metadata" JSONB NOT NULL DEFAULT '{}', ADD COLUMN "delivery_claimed_at" TIMESTAMP(3), ADD COLUMN "delivery_claim_token" UUID;
ALTER TABLE "notification_deliveries" ADD COLUMN "actor_user_id" UUID;
CREATE INDEX "notifications_status_delivery_claimed_at_idx" ON "notifications"("status", "delivery_claimed_at");
