-- CreateEnum
CREATE TYPE "payments"."CouponDiscountType" AS ENUM ('PERCENT', 'FLAT');

-- CreateEnum
CREATE TYPE "payments"."CouponClaimSource" AS ENUM ('SIGNUP');

-- AlterTable
ALTER TABLE "auth"."User" ADD COLUMN     "fullName" TEXT;

-- CreateTable
CREATE TABLE "payments"."Coupon" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "discountType" "payments"."CouponDiscountType" NOT NULL,
    "discountValue" DECIMAL(10,2) NOT NULL,
    "maxDiscount" DECIMAL(10,2),
    "minAmount" DECIMAL(10,2),
    "appliesTo" "payments"."PaymentPurpose"[],
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "maxClaims" INTEGER,
    "claimCount" INTEGER NOT NULL DEFAULT 0,
    "usesPerClaim" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments"."CouponClaim" (
    "id" UUID NOT NULL,
    "couponId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "source" "payments"."CouponClaimSource" NOT NULL,
    "usesLeft" INTEGER NOT NULL,
    "claimedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CouponClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_code_key" ON "payments"."Coupon"("code");

-- CreateIndex
CREATE INDEX "Coupon_createdAt_idx" ON "payments"."Coupon"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "CouponClaim_userId_claimedAt_idx" ON "payments"."CouponClaim"("userId", "claimedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "CouponClaim_couponId_userId_key" ON "payments"."CouponClaim"("couponId", "userId");

-- AddForeignKey
ALTER TABLE "payments"."CouponClaim" ADD CONSTRAINT "CouponClaim_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "payments"."Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Hand-written checks (CLAUDE.md §4: data rules live in the DB too).
ALTER TABLE "auth"."User" ADD CONSTRAINT "User_fullName_length"
  CHECK ("fullName" IS NULL OR char_length("fullName") BETWEEN 2 AND 80);

ALTER TABLE "payments"."Coupon" ADD CONSTRAINT "Coupon_code_format"
  CHECK ("code" ~ '^[A-Z0-9-]{3,32}$');
ALTER TABLE "payments"."Coupon" ADD CONSTRAINT "Coupon_discount_valid"
  CHECK ("discountValue" > 0 AND ("discountType" <> 'PERCENT' OR "discountValue" <= 100));
ALTER TABLE "payments"."Coupon" ADD CONSTRAINT "Coupon_amounts_positive"
  CHECK (("maxDiscount" IS NULL OR "maxDiscount" > 0) AND ("minAmount" IS NULL OR "minAmount" >= 0));
ALTER TABLE "payments"."Coupon" ADD CONSTRAINT "Coupon_dates_ordered"
  CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "startsAt" < "endsAt");
ALTER TABLE "payments"."Coupon" ADD CONSTRAINT "Coupon_claims_within_limit"
  CHECK ("claimCount" >= 0 AND ("maxClaims" IS NULL OR ("maxClaims" > 0 AND "claimCount" <= "maxClaims")));
ALTER TABLE "payments"."Coupon" ADD CONSTRAINT "Coupon_uses_positive"
  CHECK ("usesPerClaim" > 0);

ALTER TABLE "payments"."CouponClaim" ADD CONSTRAINT "CouponClaim_uses_left_valid"
  CHECK ("usesLeft" >= 0);
