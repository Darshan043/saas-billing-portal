-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('SUCCEEDED', 'DECLINED', 'INSUFFICIENT_FUNDS');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('OPEN', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "WebhookStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('SUCCESS', 'FAILED', 'FORCED_FAIL');

-- CreateEnum
CREATE TYPE "DeliveryReason" AS ENUM ('INITIAL', 'RETRY', 'REPLAY', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "TokenKind" AS ENUM ('VISA_OK', 'DECLINED', 'INSUFFICIENT_FUNDS');

-- CreateTable
CREATE TABLE "sim_customers" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sim_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sim_payment_methods" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "token_kind" "TokenKind" NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sim_payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sim_payments" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "payment_method_id" UUID,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL,
    "error_code" TEXT,
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sim_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sim_subscriptions" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "plan_price_id" TEXT,
    "canceled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "sim_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sim_invoices" (
    "id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "subscription_id" UUID,
    "payment_id" UUID,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sim_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sim_webhook_events" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "raw_body" TEXT NOT NULL,
    "status" "WebhookStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMPTZ,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sim_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sim_webhook_deliveries" (
    "id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" "DeliveryStatus" NOT NULL,
    "reason" "DeliveryReason" NOT NULL,
    "http_status" INTEGER,
    "response_body" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sim_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sim_settings" (
    "id" INTEGER NOT NULL,
    "fail_next" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sim_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sim_customers_email_key" ON "sim_customers"("email");

-- CreateIndex
CREATE INDEX "sim_payment_methods_customer_id_idx" ON "sim_payment_methods"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "sim_payments_idempotency_key_key" ON "sim_payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "sim_payments_created_at_idx" ON "sim_payments"("created_at");

-- CreateIndex
CREATE INDEX "sim_payments_customer_id_idx" ON "sim_payments"("customer_id");

-- CreateIndex
CREATE INDEX "sim_subscriptions_customer_id_idx" ON "sim_subscriptions"("customer_id");

-- CreateIndex
CREATE INDEX "sim_subscriptions_created_at_idx" ON "sim_subscriptions"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "sim_invoices_payment_id_key" ON "sim_invoices"("payment_id");

-- CreateIndex
CREATE INDEX "sim_invoices_created_at_idx" ON "sim_invoices"("created_at");

-- CreateIndex
CREATE INDEX "sim_webhook_events_status_next_retry_at_idx" ON "sim_webhook_events"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "sim_webhook_events_created_at_idx" ON "sim_webhook_events"("created_at");

-- CreateIndex
CREATE INDEX "sim_webhook_deliveries_event_id_idx" ON "sim_webhook_deliveries"("event_id");

-- AddForeignKey
ALTER TABLE "sim_payment_methods" ADD CONSTRAINT "sim_payment_methods_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "sim_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sim_payments" ADD CONSTRAINT "sim_payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "sim_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sim_payments" ADD CONSTRAINT "sim_payments_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "sim_payment_methods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sim_subscriptions" ADD CONSTRAINT "sim_subscriptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "sim_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sim_invoices" ADD CONSTRAINT "sim_invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "sim_customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sim_invoices" ADD CONSTRAINT "sim_invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "sim_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sim_invoices" ADD CONSTRAINT "sim_invoices_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "sim_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sim_webhook_deliveries" ADD CONSTRAINT "sim_webhook_deliveries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "sim_webhook_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
