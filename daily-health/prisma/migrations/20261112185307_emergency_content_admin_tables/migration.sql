-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "admin";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "content";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "emergency";

-- CreateEnum
CREATE TYPE "content"."TipCategory" AS ENUM ('NUTRITION', 'WOMEN', 'CHILD', 'MENTAL', 'GENERAL');

-- CreateEnum
CREATE TYPE "content"."TipStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "emergency"."EmergencyType" AS ENUM ('SOS', 'AMBULANCE', 'DOCTOR_CALL');

-- CreateEnum
CREATE TYPE "emergency"."EmergencyStatus" AS ENUM ('OPEN', 'DISPATCHED', 'CLOSED', 'CANCELLED');

-- CreateTable
CREATE TABLE "admin"."AuditLog" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "patientId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "meta" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin"."StaffMember" (
    "userId" UUID NOT NULL,
    "staffCode" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "addedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StaffMember_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "content"."HealthTip" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "imageStorageKey" TEXT,
    "category" "content"."TipCategory" NOT NULL DEFAULT 'GENERAL',
    "authorProviderId" UUID,
    "status" "content"."TipStatus" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMPTZ(3),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HealthTip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency"."EmergencyContact" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "relation" TEXT,
    "notifyOnSos" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EmergencyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency"."EmergencyRequest" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "patientId" UUID NOT NULL,
    "requestedByUserId" UUID NOT NULL,
    "type" "emergency"."EmergencyType" NOT NULL,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "address" TEXT,
    "note" TEXT,
    "status" "emergency"."EmergencyStatus" NOT NULL DEFAULT 'OPEN',
    "handledByUserId" UUID,
    "handlerNote" TEXT,
    "membersAlerted" INTEGER NOT NULL DEFAULT 0,
    "contactsNotified" INTEGER NOT NULL DEFAULT 0,
    "contactsFailed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EmergencyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_patientId_createdAt_idx" ON "admin"."AuditLog"("patientId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "admin"."AuditLog"("actorUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "admin"."AuditLog"("createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "StaffMember_staffCode_key" ON "admin"."StaffMember"("staffCode");

-- CreateIndex
CREATE INDEX "HealthTip_status_publishedAt_idx" ON "content"."HealthTip"("status", "publishedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyContact_patientId_phone_key" ON "emergency"."EmergencyContact"("patientId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "EmergencyRequest_code_key" ON "emergency"."EmergencyRequest"("code");

-- CreateIndex
CREATE INDEX "EmergencyRequest_status_createdAt_idx" ON "emergency"."EmergencyRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EmergencyRequest_patientId_createdAt_idx" ON "emergency"."EmergencyRequest"("patientId", "createdAt");

-- ---------------------------------------------------------------------------
-- Hand-written rules
-- ---------------------------------------------------------------------------

-- New counter kind for emergency request codes (EM-2611-0007).
ALTER TABLE "core"."ReadableIdCounter" DROP CONSTRAINT "ReadableIdCounter_kind_check";
ALTER TABLE "core"."ReadableIdCounter" ADD CONSTRAINT "ReadableIdCounter_kind_check"
  CHECK ("kind" IN ('PATIENT', 'DOCTOR', 'NUTRITIONIST', 'PHYSIO', 'MODERATOR', 'ADMIN', 'BOOKING', 'PAYMENT', 'PAYOUT', 'PRESCRIPTION', 'EMERGENCY'));

-- Emergency contacts: Bangladeshi E.164 numbers only.
ALTER TABLE "emergency"."EmergencyContact"
  ADD CONSTRAINT "EmergencyContact_phone_format_check" CHECK ("phone" ~ '^\+8801[3-9][0-9]{8}$');

-- Emergency requests.
ALTER TABLE "emergency"."EmergencyRequest"
  ADD CONSTRAINT "EmergencyRequest_code_format_check" CHECK ("code" ~ '^EM-[0-9]{4}-[0-9]{4,}$'),
  ADD CONSTRAINT "EmergencyRequest_location_pair_check" CHECK (("lat" IS NULL) = ("lng" IS NULL));
-- One live request per patient: pressing SOS again returns the open one.
CREATE UNIQUE INDEX "EmergencyRequest_one_live_per_patient"
  ON "emergency"."EmergencyRequest"("patientId") WHERE "status" IN ('OPEN', 'DISPATCHED');

-- Health tips: a published tip has its publish time.
ALTER TABLE "content"."HealthTip"
  ADD CONSTRAINT "HealthTip_published_at_check" CHECK ("status" <> 'PUBLISHED' OR "publishedAt" IS NOT NULL);

-- Staff codes: M (moderator) or A (admin) + initial + YYMM + serial.
ALTER TABLE "admin"."StaffMember"
  ADD CONSTRAINT "StaffMember_staffCode_format_check" CHECK ("staffCode" ~ '^[MA][A-Z]-[0-9]{4}-[0-9]{4,}$');
