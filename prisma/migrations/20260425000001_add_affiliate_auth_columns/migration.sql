-- Add login-attempt tracking columns that were added to schema.prisma but never migrated
ALTER TABLE "Affiliate" ADD COLUMN "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Affiliate" ADD COLUMN "lockoutUntil" TIMESTAMP(3);
