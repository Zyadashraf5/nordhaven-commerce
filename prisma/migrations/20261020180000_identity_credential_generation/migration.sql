-- Additive credential generations preserve existing accounts and sessions at generation zero.
ALTER TABLE "users" ADD COLUMN "auth_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sessions" ADD COLUMN "auth_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "identity_tokens" ADD COLUMN "auth_version" INTEGER NOT NULL DEFAULT 0;
