-- DropIndex
DROP INDEX "shop"."Product_genericName_trgm_idx";

-- DropIndex
DROP INDEX "shop"."Product_name_trgm_idx";

-- CreateTable
CREATE TABLE "admin"."AppSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "primaryColor" TEXT NOT NULL DEFAULT '#0f5c5a',
    "updatedByUserId" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."AppSettingChange" (
    "id" UUID NOT NULL,
    "fromColor" TEXT NOT NULL,
    "toColor" TEXT NOT NULL,
    "changedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppSettingChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppSettingChange_createdAt_idx" ON "admin"."AppSettingChange"("createdAt" DESC);

-- One settings row, a valid colour.
ALTER TABLE "admin"."AppSetting" ADD CONSTRAINT "AppSetting_single_row" CHECK ("id" = 1);
ALTER TABLE "admin"."AppSetting" ADD CONSTRAINT "AppSetting_primaryColor_check" CHECK ("primaryColor" ~ '^#[0-9a-f]{6}$');
ALTER TABLE "admin"."AppSettingChange" ADD CONSTRAINT "AppSettingChange_colors_check"
  CHECK ("fromColor" ~ '^#[0-9a-f]{6}$' AND "toColor" ~ '^#[0-9a-f]{6}$');
INSERT INTO "admin"."AppSetting" ("id", "primaryColor", "updatedAt") VALUES (1, '#0f5c5a', now());
