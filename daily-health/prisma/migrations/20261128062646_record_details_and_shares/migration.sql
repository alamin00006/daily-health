-- AlterTable
ALTER TABLE "records"."MedicalFile" ADD COLUMN     "consultantName" BYTEA,
ADD COLUMN     "institute" BYTEA,
ADD COLUMN     "note" BYTEA,
ADD COLUMN     "purpose" BYTEA,
ADD COLUMN     "testCode" TEXT;

-- CreateTable
CREATE TABLE "records"."RecordShare" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "grantedByUserId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "RecordShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecordShare_patientId_createdAt_idx" ON "records"."RecordShare"("patientId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "RecordShare_providerId_expiresAt_idx" ON "records"."RecordShare"("providerId", "expiresAt");

-- CreateIndex
CREATE INDEX "MedicalFile_patientId_testCode_reportDate_idx" ON "records"."MedicalFile"("patientId", "testCode", "reportDate");

-- Hand-written: one live share per patient and doctor; renewing extends it.
CREATE UNIQUE INDEX "RecordShare_one_live_per_provider"
  ON "records"."RecordShare"("patientId", "providerId") WHERE "revokedAt" IS NULL;
ALTER TABLE "records"."RecordShare" ADD CONSTRAINT "RecordShare_expires_after_created"
  CHECK ("expiresAt" > "createdAt");
-- Test codes come from the app's catalog: uppercase letters, digits, "_".
ALTER TABLE "records"."MedicalFile" ADD CONSTRAINT "MedicalFile_testCode_format"
  CHECK ("testCode" IS NULL OR "testCode" ~ '^[A-Z0-9_]{2,40}$');
