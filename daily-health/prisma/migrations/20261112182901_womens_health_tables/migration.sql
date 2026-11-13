-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "womens_health";

-- CreateEnum
CREATE TYPE "womens_health"."PregnancyStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateTable
CREATE TABLE "womens_health"."CycleSettings" (
    "patientId" UUID NOT NULL,
    "avgCycleDays" SMALLINT NOT NULL DEFAULT 28,
    "avgPeriodDays" SMALLINT NOT NULL DEFAULT 5,
    "goal" BYTEA,
    "appLockEnabled" BOOLEAN NOT NULL DEFAULT false,
    "remindersOn" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CycleSettings_pkey" PRIMARY KEY ("patientId")
);

-- CreateTable
CREATE TABLE "womens_health"."PeriodCycle" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" BYTEA,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PeriodCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "womens_health"."DailyLog" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "flow" BYTEA,
    "mood" BYTEA,
    "symptoms" BYTEA,
    "note" BYTEA,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DailyLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "womens_health"."PregnancyTracking" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "providerId" UUID,
    "lmpDate" BYTEA NOT NULL,
    "dueDate" BYTEA NOT NULL,
    "status" "womens_health"."PregnancyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PregnancyTracking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PeriodCycle_patientId_startDate_key" ON "womens_health"."PeriodCycle"("patientId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyLog_patientId_date_key" ON "womens_health"."DailyLog"("patientId", "date");

-- CreateIndex
CREATE INDEX "PregnancyTracking_patientId_status_idx" ON "womens_health"."PregnancyTracking"("patientId", "status");

-- Sane cycle settings (the contract validates the same range).
ALTER TABLE "womens_health"."CycleSettings"
  ADD CONSTRAINT "CycleSettings_avgCycleDays_check" CHECK ("avgCycleDays" BETWEEN 15 AND 60),
  ADD CONSTRAINT "CycleSettings_avgPeriodDays_check" CHECK ("avgPeriodDays" BETWEEN 1 AND 15);

-- At most one active pregnancy per patient.
CREATE UNIQUE INDEX "PregnancyTracking_one_active_per_patient"
  ON "womens_health"."PregnancyTracking"("patientId") WHERE "status" = 'ACTIVE';
