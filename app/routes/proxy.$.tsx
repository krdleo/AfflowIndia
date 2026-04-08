/**
 * App Proxy Click Tracking
 *
 * Handles: GET /proxy/:code
 * Route: store.myshopify.com/a/ref/:code
 *
 * 1. Verify Shopify App Proxy HMAC signature
 * 2. Look up affiliate by referral code
 * 3. Atomically increment totalClicks
 * 4. Redirect to shop homepage
 */

import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Authenticate the app proxy request (verifies HMAC signature)
  const { session } = await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const shop = url.searchParams.get("shop") || "";

  // Extract the referral code from the path
  // URL format: /proxy/CODE or /proxy/some/path
  const pathParts = url.pathname.split("/").filter(Boolean);
  const code = pathParts[pathParts.length - 1]; // Last segment

  if (!code || code === "proxy") {
    return new Response("Invalid referral code", { status: 400 });
  }

  try {
    // Find the shop
    const shopRecord = await db.shop.findUnique({
      where: { shopDomain: shop },
    });

    if (!shopRecord || !shopRecord.isActive) {
      // Redirect to shop anyway
      return Response.redirect(`https://${shop}`, 302);
    }

    // Find affiliate by referral code
    const affiliate = await db.affiliate.findFirst({
      where: {
        shopId: shopRecord.id,
        referralCode: code,
        status: "ACTIVE",
      },
    });

    if (affiliate) {
      // Atomically increment totalClicks
      await db.affiliate.update({
        where: { id: affiliate.id },
        data: { totalClicks: { increment: 1 } },
      });
    }

    // Redirect to shop homepage
    return Response.redirect(`https://${shop}`, 302);
  } catch (error) {
    console.error("Click tracking error:", error);
    // Always redirect to the shop even on error
    return Response.redirect(`https://${shop}`, 302);
  }
};
