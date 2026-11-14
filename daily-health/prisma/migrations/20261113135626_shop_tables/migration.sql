-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "shop";

-- CreateEnum
CREATE TYPE "shop"."CategoryBadge" AS ENUM ('TRENDING', 'MUST_HAVE', 'POPULAR', 'FEATURED', 'BEST_SELLER');

-- CreateEnum
CREATE TYPE "shop"."OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PLACED', 'CONFIRMED', 'DISPATCHED', 'DELIVERED', 'CANCELLED', 'EXPIRED', 'RETURNED');

-- CreateEnum
CREATE TYPE "shop"."OrderPaymentMethod" AS ENUM ('ONLINE', 'CASH_ON_DELIVERY');

-- CreateEnum
CREATE TYPE "shop"."PrescriptionCheck" AS ENUM ('NOT_NEEDED', 'AWAITING_PRESCRIPTION', 'PENDING_REVIEW', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "shop"."StockMovementReason" AS ENUM ('RESTOCK', 'ORDER', 'ORDER_RELEASED', 'RETURNED', 'ADJUSTMENT', 'DAMAGED', 'EXPIRED_STOCK');

-- CreateEnum
CREATE TYPE "shop"."BannerLinkType" AS ENUM ('NONE', 'CATEGORY', 'PRODUCT', 'BRAND', 'URL');

-- AlterEnum
ALTER TYPE "payments"."PaymentPurpose" ADD VALUE 'ORDER';

-- CreateTable
CREATE TABLE "shop"."ShopSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "cashOnDeliveryEnabled" BOOLEAN NOT NULL DEFAULT true,
    "minOrderAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "freeDeliveryFrom" DECIMAL(10,2),
    "paymentHoldMinutes" INTEGER NOT NULL DEFAULT 15,
    "updatedByUserId" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ShopSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop"."ShopSettingChange" (
    "id" UUID NOT NULL,
    "changes" JSONB NOT NULL,
    "changedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopSettingChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop"."ProductCategory" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "badge" "shop"."CategoryBadge",
    "imageStorageKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "showOnHome" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop"."Brand" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoStorageKey" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop"."Product" (
    "id" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "genericName" TEXT,
    "strength" TEXT,
    "dosageForm" TEXT,
    "packSize" TEXT,
    "manufacturer" TEXT,
    "description" TEXT,
    "categoryId" UUID NOT NULL,
    "brandId" UUID,
    "mrp" DECIMAL(10,2) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "stockQty" INTEGER NOT NULL DEFAULT 0,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
    "maxPerOrder" INTEGER NOT NULL DEFAULT 10,
    "requiresPrescription" BOOLEAN NOT NULL DEFAULT false,
    "isTrending" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "imageStorageKey" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop"."StockMovement" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "change" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" "shop"."StockMovementReason" NOT NULL,
    "orderId" UUID,
    "note" TEXT,
    "byUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop"."CartItem" (
    "userId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "qty" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("userId","productId")
);

-- CreateTable
CREATE TABLE "shop"."DeliveryZone" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "charge" DECIMAL(10,2) NOT NULL,
    "estimate" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop"."DeliveryAddress" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "label" TEXT,
    "recipientName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "zoneId" UUID NOT NULL,
    "area" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DeliveryAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop"."Order" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "status" "shop"."OrderStatus" NOT NULL,
    "paymentMethod" "shop"."OrderPaymentMethod" NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "deliveryCharge" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "savings" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "recipientName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "zoneName" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "note" TEXT,
    "holdExpiresAt" TIMESTAMPTZ(3),
    "prescriptionCheck" "shop"."PrescriptionCheck" NOT NULL,
    "prescriptionId" UUID,
    "prescriptionStorageKey" TEXT,
    "prescriptionReviewNote" TEXT,
    "prescriptionReviewedBy" UUID,
    "cancelReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop"."OrderItem" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "packSize" TEXT,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "mrp" DECIMAL(10,2) NOT NULL,
    "qty" INTEGER NOT NULL,
    "lineTotal" DECIMAL(10,2) NOT NULL,
    "requiresPrescription" BOOLEAN NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop"."OrderEvent" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "status" "shop"."OrderStatus" NOT NULL,
    "note" TEXT,
    "byUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop"."ShopBanner" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "imageStorageKey" TEXT,
    "linkType" "shop"."BannerLinkType" NOT NULL DEFAULT 'NONE',
    "linkValue" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ShopBanner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shop"."DiscountPartner" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "offerText" TEXT NOT NULL,
    "description" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "logoStorageKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DiscountPartner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopSettingChange_createdAt_idx" ON "shop"."ShopSettingChange"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_slug_key" ON "shop"."ProductCategory"("slug");

-- CreateIndex
CREATE INDEX "ProductCategory_isActive_sortOrder_idx" ON "shop"."ProductCategory"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_slug_key" ON "shop"."Brand"("slug");

-- CreateIndex
CREATE INDEX "Brand_isActive_isFeatured_sortOrder_idx" ON "shop"."Brand"("isActive", "isFeatured", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_key" ON "shop"."Product"("sku");

-- CreateIndex
CREATE INDEX "Product_categoryId_isActive_idx" ON "shop"."Product"("categoryId", "isActive");

-- CreateIndex
CREATE INDEX "Product_brandId_isActive_idx" ON "shop"."Product"("brandId", "isActive");

-- CreateIndex
CREATE INDEX "Product_isActive_isTrending_idx" ON "shop"."Product"("isActive", "isTrending");

-- CreateIndex
CREATE INDEX "StockMovement_productId_createdAt_idx" ON "shop"."StockMovement"("productId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "DeliveryAddress_userId_idx" ON "shop"."DeliveryAddress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_code_key" ON "shop"."Order"("code");

-- CreateIndex
CREATE INDEX "Order_userId_createdAt_idx" ON "shop"."Order"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Order_status_createdAt_idx" ON "shop"."Order"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_prescriptionCheck_idx" ON "shop"."Order"("prescriptionCheck");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_orderId_productId_key" ON "shop"."OrderItem"("orderId", "productId");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "shop"."OrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "ShopBanner_isActive_sortOrder_idx" ON "shop"."ShopBanner"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "DiscountPartner_isActive_sortOrder_idx" ON "shop"."DiscountPartner"("isActive", "sortOrder");

-- AddForeignKey
ALTER TABLE "shop"."Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "shop"."ProductCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop"."Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "shop"."Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop"."StockMovement" ADD CONSTRAINT "StockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "shop"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop"."StockMovement" ADD CONSTRAINT "StockMovement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "shop"."Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop"."CartItem" ADD CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "shop"."Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop"."DeliveryAddress" ADD CONSTRAINT "DeliveryAddress_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "shop"."DeliveryZone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop"."OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "shop"."Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop"."OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "shop"."Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shop"."OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "shop"."Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written rules
-- ---------------------------------------------------------------------------

-- New counter kind for order codes (OD-2611-0042).
ALTER TABLE "core"."ReadableIdCounter" DROP CONSTRAINT "ReadableIdCounter_kind_check";
ALTER TABLE "core"."ReadableIdCounter" ADD CONSTRAINT "ReadableIdCounter_kind_check"
  CHECK ("kind" IN ('PATIENT', 'DOCTOR', 'NUTRITIONIST', 'PHYSIO', 'MODERATOR', 'ADMIN', 'BOOKING', 'PAYMENT', 'PAYOUT', 'PRESCRIPTION', 'EMERGENCY', 'ORDER'));

-- One settings row.
ALTER TABLE "shop"."ShopSetting" ADD CONSTRAINT "ShopSetting_single_row" CHECK ("id" = 1);
ALTER TABLE "shop"."ShopSetting" ADD CONSTRAINT "ShopSetting_amounts_check"
  CHECK ("minOrderAmount" >= 0 AND ("freeDeliveryFrom" IS NULL OR "freeDeliveryFrom" >= 0)
         AND "paymentHoldMinutes" BETWEEN 5 AND 60);
INSERT INTO "shop"."ShopSetting" ("id", "enabled", "updatedAt") VALUES (1, false, now());

-- Catalog.
ALTER TABLE "shop"."ProductCategory" ADD CONSTRAINT "ProductCategory_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "shop"."Brand" ADD CONSTRAINT "Brand_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "shop"."Product" ADD CONSTRAINT "Product_price_check" CHECK ("price" > 0 AND "mrp" > 0 AND "price" <= "mrp");
ALTER TABLE "shop"."Product" ADD CONSTRAINT "Product_stock_check"
  CHECK ("stockQty" >= 0 AND "lowStockThreshold" >= 0 AND "maxPerOrder" BETWEEN 1 AND 100);
ALTER TABLE "shop"."Product" ADD CONSTRAINT "Product_sku_check" CHECK ("sku" ~ '^[A-Z0-9][A-Z0-9-]{1,39}$');

-- Fuzzy product search ("napa", "paracetamol", "ডায়াপার") with pg_trgm (installed in public).
CREATE INDEX "Product_name_trgm_idx" ON "shop"."Product" USING gin ("name" public.gin_trgm_ops);
CREATE INDEX "Product_genericName_trgm_idx" ON "shop"."Product" USING gin ("genericName" public.gin_trgm_ops);

-- Inventory ledger and cart.
ALTER TABLE "shop"."StockMovement" ADD CONSTRAINT "StockMovement_change_check" CHECK ("change" <> 0 AND "balanceAfter" >= 0);
ALTER TABLE "shop"."CartItem" ADD CONSTRAINT "CartItem_qty_check" CHECK ("qty" BETWEEN 1 AND 100);

-- Delivery.
ALTER TABLE "shop"."DeliveryZone" ADD CONSTRAINT "DeliveryZone_charge_check" CHECK ("charge" >= 0);
ALTER TABLE "shop"."DeliveryAddress" ADD CONSTRAINT "DeliveryAddress_phone_check" CHECK ("phone" ~ '^\+8801[3-9][0-9]{8}$');
-- At most one default address per buyer.
CREATE UNIQUE INDEX "DeliveryAddress_one_default_per_user" ON "shop"."DeliveryAddress" ("userId") WHERE "isDefault";
ALTER TABLE "shop"."DiscountPartner" ADD CONSTRAINT "DiscountPartner_phone_check" CHECK ("phone" IS NULL OR "phone" ~ '^\+8801[3-9][0-9]{8}$');

-- Orders.
ALTER TABLE "shop"."Order" ADD CONSTRAINT "Order_code_check" CHECK ("code" ~ '^OD-[0-9]{4}-[0-9]{4,}$');
ALTER TABLE "shop"."Order" ADD CONSTRAINT "Order_phone_check" CHECK ("phone" ~ '^\+8801[3-9][0-9]{8}$');
ALTER TABLE "shop"."Order" ADD CONSTRAINT "Order_amounts_check"
  CHECK ("subtotal" > 0 AND "deliveryCharge" >= 0 AND "total" = "subtotal" + "deliveryCharge" AND "savings" >= 0);
-- Only an unpaid online order holds stock with a deadline.
ALTER TABLE "shop"."Order" ADD CONSTRAINT "Order_hold_check"
  CHECK (("status" = 'PENDING_PAYMENT') = ("holdExpiresAt" IS NOT NULL));
ALTER TABLE "shop"."Order" ADD CONSTRAINT "Order_pending_payment_is_online"
  CHECK ("status" <> 'PENDING_PAYMENT' OR "paymentMethod" = 'ONLINE');
-- Cash orders are never marked paid online.
ALTER TABLE "shop"."Order" ADD CONSTRAINT "Order_paid_is_online" CHECK (NOT "isPaid" OR "paymentMethod" = 'ONLINE');
-- A prescription-only order cannot move past PLACED until the prescription is approved.
ALTER TABLE "shop"."Order" ADD CONSTRAINT "Order_prescription_before_confirm"
  CHECK ("status" NOT IN ('CONFIRMED', 'DISPATCHED', 'DELIVERED', 'RETURNED')
         OR "prescriptionCheck" IN ('NOT_NEEDED', 'APPROVED'));
ALTER TABLE "shop"."OrderItem" ADD CONSTRAINT "OrderItem_amounts_check"
  CHECK ("qty" BETWEEN 1 AND 100 AND "unitPrice" > 0 AND "unitPrice" <= "mrp" AND "lineTotal" = "unitPrice" * "qty");
