/**
 * TDS Compliance Module
 *
 * Handles TDS deduction from affiliate payouts:
 * - Applied when cumulative payouts exceed annual threshold
 * - tdsAmount = payoutAmount × tdsRate
 * - Net payout = baseAmount + gstAmount - tdsAmount
 * - Financial year: April 1 to March 31
 */

export interface TdsCalculation {
  tdsAmount: number;
  tdsRate: number;
  isApplicable: boolean;
  cumulativePayouts: number;
  threshold: number;
}

/**
 * Calculate TDS deduction on a payout
 * @param payoutAmount The amount after GST (base + GST)
 * @param tdsRate TDS rate as percentage (e.g., 10)
 * @param cumulativePayouts Total payouts in current financial year
 * @param annualThreshold Threshold above which TDS applies (e.g., 20000)
 * @param isEnabled Whether TDS is enabled for this shop
 */
export function calculateTds(
  payoutAmount: number,
  tdsRate: number = 10,
  cumulativePayouts: number = 0,
  annualThreshold: number = 20000,
  isEnabled: boolean = false
): TdsCalculation {
  if (!isEnabled || payoutAmount <= 0) {
    return {
      tdsAmount: 0,
      tdsRate: 0,
      isApplicable: false,
      cumulativePayouts,
      threshold: annualThreshold,
    };
  }

  // Check if cumulative payouts including this one exceed the threshold
  const totalAfterPayout = cumulativePayouts + payoutAmount;
  const isApplicable = totalAfterPayout > annualThreshold;

  if (!isApplicable) {
    return {
      tdsAmount: 0,
      tdsRate,
      isApplicable: false,
      cumulativePayouts,
      threshold: annualThreshold,
    };
  }

  const tdsAmount = roundToTwo(payoutAmount * (tdsRate / 100));

  return {
    tdsAmount,
    tdsRate,
    isApplicable: true,
    cumulativePayouts,
    threshold: annualThreshold,
  };
}

/**
 * Calculate the net payout after GST and TDS
 */
export function calculateNetPayout(
  baseAmount: number,
  gstAmount: number,
  tdsAmount: number
): number {
  return roundToTwo(baseAmount + gstAmount - tdsAmount);
}

/**
 * Get the start of the current Indian financial year (April 1)
 */
export function getFinancialYearStart(): Date {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, 3, 1); // April 1st (months are 0-indexed)
}

/**
 * Get the end of the current Indian financial year (March 31)
 */
export function getFinancialYearEnd(): Date {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() + 1 : now.getFullYear();
  return new Date(year, 2, 31); // March 31st
}

function roundToTwo(num: number): number {
  return Math.round(num * 100) / 100;
}
