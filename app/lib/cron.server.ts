/**
 * Scheduled Jobs — node-cron
 *
 * Auto monthly payouts: 1st of each month, 9:00 AM IST
 * For each shop with auto-payouts enabled:
 * 1. Aggregate pending commissions
 * 2. Apply GST/TDS
 * 3. Create Payout records
 * 4. Initiate Razorpay X payouts if configured
 * 5. Send email notifications
 */

import cron from "node-cron";
import db from "../db.server";
import { calculateGst } from "./gst.server";
import { calculateTds, getFinancialYearStart } from "./tds.server";

/**
 * Initialize all cron jobs
 * Call this once during app startup
 */
export function initCronJobs() {
  // Auto monthly payouts — 1st of each month at 9:00 AM IST (3:30 AM UTC)
  cron.schedule("30 3 1 * *", async () => {
    console.log("Running auto monthly payouts...");
    await processAutoPayouts();
  });

  console.log("Cron jobs initialized");
}

/**
 * Process auto payouts for all eligible shops
 */
async function processAutoPayouts() {
  try {
    // Find shops with auto-payouts enabled and Razorpay X configured
    const shops = await db.shop.findMany({
      where: {
        isActive: true,
        payoutMode: "RAZORPAY_X",
        razorpayXConfig: { not: null },
      },
      include: {
        gstSetting: true,
        tdsSetting: true,
      },
    });

    for (const shop of shops) {
      try {
        await processShopPayouts(shop);
      } catch (error) {
        console.error(
          `Error processing auto-payouts for shop ${shop.shopDomain}:`,
          error
        );
      }
    }
  } catch (error) {
    console.error("Error in auto-payout job:", error);
  }
}

/**
 * Process payouts for a single shop
 */
async function processShopPayouts(shop: {
  id: string;
  shopDomain: string;
  razorpayXConfig: string | null;
  gstSetting: { isEnabled: boolean; gstRate: unknown } | null;
  tdsSetting: {
    isEnabled: boolean;
    tdsRate: unknown;
    annualThreshold: unknown;
  } | null;
}) {
  // Find affiliates with pending commissions
  const affiliates = await db.affiliate.findMany({
    where: {
      shopId: shop.id,
      status: "ACTIVE",
      pendingCommission: { gt: 0 },
    },
  });

  const fyStart = getFinancialYearStart();

  for (const affiliate of affiliates) {
    const baseAmount = Number(affiliate.pendingCommission);
    if (baseAmount <= 0) continue;

    // Calculate GST
    const gst = calculateGst(
      baseAmount,
      Number(shop.gstSetting?.gstRate || 18),
      shop.gstSetting?.isEnabled || false
    );

    // Calculate TDS
    const cumulativePayouts = await db.payout.aggregate({
      where: {
        affiliateId: affiliate.id,
        status: { in: ["APPROVED", "PAID"] },
        createdAt: { gte: fyStart },
      },
      _sum: { baseAmount: true },
    });

    const tds = calculateTds(
      gst.totalWithGst,
      Number(shop.tdsSetting?.tdsRate || 10),
      Number(cumulativePayouts._sum.baseAmount || 0),
      Number(shop.tdsSetting?.annualThreshold || 20000),
      shop.tdsSetting?.isEnabled || false
    );

    const netAmount = baseAmount + gst.gstAmount - tds.tdsAmount;

    // Create payout record
    await db.$transaction([
      db.payout.create({
        data: {
          shopId: shop.id,
          affiliateId: affiliate.id,
          amount: netAmount,
          baseAmount,
          gstAmount: gst.gstAmount,
          tdsAmount: tds.tdsAmount,
          mode: "RAZORPAY_X",
          status: "APPROVED", // Auto-approved for auto-payouts
        },
      }),
      db.affiliate.update({
        where: { id: affiliate.id },
        data: { pendingCommission: 0 },
      }),
    ]);

    console.log(
      `Auto-payout created for affiliate ${affiliate.code}: ₹${netAmount}`
    );
  }
}

export { processAutoPayouts };
