-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'ADMIN');

-- CreateEnum
CREATE TYPE "IdentityTokenPurpose" AS ENUM ('PASSWORD_RESET', 'MFA_ENROLLMENT', 'MFA_VERIFICATION');

-- CreateEnum
CREATE TYPE "SecurityEventType" AS ENUM ('USER_REGISTERED', 'REGISTRATION_REJECTED', 'LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'ACCOUNT_LOCKED', 'MFA_ENROLLMENT_STARTED', 'MFA_ENROLLED', 'MFA_VERIFIED', 'MFA_VERIFICATION_FAILED', 'RECOVERY_CODE_USED', 'PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET_COMPLETED', 'PASSWORD_CHANGED', 'SESSION_REVOKED', 'SESSIONS_REVOKED', 'SESSION_REJECTED', 'ADMIN_ACCESS_DENIED', 'ADMIN_ACCESS_GRANTED', 'NOTIFICATION_DELIVERY_SKIPPED');

-- CreateEnum
CREATE TYPE "SecurityEventOutcome" AS ENUM ('SUCCESS', 'FAILURE', 'DENIED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'CUSTOMER',
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "password_changed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "client_label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revoked_reason" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "IdentityTokenPurpose" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "invalidated_at" TIMESTAMP(3),

    CONSTRAINT "identity_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_mfa_credentials" (
    "user_id" UUID NOT NULL,
    "secret_ciphertext" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "last_accepted_step" INTEGER,

    CONSTRAINT "admin_mfa_credentials_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "admin_mfa_recovery_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used_at" TIMESTAMP(3),

    CONSTRAINT "admin_mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "security_events" (
    "id" UUID NOT NULL,
    "event_type" "SecurityEventType" NOT NULL,
    "outcome" "SecurityEventOutcome" NOT NULL,
    "actor_user_id" UUID,
    "actor_role" "UserRole",
    "correlation_id" UUID NOT NULL,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "identity_tokens_token_hash_key" ON "identity_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "identity_tokens_user_id_purpose_idx" ON "identity_tokens"("user_id", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "admin_mfa_recovery_codes_code_hash_key" ON "admin_mfa_recovery_codes"("code_hash");

-- CreateIndex
CREATE INDEX "admin_mfa_recovery_codes_user_id_idx" ON "admin_mfa_recovery_codes"("user_id");

-- CreateIndex
CREATE INDEX "security_events_actor_user_id_idx" ON "security_events"("actor_user_id");

-- CreateIndex
CREATE INDEX "security_events_created_at_idx" ON "security_events"("created_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_tokens" ADD CONSTRAINT "identity_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_mfa_credentials" ADD CONSTRAINT "admin_mfa_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_mfa_recovery_codes" ADD CONSTRAINT "admin_mfa_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
