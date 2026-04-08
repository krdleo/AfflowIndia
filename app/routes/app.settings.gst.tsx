/**
 * GST Settings
 */
import { useState, useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { planHasFeature } from "../lib/plan-features.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop }, include: { gstSetting: true } });
  if (!shop) throw new Response("Shop not found", { status: 404 });

  return {
    isEnabled: shop.gstSetting?.isEnabled || false,
    gstRate: Number(shop.gstSetting?.gstRate || 18),
    canUseGst: planHasFeature(shop.plan, "gst_invoicing"),
    plan: shop.plan,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response("Shop not found", { status: 404 });

  if (!planHasFeature(shop.plan, "gst_invoicing")) {
    return { error: "GST features require the Pro plan" };
  }

  const formData = await request.formData();
  const isEnabled = formData.get("isEnabled") === "true";
  const gstRate = parseFloat(formData.get("gstRate") as string) || 18;

  await db.gstSetting.upsert({
    where: { shopId: shop.id },
    update: { isEnabled, gstRate },
    create: { shopId: shop.id, isEnabled, gstRate },
  });

  return { success: true, message: "GST settings saved" };
};

export default function GstSettings() {
  const { isEnabled, gstRate, canUseGst } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [enabled, setEnabled] = useState(isEnabled);
  const [rate, setRate] = useState(gstRate.toString());

  useEffect(() => {
    if (fetcher.data) {
      const data = fetcher.data as Record<string, unknown>;
      if (data.success) shopify.toast.show(data.message as string);
      if (data.error) shopify.toast.show(data.error as string, { isError: true });
    }
  }, [fetcher.data, shopify]);

  if (!canUseGst) {
    return (
      <s-page heading="GST Settings" backAction={{ url: "/app/settings" }}>
        <s-banner tone="warning">GST compliance features require the Pro plan. <s-button href="/app/settings/billing" variant="primary">Upgrade</s-button></s-banner>
      </s-page>
    );
  }

  return (
    <s-page heading="GST Settings" backAction={{ url: "/app/settings" }}>
      <s-button slot="primary-action" variant="primary" onClick={() => {
        fetcher.submit({ isEnabled: String(enabled), gstRate: rate }, { method: "POST" });
      }}>Save</s-button>
      <s-card>
        <s-text variant="headingMd">GST Compliance</s-text>
        <s-text tone="subdued">When enabled, GST will be added to affiliate payouts: payoutAmount = commission + (commission × GST rate)</s-text>
        <s-checkbox checked={enabled ? true : undefined} onChange={(e: CustomEvent) => setEnabled((e.target as HTMLInputElement).checked)}>Enable GST on payouts</s-checkbox>
        {enabled && (
          <s-text-field label="GST Rate (%)" type="number" value={rate} min="0" max="100" step="0.5" onInput={(e: CustomEvent) => setRate((e.target as HTMLInputElement).value)} helpText="Default: 18% (standard GST rate in India)" />
        )}
      </s-card>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => { return boundary.headers(headersArgs); };
