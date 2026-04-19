-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."AffiliateStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'FLAGGED');

-- CreateEnum
CREATE TYPE "public"."CommissionMode" AS ENUM ('FLAT', 'TIERED');

-- CreateEnum
CREATE TYPE "public"."PayoutMethod" AS ENUM ('MANUAL', 'RAZORPAY_X');

-- CreateEnum
CREATE TYPE "public"."PayoutMode" AS ENUM ('MANUAL', 'RAZORPAY_X');

-- CreateEnum
CREATE TYPE "public"."PayoutStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."Plan" AS ENUM ('FREE', 'STARTER', 'PRO');

-- CreateTable
CREATE TABLE "public"."Affiliate" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "referralCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "upiId" TEXT,
    "passwordHash" TEXT NOT NULL,
    "status" "public"."AffiliateStatus" NOT NULL DEFAULT 'PENDING',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "verificationToken" TEXT,
    "verificationTokenExpiry" TIMESTAMP(3),
    "resetPasswordToken" TEXT,
    "resetPasswordExpiry" TIMESTAMP(3),
    "commissionRate" DECIMAL(65,30) NOT NULL,
    "discountPercent" DECIMAL(65,30) NOT NULL DEFAULT 10,
    "totalClicks" INTEGER NOT NULL DEFAULT 0,
    "totalSales" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pendingCommission" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "discountCodeId" TEXT,
    "priceRuleId" TEXT,
    "panEncrypted" TEXT,
    "panIv" TEXT,
    "panTag" TEXT,
    "panLast4" TEXT,
    "gstinEncrypted" TEXT,
    "gstinIv" TEXT,
    "gstinTag" TEXT,
    "legalNameEncrypted" TEXT,
    "legalNameIv" TEXT,
    "legalNameTag" TEXT,
    "addressEncrypted" TEXT,
    "addressIv" TEXT,
    "addressTag" TEXT,
    "bankDetailsEncrypted" TEXT,
    "bankDetailsIv" TEXT,
    "bankDetailsTag" TEXT,
    "city" TEXT,
    "state" TEXT,
    "pincode" TEXT,
    "lastLogin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "fraudFlags" TEXT,

    CONSTRAINT "Affiliate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."GstSetting" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "gstRate" DECIMAL(65,30) NOT NULL DEFAULT 18,

    CONSTRAINT "GstSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Payout" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "mode" "public"."PayoutMethod" NOT NULL DEFAULT 'MANUAL',
    "status" "public"."PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "baseAmount" DECIMAL(65,30) NOT NULL,
    "gstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "tdsAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reference" TEXT,
    "externalReference" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Referral" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "affiliateId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderAmount" DECIMAL(65,30) NOT NULL,
    "commissionAmount" DECIMAL(65,30) NOT NULL,
    "commissionRate" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- Session table already created by 20240530213853_create_session_table migration.

-- CreateTable
CREATE TABLE "public"."Shop" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "accessTokenIv" TEXT NOT NULL,
    "accessTokenTag" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "plan" "public"."Plan" NOT NULL DEFAULT 'FREE',
    "payoutMode" "public"."PayoutMode" NOT NULL DEFAULT 'MANUAL',
    "razorpayXConfig" TEXT,
    "commissionMode" "public"."CommissionMode" NOT NULL DEFAULT 'FLAT',
    "defaultCommissionRate" DECIMAL(65,30) NOT NULL DEFAULT 10,
    "commissionTiers" JSONB,
    "portalCustomization" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TdsSetting" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "tdsRate" DECIMAL(65,30) NOT NULL DEFAULT 10,
    "annualThreshold" DECIMAL(65,30) NOT NULL DEFAULT 20000,

    CONSTRAINT "TdsSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Affiliate_email_shopId_idx" ON "public"."Affiliate"("email" ASC, "shopId" ASC);

-- CreateIndex
CREATE INDEX "Affiliate_referralCode_idx" ON "public"."Affiliate"("referralCode" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Affiliate_shopId_code_key" ON "public"."Affiliate"("shopId" ASC, "code" ASC);

-- CreateIndex
CREATE INDEX "Affiliate_shopId_status_idx" ON "public"."Affiliate"("shopId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "Affiliate_verificationToken_idx" ON "public"."Affiliate"("verificationToken" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "GstSetting_shopId_key" ON "public"."GstSetting"("shopId" ASC);

-- CreateIndex
CREATE INDEX "Payout_affiliateId_status_idx" ON "public"."Payout"("affiliateId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "Payout_shopId_status_createdAt_idx" ON "public"."Payout"("shopId" ASC, "status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "Referral_affiliateId_idx" ON "public"."Referral"("affiliateId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Referral_shopId_orderId_key" ON "public"."Referral"("shopId" ASC, "orderId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Shop_shopDomain_key" ON "public"."Shop"("shopDomain" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "TdsSetting_shopId_key" ON "public"."TdsSetting"("shopId" ASC);

-- AddForeignKey
ALTER TABLE "public"."Affiliate" ADD CONSTRAINT "Affiliate_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "public"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GstSetting" ADD CONSTRAINT "GstSetting_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "public"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payout" ADD CONSTRAINT "Payout_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "public"."Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payout" ADD CONSTRAINT "Payout_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "public"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Referral" ADD CONSTRAINT "Referral_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "public"."Affiliate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Referral" ADD CONSTRAINT "Referral_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "public"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TdsSetting" ADD CONSTRAINT "TdsSetting_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "public"."Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

