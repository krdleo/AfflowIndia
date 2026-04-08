/**
 * TDS Settings
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
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop }, include: { tdsSetting: true } });
  if (!shop) throw new Response("Shop not found", { status: 404 });

  return {
    isEnabled: shop.tdsSetting?.isEnabled || false,
    tdsRate: Number(shop.tdsSetting?.tdsRate || 10),
    annualThreshold: Number(shop.tdsSetting?.annualThreshold || 20000),
    canUseTds: planHasFeature(shop.plan, "tds_compliance"),
    plan: shop.plan,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response("Shop not found", { status: 404 });

  if (!planHasFeature(shop.plan, "tds_compliance")) {
    return { error: "TDS features require the Pro plan" };
  }

  const formData = await request.formData();
  const isEnabled = formData.get("isEnabled") === "true";
  const tdsRate = parseFloat(formData.get("tdsRate") as string) || 10;
  const annualThreshold = parseFloat(formData.get("annualThreshold") as string) || 20000;

  await db.tdsSetting.upsert({
    where: { shopId: shop.id },
    update: { isEnabled, tdsRate, annualThreshold },
    create: { shopId: shop.id, isEnabled, tdsRate, annualThreshold },
  });

  return { success: true, message: "TDS settings saved" };
};

export default function TdsSettings() {
  const { isEnabled, tdsRate, annualThreshold, canUseTds } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();
  const [enabled, setEnabled] = useState(isEnabled);
  const [rate, setRate] = useState(tdsRate.toString());
  const [threshold, setThreshold] = useState(annualThreshold.toString());

  useEffect(() => {
    if (fetcher.data) {
      const data = fetcher.data as Record<string, unknown>;
      if (data.success) shopify.toast.show(data.message as string);
      if (data.error) shopify.toast.show(data.error as string, { isError: true });
    }
  }, [fetcher.data, shopify]);

  if (!canUseTds) {
    return (
      <s-page heading="TDS Settings" backAction={{ url: "/app/settings" }}>
        <s-banner tone="warning">TDS compliance features require the Pro plan. <s-button href="/app/settings/billing" variant="primary">Upgrade</s-button></s-banner>
      </s-page>
    );
  }

  return (
    <s-page heading="TDS Settings" backAction={{ url: "/app/settings" }}>
      <s-button slot="primary-action" variant="primary" onClick={() => {
        fetcher.submit({ isEnabled: String(enabled), tdsRate: rate, annualThreshold: threshold }, { method: "POST" });
      }}>Save</s-button>

      <s-card>
        <s-text variant="headingMd">TDS Compliance</s-text>
        <s-text tone="subdued">When enabled, TDS will be deducted from payouts when an affiliate's cumulative payouts exceed the annual threshold.</s-text>
        <s-checkbox checked={enabled ? true : undefined} onChange={(e: CustomEvent) => setEnabled((e.target as HTMLInputElement).checked)}>Enable TDS deduction</s-checkbox>
        {enabled && (
          <>
            <s-text-field label="TDS Rate (%)" type="number" value={rate} min="0" max="100" step="0.5" onInput={(e: CustomEvent) => setRate((e.target as HTMLInputElement).value)} helpText="Default: 10% (Section 194H)" />
            <s-text-field label="Annual Threshold (₹)" type="number" value={threshold} min="0" onInput={(e: CustomEvent) => setThreshold((e.target as HTMLInputElement).value)} helpText="TDS applies only when cumulative payouts exceed this amount in a financial year. Default: ₹20,000" />
          </>
        )}
      </s-card>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => { return boundary.headers(headersArgs); };
