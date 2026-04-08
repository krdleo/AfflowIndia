/**
 * Commission Calculation Engine
 *
 * Handles both FLAT and TIERED commission modes.
 * Pure functions for testability.
 */

import type { CommissionMode } from "@prisma/client";

export interface CommissionTier {
  thresholdAmount: number;
  ratePercent: number;
}

export interface CommissionResult {
  commissionAmount: number;
  commissionRate: number;
  tierName: string | null;
}

/**
 * Calculate commission for an order
 *
 * @param mode FLAT or TIERED commission mode
 * @param affiliateRate The affiliate's personal commission rate (used in FLAT mode)
 * @param defaultRate The shop's default commission rate
 * @param tiers Tier brackets for TIERED mode (sorted by threshold ascending)
 * @param orderAmount The order's total amount
 * @param affiliateTotalSales The affiliate's cumulative total sales (for tier determination)
 */
export function calculateCommission(
  mode: CommissionMode,
  affiliateRate: number,
  defaultRate: number,
  tiers: CommissionTier[] | null,
  orderAmount: number,
  affiliateTotalSales: number = 0
): CommissionResult {
  if (orderAmount <= 0) {
    return { commissionAmount: 0, commissionRate: 0, tierName: null };
  }

  if (mode === "FLAT") {
    // Use affiliate-specific rate, falling back to shop default
    const rate = affiliateRate > 0 ? affiliateRate : defaultRate;
    return {
      commissionAmount: roundToTwo(orderAmount * (rate / 100)),
      commissionRate: rate,
      tierName: null,
    };
  }

  // TIERED mode
  if (!tiers || tiers.length === 0) {
    // Fallback to default rate if no tiers configured
    return {
      commissionAmount: roundToTwo(orderAmount * (defaultRate / 100)),
      commissionRate: defaultRate,
      tierName: "Default",
    };
  }

  // Sort tiers by threshold descending for easy lookup
  const sortedTiers = [...tiers].sort(
    (a, b) => b.thresholdAmount - a.thresholdAmount
  );

  // Find the highest tier the affiliate qualifies for
  // based on their cumulative total sales
  for (const tier of sortedTiers) {
    if (affiliateTotalSales >= tier.thresholdAmount) {
      return {
        commissionAmount: roundToTwo(orderAmount * (tier.ratePercent / 100)),
        commissionRate: tier.ratePercent,
        tierName: `₹${formatIndianNumber(tier.thresholdAmount)}+ tier`,
      };
    }
  }

  // Below the lowest tier — use the lowest tier rate or default
  const lowestTier = sortedTiers[sortedTiers.length - 1];
  return {
    commissionAmount: roundToTwo(orderAmount * (lowestTier.ratePercent / 100)),
    commissionRate: lowestTier.ratePercent,
    tierName: "Base tier",
  };
}

/**
 * Check if an affiliate should be auto-upgraded to a new tier
 * Returns the new rate if a milestone is hit, null otherwise
 */
export function checkTierUpgrade(
  tiers: CommissionTier[] | null,
  previousTotalSales: number,
  newTotalSales: number
): { newRate: number; tierName: string } | null {
  if (!tiers || tiers.length === 0) return null;

  const sortedTiers = [...tiers].sort(
    (a, b) => a.thresholdAmount - b.thresholdAmount
  );

  for (const tier of sortedTiers) {
    if (
      previousTotalSales < tier.thresholdAmount &&
      newTotalSales >= tier.thresholdAmount
    ) {
      return {
        newRate: tier.ratePercent,
        tierName: `₹${formatIndianNumber(tier.thresholdAmount)}+ tier`,
      };
    }
  }

  return null;
}

// ─── Helpers ─────────────────────────────────────────────────

function roundToTwo(num: number): number {
  return Math.round(num * 100) / 100;
}

/**
 * Format number in Indian numbering system (lakhs, crores)
 */
function formatIndianNumber(num: number): string {
  const str = num.toString();
  const lastThree = str.substring(str.length - 3);
  const otherNumbers = str.substring(0, str.length - 3);
  if (otherNumbers !== "") {
    return (
      otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + lastThree
    );
  }
  return lastThree;
}
