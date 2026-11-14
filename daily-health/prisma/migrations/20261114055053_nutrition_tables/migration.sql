-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "nutrition";

-- CreateEnum
CREATE TYPE "nutrition"."MealType" AS ENUM ('BREAKFAST', 'LUNCH', 'SNACKS', 'DINNER');

-- CreateEnum
CREATE TYPE "nutrition"."DietPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED');

-- DropIndex
DROP INDEX "community"."Post_title_trgm_idx";

-- CreateTable
CREATE TABLE "nutrition"."DietPlan" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "calorieTargetKcal" INTEGER NOT NULL,
    "waterTargetMl" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "status" "nutrition"."DietPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DietPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition"."DietPlanMeal" (
    "id" UUID NOT NULL,
    "dietPlanId" UUID NOT NULL,
    "mealType" "nutrition"."MealType" NOT NULL,
    "time" TIME(0) NOT NULL,
    "description" TEXT NOT NULL,
    "approxKcal" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DietPlanMeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition"."IntakeLog" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "dietPlanId" UUID,
    "date" DATE NOT NULL,
    "caloriesKcal" INTEGER NOT NULL DEFAULT 0,
    "waterMl" INTEGER NOT NULL DEFAULT 0,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "IntakeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition"."MealCheck" (
    "id" UUID NOT NULL,
    "intakeLogId" UUID NOT NULL,
    "mealId" UUID NOT NULL,
    "followed" BOOLEAN NOT NULL,
    "note" TEXT,

    CONSTRAINT "MealCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DietPlan_appointmentId_key" ON "nutrition"."DietPlan"("appointmentId");

-- CreateIndex
CREATE INDEX "DietPlan_patientId_status_idx" ON "nutrition"."DietPlan"("patientId", "status");

-- CreateIndex
CREATE INDEX "DietPlan_providerId_createdAt_idx" ON "nutrition"."DietPlan"("providerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "DietPlanMeal_dietPlanId_sortOrder_idx" ON "nutrition"."DietPlanMeal"("dietPlanId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "IntakeLog_patientId_date_key" ON "nutrition"."IntakeLog"("patientId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "MealCheck_intakeLogId_mealId_key" ON "nutrition"."MealCheck"("intakeLogId", "mealId");

-- AddForeignKey
ALTER TABLE "nutrition"."DietPlanMeal" ADD CONSTRAINT "DietPlanMeal_dietPlanId_fkey" FOREIGN KEY ("dietPlanId") REFERENCES "nutrition"."DietPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition"."IntakeLog" ADD CONSTRAINT "IntakeLog_dietPlanId_fkey" FOREIGN KEY ("dietPlanId") REFERENCES "nutrition"."DietPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition"."MealCheck" ADD CONSTRAINT "MealCheck_intakeLogId_fkey" FOREIGN KEY ("intakeLogId") REFERENCES "nutrition"."IntakeLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition"."MealCheck" ADD CONSTRAINT "MealCheck_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "nutrition"."DietPlanMeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written rules
-- ---------------------------------------------------------------------------
-- One plan in effect per patient.
CREATE UNIQUE INDEX "DietPlan_one_active_per_patient" ON "nutrition"."DietPlan" ("patientId") WHERE "status" = 'ACTIVE';
ALTER TABLE "nutrition"."DietPlan" ADD CONSTRAINT "DietPlan_targets_check"
  CHECK ("calorieTargetKcal" BETWEEN 500 AND 6000 AND "waterTargetMl" BETWEEN 500 AND 8000);
ALTER TABLE "nutrition"."DietPlan" ADD CONSTRAINT "DietPlan_dates_check" CHECK ("endDate" IS NULL OR "endDate" >= "startDate");
ALTER TABLE "nutrition"."DietPlan" ADD CONSTRAINT "DietPlan_published_check" CHECK ("status" = 'DRAFT' OR "publishedAt" IS NOT NULL);
ALTER TABLE "nutrition"."DietPlanMeal" ADD CONSTRAINT "DietPlanMeal_kcal_check" CHECK ("approxKcal" IS NULL OR "approxKcal" BETWEEN 0 AND 5000);
ALTER TABLE "nutrition"."IntakeLog" ADD CONSTRAINT "IntakeLog_amounts_check"
  CHECK ("caloriesKcal" BETWEEN 0 AND 20000 AND "waterMl" BETWEEN 0 AND 10000);
