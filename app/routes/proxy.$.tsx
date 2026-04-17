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

// Shopify shop domain shape: lowercase alphanumeric, hyphens, ending in .myshopify.com
// (plus optional custom domains that Shopify authenticates the proxy through).
// Validating keeps an attacker from crafting a click URL whose `?shop=`
// points at an unrelated host.
const SHOP_DOMAIN_RE = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

// Shared 302 response with no-cache so browsers/CDNs never serve a cached
// redirect that would skip the click-increment side effect.
function redirectToShop(shop: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: `https://${shop}`,
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
    },
  });
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Authenticate the app proxy request (verifies HMAC signature).
  const { session } = await authenticate.public.appProxy(request);

  const url = new URL(request.url);
  const queryShop = url.searchParams.get("shop")?.toLowerCase() || "";

  // Prefer the shop the session was authenticated for — never the raw query
  // param, which could be tampered with pre-HMAC-validation layers.
  const shop = (session?.shop || queryShop).toLowerCase();

  if (!shop || !SHOP_DOMAIN_RE.test(shop)) {
    return new Response("Invalid shop", { status: 400 });
  }

  // Extract the referral code from the path
  // URL format: /proxy/CODE or /proxy/some/path
  const pathParts = url.pathname.split("/").filter(Boolean);
  const code = pathParts[pathParts.length - 1]; // Last segment

  if (!code || code === "proxy") {
    return new Response("Invalid referral code", { status: 400 });
  }

  try {
    const shopRecord = await db.shop.findUnique({
      where: { shopDomain: shop },
    });

    if (!shopRecord || !shopRecord.isActive) {
      return redirectToShop(shop);
    }

    const affiliate = await db.affiliate.findFirst({
      where: {
        shopId: shopRecord.id,
        referralCode: code,
        status: "ACTIVE",
      },
    });

    if (affiliate) {
      await db.affiliate.update({
        where: { id: affiliate.id },
        data: { totalClicks: { increment: 1 } },
      });
    }

    return redirectToShop(shop);
  } catch (error) {
    console.error(
      "Click tracking error:",
      error instanceof Error ? error.message : "unknown error"
    );
    return redirectToShop(shop);
  }
};
