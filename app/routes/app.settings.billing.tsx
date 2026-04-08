/**
 * Billing Settings Page — Plan & Billing
 */
import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, redirect } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { PLAN_CONFIGS, createSubscription } from "../lib/billing.server";
import { getPlanFeatures } from "../lib/plan-features.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response("Shop not found", { status: 404 });

  const affiliateCount = await db.affiliate.count({
    where: { shopId: shop.id, status: { not: "SUSPENDED" } },
  });

  return {
    currentPlan: shop.plan,
    affiliateCount,
    plans: Object.entries(PLAN_CONFIGS).map(([key, config]) => ({
      key,
      ...config,
      features: getPlanFeatures(key as "FREE" | "STARTER" | "PRO"),
      isCurrent: key === shop.plan,
      affiliateLimit: config.affiliateLimit === Infinity ? "Unlimited" : config.affiliateLimit.toString(),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const targetPlan = formData.get("plan") as "STARTER" | "PRO";

  if (!targetPlan || !["STARTER", "PRO"].includes(targetPlan)) {
    return { error: "Invalid plan" };
  }

  try {
    const returnUrl = `${process.env.SHOPIFY_APP_URL}/app/settings/billing`;
    const confirmationUrl = await createSubscription(admin, targetPlan, returnUrl);

    if (confirmationUrl) {
      return redirect(confirmationUrl);
    }

    return { error: "Failed to create subscription" };
  } catch (error) {
    return { error: (error as Error).message };
  }
};

export default function BillingSettings() {
  const { currentPlan, affiliateCount, plans } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  useEffect(() => {
    if (fetcher.data) {
      const data = fetcher.data as Record<string, unknown>;
      if (data.error) shopify.toast.show(data.error as string, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const featureLabels: Record<string, string> = {
    tiered_commissions: "Tiered Commissions",
    custom_codes: "Custom Affiliate Codes",
    portal_customization: "Portal Customization",
    email_notifications: "Email Notifications",
    razorpay_payouts: "Razorpay X Auto-Payouts",
    gst_invoicing: "GST Compliance",
    tds_compliance: "TDS Compliance",
    fraud_detection: "Fraud Detection",
    whatsapp_sharing: "WhatsApp Sharing",
    realtime_analytics: "Real-time Analytics",
    product_commissions: "Product-level Commissions",
    milestone_bonuses: "Milestone Bonuses",
    auto_payouts: "Auto Monthly Payouts",
    creative_assets: "Creative Asset Library",
    unique_coupon_codes: "Unique Coupon Codes",
  };

  return (
    <s-page heading="Plan & Billing" backAction={{ url: "/app/settings" }}>
      <s-banner tone="info">
        You're currently on the <strong>{currentPlan}</strong> plan with{" "}
        <strong>{affiliateCount}</strong> active affiliate(s).
      </s-banner>

      <s-layout>
        {plans.map((plan) => (
          <s-layout-section key={plan.key} variant="oneThird">
            <s-card>
              <s-stack direction="block" gap="base">
                <s-text variant="headingLg">{plan.name}</s-text>
                <s-text variant="heading2xl">{plan.displayPrice}</s-text>
                <s-text tone="subdued">
                  Up to {plan.affiliateLimit} affiliates
                  {plan.trialDays > 0 && ` · ${plan.trialDays}-day free trial`}
                </s-text>

                <s-divider />

                <s-text variant="headingSm">Features:</s-text>
                <s-unordered-list>
                  <s-list-item>Flat commission rates</s-list-item>
                  <s-list-item>Manual payouts</s-list-item>
                  <s-list-item>Basic dashboard</s-list-item>
                  <s-list-item>Referral tracking</s-list-item>
                  {plan.features.map((f) => (
                    <s-list-item key={f}>
                      {featureLabels[f] || f}
                    </s-list-item>
                  ))}
                </s-unordered-list>

                {plan.isCurrent ? (
                  <s-badge tone="success">Current Plan</s-badge>
                ) : plan.key !== "FREE" ? (
                  <s-button
                    variant="primary"
                    fullWidth
                    onClick={() =>
                      fetcher.submit({ plan: plan.key }, { method: "POST" })
                    }
                  >
                    {currentPlan === "PRO" ? "Switch to" : "Upgrade to"} {plan.name}
                  </s-button>
                ) : null}
              </s-stack>
            </s-card>
          </s-layout-section>
        ))}
      </s-layout>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
