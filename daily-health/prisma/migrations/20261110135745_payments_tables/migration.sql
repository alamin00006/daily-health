-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "payments";

-- CreateEnum
CREATE TYPE "payments"."PaymentPurpose" AS ENUM ('APPOINTMENT', 'QUICK_CONSULT', 'DIET_PLAN');

-- CreateEnum
CREATE TYPE "payments"."PaymentGatewayName" AS ENUM ('SHURJOPAY', 'SSLCOMMERZ');

-- CreateEnum
CREATE TYPE "payments"."PaymentMethod" AS ENUM ('BKASH', 'NAGAD', 'ROCKET', 'UPAY', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "payments"."PaymentStatus" AS ENUM ('INITIATED', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "payments"."GatewayTransactionKind" AS ENUM ('INITIATE', 'VERIFY', 'RETURN', 'IPN', 'REFUND');

-- CreateEnum
CREATE TYPE "payments"."RefundStatus" AS ENUM ('REQUESTED', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "payments"."RefundRequester" AS ENUM ('SYSTEM', 'ADMIN');

-- CreateEnum
CREATE TYPE "payments"."EarningKind" AS ENUM ('EARNING', 'REFUND_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "payments"."PayoutMethod" AS ENUM ('BKASH', 'NAGAD', 'BANK');

-- CreateEnum
CREATE TYPE "payments"."PayoutStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "payments"."Payment" (
    "id" UUID NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "payerUserId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "purpose" "payments"."PaymentPurpose" NOT NULL,
    "referenceId" UUID NOT NULL,
    "providerId" UUID,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BDT',
    "gateway" "payments"."PaymentGatewayName" NOT NULL,
    "method" "payments"."PaymentMethod",
    "status" "payments"."PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "gatewayPaymentId" TEXT,
    "gatewayTrxId" TEXT,
    "checkoutUrl" TEXT,
    "checkoutExpiresAt" TIMESTAMPTZ(3),
    "paidAt" TIMESTAMPTZ(3),
    "failureReason" TEXT,
    "refundedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments"."GatewayTransaction" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "kind" "payments"."GatewayTransactionKind" NOT NULL,
    "gatewayPaymentId" TEXT,
    "gatewayTrxId" TEXT,
    "status" TEXT,
    "rawRequest" JSONB,
    "rawResponse" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GatewayTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments"."Refund" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "payments"."RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedBy" "payments"."RefundRequester" NOT NULL,
    "gatewayRefundId" TEXT,
    "failureReason" TEXT,
    "processedByUserId" UUID,
    "processedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments"."ProviderEarning" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "refundId" UUID,
    "kind" "payments"."EarningKind" NOT NULL,
    "gross" DECIMAL(10,2) NOT NULL,
    "platformFee" DECIMAL(10,2) NOT NULL,
    "net" DECIMAL(10,2) NOT NULL,
    "payoutId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderEarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments"."Payout" (
    "id" UUID NOT NULL,
    "payoutNo" TEXT NOT NULL,
    "providerId" UUID NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" "payments"."PayoutMethod" NOT NULL,
    "accountMasked" TEXT NOT NULL,
    "status" "payments"."PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "createdByUserId" UUID NOT NULL,
    "paidByUserId" UUID,
    "paidAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments"."ProviderPayoutAccount" (
    "providerId" UUID NOT NULL,
    "method" "payments"."PayoutMethod" NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumberEnc" BYTEA NOT NULL,
    "accountNumberLast4" TEXT NOT NULL,
    "bankName" TEXT,
    "branchName" TEXT,
    "routingNumber" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProviderPayoutAccount_pkey" PRIMARY KEY ("providerId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payment_invoiceNo_key" ON "payments"."Payment"("invoiceNo");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_gatewayPaymentId_key" ON "payments"."Payment"("gatewayPaymentId");

-- CreateIndex
CREATE INDEX "Payment_payerUserId_createdAt_idx" ON "payments"."Payment"("payerUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Payment_patientId_createdAt_idx" ON "payments"."Payment"("patientId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Payment_purpose_referenceId_idx" ON "payments"."Payment"("purpose", "referenceId");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "payments"."Payment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "GatewayTransaction_paymentId_createdAt_idx" ON "payments"."GatewayTransaction"("paymentId", "createdAt");

-- CreateIndex
CREATE INDEX "Refund_status_createdAt_idx" ON "payments"."Refund"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderEarning_refundId_key" ON "payments"."ProviderEarning"("refundId");

-- CreateIndex
CREATE INDEX "ProviderEarning_providerId_payoutId_createdAt_idx" ON "payments"."ProviderEarning"("providerId", "payoutId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payout_payoutNo_key" ON "payments"."Payout"("payoutNo");

-- CreateIndex
CREATE INDEX "Payout_providerId_createdAt_idx" ON "payments"."Payout"("providerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Payout_status_createdAt_idx" ON "payments"."Payout"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "payments"."GatewayTransaction" ADD CONSTRAINT "GatewayTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"."Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments"."Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"."Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments"."ProviderEarning" ADD CONSTRAINT "ProviderEarning_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"."Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments"."ProviderEarning" ADD CONSTRAINT "ProviderEarning_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "payments"."Refund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments"."ProviderEarning" ADD CONSTRAINT "ProviderEarning_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "payments"."Payout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written rules (Prisma cannot express these).
-- ---------------------------------------------------------------------------

-- One live payment per thing paid for (CLAUDE.md §4 "Payment link").
CREATE UNIQUE INDEX "Payment_active_reference_key"
  ON "payments"."Payment" ("purpose", "referenceId")
  WHERE "status" IN ('INITIATED', 'SUCCESS');

ALTER TABLE "payments"."Payment" ADD CONSTRAINT "Payment_invoiceNo_format_check"
  CHECK ("invoiceNo" ~ '^PY-[0-9]{4}-[0-9]{4,}$');
ALTER TABLE "payments"."Payment" ADD CONSTRAINT "Payment_amount_check"
  CHECK ("amount" > 0 AND "refundedAmount" >= 0 AND "refundedAmount" <= "amount");
ALTER TABLE "payments"."Payment" ADD CONSTRAINT "Payment_currency_check"
  CHECK ("currency" = 'BDT');
ALTER TABLE "payments"."Payment" ADD CONSTRAINT "Payment_paid_check"
  CHECK (("status" IN ('SUCCESS', 'REFUNDED', 'PARTIALLY_REFUNDED')) = ("paidAt" IS NOT NULL));

ALTER TABLE "payments"."Refund" ADD CONSTRAINT "Refund_amount_check" CHECK ("amount" > 0);
ALTER TABLE "payments"."Refund" ADD CONSTRAINT "Refund_processed_check"
  CHECK (("status" = 'PROCESSED') = ("processedAt" IS NOT NULL));

-- Earnings: one EARNING per payment, one adjustment per refund; signs match the kind.
CREATE UNIQUE INDEX "ProviderEarning_payment_earning_key"
  ON "payments"."ProviderEarning" ("paymentId") WHERE "kind" = 'EARNING';
ALTER TABLE "payments"."ProviderEarning" ADD CONSTRAINT "ProviderEarning_kind_check"
  CHECK (
    ("kind" = 'EARNING' AND "refundId" IS NULL AND "gross" > 0 AND "platformFee" >= 0 AND "net" >= 0)
    OR ("kind" = 'REFUND_ADJUSTMENT' AND "refundId" IS NOT NULL AND "gross" < 0 AND "platformFee" <= 0 AND "net" <= 0)
  );
ALTER TABLE "payments"."ProviderEarning" ADD CONSTRAINT "ProviderEarning_net_check"
  CHECK ("net" = "gross" - "platformFee");

ALTER TABLE "payments"."Payout" ADD CONSTRAINT "Payout_payoutNo_format_check"
  CHECK ("payoutNo" ~ '^PO-[0-9]{4}-[0-9]{4,}$');
ALTER TABLE "payments"."Payout" ADD CONSTRAINT "Payout_period_check"
  CHECK ("periodEnd" >= "periodStart" AND "amount" > 0);
ALTER TABLE "payments"."Payout" ADD CONSTRAINT "Payout_paid_check"
  CHECK (("status" = 'PAID') = ("paidAt" IS NOT NULL AND "reference" IS NOT NULL));

ALTER TABLE "payments"."ProviderPayoutAccount" ADD CONSTRAINT "ProviderPayoutAccount_bank_check"
  CHECK ("method" <> 'BANK' OR ("bankName" IS NOT NULL AND "branchName" IS NOT NULL));

-- Payment and payout references share the readable-ID counter.
ALTER TABLE "core"."ReadableIdCounter" DROP CONSTRAINT "ReadableIdCounter_kind_check";
ALTER TABLE "core"."ReadableIdCounter" ADD CONSTRAINT "ReadableIdCounter_kind_check"
  CHECK ("kind" IN ('PATIENT', 'DOCTOR', 'NUTRITIONIST', 'PHYSIO', 'MODERATOR', 'ADMIN', 'BOOKING', 'PAYMENT', 'PAYOUT'));
