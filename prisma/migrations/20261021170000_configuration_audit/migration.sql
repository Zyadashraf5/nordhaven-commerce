CREATE TABLE "tax_configuration_events" (
 "id" UUID NOT NULL, "target" TEXT NOT NULL, "action" TEXT NOT NULL, "actor_user_id" UUID, "before" JSONB NOT NULL, "after" JSONB NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "tax_configuration_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tax_configuration_events_target_created_at_id_idx" ON "tax_configuration_events"("target", "created_at", "id");

CREATE TABLE "checkout_configuration_events" (
 "id" UUID NOT NULL, "target" TEXT NOT NULL, "action" TEXT NOT NULL, "actor_user_id" UUID, "before" JSONB NOT NULL, "after" JSONB NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "checkout_configuration_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "checkout_configuration_events_target_created_at_id_idx" ON "checkout_configuration_events"("target", "created_at", "id");
