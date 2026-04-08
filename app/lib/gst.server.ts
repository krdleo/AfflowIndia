/**
 * GST Compliance Module
 *
 * Handles GST calculations for affiliate payouts:
 * payoutAmount = commission + (commission × gstRate)
 */

export interface GstCalculation {
  baseAmount: number;
  gstAmount: number;
  totalWithGst: number;
  gstRate: number;
}

/**
 * Calculate GST on a commission amount
 * @param baseAmount The commission base amount
 * @param gstRate GST rate as percentage (e.g., 18)
 * @param isEnabled Whether GST is enabled for this shop
 */
export function calculateGst(
  baseAmount: number,
  gstRate: number = 18,
  isEnabled: boolean = false
): GstCalculation {
  if (!isEnabled || baseAmount <= 0) {
    return {
      baseAmount,
      gstAmount: 0,
      totalWithGst: baseAmount,
      gstRate: 0,
    };
  }

  const gstAmount = roundToTwo(baseAmount * (gstRate / 100));

  return {
    baseAmount,
    gstAmount,
    totalWithGst: roundToTwo(baseAmount + gstAmount),
    gstRate,
  };
}

/**
 * Validate GSTIN format
 * Format: 2 digits + 5 uppercase letters + 4 digits + 1 letter + 1 alphanumeric + Z + 1 alphanumeric
 */
export function validateGstin(gstin: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(
    gstin.toUpperCase().trim()
  );
}

function roundToTwo(num: number): number {
  return Math.round(num * 100) / 100;
}
