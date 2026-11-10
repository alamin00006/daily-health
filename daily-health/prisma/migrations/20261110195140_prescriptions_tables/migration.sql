-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "prescriptions";

-- CreateEnum
CREATE TYPE "prescriptions"."PrescriptionStatus" AS ENUM ('DRAFT', 'ISSUED', 'REVOKED');

-- CreateEnum
CREATE TYPE "prescriptions"."RxMedicineForm" AS ENUM ('TABLET', 'CAPSULE', 'SYRUP', 'SUSPENSION', 'DROPS', 'INJECTION', 'INSULIN', 'INHALER', 'CREAM', 'OINTMENT', 'GEL', 'SUPPOSITORY', 'POWDER', 'OTHER');

-- CreateEnum
CREATE TYPE "prescriptions"."RxDoseUnit" AS ENUM ('TABLET', 'CAPSULE', 'ML', 'SPOON', 'DROP', 'PUFF', 'UNIT', 'SACHET', 'APPLICATION');

-- CreateEnum
CREATE TYPE "prescriptions"."RxMealTiming" AS ENUM ('BEFORE_MEAL', 'AFTER_MEAL', 'WITH_MEAL', 'ANY');

-- CreateTable
CREATE TABLE "prescriptions"."Prescription" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "patientId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "providerUserId" UUID NOT NULL,
    "appointmentId" UUID,
    "consultationId" UUID,
    "chiefComplaint" BYTEA,
    "diagnosis" BYTEA,
    "advice" BYTEA,
    "followUpAfterDays" SMALLINT,
    "pdfStorageKey" TEXT,
    "status" "prescriptions"."PrescriptionStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "revokeReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Prescription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions"."PrescriptionItem" (
    "id" UUID NOT NULL,
    "prescriptionId" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "medicineId" UUID,
    "medicineName" TEXT NOT NULL,
    "strength" TEXT,
    "form" "prescriptions"."RxMedicineForm" NOT NULL,
    "doseUnit" "prescriptions"."RxDoseUnit" NOT NULL,
    "dosePattern" TEXT NOT NULL,
    "mealTiming" "prescriptions"."RxMealTiming" NOT NULL DEFAULT 'AFTER_MEAL',
    "durationDays" SMALLINT,
    "instruction" TEXT,

    CONSTRAINT "PrescriptionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions"."PrescribedTest" (
    "id" UUID NOT NULL,
    "prescriptionId" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "testName" TEXT NOT NULL,
    "note" TEXT,
    "resultFileId" UUID,

    CONSTRAINT "PrescribedTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Prescription_code_key" ON "prescriptions"."Prescription"("code");

-- CreateIndex
CREATE INDEX "Prescription_patientId_issuedAt_idx" ON "prescriptions"."Prescription"("patientId", "issuedAt");

-- CreateIndex
CREATE INDEX "Prescription_providerId_createdAt_idx" ON "prescriptions"."Prescription"("providerId", "createdAt");

-- CreateIndex
CREATE INDEX "Prescription_appointmentId_idx" ON "prescriptions"."Prescription"("appointmentId");

-- CreateIndex
CREATE INDEX "Prescription_consultationId_idx" ON "prescriptions"."Prescription"("consultationId");

-- CreateIndex
CREATE INDEX "PrescriptionItem_prescriptionId_idx" ON "prescriptions"."PrescriptionItem"("prescriptionId");

-- CreateIndex
CREATE INDEX "PrescribedTest_prescriptionId_idx" ON "prescriptions"."PrescribedTest"("prescriptionId");

-- AddForeignKey
ALTER TABLE "prescriptions"."PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"."Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions"."PrescribedTest" ADD CONSTRAINT "PrescribedTest_prescriptionId_fkey" FOREIGN KEY ("prescriptionId") REFERENCES "prescriptions"."Prescription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written rules (erd.md → "ডিজিটাল প্রেসক্রিপশন")
-- ---------------------------------------------------------------------------

ALTER TABLE "prescriptions"."Prescription"
  ADD CONSTRAINT "Prescription_code_format_check" CHECK ("code" ~ '^RX-[0-9]{4}-[0-9]{4,}$'),
  -- Written for exactly one visit or one consultation.
  ADD CONSTRAINT "Prescription_source_check" CHECK (("appointmentId" IS NULL) <> ("consultationId" IS NULL)),
  ADD CONSTRAINT "Prescription_issued_check" CHECK ("status" = 'DRAFT' OR "issuedAt" IS NOT NULL),
  ADD CONSTRAINT "Prescription_revoked_check" CHECK (("status" = 'REVOKED') = ("revokedAt" IS NOT NULL)),
  ADD CONSTRAINT "Prescription_follow_up_check" CHECK ("followUpAfterDays" IS NULL OR "followUpAfterDays" BETWEEN 1 AND 365);

-- One open (draft or issued) prescription per visit / consultation.
CREATE UNIQUE INDEX "Prescription_one_open_per_appointment"
  ON "prescriptions"."Prescription" ("appointmentId") WHERE "status" <> 'REVOKED' AND "appointmentId" IS NOT NULL;
CREATE UNIQUE INDEX "Prescription_one_open_per_consultation"
  ON "prescriptions"."Prescription" ("consultationId") WHERE "status" <> 'REVOKED' AND "consultationId" IS NOT NULL;

ALTER TABLE "prescriptions"."PrescriptionItem"
  ADD CONSTRAINT "PrescriptionItem_duration_check" CHECK ("durationDays" IS NULL OR "durationDays" BETWEEN 1 AND 365);

-- Readable references now include prescriptions (RX-…).
ALTER TABLE "core"."ReadableIdCounter" DROP CONSTRAINT "ReadableIdCounter_kind_check";
ALTER TABLE "core"."ReadableIdCounter" ADD CONSTRAINT "ReadableIdCounter_kind_check"
  CHECK ("kind" IN ('PATIENT', 'DOCTOR', 'NUTRITIONIST', 'PHYSIO', 'MODERATOR', 'ADMIN', 'BOOKING', 'PAYMENT', 'PAYOUT', 'PRESCRIPTION'));
