-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "community";

-- CreateEnum
CREATE TYPE "community"."CommunitySpace" AS ENUM ('COMMON', 'WOMEN');

-- CreateEnum
CREATE TYPE "community"."PostStatus" AS ENUM ('PUBLISHED', 'HIDDEN', 'REMOVED');

-- CreateEnum
CREATE TYPE "community"."CommunityTarget" AS ENUM ('POST', 'ANSWER');

-- CreateEnum
CREATE TYPE "community"."ReportReason" AS ENUM ('SPAM', 'MISINFO', 'ABUSE', 'ADS', 'PRIVACY', 'OTHER');

-- CreateEnum
CREATE TYPE "community"."ReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "community"."WomenMembershipStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REMOVED');

-- CreateEnum
CREATE TYPE "community"."BanScope" AS ENUM ('ALL', 'WOMEN');

-- CreateTable
CREATE TABLE "community"."ForumCategory" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "nameBn" TEXT NOT NULL,
    "space" "community"."CommunitySpace" NOT NULL,
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ForumCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community"."Post" (
    "id" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "providerId" UUID,
    "categoryId" UUID NOT NULL,
    "space" "community"."CommunitySpace" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "anonAlias" TEXT,
    "status" "community"."PostStatus" NOT NULL DEFAULT 'PUBLISHED',
    "answerCount" INTEGER NOT NULL DEFAULT 0,
    "doctorAnswerCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "moderationNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community"."PostImage" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community"."Answer" (
    "id" UUID NOT NULL,
    "postId" UUID NOT NULL,
    "authorUserId" UUID NOT NULL,
    "providerId" UUID,
    "body" TEXT NOT NULL,
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "anonAlias" TEXT,
    "isHighlighted" BOOLEAN NOT NULL DEFAULT false,
    "status" "community"."PostStatus" NOT NULL DEFAULT 'PUBLISHED',
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "moderationNote" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community"."Reaction" (
    "userId" UUID NOT NULL,
    "targetType" "community"."CommunityTarget" NOT NULL,
    "targetId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reaction_pkey" PRIMARY KEY ("userId","targetType","targetId")
);

-- CreateTable
CREATE TABLE "community"."ContentReport" (
    "id" UUID NOT NULL,
    "reporterUserId" UUID NOT NULL,
    "targetType" "community"."CommunityTarget" NOT NULL,
    "targetId" UUID NOT NULL,
    "reason" "community"."ReportReason" NOT NULL,
    "note" TEXT,
    "status" "community"."ReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedByUserId" UUID,
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community"."WomenCommunityMember" (
    "userId" UUID NOT NULL,
    "status" "community"."WomenMembershipStatus" NOT NULL DEFAULT 'PENDING',
    "requestNote" TEXT,
    "decisionNote" TEXT,
    "decidedByUserId" UUID,
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMPTZ(3),

    CONSTRAINT "WomenCommunityMember_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "community"."CommunityBan" (
    "userId" UUID NOT NULL,
    "scope" "community"."BanScope" NOT NULL,
    "reason" TEXT NOT NULL,
    "bannedByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunityBan_pkey" PRIMARY KEY ("userId","scope")
);

-- CreateIndex
CREATE UNIQUE INDEX "ForumCategory_slug_key" ON "community"."ForumCategory"("slug");

-- CreateIndex
CREATE INDEX "ForumCategory_space_isActive_sortOrder_idx" ON "community"."ForumCategory"("space", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "Post_space_status_createdAt_idx" ON "community"."Post"("space", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Post_categoryId_createdAt_idx" ON "community"."Post"("categoryId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Post_authorUserId_createdAt_idx" ON "community"."Post"("authorUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PostImage_postId_sortOrder_idx" ON "community"."PostImage"("postId", "sortOrder");

-- CreateIndex
CREATE INDEX "Answer_postId_status_createdAt_idx" ON "community"."Answer"("postId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Reaction_targetType_targetId_idx" ON "community"."Reaction"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "ContentReport_status_createdAt_idx" ON "community"."ContentReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ContentReport_targetType_targetId_idx" ON "community"."ContentReport"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentReport_reporterUserId_targetType_targetId_key" ON "community"."ContentReport"("reporterUserId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "WomenCommunityMember_status_requestedAt_idx" ON "community"."WomenCommunityMember"("status", "requestedAt");

-- AddForeignKey
ALTER TABLE "community"."Post" ADD CONSTRAINT "Post_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "community"."ForumCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community"."PostImage" ADD CONSTRAINT "PostImage_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community"."Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community"."Answer" ADD CONSTRAINT "Answer_postId_fkey" FOREIGN KEY ("postId") REFERENCES "community"."Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written rules
-- ---------------------------------------------------------------------------
ALTER TABLE "community"."ForumCategory" ADD CONSTRAINT "ForumCategory_slug_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');
ALTER TABLE "community"."Post" ADD CONSTRAINT "Post_counts_check"
  CHECK ("answerCount" >= 0 AND "doctorAnswerCount" >= 0 AND "doctorAnswerCount" <= "answerCount" AND "likeCount" >= 0);
-- An anonymous post or answer always has the alias others see.
ALTER TABLE "community"."Post" ADD CONSTRAINT "Post_anon_alias_check" CHECK (NOT "isAnonymous" OR "anonAlias" IS NOT NULL);
ALTER TABLE "community"."Answer" ADD CONSTRAINT "Answer_anon_alias_check" CHECK (NOT "isAnonymous" OR "anonAlias" IS NOT NULL);
ALTER TABLE "community"."Answer" ADD CONSTRAINT "Answer_like_check" CHECK ("likeCount" >= 0);
-- A decided membership records who decided and when.
ALTER TABLE "community"."WomenCommunityMember" ADD CONSTRAINT "WomenCommunityMember_decision_check"
  CHECK ("status" = 'PENDING' OR ("decidedByUserId" IS NOT NULL AND "decidedAt" IS NOT NULL));
-- Search in titles and bodies (Bangla too) with pg_trgm.
CREATE INDEX "Post_title_trgm_idx" ON "community"."Post" USING gin ("title" public.gin_trgm_ops);
