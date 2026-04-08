/**
 * Payout Settings Page
 */
import { useState, useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { planHasFeature } from "../lib/plan-features.server";
import { encryptToString } from "../lib/encryption.server";

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
  const shopify = useAppBridge();

  const [mode, setMode] = useState(payoutMode);

  useEffect(() => {
    if (fetcher.data) {
      const data = fetcher.data as Record<string, unknown>;
      if (data.success) shopify.toast.show(data.message as string);
      if (data.error) shopify.toast.show(data.error as string, { isError: true });
    }
  }, [fetcher.data, shopify]);

  return (
    <s-page heading="Payout Settings" backAction={{ url: "/app/settings" }}>
      <s-button slot="primary-action" variant="primary" onClick={() => {
        const form = document.getElementById("payoutForm") as HTMLFormElement;
        if (form) fetcher.submit(new FormData(form), { method: "POST" });
      }}>
        Save
      </s-button>

      <form id="payoutForm">
        <s-card>
          <s-text variant="headingMd">Payout Mode</s-text>
          <s-choice-list
            title="How should affiliates be paid?"
            selected={[mode]}
            onChange={(e: CustomEvent) => setMode(e.detail[0])}
          >
            <s-choice value="MANUAL">Manual — Mark payouts as paid after transferring manually</s-choice>
            <s-choice value="RAZORPAY_X" disabled={!canUseRazorpay}>
              Razorpay X — Auto-pay via UPI/bank transfer {!canUseRazorpay && "(Pro plan required)"}
            </s-choice>
          </s-choice-list>
          <input type="hidden" name="payoutMode" value={mode} />
        </s-card>

        {mode === "RAZORPAY_X" && (
          <s-card>
            <s-text variant="headingMd">Razorpay X Credentials</s-text>
            {hasRazorpayConfig && (
              <s-banner tone="info">
                Razorpay X credentials are already configured. Enter new values to update.
              </s-banner>
            )}
            <s-text-field name="razorpayKeyId" label="Key ID" placeholder="rzp_live_..." />
            <s-text-field name="razorpayKeySecret" label="Key Secret" type="password" placeholder="Enter secret..." />
            <s-text-field name="razorpayAccountNumber" label="Account Number" placeholder="Account number for payouts" />
          </s-card>
        )}
      </form>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
