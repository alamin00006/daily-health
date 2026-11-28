-- CreateEnum
CREATE TYPE "payments"."CouponRedemptionStatus" AS ENUM ('RESERVED', 'USED', 'RELEASED');

-- AlterTable
ALTER TABLE "payments"."Payment" ADD COLUMN     "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "listAmount" DECIMAL(10,2);

-- Payments made before coupons: the price was what was charged.
UPDATE "payments"."Payment" SET "listAmount" = "amount";
ALTER TABLE "payments"."Payment" ALTER COLUMN "listAmount" SET NOT NULL;

-- CreateTable
CREATE TABLE "payments"."CouponRedemption" (
    "id" UUID NOT NULL,
    "claimId" UUID NOT NULL,
    "couponId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "discountAmount" DECIMAL(10,2) NOT NULL,
    "status" "payments"."CouponRedemptionStatus" NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CouponRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CouponRedemption_paymentId_key" ON "payments"."CouponRedemption"("paymentId");

-- CreateIndex
CREATE INDEX "CouponRedemption_claimId_idx" ON "payments"."CouponRedemption"("claimId");

-- CreateIndex
CREATE INDEX "CouponRedemption_couponId_status_idx" ON "payments"."CouponRedemption"("couponId", "status");

-- AddForeignKey
ALTER TABLE "payments"."CouponRedemption" ADD CONSTRAINT "CouponRedemption_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "payments"."CouponClaim"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments"."CouponRedemption" ADD CONSTRAINT "CouponRedemption_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "payments"."Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments"."CouponRedemption" ADD CONSTRAINT "CouponRedemption_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"."Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written checks.
ALTER TABLE "payments"."Payment" ADD CONSTRAINT "Payment_discount_valid"
  CHECK ("discountAmount" >= 0 AND "amount" = "listAmount" - "discountAmount" AND "amount" > 0);
ALTER TABLE "payments"."CouponRedemption" ADD CONSTRAINT "CouponRedemption_discount_positive"
  CHECK ("discountAmount" > 0);
