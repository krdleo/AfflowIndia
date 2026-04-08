/**
 * Settings Hub — Main settings navigation page
 *
 * Card-based navigation to 6 sub-pages.
 * Each card shows current configuration summary.
 */

import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { Outlet } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const shop = await db.shop.findUnique({
    where: { shopDomain },
    include: { gstSetting: true, tdsSetting: true },
  });

  if (!shop) throw new Response("Shop not found", { status: 404 });

  return {
    shop: {
      plan: shop.plan,
      payoutMode: shop.payoutMode,
      commissionMode: shop.commissionMode,
      defaultCommissionRate: Number(shop.defaultCommissionRate),
      gstEnabled: shop.gstSetting?.isEnabled || false,
      gstRate: Number(shop.gstSetting?.gstRate || 18),
      tdsEnabled: shop.tdsSetting?.isEnabled || false,
      tdsRate: Number(shop.tdsSetting?.tdsRate || 10),
    },
  };
};

export default function Settings() {
  const { shop } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Settings">
      <s-layout>
        <s-layout-section>
          {/* Commission Settings */}
          <s-card>
            <s-stack direction="inline" gap="base" align="space-between">
              <s-stack direction="block" gap="tight">
                <s-text variant="headingMd">Commission Settings</s-text>
                <s-text tone="subdued">
                  Mode: {shop.commissionMode} · Default rate: {shop.defaultCommissionRate}%
                </s-text>
              </s-stack>
              <s-button href="/app/settings/commission">Configure</s-button>
            </s-stack>
          </s-card>

          {/* Payout Settings */}
          <s-card>
            <s-stack direction="inline" gap="base" align="space-between">
              <s-stack direction="block" gap="tight">
                <s-text variant="headingMd">Payout Settings</s-text>
                <s-text tone="subdued">
                  Mode: {shop.payoutMode === "RAZORPAY_X" ? "Razorpay X (Auto)" : "Manual"}
                </s-text>
              </s-stack>
              <s-button href="/app/settings/payout">Configure</s-button>
            </s-stack>
          </s-card>

          {/* Portal Customization */}
          <s-card>
            <s-stack direction="inline" gap="base" align="space-between">
              <s-stack direction="block" gap="tight">
                <s-text variant="headingMd">Portal Customization</s-text>
                <s-text tone="subdued">
                  Customize your affiliate portal&apos;s look and feel
                </s-text>
              </s-stack>
              <s-button href="/app/settings/portal">Customize</s-button>
            </s-stack>
          </s-card>

          {/* GST Settings */}
          <s-card>
            <s-stack direction="inline" gap="base" align="space-between">
              <s-stack direction="block" gap="tight">
                <s-text variant="headingMd">GST Settings</s-text>
                <s-text tone="subdued">
                  {shop.gstEnabled ? `Enabled · ${shop.gstRate}% rate` : "Disabled"}
                </s-text>
              </s-stack>
              <s-button href="/app/settings/gst">Configure</s-button>
            </s-stack>
          </s-card>

          {/* TDS Settings */}
          <s-card>
            <s-stack direction="inline" gap="base" align="space-between">
              <s-stack direction="block" gap="tight">
                <s-text variant="headingMd">TDS Settings</s-text>
                <s-text tone="subdued">
                  {shop.tdsEnabled ? `Enabled · ${shop.tdsRate}% rate` : "Disabled"}
                </s-text>
              </s-stack>
              <s-button href="/app/settings/tds">Configure</s-button>
            </s-stack>
          </s-card>

          {/* Plan & Billing */}
          <s-card>
            <s-stack direction="inline" gap="base" align="space-between">
              <s-stack direction="block" gap="tight">
                <s-text variant="headingMd">Plan & Billing</s-text>
                <s-badge tone={shop.plan === "FREE" ? "warning" : "success"}>
                  {shop.plan} Plan
                </s-badge>
              </s-stack>
              <s-button href="/app/settings/billing">Manage</s-button>
            </s-stack>
          </s-card>
        </s-layout-section>
      </s-layout>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
