-- CreateEnum
CREATE TYPE "admin"."LegalPageSlug" AS ENUM ('TERMS', 'PRIVACY');

-- AlterTable
ALTER TABLE "admin"."AppSetting" ADD COLUMN     "supportHotline" TEXT,
ADD COLUMN     "supportWhatsApp" TEXT;

-- CreateTable
CREATE TABLE "admin"."LegalPage" (
    "slug" "admin"."LegalPageSlug" NOT NULL,
    "body" TEXT NOT NULL,
    "updatedByUserId" UUID NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "LegalPage_pkey" PRIMARY KEY ("slug")
);
