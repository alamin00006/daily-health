-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "appointments";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "providers";

-- CreateEnum
CREATE TYPE "appointments"."AppointmentMode" AS ENUM ('IN_PERSON', 'VIDEO', 'CHAT', 'HOME_VISIT');

-- CreateEnum
CREATE TYPE "appointments"."AppointmentKind" AS ENUM ('NEW', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "appointments"."AppointmentStatus" AS ENUM ('PENDING_PAYMENT', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'EXPIRED');

-- CreateEnum
CREATE TYPE "appointments"."AppointmentActor" AS ENUM ('PATIENT', 'PROVIDER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "appointments"."FollowUpMode" AS ENUM ('IN_PERSON', 'VIDEO', 'HOME_VISIT');

-- CreateEnum
CREATE TYPE "appointments"."FollowUpStatus" AS ENUM ('UPCOMING', 'DONE', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "providers"."ProviderType" AS ENUM ('DOCTOR', 'NUTRITIONIST', 'PHYSIO');

-- CreateEnum
CREATE TYPE "providers"."ProviderGender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "providers"."ProviderVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "providers"."ConsultationMode" AS ENUM ('IN_PERSON', 'VIDEO', 'CHAT', 'HOME_VISIT');

-- CreateEnum
CREATE TYPE "providers"."VerificationDocType" AS ENUM ('BMDC_CERT', 'NID', 'DEGREE', 'OTHER');

-- CreateEnum
CREATE TYPE "providers"."VerificationDocStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "providers"."ReviewStatus" AS ENUM ('VISIBLE', 'HIDDEN');

-- CreateTable
CREATE TABLE "appointments"."Appointment" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "patientId" UUID NOT NULL,
    "bookedByUserId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "chamberId" UUID,
    "scheduleId" UUID NOT NULL,
    "mode" "appointments"."AppointmentMode" NOT NULL,
    "kind" "appointments"."AppointmentKind" NOT NULL DEFAULT 'NEW',
    "parentAppointmentId" UUID,
    "sessionDate" DATE NOT NULL,
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
    "durationMin" SMALLINT NOT NULL,
    "serialNo" SMALLINT,
    "status" "appointments"."AppointmentStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "holdExpiresAt" TIMESTAMPTZ(3),
    "confirmedAt" TIMESTAMPTZ(3),
    "reason" TEXT,
    "homeAddress" TEXT,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "fee" DECIMAL(10,2) NOT NULL,
    "cancelledBy" "appointments"."AppointmentActor",
    "cancelReason" TEXT,
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments"."AppointmentStatusLog" (
    "id" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "fromStatus" "appointments"."AppointmentStatus",
    "toStatus" "appointments"."AppointmentStatus" NOT NULL,
    "changedByUserId" UUID,
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppointmentStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments"."FollowUpReminder" (
    "id" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "appointmentId" UUID,
    "providerId" UUID,
    "doctorName" TEXT NOT NULL,
    "location" TEXT,
    "mode" "appointments"."FollowUpMode" NOT NULL DEFAULT 'IN_PERSON',
    "dueAt" TIMESTAMPTZ(3) NOT NULL,
    "status" "appointments"."FollowUpStatus" NOT NULL DEFAULT 'UPCOMING',
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FollowUpReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers"."Provider" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "providerCode" TEXT NOT NULL,
    "type" "providers"."ProviderType" NOT NULL,
    "gender" "providers"."ProviderGender" NOT NULL,
    "displayName" TEXT NOT NULL,
    "designation" TEXT,
    "qualifications" TEXT NOT NULL,
    "bmdcNo" TEXT,
    "verificationStatus" "providers"."ProviderVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "verifiedAt" TIMESTAMPTZ(3),
    "verifiedByUserId" UUID,
    "experienceYears" SMALLINT NOT NULL DEFAULT 0,
    "bio" TEXT,
    "avatarStorageKey" TEXT,
    "videoFee" DECIMAL(10,2),
    "chatFee" DECIMAL(10,2),
    "homeVisitFee" DECIMAL(10,2),
    "acceptsQuickConsult" BOOLEAN NOT NULL DEFAULT false,
    "offersHomeVisit" BOOLEAN NOT NULL DEFAULT false,
    "ratingAvg" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "lastOnlineAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Provider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers"."Specialty" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "nameBn" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "iconName" TEXT NOT NULL,
    "forType" "providers"."ProviderType" NOT NULL DEFAULT 'DOCTOR',
    "sortOrder" SMALLINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Specialty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers"."ProviderSpecialty" (
    "providerId" UUID NOT NULL,
    "specialtyId" UUID NOT NULL,

    CONSTRAINT "ProviderSpecialty_pkey" PRIMARY KEY ("providerId","specialtyId")
);

-- CreateTable
CREATE TABLE "providers"."Hospital" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "lat" DECIMAL(9,6),
    "lng" DECIMAL(9,6),
    "phone" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Hospital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers"."Chamber" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "hospitalId" UUID NOT NULL,
    "room" TEXT,
    "fee" DECIMAL(10,2) NOT NULL,
    "followUpFee" DECIMAL(10,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Chamber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers"."Schedule" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "chamberId" UUID,
    "mode" "providers"."ConsultationMode" NOT NULL,
    "dayOfWeek" SMALLINT NOT NULL,
    "startTime" TIME(0) NOT NULL,
    "endTime" TIME(0) NOT NULL,
    "slotMinutes" SMALLINT,
    "maxPatients" SMALLINT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers"."ScheduleException" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "scheduleId" UUID,
    "date" DATE NOT NULL,
    "isOff" BOOLEAN NOT NULL DEFAULT true,
    "startTime" TIME(0),
    "endTime" TIME(0),
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ScheduleException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers"."VerificationDocument" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "docType" "providers"."VerificationDocType" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "status" "providers"."VerificationDocStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "VerificationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers"."Review" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "patientId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "appointmentId" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "comment" TEXT,
    "status" "providers"."ReviewStatus" NOT NULL DEFAULT 'VISIBLE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "providers"."FavoriteProvider" (
    "patientId" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FavoriteProvider_pkey" PRIMARY KEY ("patientId","providerId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_code_key" ON "appointments"."Appointment"("code");

-- CreateIndex
CREATE INDEX "Appointment_patientId_scheduledAt_idx" ON "appointments"."Appointment"("patientId", "scheduledAt" DESC);

-- CreateIndex
CREATE INDEX "Appointment_providerId_sessionDate_idx" ON "appointments"."Appointment"("providerId", "sessionDate");

-- CreateIndex
CREATE INDEX "Appointment_status_holdExpiresAt_idx" ON "appointments"."Appointment"("status", "holdExpiresAt");

-- CreateIndex
CREATE INDEX "AppointmentStatusLog_appointmentId_changedAt_idx" ON "appointments"."AppointmentStatusLog"("appointmentId", "changedAt");

-- CreateIndex
CREATE INDEX "FollowUpReminder_patientId_status_dueAt_idx" ON "appointments"."FollowUpReminder"("patientId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "Provider_userId_key" ON "providers"."Provider"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Provider_providerCode_key" ON "providers"."Provider"("providerCode");

-- CreateIndex
CREATE UNIQUE INDEX "Provider_bmdcNo_key" ON "providers"."Provider"("bmdcNo");

-- CreateIndex
CREATE INDEX "Provider_verificationStatus_type_idx" ON "providers"."Provider"("verificationStatus", "type");

-- CreateIndex
CREATE INDEX "Provider_displayName_trgm_idx" ON "providers"."Provider" USING GIN ("displayName" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "Specialty_slug_key" ON "providers"."Specialty"("slug");

-- CreateIndex
CREATE INDEX "ProviderSpecialty_specialtyId_idx" ON "providers"."ProviderSpecialty"("specialtyId");

-- CreateIndex
CREATE INDEX "Hospital_name_trgm_idx" ON "providers"."Hospital" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE UNIQUE INDEX "Hospital_name_district_key" ON "providers"."Hospital"("name", "district");

-- CreateIndex
CREATE INDEX "Chamber_providerId_idx" ON "providers"."Chamber"("providerId");

-- CreateIndex
CREATE INDEX "Schedule_providerId_dayOfWeek_idx" ON "providers"."Schedule"("providerId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "ScheduleException_providerId_date_idx" ON "providers"."ScheduleException"("providerId", "date");

-- CreateIndex
CREATE INDEX "VerificationDocument_providerId_idx" ON "providers"."VerificationDocument"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "Review_appointmentId_key" ON "providers"."Review"("appointmentId");

-- CreateIndex
CREATE INDEX "Review_providerId_status_createdAt_idx" ON "providers"."Review"("providerId", "status", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "appointments"."Appointment" ADD CONSTRAINT "Appointment_parentAppointmentId_fkey" FOREIGN KEY ("parentAppointmentId") REFERENCES "appointments"."Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments"."AppointmentStatusLog" ADD CONSTRAINT "AppointmentStatusLog_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"."Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments"."FollowUpReminder" ADD CONSTRAINT "FollowUpReminder_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"."Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "providers"."ProviderSpecialty" ADD CONSTRAINT "ProviderSpecialty_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"."Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "providers"."ProviderSpecialty" ADD CONSTRAINT "ProviderSpecialty_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "providers"."Specialty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "providers"."Chamber" ADD CONSTRAINT "Chamber_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"."Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "providers"."Chamber" ADD CONSTRAINT "Chamber_hospitalId_fkey" FOREIGN KEY ("hospitalId") REFERENCES "providers"."Hospital"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "providers"."Schedule" ADD CONSTRAINT "Schedule_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"."Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "providers"."Schedule" ADD CONSTRAINT "Schedule_chamberId_fkey" FOREIGN KEY ("chamberId") REFERENCES "providers"."Chamber"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "providers"."ScheduleException" ADD CONSTRAINT "ScheduleException_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"."Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "providers"."ScheduleException" ADD CONSTRAINT "ScheduleException_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "providers"."Schedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "providers"."VerificationDocument" ADD CONSTRAINT "VerificationDocument_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"."Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "providers"."Review" ADD CONSTRAINT "Review_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"."Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "providers"."FavoriteProvider" ADD CONSTRAINT "FavoriteProvider_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "providers"."Provider"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written rules (Prisma cannot express these).
-- ---------------------------------------------------------------------------

-- Readable IDs (shared-contracts/readable-id.contract.ts).
ALTER TABLE "providers"."Provider" ADD CONSTRAINT "Provider_providerCode_format_check"
  CHECK ("providerCode" ~ '^[DNT][A-Z]-[0-9]{4}-[0-9]{4,}$');
ALTER TABLE "appointments"."Appointment" ADD CONSTRAINT "Appointment_code_format_check"
  CHECK ("code" ~ '^BK-[0-9]{4}-[0-9]{4,}$');

-- Doctors must have a BMDC number ("A-12345" medical, "D-1234" dental); others must not.
ALTER TABLE "providers"."Provider" ADD CONSTRAINT "Provider_bmdcNo_check"
  CHECK (
    ("type" = 'DOCTOR' AND "bmdcNo" ~ '^[AD]-[0-9]{2,6}$')
    OR ("type" <> 'DOCTOR' AND "bmdcNo" IS NULL)
  );
ALTER TABLE "providers"."Provider" ADD CONSTRAINT "Provider_fees_check"
  CHECK (
    ("videoFee" IS NULL OR "videoFee" >= 0)
    AND ("chatFee" IS NULL OR "chatFee" >= 0)
    AND ("homeVisitFee" IS NULL OR "homeVisitFee" >= 0)
  );
ALTER TABLE "providers"."Provider" ADD CONSTRAINT "Provider_experienceYears_check"
  CHECK ("experienceYears" BETWEEN 0 AND 70);
ALTER TABLE "providers"."Provider" ADD CONSTRAINT "Provider_rating_check"
  CHECK ("ratingAvg" BETWEEN 0 AND 5 AND "ratingCount" >= 0);
-- Home visits need a fee.
ALTER TABLE "providers"."Provider" ADD CONSTRAINT "Provider_homeVisit_check"
  CHECK (NOT "offersHomeVisit" OR "homeVisitFee" IS NOT NULL);

ALTER TABLE "providers"."Chamber" ADD CONSTRAINT "Chamber_fee_check"
  CHECK ("fee" >= 0 AND ("followUpFee" IS NULL OR "followUpFee" >= 0));

-- IN_PERSON = serials at a chamber; the other modes = time slots, online (no chamber).
ALTER TABLE "providers"."Schedule" ADD CONSTRAINT "Schedule_mode_check"
  CHECK (
    ("mode" = 'IN_PERSON' AND "chamberId" IS NOT NULL AND "maxPatients" BETWEEN 1 AND 300 AND "slotMinutes" IS NULL)
    OR ("mode" <> 'IN_PERSON' AND "chamberId" IS NULL AND "slotMinutes" BETWEEN 5 AND 120 AND "maxPatients" IS NULL)
  );
ALTER TABLE "providers"."Schedule" ADD CONSTRAINT "Schedule_times_check"
  CHECK ("endTime" > "startTime" AND "dayOfWeek" BETWEEN 0 AND 6);

ALTER TABLE "providers"."ScheduleException" ADD CONSTRAINT "ScheduleException_hours_check"
  CHECK (
    ("isOff" AND "startTime" IS NULL AND "endTime" IS NULL)
    OR (NOT "isOff" AND "scheduleId" IS NOT NULL AND "endTime" > "startTime")
  );
-- One exception per schedule (or per whole day) and date.
CREATE UNIQUE INDEX "ScheduleException_providerId_scheduleId_date_key"
  ON "providers"."ScheduleException" ("providerId", COALESCE("scheduleId", '00000000-0000-0000-0000-000000000000'::uuid), "date");

ALTER TABLE "providers"."Review" ADD CONSTRAINT "Review_rating_check"
  CHECK ("rating" BETWEEN 1 AND 5);

-- Appointments.
ALTER TABLE "appointments"."Appointment" ADD CONSTRAINT "Appointment_mode_check"
  CHECK (
    ("mode" = 'IN_PERSON' AND "chamberId" IS NOT NULL AND "serialNo" >= 1)
    OR ("mode" <> 'IN_PERSON' AND "chamberId" IS NULL AND "serialNo" IS NULL)
  );
ALTER TABLE "appointments"."Appointment" ADD CONSTRAINT "Appointment_homeVisit_check"
  CHECK ("mode" <> 'HOME_VISIT' OR "homeAddress" IS NOT NULL);
ALTER TABLE "appointments"."Appointment" ADD CONSTRAINT "Appointment_hold_check"
  CHECK (("status" = 'PENDING_PAYMENT') = ("holdExpiresAt" IS NOT NULL));
ALTER TABLE "appointments"."Appointment" ADD CONSTRAINT "Appointment_cancel_check"
  CHECK (("status" = 'CANCELLED') = ("cancelledAt" IS NOT NULL AND "cancelledBy" IS NOT NULL));
ALTER TABLE "appointments"."Appointment" ADD CONSTRAINT "Appointment_fee_check"
  CHECK ("fee" >= 0 AND "durationMin" > 0);
ALTER TABLE "appointments"."Appointment" ADD CONSTRAINT "Appointment_followUp_check"
  CHECK (("kind" = 'FOLLOW_UP') = ("parentAppointmentId" IS NOT NULL));

-- Double booking (CLAUDE.md §4): one live booking per serial, and per provider time slot.
CREATE UNIQUE INDEX "Appointment_in_person_serial_key"
  ON "appointments"."Appointment" ("scheduleId", "sessionDate", "serialNo")
  WHERE "mode" = 'IN_PERSON' AND "status" NOT IN ('CANCELLED', 'EXPIRED');
CREATE UNIQUE INDEX "Appointment_time_slot_key"
  ON "appointments"."Appointment" ("providerId", "scheduledAt")
  WHERE "mode" <> 'IN_PERSON' AND "status" NOT IN ('CANCELLED', 'EXPIRED');
-- A patient holds at most one live booking per session (no booking two serials for one visit).
CREATE UNIQUE INDEX "Appointment_patient_session_key"
  ON "appointments"."Appointment" ("patientId", "scheduleId", "sessionDate")
  WHERE "status" NOT IN ('CANCELLED', 'EXPIRED');

ALTER TABLE "appointments"."FollowUpReminder" ADD CONSTRAINT "FollowUpReminder_link_check"
  CHECK ("appointmentId" IS NULL OR "providerId" IS NOT NULL);
