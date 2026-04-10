/**
 * Payout Settings Page
 */
import { useState, useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { planHasFeature } from "../lib/plan-features.server";
import { encryptToString } from "../lib/encryption.server";
import {
  Page,
  Banner,
  Button,
  Card,
  ChoiceList,
  TextField,
  Text,
  BlockStack,
} from "@shopify/polaris";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response("Shop not found", { status: 404 });

  return {
    payoutMode: shop.payoutMode,
    hasRazorpayConfig: !!shop.razorpayXConfig,
    plan: shop.plan,
    canUseRazorpay: planHasFeature(shop.plan, "razorpay_payouts"),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response("Shop not found", { status: 404 });

  const formData = await request.formData();
  const mode = formData.get("payoutMode") as string;

  if (mode === "RAZORPAY_X" && !planHasFeature(shop.plan, "razorpay_payouts")) {
    return { error: "Razorpay X payouts require the Pro plan" };
  }

  const updateData: Record<string, unknown> = {
    payoutMode: mode as "MANUAL" | "RAZORPAY_X",
  };

  if (mode === "RAZORPAY_X") {
    const keyId = formData.get("razorpayKeyId") as string;
    const keySecret = formData.get("razorpayKeySecret") as string;
    const accountNumber = formData.get("razorpayAccountNumber") as string;

    if (keyId && keySecret) {
      updateData.razorpayXConfig = encryptToString(
        JSON.stringify({ keyId, keySecret: keySecret, accountNumber })
      );
    }
  }

  await db.shop.update({ where: { id: shop.id }, data: updateData });
  return { success: true, message: "Payout settings saved" };
};

export default function PayoutSettings() {
  const { payoutMode, hasRazorpayConfig, canUseRazorpay } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();

  const [mode, setMode] = useState<"MANUAL" | "RAZORPAY_X">(payoutMode as "MANUAL" | "RAZORPAY_X");
  const [razorpayKeyId, setRazorpayKeyId] = useState("");
  const [razorpayKeySecret, setRazorpayKeySecret] = useState("");
  const [razorpayAccountNumber, setRazorpayAccountNumber] = useState("");

  useEffect(() => {
    if (fetcher.data) {
      const data = fetcher.data as Record<string, unknown>;
      // removed shopify toast 
    }
  }, [fetcher.data]);

  return (
    <Page
      title="Payout Settings"
      backAction={{ content: "Settings", onAction: () => navigate("/app/settings") }}
      primaryAction={{
        content: "Save",
        onAction: () => {
          fetcher.submit(
            {
              payoutMode: mode,
              razorpayKeyId,
              razorpayKeySecret,
              razorpayAccountNumber,
            },
            { method: "POST" }
          );
        },
      }}
    >
      <BlockStack gap="400">
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Payout Mode</Text>
            <ChoiceList
              title="How should affiliates be paid?"
              choices={[
                {
                  label: "Manual — Mark payouts as paid after transferring manually",
                  value: "MANUAL",
                },
                {
                  label: "Razorpay X — Auto-pay via UPI/bank transfer" +
                         (!canUseRazorpay ? " (Pro plan required)" : ""),
                  value: "RAZORPAY_X",
                  disabled: !canUseRazorpay,
                },
              ]}
              selected={[mode]}
              onChange={(selections) => setMode(selections[0] as "MANUAL" | "RAZORPAY_X")}
            />
          </BlockStack>
        </Card>

        {mode === "RAZORPAY_X" && (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Razorpay X Credentials</Text>
              {hasRazorpayConfig && (
                <Banner tone="info">
                  <p>Razorpay X credentials are already configured. Enter new values to update.</p>
                </Banner>
              )}
              
              <TextField
                label="Key ID"
                value={razorpayKeyId}
                onChange={setRazorpayKeyId}
                placeholder="rzp_live_..."
                autoComplete="off"
              />
              <TextField
                label="Key Secret"
                type="password"
                value={razorpayKeySecret}
                onChange={setRazorpayKeySecret}
                placeholder="Enter secret..."
                autoComplete="off"
              />
              <TextField
                label="Account Number"
                value={razorpayAccountNumber}
                onChange={setRazorpayAccountNumber}
                placeholder="Account number for payouts"
                autoComplete="off"
              />
            </BlockStack>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
