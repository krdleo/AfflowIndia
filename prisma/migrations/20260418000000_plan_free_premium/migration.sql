-- Collapse the Plan enum from three tiers (FREE, STARTER, PRO) to two
-- (FREE, PREMIUM). Existing STARTER and PRO shops are migrated to PREMIUM
-- so no shop loses access to paid features mid-subscription.
--
-- Postgres does not let you drop values from an enum in place, so we create
-- a new enum, swap the column over with an inline CASE to translate values,
-- then drop the old enum.

CREATE TYPE "Plan_new" AS ENUM ('FREE', 'PREMIUM');

ALTER TABLE "Shop"
  ALTER COLUMN "plan" DROP DEFAULT,
  ALTER COLUMN "plan" TYPE "Plan_new" USING (
    CASE "plan"::text
      WHEN 'STARTER' THEN 'PREMIUM'::"Plan_new"
      WHEN 'PRO'     THEN 'PREMIUM'::"Plan_new"
      ELSE                 'FREE'::"Plan_new"
    END
  ),
  ALTER COLUMN "plan" SET DEFAULT 'FREE';

DROP TYPE "Plan";
ALTER TYPE "Plan_new" RENAME TO "Plan";
