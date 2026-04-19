/**
 * TDS Settings
 */
import { useState, useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useNavigate, useRouteError } from "react-router";
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
    return { error: "TDS features require the Premium plan" };
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
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(isEnabled);
  const [rate, setRate] = useState(tdsRate.toString());
  const [threshold, setThreshold] = useState(annualThreshold.toString());

  useEffect(() => {
    if (fetcher.data) {
      const data = fetcher.data as Record<string, unknown>;
      // removed shopify toast 
    }
  }, [fetcher.data]);

  if (!canUseTds) {
    return (
      <Page
        title="TDS Settings"
        backAction={{ content: "Settings", onAction: () => navigate("/app/settings") }}
      >
        <Banner tone="warning">
          <p>
            TDS compliance features require the Premium plan.{" "}
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
      title="TDS Settings"
      backAction={{ content: "Settings", onAction: () => navigate("/app/settings") }}
      primaryAction={{
        content: "Save",
        onAction: () => {
          fetcher.submit(
            { isEnabled: String(enabled), tdsRate: rate, annualThreshold: threshold },
            { method: "POST" }
          );
        },
      }}
    >
      <Card>
        <BlockStack gap="400">
          <BlockStack gap="100">
            <Text as="h2" variant="headingMd">TDS Compliance</Text>
            <Text as="p" tone="subdued">
              When enabled, TDS will be deducted from payouts when an affiliate's cumulative payouts exceed the annual threshold.
            </Text>
          </BlockStack>
          
          <Checkbox
            label="Enable TDS deduction"
            checked={enabled}
            onChange={(newChecked) => setEnabled(newChecked)}
          />

          {enabled && (
            <>
              <TextField
                label="TDS Rate (%)"
                type="number"
                value={rate}
                min={0}
                max={100}
                step={0.5}
                onChange={(value) => setRate(value)}
                helpText="Default: 10% (Section 194H)"
                autoComplete="off"
              />
              <TextField
                label="Annual Threshold (₹)"
                type="number"
                value={threshold}
                min={0}
                onChange={(value) => setThreshold(value)}
                helpText="TDS applies only when cumulative payouts exceed this amount in a financial year. Default: ₹20,000"
                autoComplete="off"
              />
            </>
          )}
        </BlockStack>
      </Card>
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => { return boundary.headers(headersArgs); };
