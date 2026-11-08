-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "health";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "records";

-- CreateEnum
CREATE TYPE "health"."VitalType" AS ENUM ('BP', 'GLUCOSE', 'WEIGHT', 'PULSE', 'TEMP', 'SPO2');

-- CreateEnum
CREATE TYPE "health"."VitalContext" AS ENUM ('FASTING', 'AFTER_MEAL', 'RANDOM');

-- CreateEnum
CREATE TYPE "health"."VitalStatus" AS ENUM ('NORMAL', 'CONTROLLED', 'HIGH', 'LOW');

-- CreateEnum
CREATE TYPE "health"."ConditionKind" AS ENUM ('CHRONIC', 'ALLERGY', 'SURGERY');

-- CreateEnum
CREATE TYPE "records"."MedicalFileType" AS ENUM ('LAB_REPORT', 'PRESCRIPTION_SCAN', 'IMAGING', 'OTHER');

-- CreateTable
CREATE TABLE "health"."VitalReading" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "type" "health"."VitalType" NOT NULL,
    "systolic" SMALLINT,
    "diastolic" SMALLINT,
    "value" DECIMAL(6,2),
    "unit" TEXT NOT NULL,
    "context" "health"."VitalContext",
    "status" "health"."VitalStatus",
    "note" BYTEA,
    "recordedByUserId" UUID NOT NULL,
    "measuredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "VitalReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health"."MedicalCondition" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "name" BYTEA NOT NULL,
    "kind" "health"."ConditionKind" NOT NULL,
    "since" DATE,
    "note" BYTEA,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MedicalCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health"."HealthCard" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "qrToken" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HealthCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health"."HealthCardAccess" (
    "id" UUID NOT NULL,
    "healthCardId" UUID NOT NULL,
    "viewerUserId" UUID,
    "ip" TEXT,
    "accessedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HealthCardAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "records"."MedicalFile" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "type" "records"."MedicalFileType" NOT NULL,
    "title" BYTEA NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "reportDate" DATE,
    "uploadedByUserId" UUID NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MedicalFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "records"."MedicalFileShare" (
    "id" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "appointmentId" UUID,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MedicalFileShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VitalReading_patientId_type_measuredAt_idx" ON "health"."VitalReading"("patientId", "type", "measuredAt");

-- CreateIndex
CREATE INDEX "VitalReading_patientId_measuredAt_idx" ON "health"."VitalReading"("patientId", "measuredAt");

-- CreateIndex
CREATE INDEX "MedicalCondition_patientId_kind_idx" ON "health"."MedicalCondition"("patientId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "HealthCard_patientId_key" ON "health"."HealthCard"("patientId");

-- CreateIndex
CREATE UNIQUE INDEX "HealthCard_qrToken_key" ON "health"."HealthCard"("qrToken");

-- CreateIndex
CREATE INDEX "HealthCardAccess_healthCardId_accessedAt_idx" ON "health"."HealthCardAccess"("healthCardId", "accessedAt");

-- CreateIndex
CREATE INDEX "MedicalFile_patientId_createdAt_idx" ON "records"."MedicalFile"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "MedicalFileShare_fileId_idx" ON "records"."MedicalFileShare"("fileId");

-- CreateIndex
CREATE INDEX "MedicalFileShare_providerId_expiresAt_idx" ON "records"."MedicalFileShare"("providerId", "expiresAt");

-- AddForeignKey
ALTER TABLE "health"."HealthCardAccess" ADD CONSTRAINT "HealthCardAccess_healthCardId_fkey" FOREIGN KEY ("healthCardId") REFERENCES "health"."HealthCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "records"."MedicalFileShare" ADD CONSTRAINT "MedicalFileShare_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "records"."MedicalFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Raw SQL that Prisma cannot express (keep in sync with health.prisma / records.prisma)
-- ---------------------------------------------------------------------------

-- BP is systolic/diastolic only; every other vital is a single value.
ALTER TABLE "health"."VitalReading" ADD CONSTRAINT "VitalReading_shape_check" CHECK (
  ("type" = 'BP' AND "systolic" IS NOT NULL AND "diastolic" IS NOT NULL AND "value" IS NULL
     AND "systolic" > "diastolic")
  OR ("type" <> 'BP' AND "systolic" IS NULL AND "diastolic" IS NULL AND "value" IS NOT NULL
     AND "value" > 0)
);

-- Fasting / after meal / random only makes sense for glucose.
ALTER TABLE "health"."VitalReading" ADD CONSTRAINT "VitalReading_context_check" CHECK (
  ("type" = 'GLUCOSE' AND "context" IS NOT NULL) OR ("type" <> 'GLUCOSE' AND "context" IS NULL)
);

ALTER TABLE "records"."MedicalFile" ADD CONSTRAINT "MedicalFile_sizeBytes_check" CHECK ("sizeBytes" > 0);
ALTER TABLE "records"."MedicalFile" ADD CONSTRAINT "MedicalFile_mimeType_check"
  CHECK ("mimeType" IN ('image/webp', 'application/pdf'));