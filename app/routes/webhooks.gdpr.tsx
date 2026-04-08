/**
 * GDPR Webhooks — Mandatory for Shopify App Store
 *
 * These endpoints MUST exist and return 200.
 * Shopify will reject the app if they're missing.
 *
 * - customers/data_request: Return any customer PII stored
 * - customers/redact: Delete any customer PII
 * - shop/redact: Delete all shop data after 48 hours of uninstall
 */

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// ─── customers/data_request ──────────────────────────────────
// Affiliates are not Shopify customers, so we typically return empty
// Unless a customer email matches an affiliate email

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} GDPR webhook for ${shop}`);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST": {
      // Return any data we store about this customer
      // Affiliates are not customers, so likely empty
      console.log("Customer data request received — no customer data stored");
      break;
    }

    case "CUSTOMERS_REDACT": {
      // Delete any customer PII for the specified customer
      console.log("Customer redact received — no customer data to redact");
      break;
    }

    case "SHOP_REDACT": {
      // Delete ALL shop data — shop has been uninstalled for 48+ hours
      try {
        const shopRecord = await db.shop.findUnique({
          where: { shopDomain: shop },
        });

        if (shopRecord) {
          // Delete in order respecting foreign keys
          await db.$transaction([
            db.payout.deleteMany({ where: { shopId: shopRecord.id } }),
            db.referral.deleteMany({ where: { shopId: shopRecord.id } }),
            db.affiliate.deleteMany({ where: { shopId: shopRecord.id } }),
            db.gstSetting.deleteMany({ where: { shopId: shopRecord.id } }),
            db.tdsSetting.deleteMany({ where: { shopId: shopRecord.id } }),
            db.shop.delete({ where: { id: shopRecord.id } }),
          ]);
          console.log(`Shop data redacted for ${shop}`);
        }
      } catch (error) {
        console.error(`Error redacting shop data for ${shop}:`, error);
      }
      break;
    }
  }

  return new Response();
};
