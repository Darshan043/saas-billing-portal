-- AlterEnum
ALTER TYPE "SubscriptionStatus" ADD VALUE 'PAUSED';

-- AlterTable
ALTER TABLE "sim_subscriptions" ADD COLUMN "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "paused_at" TIMESTAMPTZ,
ADD COLUMN "current_period_start" TIMESTAMPTZ,
ADD COLUMN "current_period_end" TIMESTAMPTZ;

-- CreateTable
CREATE TABLE "sim_subscription_ops" (
    "idempotency_key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subscription_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sim_subscription_ops_pkey" PRIMARY KEY ("idempotency_key")
);

-- CreateIndex
CREATE INDEX "sim_subscription_ops_subscription_id_idx" ON "sim_subscription_ops"("subscription_id");

-- AddForeignKey
ALTER TABLE "sim_subscription_ops" ADD CONSTRAINT "sim_subscription_ops_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "sim_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
