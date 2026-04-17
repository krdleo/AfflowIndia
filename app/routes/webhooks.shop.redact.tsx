/**
 * GDPR Webhook: shop/redact
 *
 * Delivered 48 hours after a shop uninstalls the app.
 * Delete ALL shop data — we have no further right to retain it.
 *
 * Respond 200 with JSON. Keep under 5 seconds.
 */

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop } = await authenticate.webhook(request);

  try {
    const shopRecord = await db.shop.findUnique({
      where: { shopDomain: shop },
    });

    if (shopRecord) {
      await db.$transaction([
        db.payout.deleteMany({ where: { shopId: shopRecord.id } }),
        db.referral.deleteMany({ where: { shopId: shopRecord.id } }),
        db.affiliate.deleteMany({ where: { shopId: shopRecord.id } }),
        db.gstSetting.deleteMany({ where: { shopId: shopRecord.id } }),
        db.tdsSetting.deleteMany({ where: { shopId: shopRecord.id } }),
        db.shop.delete({ where: { id: shopRecord.id } }),
      ]);
    }

    await db.session.deleteMany({ where: { shop } });

    return new Response(JSON.stringify({ redacted: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(
      `shop/redact failed for ${shop}:`,
      error instanceof Error ? error.message : "unknown error"
    );
    return new Response(JSON.stringify({ redacted: false }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
};
