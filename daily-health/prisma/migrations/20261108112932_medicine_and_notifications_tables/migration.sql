-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "medicine";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "notifications";

-- CreateEnum
CREATE TYPE "medicine"."MedicineForm" AS ENUM ('TABLET', 'CAPSULE', 'SYRUP', 'SUSPENSION', 'DROPS', 'INJECTION', 'INSULIN', 'INHALER', 'CREAM', 'OINTMENT', 'GEL', 'SUPPOSITORY', 'POWDER', 'OTHER');

-- CreateEnum
CREATE TYPE "medicine"."MealTiming" AS ENUM ('BEFORE_MEAL', 'AFTER_MEAL', 'WITH_MEAL', 'ANY');

-- CreateEnum
CREATE TYPE "medicine"."DoseStatus" AS ENUM ('PENDING', 'TAKEN', 'MISSED', 'SKIPPED', 'SNOOZED');

-- CreateEnum
CREATE TYPE "medicine"."DoseSource" AS ENUM ('APP', 'SMS', 'CAREGIVER');

-- CreateEnum
CREATE TYPE "notifications"."ReminderKind" AS ENUM ('DOSE_BACKUP', 'FOLLOW_UP', 'APPOINTMENT', 'REFILL', 'PERIOD');

-- CreateEnum
CREATE TYPE "notifications"."ReminderStatus" AS ENUM ('SCHEDULED', 'SENT', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "notifications"."NotificationChannel" AS ENUM ('PUSH', 'SMS', 'IN_APP');

-- CreateEnum
CREATE TYPE "notifications"."NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "medicine"."Medicine" (
    "id" UUID NOT NULL,
    "brandName" TEXT NOT NULL,
    "genericName" TEXT NOT NULL,
    "strength" TEXT NOT NULL,
    "form" "medicine"."MedicineForm" NOT NULL,
    "manufacturer" TEXT,
    "unitPrice" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Medicine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicine"."MedicationPlan" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "medicineId" UUID,
    "prescriptionItemId" UUID,
    "displayName" TEXT NOT NULL,
    "doseUnit" TEXT NOT NULL,
    "mealTiming" "medicine"."MealTiming" NOT NULL DEFAULT 'ANY',
    "mealOffsetMin" SMALLINT,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "stockQty" DECIMAL(8,2),
    "refillAlertDays" SMALLINT NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "stoppedAt" TIMESTAMPTZ(3),
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MedicationPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicine"."MedicationTime" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "timeOfDay" TIME(0) NOT NULL,
    "dose" DECIMAL(5,2) NOT NULL,
    "daysMask" SMALLINT NOT NULL DEFAULT 127,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MedicationTime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicine"."DoseLog" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "medicationTimeId" UUID,
    "scheduledFor" TIMESTAMPTZ(3) NOT NULL,
    "dose" DECIMAL(5,2) NOT NULL,
    "status" "medicine"."DoseStatus" NOT NULL DEFAULT 'PENDING',
    "actedAt" TIMESTAMPTZ(3),
    "actedByUserId" UUID,
    "snoozedUntil" TIMESTAMPTZ(3),
    "source" "medicine"."DoseSource",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DoseLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications"."NotificationPreference" (
    "userId" UUID NOT NULL,
    "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "alarmEnabled" BOOLEAN NOT NULL DEFAULT true,
    "doseBackupDelayMin" SMALLINT NOT NULL DEFAULT 30,
    "followUpOffsetsMin" JSONB NOT NULL DEFAULT '[1440, 120]',
    "quietStart" TIME(0),
    "quietEnd" TIME(0),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "notifications"."ScheduledReminder" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "patientId" UUID,
    "kind" "notifications"."ReminderKind" NOT NULL,
    "refId" UUID NOT NULL,
    "fireAt" TIMESTAMPTZ(3) NOT NULL,
    "channels" "notifications"."NotificationChannel"[],
    "status" "notifications"."ReminderStatus" NOT NULL DEFAULT 'SCHEDULED',
    "jobId" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ScheduledReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications"."Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "patientId" UUID,
    "reminderId" UUID,
    "channel" "notifications"."NotificationChannel" NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "status" "notifications"."NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "failureReason" TEXT,
    "providerMsgId" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Medicine_brandName_strength_form_key" ON "medicine"."Medicine"("brandName", "strength", "form");

-- CreateIndex
CREATE INDEX "MedicationPlan_patientId_isActive_idx" ON "medicine"."MedicationPlan"("patientId", "isActive");

-- CreateIndex
CREATE INDEX "MedicationTime_planId_idx" ON "medicine"."MedicationTime"("planId");

-- CreateIndex
CREATE INDEX "DoseLog_status_scheduledFor_idx" ON "medicine"."DoseLog"("status", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "DoseLog_planId_scheduledFor_key" ON "medicine"."DoseLog"("planId", "scheduledFor");

-- CreateIndex
CREATE INDEX "ScheduledReminder_kind_refId_idx" ON "notifications"."ScheduledReminder"("kind", "refId");

-- CreateIndex
CREATE INDEX "ScheduledReminder_patientId_status_idx" ON "notifications"."ScheduledReminder"("patientId", "status");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "notifications"."Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_userId_channel_createdAt_idx" ON "notifications"."Notification"("userId", "channel", "createdAt");

-- AddForeignKey
ALTER TABLE "medicine"."MedicationPlan" ADD CONSTRAINT "MedicationPlan_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "medicine"."Medicine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine"."MedicationTime" ADD CONSTRAINT "MedicationTime_planId_fkey" FOREIGN KEY ("planId") REFERENCES "medicine"."MedicationPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine"."DoseLog" ADD CONSTRAINT "DoseLog_planId_fkey" FOREIGN KEY ("planId") REFERENCES "medicine"."MedicationPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medicine"."DoseLog" ADD CONSTRAINT "DoseLog_medicationTimeId_fkey" FOREIGN KEY ("medicationTimeId") REFERENCES "medicine"."MedicationTime"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications"."Notification" ADD CONSTRAINT "Notification_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "notifications"."ScheduledReminder"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Raw SQL that Prisma cannot express (keep in sync with medicine.prisma / notifications.prisma)
-- ---------------------------------------------------------------------------

-- Fuzzy medicine search ("napa", "sergl", "paracetamol") with pg_trgm (installed in public).
CREATE INDEX "Medicine_brandName_trgm_idx" ON "medicine"."Medicine" USING gin ("brandName" public.gin_trgm_ops);
CREATE INDEX "Medicine_genericName_trgm_idx" ON "medicine"."Medicine" USING gin ("genericName" public.gin_trgm_ops);

ALTER TABLE "medicine"."MedicationPlan" ADD CONSTRAINT "MedicationPlan_stockQty_check" CHECK ("stockQty" IS NULL OR "stockQty" >= 0);
ALTER TABLE "medicine"."MedicationPlan" ADD CONSTRAINT "MedicationPlan_refillAlertDays_check" CHECK ("refillAlertDays" BETWEEN 0 AND 60);
ALTER TABLE "medicine"."MedicationPlan" ADD CONSTRAINT "MedicationPlan_dates_check" CHECK ("endDate" IS NULL OR "endDate" >= "startDate");
ALTER TABLE "medicine"."MedicationPlan" ADD CONSTRAINT "MedicationPlan_stopped_check" CHECK ("isActive" = ("stoppedAt" IS NULL));
ALTER TABLE "medicine"."MedicationPlan" ADD CONSTRAINT "MedicationPlan_mealOffsetMin_check" CHECK ("mealOffsetMin" IS NULL OR "mealOffsetMin" BETWEEN 0 AND 240);

-- Half tablets are fine, zero is not. Bit 0 = Sunday … bit 6 = Saturday, at least one day.
ALTER TABLE "medicine"."MedicationTime" ADD CONSTRAINT "MedicationTime_dose_check" CHECK ("dose" > 0);
ALTER TABLE "medicine"."MedicationTime" ADD CONSTRAINT "MedicationTime_daysMask_check" CHECK ("daysMask" BETWEEN 1 AND 127);
ALTER TABLE "medicine"."DoseLog" ADD CONSTRAINT "DoseLog_dose_check" CHECK ("dose" > 0);

-- A snooze needs its end time; acted states need when and by whom.
ALTER TABLE "medicine"."DoseLog" ADD CONSTRAINT "DoseLog_snooze_check" CHECK ("status" <> 'SNOOZED' OR "snoozedUntil" IS NOT NULL);

ALTER TABLE "notifications"."NotificationPreference" ADD CONSTRAINT "NotificationPreference_doseBackupDelayMin_check"
  CHECK ("doseBackupDelayMin" BETWEEN 10 AND 240);

-- At most one waiting reminder per thing (one backup per dose, one refill alert per plan).
CREATE UNIQUE INDEX "ScheduledReminder_one_scheduled_per_ref"
  ON "notifications"."ScheduledReminder" ("kind", "refId")
  WHERE "status" = 'SCHEDULED';