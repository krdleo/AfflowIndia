/**
 * Billing Settings Page — Plan & Billing
 */
import { useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useNavigate, useRouteError } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { PLAN_CONFIGS, createSubscription, resolvePlan } from "../lib/billing.server";
import { getPlanFeatures } from "../lib/plan-features.server";
import {
  Page,
  Banner,
  Layout,
  Card,
  BlockStack,
  Text,
  Divider,
  List,
  Badge,
  Button,
} from "@shopify/polaris";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response("Shop not found", { status: 404 });

  // Resolve plan from Shopify on every billing-page load so the UI shows the
  // real subscription state after the merchant returns from the confirmation
  // URL. The webhook keeps it in sync continuously; this is belt-and-braces.
  const currentPlan = await resolvePlan(admin, session.shop);

  const affiliateCount = await db.affiliate.count({
    where: { shopId: shop.id, status: { not: "SUSPENDED" } },
  });

  return {
    currentPlan,
    affiliateCount,
    plans: Object.entries(PLAN_CONFIGS).map(([key, config]) => ({
      key,
      ...config,
      features: getPlanFeatures(key as "FREE" | "PREMIUM"),
      isCurrent: key === currentPlan,
      affiliateLimit: config.affiliateLimit === Infinity ? "Unlimited" : config.affiliateLimit.toString(),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const targetPlan = formData.get("plan") as "PREMIUM";

  if (targetPlan !== "PREMIUM") {
    return { error: "Invalid plan" };
  }

  try {
    const returnUrl = `https://${session.shop}/admin/apps/${process.env.SHOPIFY_API_KEY}/app/settings/billing`;
    const confirmationUrl = await createSubscription(admin, targetPlan, returnUrl);

    if (confirmationUrl) {
      return { confirmationUrl };
    }

    return { error: "Failed to create subscription" };
  } catch (error) {
    return { error: (error as Error).message };
  }
};

export default function BillingSettings() {
  const { currentPlan, affiliateCount, plans } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();

  useEffect(() => {
    if (fetcher.data) {
      const data = fetcher.data as Record<string, unknown>;
      if (data.confirmationUrl) {
        // Navigate the top-level frame (outside the iframe) to Shopify's billing confirmation page
        window.open(data.confirmationUrl as string, "_top");
      } else if (data.error) {
        shopify.toast.show(data.error as string, { isError: true });
      }
    }
  }, [fetcher.data]);

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
    <Page
      title="Plan & Billing"
      backAction={{ content: "Settings", onAction: () => navigate("/app/settings") }}
    >
      <BlockStack gap="400">
        <Banner tone="info">
          <p>
            You're currently on the <strong>{currentPlan}</strong> plan with{" "}
            <strong>{affiliateCount}</strong> active affiliate(s).
          </p>
        </Banner>

        <Layout>
          {plans.map((plan) => (
            <Layout.Section key={plan.key} variant="oneHalf">
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingLg">{plan.name}</Text>
                  <Text as="p" variant="heading2xl">{plan.displayPrice}</Text>
                  <Text as="p" tone="subdued">
                    {plan.affiliateLimit === "Unlimited"
                      ? "Unlimited affiliates"
                      : `Up to ${plan.affiliateLimit} affiliates`}
                    {plan.trialDays > 0 && ` · ${plan.trialDays}-day free trial`}
                  </Text>

                  <Divider />

                  <Text as="h3" variant="headingSm">Features:</Text>
                  <List type="bullet">
                    <List.Item>Flat commission rates</List.Item>
                    <List.Item>Manual payouts</List.Item>
                    <List.Item>Basic dashboard</List.Item>
                    <List.Item>Referral tracking</List.Item>
                    {plan.features.map((f) => (
                      <List.Item key={f}>
                        {featureLabels[f] || f}
                      </List.Item>
                    ))}
                  </List>

                  {plan.isCurrent ? (
                    <Badge tone="success">Current Plan</Badge>
                  ) : plan.key !== "FREE" ? (
                    <Button
                      variant="primary"
                      fullWidth
                      onClick={() =>
                        fetcher.submit({ plan: plan.key }, { method: "POST" })
                      }
                    >
                      Upgrade to {plan.name}
                    </Button>
                  ) : null}
                </BlockStack>
              </Card>
            </Layout.Section>
          ))}
        </Layout>
      </BlockStack>
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
