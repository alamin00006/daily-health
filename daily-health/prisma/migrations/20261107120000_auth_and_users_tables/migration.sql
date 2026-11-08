-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "auth";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "users";

-- CreateEnum
CREATE TYPE "auth"."UserRole" AS ENUM ('PATIENT', 'DOCTOR', 'NUTRITIONIST', 'PHYSIO', 'MODERATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "auth"."UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "auth"."OtpChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "auth"."OtpPurpose" AS ENUM ('SIGNUP', 'LOGIN', 'RESET_PIN');

-- CreateEnum
CREATE TYPE "auth"."DevicePlatform" AS ENUM ('ANDROID', 'IOS', 'WEB');

-- CreateEnum
CREATE TYPE "users"."Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "users"."BloodGroup" AS ENUM ('A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG');

-- CreateEnum
CREATE TYPE "users"."ProfileRole" AS ENUM ('OWNER', 'CAREGIVER', 'VIEWER');

-- CreateEnum
CREATE TYPE "users"."ProfileRelation" AS ENUM ('SELF', 'FATHER', 'MOTHER', 'CHILD', 'SPOUSE', 'OTHER');

-- CreateEnum
CREATE TYPE "users"."ProfileInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'REVOKED', 'EXPIRED');

-- CreateTable
CREATE TABLE "auth"."User" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "phone" TEXT,
    "pinHash" TEXT,
    "role" "auth"."UserRole" NOT NULL DEFAULT 'PATIENT',
    "status" "auth"."UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "isGuest" BOOLEAN NOT NULL DEFAULT false,
    "failedPinAttempts" INTEGER NOT NULL DEFAULT 0,
    "pinLockedUntil" TIMESTAMPTZ(3),
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."OtpCode" (
    "id" UUID NOT NULL,
    "channel" "auth"."OtpChannel" NOT NULL,
    "destination" TEXT NOT NULL,
    "purpose" "auth"."OtpPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."Device" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "installationId" TEXT NOT NULL,
    "platform" "auth"."DevicePlatform" NOT NULL,
    "pushToken" TEXT,
    "appVersion" TEXT,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth"."Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "deviceId" UUID NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "lastUsedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users"."PatientProfile" (
    "id" UUID NOT NULL,
    "linkedUserId" UUID,
    "fullName" TEXT NOT NULL,
    "gender" "users"."Gender" NOT NULL,
    "dateOfBirth" DATE,
    "bloodGroup" "users"."BloodGroup",
    "heightCm" DECIMAL(5,1),
    "district" TEXT,
    "avatarStorageKey" TEXT,
    "createdByUserId" UUID NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PatientProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users"."ProfileMember" (
    "profileId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "users"."ProfileRole" NOT NULL,
    "relation" "users"."ProfileRelation" NOT NULL,
    "receivesAlerts" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProfileMember_pkey" PRIMARY KEY ("profileId","userId")
);

-- CreateTable
CREATE TABLE "users"."ProfileInvite" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "invitedEmail" TEXT NOT NULL,
    "role" "users"."ProfileRole" NOT NULL,
    "relation" "users"."ProfileRelation" NOT NULL,
    "invitedByUserId" UUID NOT NULL,
    "status" "users"."ProfileInviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "respondedAt" TIMESTAMPTZ(3),
    "acceptedByUserId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ProfileInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "auth"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "auth"."User"("phone");

-- CreateIndex
CREATE INDEX "OtpCode_destination_purpose_createdAt_idx" ON "auth"."OtpCode"("destination", "purpose", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Device_userId_installationId_key" ON "auth"."Device"("userId", "installationId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "auth"."Session"("userId");

-- CreateIndex
CREATE INDEX "Session_deviceId_idx" ON "auth"."Session"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "PatientProfile_linkedUserId_key" ON "users"."PatientProfile"("linkedUserId");

-- CreateIndex
CREATE INDEX "ProfileMember_userId_idx" ON "users"."ProfileMember"("userId");

-- CreateIndex
CREATE INDEX "ProfileInvite_profileId_idx" ON "users"."ProfileInvite"("profileId");

-- CreateIndex
CREATE INDEX "ProfileInvite_invitedEmail_status_idx" ON "users"."ProfileInvite"("invitedEmail", "status");

-- AddForeignKey
ALTER TABLE "auth"."Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth"."Session" ADD CONSTRAINT "Session_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "auth"."Device"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users"."ProfileMember" ADD CONSTRAINT "ProfileMember_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "users"."PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users"."ProfileInvite" ADD CONSTRAINT "ProfileInvite_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "users"."PatientProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Raw SQL that Prisma cannot express (keep in sync with auth.prisma / users.prisma)
-- ---------------------------------------------------------------------------

-- A guest has no email, phone or PIN. A registered account has a PIN and at
-- least one login identifier (email now, phone after SMS OTP launches).
ALTER TABLE "auth"."User" ADD CONSTRAINT "User_guest_or_registered_check" CHECK (
  ("isGuest" AND "email" IS NULL AND "phone" IS NULL AND "pinHash" IS NULL)
  OR (NOT "isGuest" AND "pinHash" IS NOT NULL AND ("email" IS NOT NULL OR "phone" IS NOT NULL))
);

-- Emails are stored lowercased so the unique index is case-insensitive in practice.
ALTER TABLE "auth"."User" ADD CONSTRAINT "User_email_lowercase_check" CHECK ("email" = lower("email"));
ALTER TABLE "users"."ProfileInvite" ADD CONSTRAINT "ProfileInvite_invitedEmail_lowercase_check" CHECK ("invitedEmail" = lower("invitedEmail"));

ALTER TABLE "auth"."OtpCode" ADD CONSTRAINT "OtpCode_attempts_check" CHECK ("attempts" >= 0);
ALTER TABLE "auth"."User" ADD CONSTRAINT "User_failedPinAttempts_check" CHECK ("failedPinAttempts" >= 0);

-- At most one open invite per person per profile.
CREATE UNIQUE INDEX "ProfileInvite_one_pending_per_email"
  ON "users"."ProfileInvite" ("profileId", "invitedEmail")
  WHERE "status" = 'PENDING';
