/**
 * Webhook: app_subscriptions/update
 *
 * Fires when a merchant's subscription changes state — approved, declined,
 * expired, cancelled, trial started/ended. We mirror Shopify's source of
 * truth into shop.plan so feature gating doesn't drift.
 *
 * Payload shape (2026-04):
 *   app_subscription: { admin_graphql_api_id, name, status, ... }
 * status is one of: ACTIVE, CANCELLED, DECLINED, EXPIRED, FROZEN, PENDING, ACCEPTED
 */

import type { ActionFunctionArgs } from "react-router";
import type { Plan } from "@prisma/client";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { invalidatePlanCache } from "../lib/billing.server";

type AppSubscriptionUpdatePayload = {
  app_subscription?: {
    name?: string;
    status?: string;
    admin_graphql_api_id?: string;
  };
};

function planFromName(name: string | undefined): Plan {
  if (!name) return "FREE";
  const upper = name.toUpperCase();
  if (upper.includes("PRO")) return "PRO";
  if (upper.includes("STARTER")) return "STARTER";
  return "FREE";
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const sub = (payload as AppSubscriptionUpdatePayload).app_subscription;

  const status = sub?.status?.toUpperCase();
  const activeStatuses = new Set(["ACTIVE", "ACCEPTED"]);
  const nextPlan: Plan = activeStatuses.has(status || "")
    ? planFromName(sub?.name)
    : "FREE";

  await db.shop.updateMany({
    where: { shopDomain: shop },
    data: { plan: nextPlan },
  });

  invalidatePlanCache(shop);

  return new Response(JSON.stringify({ ok: true, plan: nextPlan }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
