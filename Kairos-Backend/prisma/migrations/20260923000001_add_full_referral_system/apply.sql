BEGIN;
-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_referredById_fkey";

-- DropIndex
DROP INDEX "User_referralCode_key";

-- DropIndex
DROP INDEX "User_referredById_idx";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "referralCode",
DROP COLUMN "referredById",
ADD COLUMN     "bannedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ReferralProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "codeActivatesAt" TIMESTAMP(3) NOT NULL,
    "vanityChanged" BOOLEAN NOT NULL DEFAULT false,
    "displayName" TEXT NOT NULL DEFAULT '',
    "leaderboardOptIn" BOOLEAN NOT NULL DEFAULT false,
    "joinedCount" INTEGER NOT NULL DEFAULT 0,
    "qualifiedCount" INTEGER NOT NULL DEFAULT 0,
    "blockedAt" TIMESTAMP(3),
    "blockedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "campaignId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "activatesAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "maxRedemptions" INTEGER,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "refereeCredits" INTEGER NOT NULL DEFAULT 100,
    "referrerCredits" INTEGER NOT NULL DEFAULT 250,
    "createdByAdminId" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralAttribution" (
    "id" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "refereeUserId" TEXT NOT NULL,
    "referrerUserId" TEXT,
    "campaignId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'joined',
    "fraudStatus" TEXT NOT NULL DEFAULT 'clean',
    "fraudScore" INTEGER NOT NULL DEFAULT 0,
    "evidenceJson" TEXT NOT NULL DEFAULT '{}',
    "signupIpHash" TEXT,
    "deviceIdHash" TEXT,
    "qualifiedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralClick" (
    "id" TEXT NOT NULL,
    "codeId" TEXT NOT NULL,
    "campaignId" TEXT,
    "source" TEXT,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralClick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "availableCredits" INTEGER NOT NULL DEFAULT 0,
    "pendingCredits" INTEGER NOT NULL DEFAULT 0,
    "lifetimeEarned" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditLedger" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "availableAfter" INTEGER NOT NULL,
    "pendingAfter" INTEGER NOT NULL,
    "idempotencyRef" TEXT NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "maturesAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "adminId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralQualification" (
    "id" TEXT NOT NULL,
    "attributionId" TEXT NOT NULL,
    "referrerUserId" TEXT NOT NULL,
    "awardedCredits" INTEGER NOT NULL,
    "ledgerEntryId" TEXT,
    "maturesAt" TIMESTAMP(3) NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversedReason" TEXT,
    "reversedByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReferralQualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MilestoneDefinition" (
    "id" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "unlockKey" TEXT NOT NULL,
    "bonusCredits" INTEGER NOT NULL DEFAULT 0,
    "iconKey" TEXT NOT NULL DEFAULT 'gift',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MilestoneDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReferralMilestone" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL,
    "countAtUnlock" INTEGER NOT NULL,
    "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "ReferralMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "budgetCredits" INTEGER,
    "spentCredits" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "totpSecret" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "beforeJson" TEXT NOT NULL DEFAULT '{}',
    "afterJson" TEXT NOT NULL DEFAULT '{}',
    "reason" TEXT NOT NULL DEFAULT '',
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReferralProfile_userId_key" ON "ReferralProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralProfile_code_key" ON "ReferralProfile"("code");

-- CreateIndex
CREATE INDEX "ReferralProfile_qualifiedCount_idx" ON "ReferralProfile"("qualifiedCount");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralCode_code_key" ON "ReferralCode"("code");

-- CreateIndex
CREATE INDEX "ReferralCode_campaignId_status_idx" ON "ReferralCode"("campaignId", "status");

-- CreateIndex
CREATE INDEX "ReferralCode_ownerUserId_idx" ON "ReferralCode"("ownerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralAttribution_refereeUserId_key" ON "ReferralAttribution"("refereeUserId");

-- CreateIndex
CREATE INDEX "ReferralAttribution_referrerUserId_status_idx" ON "ReferralAttribution"("referrerUserId", "status");

-- CreateIndex
CREATE INDEX "ReferralAttribution_campaignId_createdAt_idx" ON "ReferralAttribution"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralAttribution_fraudStatus_createdAt_idx" ON "ReferralAttribution"("fraudStatus", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralClick_codeId_createdAt_idx" ON "ReferralClick"("codeId", "createdAt");

-- CreateIndex
CREATE INDEX "ReferralClick_campaignId_createdAt_idx" ON "ReferralClick"("campaignId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditAccount_userId_key" ON "CreditAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditLedger_idempotencyRef_key" ON "CreditLedger"("idempotencyRef");

-- CreateIndex
CREATE INDEX "CreditLedger_accountId_createdAt_idx" ON "CreditLedger"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditLedger_entryType_createdAt_idx" ON "CreditLedger"("entryType", "createdAt");

-- CreateIndex
CREATE INDEX "CreditLedger_maturesAt_idx" ON "CreditLedger"("maturesAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralQualification_attributionId_key" ON "ReferralQualification"("attributionId");

-- CreateIndex
CREATE INDEX "ReferralQualification_referrerUserId_createdAt_idx" ON "ReferralQualification"("referrerUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MilestoneDefinition_threshold_key" ON "MilestoneDefinition"("threshold");

-- CreateIndex
CREATE UNIQUE INDEX "MilestoneDefinition_unlockKey_key" ON "MilestoneDefinition"("unlockKey");

-- CreateIndex
CREATE INDEX "ReferralMilestone_userId_idx" ON "ReferralMilestone"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ReferralMilestone_userId_threshold_key" ON "ReferralMilestone"("userId", "threshold");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_slug_key" ON "Campaign"("slug");

-- CreateIndex
CREATE INDEX "Campaign_status_startsAt_idx" ON "Campaign"("status", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");

-- CreateIndex
CREATE INDEX "AdminAuditLog_adminId_createdAt_idx" ON "AdminAuditLog"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetType_targetId_idx" ON "AdminAuditLog"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "ReferralProfile" ADD CONSTRAINT "ReferralProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReferralCode" ADD CONSTRAINT "ReferralCode_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditLedger" ADD CONSTRAINT "CreditLedger_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "CreditAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
