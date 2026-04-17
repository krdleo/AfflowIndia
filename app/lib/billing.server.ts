/**
 * Billing Utilities
 *
 * Three-tier pricing model:
 * - FREE: ₹0 / $0, 20 affiliates
 * - STARTER: ₹999/mo (~$12), 200 affiliates
 * - PRO: ₹2,999/mo (~$36), unlimited affiliates
 *
 * Uses Shopify Billing API (appSubscriptionCreate mutation). The Shopify
 * Billing API requires the charge to be in the shop's billing currency.
 * We fetch shop.currencyCode before subscription creation and pick INR
 * pricing for Indian merchants, USD otherwise.
 */

import type { Plan } from "@prisma/client";
import prisma from "../db.server";

export interface PlanConfig {
  name: string;
  displayPrice: string;
  usdAmount: number;
  inrAmount: number;
  affiliateLimit: number;
  trialDays: number;
}

export const PLAN_CONFIGS: Record<Plan, PlanConfig> = {
  FREE: {
    name: "Free",
    displayPrice: "₹0",
    usdAmount: 0,
    inrAmount: 0,
    affiliateLimit: 20,
    trialDays: 0,
  },
  STARTER: {
    name: "Starter",
    displayPrice: "₹999/mo",
    usdAmount: 12,
    inrAmount: 999,
    affiliateLimit: 200,
    trialDays: 14,
  },
  PRO: {
    name: "Pro",
    displayPrice: "₹2,999/mo",
    usdAmount: 36,
    inrAmount: 2999,
    affiliateLimit: Infinity,
    trialDays: 14,
  },
};

// In-memory cache for billing status (5-minute TTL)
const billingCache = new Map<
  string,
  { plan: Plan; timestamp: number }
>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function invalidatePlanCache(shopDomain: string) {
  billingCache.delete(shopDomain);
}

/**
 * Resolve the current plan for a shop
 * Checks Shopify subscription and caches result for 5 minutes
 */
export async function resolvePlan(
  admin: {
    graphql: (query: string) => Promise<Response>;
  },
  shopDomain: string
): Promise<Plan> {
  // Check cache first
  const cached = billingCache.get(shopDomain);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.plan;
  }

  try {
    const response = await admin.graphql(
      `#graphql
      query {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
            lineItems {
              plan {
                pricingDetails {
                  ... on AppRecurringPricing {
                    price {
                      amount
                      currencyCode
                    }
                  }
                }
              }
            }
          }
        }
      }`
    );

    const json = await response.json();
    const subscriptions =
      json.data?.currentAppInstallation?.activeSubscriptions || [];

    let plan: Plan = "FREE";

    for (const sub of subscriptions) {
      if (sub.status === "ACTIVE") {
        const amount = parseFloat(
          sub.lineItems?.[0]?.plan?.pricingDetails?.price?.amount || "0"
        );
        if (amount >= 30) {
          plan = "PRO";
        } else if (amount >= 10) {
          plan = "STARTER";
        }
      }
    }

    // Update the shop record
    await prisma.shop.updateMany({
      where: { shopDomain },
      data: { plan },
    });

    // Cache the result
    billingCache.set(shopDomain, { plan, timestamp: Date.now() });

    return plan;
  } catch (error) {
    console.error("Error resolving plan:", error);
    // Fallback to database
    const shop = await prisma.shop.findUnique({
      where: { shopDomain },
      select: { plan: true },
    });
    return shop?.plan || "FREE";
  }
}

/**
 * Fetch the shop's billing currency from the Shopify Admin API.
 * Shopify Billing API only accepts the shop's currency or USD; we use
 * INR if the shop is configured in rupees so Indian merchants see the
 * ₹ price they agreed to, not a USD conversion.
 */
async function getShopCurrency(admin: {
  graphql: (query: string) => Promise<Response>;
}): Promise<string> {
  try {
    const response = await admin.graphql(
      `#graphql
      query { shop { currencyCode } }`
    );
    const json = await response.json();
    return json.data?.shop?.currencyCode || "USD";
  } catch {
    return "USD";
  }
}

/**
 * Create a subscription for a shop
 * @returns The confirmation URL to redirect the merchant to
 */
export async function createSubscription(
  admin: {
    graphql: (
      query: string,
      options?: { variables?: Record<string, unknown> }
    ) => Promise<Response>;
  },
  plan: "STARTER" | "PRO",
  returnUrl: string
): Promise<string | null> {
  const config = PLAN_CONFIGS[plan];
  const shopCurrency = await getShopCurrency(admin);
  const useINR = shopCurrency === "INR";
  const amount = useINR ? config.inrAmount : config.usdAmount;
  const currencyCode = useINR ? "INR" : "USD";

  // Dev stores and development-mode apps must use `test: true` to avoid
  // real charges. SHOPIFY_APP_LIVE is set to "true" only in production.
  const isLive = process.env.SHOPIFY_APP_LIVE === "true";

  const response = await admin.graphql(
    `#graphql
    mutation appSubscriptionCreate(
      $name: String!
      $lineItems: [AppSubscriptionLineItemInput!]!
      $returnUrl: URL!
      $trialDays: Int
      $test: Boolean
    ) {
      appSubscriptionCreate(
        name: $name
        returnUrl: $returnUrl
        lineItems: $lineItems
        trialDays: $trialDays
        test: $test
      ) {
        userErrors {
          field
          message
        }
        confirmationUrl
        appSubscription {
          id
        }
      }
    }`,
    {
      variables: {
        name: `AfflowIndia ${config.name}`,
        returnUrl,
        trialDays: config.trialDays,
        test: !isLive,
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount, currencyCode },
                interval: "EVERY_30_DAYS",
              },
            },
          },
        ],
      },
    }
  );

  const json = await response.json();
  const data = json.data?.appSubscriptionCreate;

  if (data?.userErrors?.length > 0) {
    throw new Error(
      `Failed to create subscription: ${data.userErrors
        .map((e: { message: string }) => e.message)
        .join(", ")}`
    );
  }

  return data?.confirmationUrl || null;
}

/**
 * Cancel the current subscription for a shop
 */
export async function cancelSubscription(
  admin: {
    graphql: (query: string) => Promise<Response>;
  },
  shopDomain: string
): Promise<boolean> {
  try {
    // Get active subscription
    const response = await admin.graphql(
      `#graphql
      query {
        currentAppInstallation {
          activeSubscriptions {
            id
          }
        }
      }`
    );

    const json = await response.json();
    const subscriptions =
      json.data?.currentAppInstallation?.activeSubscriptions || [];

    if (subscriptions.length === 0) return true;

    // Cancel each active subscription
    for (const sub of subscriptions) {
      await admin.graphql(
        `#graphql
        mutation appSubscriptionCancel($id: ID!) {
          appSubscriptionCancel(id: $id) {
            userErrors {
              field
              message
            }
          }
        }`,
        // @ts-expect-error graphql call with variables
        { variables: { id: sub.id } }
      );
    }

    // Update shop plan
    await prisma.shop.updateMany({
      where: { shopDomain },
      data: { plan: "FREE" },
    });

    // Clear cache
    billingCache.delete(shopDomain);

    return true;
  } catch (error) {
    console.error("Error cancelling subscription:", error);
    return false;
  }
}

/**
 * Check if a shop has reached its affiliate limit
 */
export async function checkAffiliateLimit(
  shopId: string,
  plan: Plan
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const limit = PLAN_CONFIGS[plan].affiliateLimit;
  const current = await prisma.affiliate.count({
    where: { shopId, status: { not: "SUSPENDED" } },
  });

  return {
    allowed: current < limit,
    current,
    limit: limit === Infinity ? -1 : limit,
  };
}
