-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "chat";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "consultation";

-- CreateEnum
CREATE TYPE "chat"."ConversationType" AS ENUM ('CONSULTATION', 'SUPPORT', 'CARE_TEAM');

-- CreateEnum
CREATE TYPE "chat"."ChatParticipantRole" AS ENUM ('PATIENT', 'PROVIDER', 'AGENT', 'CAREGIVER');

-- CreateEnum
CREATE TYPE "chat"."MessageType" AS ENUM ('TEXT', 'IMAGE', 'FILE', 'SYSTEM', 'PRESCRIPTION');

-- CreateEnum
CREATE TYPE "consultation"."ConsultChannel" AS ENUM ('VIDEO', 'AUDIO', 'CHAT');

-- CreateEnum
CREATE TYPE "consultation"."ConsultTier" AS ENUM ('QUICK', 'STANDARD');

-- CreateEnum
CREATE TYPE "consultation"."ConsultStatus" AS ENUM ('PENDING_PAYMENT', 'WAITING', 'ONGOING', 'ENDED', 'MISSED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "consultation"."QuickConsultKind" AS ENUM ('GENERAL', 'WOMENS_HEALTH');

-- CreateEnum
CREATE TYPE "consultation"."ConsultActor" AS ENUM ('PATIENT', 'PROVIDER', 'SYSTEM');

-- CreateEnum
CREATE TYPE "consultation"."RequiredProviderGender" AS ENUM ('MALE', 'FEMALE');

-- CreateEnum
CREATE TYPE "consultation"."QueueEntryStatus" AS ENUM ('WAITING', 'ASSIGNED', 'EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "chat"."Conversation" (
    "id" UUID NOT NULL,
    "type" "chat"."ConversationType" NOT NULL,
    "consultationId" UUID,
    "patientId" UUID,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "closedAt" TIMESTAMPTZ(3),
    "lastMessageAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat"."ConversationParticipant" (
    "conversationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "chat"."ChatParticipantRole" NOT NULL,
    "lastReadAt" TIMESTAMPTZ(3),
    "muted" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("conversationId","userId")
);

-- CreateTable
CREATE TABLE "chat"."Message" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "senderId" UUID,
    "type" "chat"."MessageType" NOT NULL,
    "body" BYTEA,
    "attachmentStorageKey" BYTEA,
    "attachmentMimeType" TEXT,
    "refId" UUID,
    "clientMsgId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultation"."Consultation" (
    "id" UUID NOT NULL,
    "appointmentId" UUID,
    "patientId" UUID NOT NULL,
    "requestedByUserId" UUID NOT NULL,
    "providerId" UUID,
    "providerUserId" UUID,
    "channel" "consultation"."ConsultChannel" NOT NULL,
    "tier" "consultation"."ConsultTier" NOT NULL,
    "quickKind" "consultation"."QuickConsultKind",
    "status" "consultation"."ConsultStatus" NOT NULL,
    "fee" DECIMAL(10,2) NOT NULL,
    "holdExpiresAt" TIMESTAMPTZ(3),
    "waitingUntil" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "rtcChannel" TEXT,
    "callActive" BOOLEAN NOT NULL DEFAULT false,
    "ringingAt" TIMESTAMPTZ(3),
    "startedAt" TIMESTAMPTZ(3),
    "endedAt" TIMESTAMPTZ(3),
    "durationSec" INTEGER,
    "endedBy" "consultation"."ConsultActor",
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultation"."ConsultQueueEntry" (
    "id" UUID NOT NULL,
    "consultationId" UUID NOT NULL,
    "specialtyId" UUID,
    "requiredProviderGender" "consultation"."RequiredProviderGender",
    "status" "consultation"."QueueEntryStatus" NOT NULL DEFAULT 'WAITING',
    "enqueuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ConsultQueueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultation"."QuickConsultSetting" (
    "kind" "consultation"."QuickConsultKind" NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "maxWaitMin" SMALLINT NOT NULL,
    "sessionMin" SMALLINT NOT NULL,
    "updatedByUserId" UUID,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuickConsultSetting_pkey" PRIMARY KEY ("kind")
);

-- CreateTable
CREATE TABLE "consultation"."QuickConsultSettingChange" (
    "id" UUID NOT NULL,
    "kind" "consultation"."QuickConsultKind" NOT NULL,
    "oldPrice" DECIMAL(10,2) NOT NULL,
    "newPrice" DECIMAL(10,2) NOT NULL,
    "oldEnabled" BOOLEAN NOT NULL,
    "newEnabled" BOOLEAN NOT NULL,
    "oldMaxWaitMin" SMALLINT NOT NULL,
    "newMaxWaitMin" SMALLINT NOT NULL,
    "oldSessionMin" SMALLINT NOT NULL,
    "newSessionMin" SMALLINT NOT NULL,
    "changedByUserId" UUID NOT NULL,
    "changedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuickConsultSettingChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_consultationId_key" ON "chat"."Conversation"("consultationId");

-- CreateIndex
CREATE INDEX "ConversationParticipant_userId_idx" ON "chat"."ConversationParticipant"("userId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "chat"."Message"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Message_conversationId_clientMsgId_key" ON "chat"."Message"("conversationId", "clientMsgId");

-- CreateIndex
CREATE UNIQUE INDEX "Consultation_appointmentId_key" ON "consultation"."Consultation"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Consultation_rtcChannel_key" ON "consultation"."Consultation"("rtcChannel");

-- CreateIndex
CREATE INDEX "Consultation_requestedByUserId_createdAt_idx" ON "consultation"."Consultation"("requestedByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Consultation_providerId_status_idx" ON "consultation"."Consultation"("providerId", "status");

-- CreateIndex
CREATE INDEX "Consultation_status_waitingUntil_idx" ON "consultation"."Consultation"("status", "waitingUntil");

-- CreateIndex
CREATE UNIQUE INDEX "ConsultQueueEntry_consultationId_key" ON "consultation"."ConsultQueueEntry"("consultationId");

-- CreateIndex
CREATE INDEX "ConsultQueueEntry_status_enqueuedAt_idx" ON "consultation"."ConsultQueueEntry"("status", "enqueuedAt");

-- CreateIndex
CREATE INDEX "QuickConsultSettingChange_changedAt_idx" ON "consultation"."QuickConsultSettingChange"("changedAt");

-- AddForeignKey
ALTER TABLE "chat"."ConversationParticipant" ADD CONSTRAINT "ConversationParticipant_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat"."Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat"."Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "chat"."Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultation"."ConsultQueueEntry" ADD CONSTRAINT "ConsultQueueEntry_consultationId_fkey" FOREIGN KEY ("consultationId") REFERENCES "consultation"."Consultation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written rules (CLAUDE.md §4 "Quick consult", erd.md → "পরামর্শ ও বার্তা")
-- ---------------------------------------------------------------------------

-- A quick consult is chat only: a video call costs more than its fee.
ALTER TABLE "consultation"."Consultation"
  ADD CONSTRAINT "Consultation_quick_is_chat_check" CHECK ("tier" <> 'QUICK' OR "channel" = 'CHAT'),
  ADD CONSTRAINT "Consultation_standard_has_appointment_check" CHECK (("tier" = 'STANDARD') = ("appointmentId" IS NOT NULL)),
  ADD CONSTRAINT "Consultation_quick_kind_check" CHECK (("tier" = 'QUICK') = ("quickKind" IS NOT NULL)),
  ADD CONSTRAINT "Consultation_fee_check" CHECK ("fee" >= 0),
  ADD CONSTRAINT "Consultation_provider_check" CHECK ("status" IN ('PENDING_PAYMENT', 'WAITING', 'MISSED', 'CANCELLED', 'EXPIRED') OR "providerId" IS NOT NULL),
  ADD CONSTRAINT "Consultation_duration_check" CHECK ("durationSec" IS NULL OR "durationSec" >= 0);

-- One live quick consult per patient at a time.
CREATE UNIQUE INDEX "Consultation_one_live_quick_per_patient"
  ON "consultation"."Consultation" ("patientId")
  WHERE "tier" = 'QUICK' AND "status" IN ('PENDING_PAYMENT', 'WAITING', 'ONGOING');

ALTER TABLE "consultation"."QuickConsultSetting"
  ADD CONSTRAINT "QuickConsultSetting_price_check" CHECK ("price" > 0 AND "price" <= 5000),
  ADD CONSTRAINT "QuickConsultSetting_wait_check" CHECK ("maxWaitMin" BETWEEN 2 AND 60),
  ADD CONSTRAINT "QuickConsultSetting_session_check" CHECK ("sessionMin" BETWEEN 5 AND 120);

-- The launch price (৳10); admins change it in the panel.
INSERT INTO "consultation"."QuickConsultSetting" ("kind", "price", "isEnabled", "maxWaitMin", "sessionMin", "updatedAt")
VALUES ('GENERAL', 10.00, true, 10, 15, now()),
       ('WOMENS_HEALTH', 10.00, true, 10, 15, now());

ALTER TABLE "chat"."Message"
  ADD CONSTRAINT "Message_content_check" CHECK ("body" IS NOT NULL OR "attachmentStorageKey" IS NOT NULL),
  ADD CONSTRAINT "Message_sender_check" CHECK ("type" = 'SYSTEM' OR "senderId" IS NOT NULL);
