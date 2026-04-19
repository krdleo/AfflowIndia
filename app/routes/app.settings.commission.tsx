/**
 * Commission Settings Page
 *
 * - Toggle FLAT vs TIERED mode
 * - Flat: global commission rate
 * - Tiered: dynamic tier bracket editor
 */

import { useState, useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useNavigate, useRouteError } from "react-router";
import { Prisma } from "@prisma/client";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { planHasFeature } from "../lib/plan-features.server";
import { commissionSettingsSchema } from "../lib/validation.server";
import {
  Page,
  Card,
  Text,
  Button,
  ChoiceList,
  TextField,
  InlineStack,
  BlockStack,
  Box,
} from "@shopify/polaris";

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
  const tiersJson = (formData.get("commissionTiers") as string) || "";

  let tiers: Array<{ thresholdAmount: number; ratePercent: number }> | undefined;
  if (tiersJson) {
    try {
      const raw = JSON.parse(tiersJson);
      tiers = Array.isArray(raw) ? raw : undefined;
    } catch {
      return { error: "Invalid tier configuration" };
    }
  }

  const parsed = commissionSettingsSchema.safeParse({
    commissionMode: formData.get("commissionMode"),
    defaultCommissionRate: parseFloat((formData.get("defaultCommissionRate") as string) || "0"),
    commissionTiers: tiers,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message || "Invalid commission settings" };
  }

  const { commissionMode, defaultCommissionRate, commissionTiers } = parsed.data;

  if (commissionMode === "TIERED" && !planHasFeature(shop.plan, "tiered_commissions")) {
    return { error: "Tiered commissions require the Premium plan" };
  }

  await db.shop.update({
    where: { id: shop.id },
    data: {
      commissionMode,
      defaultCommissionRate,
      commissionTiers:
        commissionTiers && commissionTiers.length > 0 ? commissionTiers : Prisma.JsonNull,
    },
  });

  return { success: true, message: "Commission settings saved" };
};

export default function CommissionSettings() {
  const { commissionMode, defaultCommissionRate, commissionTiers, canUseTiered } =
    useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"FLAT" | "TIERED">(commissionMode);
  const [rate, setRate] = useState(defaultCommissionRate.toString());
  const [tiers, setTiers] = useState(commissionTiers);

  useEffect(() => {
    if (fetcher.data) {
      const data = fetcher.data as Record<string, unknown>;
      if (data.success) shopify.toast.show(data.message as string);
      if (data.error) shopify.toast.show(data.error as string, { isError: true });
    }
  }, [fetcher.data]);

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

  const updateTier = (index: number, field: string, value: string) => {
    const updated = [...tiers];
    updated[index] = { ...updated[index], [field]: parseFloat(value) || 0 };
    setTiers(updated);
  };

  return (
    <Page
      title="Commission Settings"
      backAction={{ content: "Settings", onAction: () => navigate("/app/settings") }}
      primaryAction={{ content: "Save", onAction: handleSave }}
    >
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Commission Mode</Text>
            <ChoiceList
              title="How should commissions be calculated?"
              choices={[
                { label: "Flat Rate — Same percentage for all affiliates", value: "FLAT" },
                {
                  label: "Tiered — Different rates based on affiliate performance" +
                         (!canUseTiered ? " (Premium plan required)" : ""),
                  value: "TIERED",
                  disabled: !canUseTiered,
                },
              ]}
              selected={[mode]}
              onChange={(selections) => setMode(selections[0] as "FLAT" | "TIERED")}
            />
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Default Commission Rate</Text>
            <TextField
              label="Commission Rate (%)"
              type="number"
              value={rate}
              min={0}
              max={100}
              step={0.5}
              onChange={(value) => setRate(value)}
              helpText="This rate applies to all affiliates unless overridden"
              autoComplete="off"
            />
          </BlockStack>
        </Card>

        {mode === "TIERED" && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Commission Tiers</Text>
              <Text as="p" tone="subdued">
                Define sales thresholds and their corresponding commission rates.
                Affiliates automatically get the highest tier they qualify for.
              </Text>

              <BlockStack gap="300">
                {tiers.map((tier, index) => (
                  <Box key={index} padding="300" background="bg-surface-secondary" borderRadius="200">
                    <InlineStack gap="300" align="end">
                      <TextField
                        label={`Tier ${index + 1} — Sales Threshold (₹)`}
                        type="number"
                        value={tier.thresholdAmount.toString()}
                        min={0}
                        onChange={(value) => updateTier(index, "thresholdAmount", value)}
                        autoComplete="off"
                      />
                      <TextField
                        label="Commission Rate (%)"
                        type="number"
                        value={tier.ratePercent.toString()}
                        min={0}
                        max={100}
                        step={0.5}
                        onChange={(value) => updateTier(index, "ratePercent", value)}
                        autoComplete="off"
                      />
                      <Button tone="critical" onClick={() => removeTier(index)}>
                        Remove
                      </Button>
                    </InlineStack>
                  </Box>
                ))}
              </BlockStack>

              <InlineStack>
                <Button onClick={addTier}>+ Add Tier</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}
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
