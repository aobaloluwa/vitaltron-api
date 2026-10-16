-- CreateEnum
CREATE TYPE "AuthActionType" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateTable
CREATE TABLE "auth_action_tokens" (
    "id" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "type" "AuthActionType" NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_action_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_action_tokens_tokenHash_key" ON "auth_action_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "auth_action_tokens_userId_type_idx" ON "auth_action_tokens"("userId", "type");

-- CreateIndex
CREATE INDEX "auth_action_tokens_expiresAt_idx" ON "auth_action_tokens"("expiresAt");

-- AddForeignKey
ALTER TABLE "auth_action_tokens" ADD CONSTRAINT "auth_action_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
