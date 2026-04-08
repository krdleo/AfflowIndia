/**
 * Plan Feature Gating
 *
 * Centralized feature flag system.
 * Every feature checks the shop's plan before allowing access.
 */

import type { Plan } from "@prisma/client";

export type FeatureKey =
  | "tiered_commissions"
  | "custom_codes"
  | "portal_customization"
  | "email_notifications"
  | "razorpay_payouts"
  | "gst_invoicing"
  | "tds_compliance"
  | "fraud_detection"
  | "whatsapp_sharing"
  | "realtime_analytics"
  | "product_commissions"
  | "milestone_bonuses"
  | "auto_payouts"
  | "creative_assets"
  | "unique_coupon_codes";

/**
 * Feature availability by plan
 */
const FEATURE_MAP: Record<FeatureKey, Plan[]> = {
  // STARTER+ features
  tiered_commissions: ["STARTER", "PRO"],
  custom_codes: ["STARTER", "PRO"],
  portal_customization: ["STARTER", "PRO"],
  email_notifications: ["STARTER", "PRO"],

  // PRO-only features
  razorpay_payouts: ["PRO"],
  gst_invoicing: ["PRO"],
  tds_compliance: ["PRO"],
  fraud_detection: ["PRO"],
  whatsapp_sharing: ["PRO"],
  realtime_analytics: ["PRO"],
  product_commissions: ["PRO"],
  milestone_bonuses: ["PRO"],
  auto_payouts: ["PRO"],
  creative_assets: ["PRO"],
  unique_coupon_codes: ["PRO"],
};

/**
 * Check if a plan has access to a specific feature
 */
export function planHasFeature(plan: Plan, feature: FeatureKey): boolean {
  const allowedPlans = FEATURE_MAP[feature];
  if (!allowedPlans) return false;

  // FREE plan always has access if it's in the list
  // Otherwise check if the current plan is allowed
  return allowedPlans.includes(plan);
}

/**
 * Get all features available for a plan
 */
export function getPlanFeatures(plan: Plan): FeatureKey[] {
  return (Object.entries(FEATURE_MAP) as [FeatureKey, Plan[]][])
    .filter(([, plans]) => plans.includes(plan))
    .map(([key]) => key);
}

/**
 * Get the minimum plan required for a feature
 */
export function getMinimumPlan(feature: FeatureKey): Plan {
  const plans = FEATURE_MAP[feature];
  if (!plans || plans.length === 0) return "PRO";
  if (plans.includes("FREE")) return "FREE";
  if (plans.includes("STARTER")) return "STARTER";
  return "PRO";
}

/**
 * Enforce feature access — throws Response if not allowed
 */
export function requireFeature(plan: Plan, feature: FeatureKey): void {
  if (!planHasFeature(plan, feature)) {
    const minPlan = getMinimumPlan(feature);
    throw new Response(
      JSON.stringify({
        error: "Feature not available",
        feature,
        currentPlan: plan,
        requiredPlan: minPlan,
        message: `This feature requires the ${minPlan} plan or higher.`,
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
