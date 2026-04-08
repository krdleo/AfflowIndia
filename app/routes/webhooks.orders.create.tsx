/**
 * Webhook: orders/create
 *
 * Core attribution engine — when an order comes in:
 * 1. Parse discount_codes from payload
 * 2. Normalize codes (uppercase, trim)
 * 3. Look up affiliate by (shopId, code)
 * 4. Check idempotency (shopId, orderId)
 * 5. Calculate commission (FLAT or TIERED)
 * 6. Create Referral record
 * 7. Atomically increment affiliate's totalSales and pendingCommission
 */

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { calculateCommission } from "../lib/commission.server";
import type { CommissionTier } from "../lib/commission.server";
import type { CommissionMode } from "@prisma/client";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  try {
    // Find the shop in our database
    const shopRecord = await db.shop.findUnique({
      where: { shopDomain: shop },
    });

    if (!shopRecord || !shopRecord.isActive) {
      console.log(`Shop ${shop} not found or inactive, skipping`);
      return new Response();
    }

    // Parse order data from webhook payload
    const orderData = payload as {
      id: number;
      order_number: number;
      total_price: string;
      discount_codes?: Array<{ code: string; amount: string; type: string }>;
    };

    const orderId = String(orderData.id);
    const orderAmount = parseFloat(orderData.total_price || "0");

    // Parse discount codes
    const discountCodes = orderData.discount_codes || [];
    if (discountCodes.length === 0) {
      console.log(`Order ${orderId} has no discount codes, skipping`);
      return new Response();
    }

    // Try to match each discount code to an affiliate
    for (const discountCode of discountCodes) {
      const normalizedCode = discountCode.code.toUpperCase().trim();

      // Look up affiliate by shop + code
      const affiliate = await db.affiliate.findUnique({
        where: {
          shopId_code: {
            shopId: shopRecord.id,
            code: normalizedCode,
          },
        },
      });

      if (!affiliate || affiliate.status !== "ACTIVE") {
        continue; // Not an affiliate code, try next
      }

      // Idempotency check — prevent duplicate processing
      const existingReferral = await db.referral.findUnique({
        where: {
          shopId_orderId: {
            shopId: shopRecord.id,
            orderId,
          },
        },
      });

      if (existingReferral) {
        console.log(
          `Order ${orderId} already processed for shop ${shop}, skipping (idempotency)`
        );
        return new Response();
      }

      // Calculate commission
      const tiers = shopRecord.commissionTiers as CommissionTier[] | null;
      const commission = calculateCommission(
        shopRecord.commissionMode as CommissionMode,
        Number(affiliate.commissionRate),
        Number(shopRecord.defaultCommissionRate),
        tiers,
        orderAmount,
        Number(affiliate.totalSales)
      );

      // Transaction: create referral + atomic increment affiliate stats
      await db.$transaction([
        db.referral.create({
          data: {
            shopId: shopRecord.id,
            affiliateId: affiliate.id,
            orderId,
            orderAmount,
            commissionAmount: commission.commissionAmount,
            commissionRate: commission.commissionRate,
          },
        }),
        db.affiliate.update({
          where: { id: affiliate.id },
          data: {
            totalSales: { increment: orderAmount },
            pendingCommission: { increment: commission.commissionAmount },
          },
        }),
      ]);

      console.log(
        `Order ${orderId}: Attributed to affiliate ${affiliate.code}, commission: ₹${commission.commissionAmount}`
      );

      // Only attribute to the first matching affiliate code
      break;
    }
  } catch (error) {
    console.error(`Error processing orders/create webhook for ${shop}:`, error);
    // Return 200 to prevent Shopify from retrying indefinitely
    // The error is logged for debugging
  }

  // Always return 200 quickly (BFS requirement: < 5 seconds)
  return new Response();
};
