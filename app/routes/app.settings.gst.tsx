/**
 * GST Settings
 */
import { useState, useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { planHasFeature } from "../lib/plan-features.server";
import {
  Page,
  Banner,
  Button,
  Card,
  Checkbox,
  TextField,
  Text,
  BlockStack,
} from "@shopify/polaris";

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
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(isEnabled);
  const [rate, setRate] = useState(gstRate.toString());

  useEffect(() => {
    if (fetcher.data) {
      const data = fetcher.data as Record<string, unknown>;
      // removed shopify toast 
    }
  }, [fetcher.data]);

  if (!canUseGst) {
    return (
      <Page
        title="GST Settings"
        backAction={{ content: "Settings", onAction: () => navigate("/app/settings") }}
      >
        <Banner tone="warning">
          <p>
            GST compliance features require the Pro plan.{" "}
            <Button
              variant="primary"
              onClick={() => navigate("/app/settings/billing")}
            >
              Upgrade
            </Button>
          </p>
        </Banner>
      </Page>
    );
  }

  return (
    <Page
      title="GST Settings"
      backAction={{ content: "Settings", onAction: () => navigate("/app/settings") }}
      primaryAction={{
        content: "Save",
        onAction: () => fetcher.submit({ isEnabled: String(enabled), gstRate: rate }, { method: "POST" }),
      }}
    >
      <Card>
        <BlockStack gap="400">
          <BlockStack gap="100">
            <Text as="h2" variant="headingMd">GST Compliance</Text>
            <Text as="p" tone="subdued">
              When enabled, GST will be added to affiliate payouts: payoutAmount = commission + (commission × GST rate)
            </Text>
          </BlockStack>
          
          <Checkbox
            label="Enable GST on payouts"
            checked={enabled}
            onChange={(newChecked) => setEnabled(newChecked)}
          />

          {enabled && (
            <TextField
              label="GST Rate (%)"
              type="number"
              value={rate}
              min={0}
              max={100}
              step={0.5}
              onChange={(value) => setRate(value)}
              helpText="Default: 18% (standard GST rate in India)"
              autoComplete="off"
            />
          )}
        </BlockStack>
      </Card>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => { return boundary.headers(headersArgs); };
