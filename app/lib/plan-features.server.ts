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
 * Feature availability by plan. All paid features live on PREMIUM; FREE
 * ships only the baseline (flat commissions, manual payouts, basic dashboard,
 * referral tracking) which are hard-coded in the app rather than gated here.
 */
const FEATURE_MAP: Record<FeatureKey, Plan[]> = {
  tiered_commissions: ["PREMIUM"],
  custom_codes: ["PREMIUM"],
  portal_customization: ["PREMIUM"],
  email_notifications: ["PREMIUM"],
  razorpay_payouts: ["PREMIUM"],
  gst_invoicing: ["PREMIUM"],
  tds_compliance: ["PREMIUM"],
  fraud_detection: ["PREMIUM"],
  whatsapp_sharing: ["PREMIUM"],
  realtime_analytics: ["PREMIUM"],
  product_commissions: ["PREMIUM"],
  milestone_bonuses: ["PREMIUM"],
  auto_payouts: ["PREMIUM"],
  creative_assets: ["PREMIUM"],
  unique_coupon_codes: ["PREMIUM"],
};

/**
 * Check if a plan has access to a specific feature
 */
export function planHasFeature(plan: Plan, feature: FeatureKey): boolean {
  const allowedPlans = FEATURE_MAP[feature];
  if (!allowedPlans) return false;
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
  if (!plans || plans.length === 0) return "PREMIUM";
  if (plans.includes("FREE")) return "FREE";
  return "PREMIUM";
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
        message: `This feature requires the ${minPlan} plan.`,
      }),
      {
        status: 403,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
