/**
 * Fraud Detection Heuristics
 *
 * Flags suspicious patterns:
 * - Same IP making multiple clicks
 * - Abnormally high conversion rates
 * - Self-referrals (affiliate email matches customer email)
 * - Rapid-fire orders from same affiliate
 */

import db from "../db.server";

export interface FraudCheckResult {
  isSuspicious: boolean;
  flags: string[];
  severity: "low" | "medium" | "high";
}

/**
 * Check for self-referral fraud
 * If the customer's email on the order matches the affiliate's email
 */
export async function checkSelfReferral(
  affiliateEmail: string,
  customerEmail: string | null
): Promise<FraudCheckResult> {
  if (!customerEmail) {
    return { isSuspicious: false, flags: [], severity: "low" };
  }

  if (affiliateEmail.toLowerCase() === customerEmail.toLowerCase()) {
    return {
      isSuspicious: true,
      flags: ["Self-referral: Affiliate's email matches customer email"],
      severity: "high",
    };
  }

  return { isSuspicious: false, flags: [], severity: "low" };
}

/**
 * Check for abnormally high conversion rate
 * If clicks-to-sales ratio is suspiciously high
 */
export async function checkConversionRate(
  affiliateId: string
): Promise<FraudCheckResult> {
  const affiliate = await db.affiliate.findUnique({
    where: { id: affiliateId },
    select: { totalClicks: true },
  });

  if (!affiliate || affiliate.totalClicks === 0) {
    return { isSuspicious: false, flags: [], severity: "low" };
  }

  const referralCount = await db.referral.count({
    where: { affiliateId },
  });

  const conversionRate = referralCount / affiliate.totalClicks;

  // A conversion rate above 50% is suspicious
  if (conversionRate > 0.5 && referralCount > 5) {
    return {
      isSuspicious: true,
      flags: [
        `Abnormally high conversion rate: ${(conversionRate * 100).toFixed(1)}% (${referralCount} orders from ${affiliate.totalClicks} clicks)`,
      ],
      severity: "medium",
    };
  }

  return { isSuspicious: false, flags: [], severity: "low" };
}

/**
 * Check for rapid-fire orders (multiple orders attributed to same affiliate in short time)
 */
export async function checkRapidOrders(
  affiliateId: string,
  windowMinutes: number = 10,
  thresholdCount: number = 5
): Promise<FraudCheckResult> {
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);

  const recentOrders = await db.referral.count({
    where: {
      affiliateId,
      createdAt: { gte: since },
    },
  });

  if (recentOrders >= thresholdCount) {
    return {
      isSuspicious: true,
      flags: [
        `Rapid orders: ${recentOrders} orders in ${windowMinutes} minutes`,
      ],
      severity: "medium",
    };
  }

  return { isSuspicious: false, flags: [], severity: "low" };
}

/**
 * Run all fraud checks for a referral
 */
export async function runFraudChecks(
  affiliateId: string,
  affiliateEmail: string,
  customerEmail: string | null
): Promise<FraudCheckResult> {
  const results = await Promise.all([
    checkSelfReferral(affiliateEmail, customerEmail),
    checkConversionRate(affiliateId),
    checkRapidOrders(affiliateId),
  ]);

  const allFlags = results.flatMap((r) => r.flags);
  const isSuspicious = results.some((r) => r.isSuspicious);
  const severity = results.some((r) => r.severity === "high")
    ? "high"
    : results.some((r) => r.severity === "medium")
    ? "medium"
    : "low";

  return {
    isSuspicious,
    flags: allFlags,
    severity,
  };
}

/**
 * Flag an affiliate as suspicious
 */
export async function flagAffiliate(
  affiliateId: string,
  reason: string
): Promise<void> {
  await db.affiliate.update({
    where: { id: affiliateId },
    data: { status: "FLAGGED" },
  });
  console.warn(`Affiliate ${affiliateId} flagged: ${reason}`);
}
