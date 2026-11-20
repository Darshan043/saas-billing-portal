-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTH', 'YEAR');

-- AlterTable
ALTER TABLE "sim_customers" ADD COLUMN "idempotency_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "sim_customers_idempotency_key_key" ON "sim_customers"("idempotency_key");

-- AlterTable
ALTER TABLE "sim_subscriptions" ADD COLUMN "interval" "BillingInterval",
ADD COLUMN "metadata" JSONB;
