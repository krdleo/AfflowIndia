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
import {
  createContact,
  createUPIFundAccount,
  createPayout as createRazorpayPayout,
} from "./razorpay.server";

/**
 * Initialize all cron jobs
 * Call this once during app startup
 */
export function initCronJobs() {
  // Auto monthly payouts — 1st of each month at 9:00 AM IST (3:30 AM UTC)
  cron.schedule("30 3 1 * *", async () => {
    try {
      const lockData = await db.$queryRawUnsafe<{ pg_try_advisory_lock: boolean }[]>("SELECT pg_try_advisory_lock(1001);");
      const hasLock = lockData?.[0]?.pg_try_advisory_lock;
      
      if (!hasLock) {
        console.log("Cron job already running on another instance, skipping...");
        return;
      }
      
      console.log("Running auto monthly payouts...");
      await processAutoPayouts();
    } catch (err) {
      console.error("Error obtaining cron lock", err);
    } finally {
      // Release lock
      await db.$executeRawUnsafe("SELECT pg_advisory_unlock(1001);").catch(() => {});
    }
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
    const [payout] = await db.$transaction([
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

    // Initiate the actual Razorpay X payout. A failure here must not abort the
    // loop — each affiliate is isolated so one failure cannot block the others.
    await initiateRazorpayPayoutForAffiliate({
      payoutId: payout.id,
      netAmount,
      razorpayXConfig: shop.razorpayXConfig,
      affiliate: {
        id: affiliate.id,
        code: affiliate.code,
        name: affiliate.name,
        email: affiliate.email,
        phone: affiliate.phone,
        upiId: affiliate.upiId,
      },
    });
  }
}

/**
 * Initiate a Razorpay X payout for a single affiliate.
 * On success: mark Payout PAID and record externalReference + paidAt.
 * On failure: mark Payout FAILED and log. Never throws — callers keep looping.
 *
 * Status mapping: schema has no PROCESSING state, so a Razorpay-accepted payout
 * is marked PAID (the closest terminal state). If the transfer later reverses,
 * that must be reconciled manually or via a future Razorpay webhook handler.
 */
async function initiateRazorpayPayoutForAffiliate(args: {
  payoutId: string;
  netAmount: number;
  razorpayXConfig: string | null;
  affiliate: {
    id: string;
    code: string;
    name: string;
    email: string;
    phone: string | null;
    upiId: string | null;
  };
}) {
  const { payoutId, netAmount, razorpayXConfig, affiliate } = args;

  if (!razorpayXConfig) {
    console.warn(
      `[cron] Skipping Razorpay payout — shop has no razorpayXConfig (payoutId=${payoutId} affiliateId=${affiliate.id})`
    );
    return;
  }

  if (!affiliate.upiId) {
    console.warn(
      `[cron] Skipping Razorpay payout — affiliate has no UPI ID (payoutId=${payoutId} affiliateId=${affiliate.id})`
    );
    return;
  }

  try {
    const contact = await createContact(
      razorpayXConfig,
      affiliate.name,
      affiliate.email,
      affiliate.phone || undefined
    );
    const fundAccount = await createUPIFundAccount(
      razorpayXConfig,
      contact.id,
      affiliate.upiId
    );
    const razorpayPayout = await createRazorpayPayout(
      razorpayXConfig,
      fundAccount.id,
      netAmount,
      payoutId,
      `AfflowIndia payout for ${affiliate.code}`
    );

    await db.payout.update({
      where: { id: payoutId },
      data: {
        status: "PAID",
        externalReference: razorpayPayout.id,
        paidAt: new Date(),
      },
    });

    console.log(
      `[cron] Razorpay payout initiated — razorpayId=${razorpayPayout.id} payoutId=${payoutId} affiliateId=${affiliate.id}`
    );
  } catch (error) {
    console.error(
      `[cron] Razorpay payout FAILED — payoutId=${payoutId} affiliateId=${affiliate.id}:`,
      error
    );
    try {
      await db.payout.update({
        where: { id: payoutId },
        data: { status: "FAILED" },
      });
    } catch (updateError) {
      console.error(
        `[cron] Failed to update payout status to FAILED (payoutId=${payoutId}):`,
        updateError
      );
    }
  }
}

export { processAutoPayouts };
