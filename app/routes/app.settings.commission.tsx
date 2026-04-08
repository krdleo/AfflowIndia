/**
 * Commission Settings Page
 *
 * - Toggle FLAT vs TIERED mode
 * - Flat: global commission rate
 * - Tiered: dynamic tier bracket editor
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
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response("Shop not found", { status: 404 });

  return {
    commissionMode: shop.commissionMode,
    defaultCommissionRate: Number(shop.defaultCommissionRate),
    commissionTiers: (shop.commissionTiers as Array<{ thresholdAmount: number; ratePercent: number }>) || [],
    plan: shop.plan,
    canUseTiered: planHasFeature(shop.plan, "tiered_commissions"),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response("Shop not found", { status: 404 });

  const formData = await request.formData();
  const mode = formData.get("commissionMode") as string;
  const rate = parseFloat(formData.get("defaultCommissionRate") as string);
  const tiersJson = formData.get("commissionTiers") as string;

  if (mode === "TIERED" && !planHasFeature(shop.plan, "tiered_commissions")) {
    return { error: "Tiered commissions require Starter plan or higher" };
  }

  await db.shop.update({
    where: { id: shop.id },
    data: {
      commissionMode: mode as "FLAT" | "TIERED",
      defaultCommissionRate: rate,
      commissionTiers: tiersJson ? JSON.parse(tiersJson) : null,
    },
  });

  return { success: true, message: "Commission settings saved" };
};

export default function CommissionSettings() {
  const { commissionMode, defaultCommissionRate, commissionTiers, canUseTiered } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [mode, setMode] = useState(commissionMode);
  const [rate, setRate] = useState(defaultCommissionRate.toString());
  const [tiers, setTiers] = useState(commissionTiers);

  useEffect(() => {
    if (fetcher.data) {
      const data = fetcher.data as Record<string, unknown>;
      if (data.success) shopify.toast.show(data.message as string);
      if (data.error) shopify.toast.show(data.error as string, { isError: true });
    }
  }, [fetcher.data, shopify]);

  const handleSave = () => {
    fetcher.submit(
      {
        commissionMode: mode,
        defaultCommissionRate: rate,
        commissionTiers: JSON.stringify(tiers),
      },
      { method: "POST" }
    );
  };

  const addTier = () => {
    setTiers([...tiers, { thresholdAmount: 0, ratePercent: 0 }]);
  };

  const removeTier = (index: number) => {
    setTiers(tiers.filter((_, i) => i !== index));
  };

  const updateTier = (index: number, field: string, value: number) => {
    const updated = [...tiers];
    updated[index] = { ...updated[index], [field]: value };
    setTiers(updated);
  };

  return (
    <s-page heading="Commission Settings" backAction={{ url: "/app/settings" }}>
      <s-button slot="primary-action" variant="primary" onClick={handleSave}>
        Save
      </s-button>

      <s-card>
        <s-text variant="headingMd">Commission Mode</s-text>
        <s-stack direction="block" gap="base">
          <s-choice-list
            title="How should commissions be calculated?"
            selected={[mode]}
            onChange={(e: CustomEvent) => setMode(e.detail[0])}
          >
            <s-choice value="FLAT">
              Flat Rate — Same percentage for all affiliates
            </s-choice>
            <s-choice value="TIERED" disabled={!canUseTiered}>
              Tiered — Different rates based on affiliate performance
              {!canUseTiered && " (Starter plan required)"}
            </s-choice>
          </s-choice-list>
        </s-stack>
      </s-card>

      <s-card>
        <s-text variant="headingMd">Default Commission Rate</s-text>
        <s-text-field
          label="Commission Rate (%)"
          type="number"
          value={rate}
          min="0"
          max="100"
          step="0.5"
          onInput={(e: CustomEvent) => setRate((e.target as HTMLInputElement).value)}
          helpText="This rate applies to all affiliates unless overridden"
        />
      </s-card>

      {mode === "TIERED" && (
        <s-card>
          <s-text variant="headingMd">Commission Tiers</s-text>
          <s-text tone="subdued">
            Define sales thresholds and their corresponding commission rates.
            Affiliates automatically get the highest tier they qualify for.
          </s-text>

          {tiers.map((tier, index) => (
            <s-card key={index}>
              <s-stack direction="inline" gap="base" align="end">
                <s-text-field
                  label={`Tier ${index + 1} — Sales Threshold (₹)`}
                  type="number"
                  value={tier.thresholdAmount.toString()}
                  min="0"
                  onInput={(e: CustomEvent) =>
                    updateTier(index, "thresholdAmount", parseFloat((e.target as HTMLInputElement).value) || 0)
                  }
                />
                <s-text-field
                  label="Commission Rate (%)"
                  type="number"
                  value={tier.ratePercent.toString()}
                  min="0"
                  max="100"
                  step="0.5"
                  onInput={(e: CustomEvent) =>
                    updateTier(index, "ratePercent", parseFloat((e.target as HTMLInputElement).value) || 0)
                  }
                />
                <s-button tone="critical" onClick={() => removeTier(index)}>
                  Remove
                </s-button>
              </s-stack>
            </s-card>
          ))}

          <s-button onClick={addTier}>+ Add Tier</s-button>
        </s-card>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
