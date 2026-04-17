/**
 * Settings Hub — Main settings navigation page
 *
 * Card-based navigation to 6 sub-pages.
 * Each card shows current configuration summary.
 */

import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";

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

import {
  Page,
  Layout,
  Card,
  Text,
  Button,
  Badge,
  InlineStack,
  BlockStack,
} from "@shopify/polaris";

export default function SettingsIndex() {
  const { shop } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <Page title="Settings">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {/* Commission Settings */}
            <Card>
              <InlineStack align="space-between">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">Commission Settings</Text>
                  <Text as="p" tone="subdued">
                    Mode: {shop.commissionMode} · Default rate: {shop.defaultCommissionRate}%
                  </Text>
                </BlockStack>
                <Button onClick={() => navigate("/app/settings/commission")}>Configure</Button>
              </InlineStack>
            </Card>

            {/* Payout Settings */}
            <Card>
              <InlineStack align="space-between">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">Payout Settings</Text>
                  <Text as="p" tone="subdued">
                    Mode: {shop.payoutMode === "RAZORPAY_X" ? "Razorpay X (Auto)" : "Manual"}
                  </Text>
                </BlockStack>
                <Button onClick={() => navigate("/app/settings/payout")}>Configure</Button>
              </InlineStack>
            </Card>

            {/* Portal Customization */}
            <Card>
              <InlineStack align="space-between">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">Portal Customization</Text>
                  <Text as="p" tone="subdued">
                    Customize your affiliate portal&apos;s look and feel
                  </Text>
                </BlockStack>
                <Button onClick={() => navigate("/app/settings/portal")}>Customize</Button>
              </InlineStack>
            </Card>

            {/* GST Settings */}
            <Card>
              <InlineStack align="space-between">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">GST Settings</Text>
                  <Text as="p" tone="subdued">
                    {shop.gstEnabled ? `Enabled · ${shop.gstRate}% rate` : "Disabled"}
                  </Text>
                </BlockStack>
                <Button onClick={() => navigate("/app/settings/gst")}>Configure</Button>
              </InlineStack>
            </Card>

            {/* TDS Settings */}
            <Card>
              <InlineStack align="space-between">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">TDS Settings</Text>
                  <Text as="p" tone="subdued">
                    {shop.tdsEnabled ? `Enabled · ${shop.tdsRate}% rate` : "Disabled"}
                  </Text>
                </BlockStack>
                <Button onClick={() => navigate("/app/settings/tds")}>Configure</Button>
              </InlineStack>
            </Card>

            {/* Plan & Billing */}
            <Card>
              <InlineStack align="space-between">
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">Plan & Billing</Text>
                  <Badge tone={shop.plan === "FREE" ? "warning" : "success"}>
                    {`${shop.plan} Plan`}
                  </Badge>
                </BlockStack>
                <Button onClick={() => navigate("/app/settings/billing")}>Manage</Button>
              </InlineStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
