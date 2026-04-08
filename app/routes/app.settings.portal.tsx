/**
 * Portal Customization Settings
 */

import { useState, useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { planHasFeature } from "../lib/plan-features.server";

interface PortalConfig {
  programName: string;
  logoUrl: string;
  bannerUrl: string;
  primaryColor: string;
  accentColor: string;
  welcomeHeading: string;
  welcomeMessage: string;
  termsText: string;
  signupsEnabled: boolean;
  requireApproval: boolean;
  showPhone: boolean;
  showUpi: boolean;
  showPan: boolean;
  showGstin: boolean;
}

const DEFAULT_CONFIG: PortalConfig = {
  programName: "",
  logoUrl: "",
  bannerUrl: "",
  primaryColor: "#4f46e5",
  accentColor: "#7c3aed",
  welcomeHeading: "Join Our Affiliate Program",
  welcomeMessage: "Earn commissions by referring customers to our store.",
  termsText: "",
  signupsEnabled: true,
  requireApproval: true,
  showPhone: true,
  showUpi: true,
  showPan: false,
  showGstin: false,
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response("Shop not found", { status: 404 });

  const config = (shop.portalCustomization as PortalConfig) || DEFAULT_CONFIG;

  return {
    config: { ...DEFAULT_CONFIG, ...config },
    plan: shop.plan,
    canCustomize: planHasFeature(shop.plan, "portal_customization"),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = await db.shop.findUnique({ where: { shopDomain: session.shop } });
  if (!shop) throw new Response("Shop not found", { status: 404 });

  const formData = await request.formData();

  const config: PortalConfig = {
    programName: (formData.get("programName") as string) || "",
    logoUrl: (formData.get("logoUrl") as string) || "",
    bannerUrl: (formData.get("bannerUrl") as string) || "",
    primaryColor: (formData.get("primaryColor") as string) || "#4f46e5",
    accentColor: (formData.get("accentColor") as string) || "#7c3aed",
    welcomeHeading: (formData.get("welcomeHeading") as string) || "",
    welcomeMessage: (formData.get("welcomeMessage") as string) || "",
    termsText: (formData.get("termsText") as string) || "",
    signupsEnabled: formData.get("signupsEnabled") === "true",
    requireApproval: formData.get("requireApproval") === "true",
    showPhone: formData.get("showPhone") === "true",
    showUpi: formData.get("showUpi") === "true",
    showPan: formData.get("showPan") === "true",
    showGstin: formData.get("showGstin") === "true",
  };

  await db.shop.update({
    where: { id: shop.id },
    data: { portalCustomization: config as unknown as Record<string, unknown> },
  });

  return { success: true, message: "Portal customization saved" };
};

export default function PortalSettings() {
  const { config, canCustomize } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const [form, setForm] = useState(config);

  useEffect(() => {
    if (fetcher.data) {
      const data = fetcher.data as Record<string, unknown>;
      if (data.success) shopify.toast.show(data.message as string);
    }
  }, [fetcher.data, shopify]);

  const handleSave = () => {
    const formData = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      formData.set(key, String(value));
    });
    fetcher.submit(formData, { method: "POST" });
  };

  const updateField = (field: keyof PortalConfig, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  if (!canCustomize) {
    return (
      <s-page heading="Portal Customization" backAction={{ url: "/app/settings" }}>
        <s-banner tone="warning">
          Portal customization requires the Starter plan or higher.
          <s-button href="/app/settings/billing" variant="primary">
            Upgrade Plan
          </s-button>
        </s-banner>
      </s-page>
    );
  }

  return (
    <s-page heading="Portal Customization" backAction={{ url: "/app/settings" }}>
      <s-button slot="primary-action" variant="primary" onClick={handleSave}>
        Save
      </s-button>

      {/* Branding */}
      <s-card>
        <s-text variant="headingMd">Branding</s-text>
        <s-text-field label="Program Name" value={form.programName} onInput={(e: CustomEvent) => updateField("programName", (e.target as HTMLInputElement).value)} />
        <s-text-field label="Logo URL" value={form.logoUrl} onInput={(e: CustomEvent) => updateField("logoUrl", (e.target as HTMLInputElement).value)} helpText="URL to your program logo" />
        <s-text-field label="Banner URL" value={form.bannerUrl} onInput={(e: CustomEvent) => updateField("bannerUrl", (e.target as HTMLInputElement).value)} helpText="URL to your portal banner image" />
        <s-text-field label="Primary Color" value={form.primaryColor} onInput={(e: CustomEvent) => updateField("primaryColor", (e.target as HTMLInputElement).value)} helpText="Hex color code (e.g., #4f46e5)" />
        <s-text-field label="Accent Color" value={form.accentColor} onInput={(e: CustomEvent) => updateField("accentColor", (e.target as HTMLInputElement).value)} />
      </s-card>

      {/* Welcome Content */}
      <s-card>
        <s-text variant="headingMd">Welcome Content</s-text>
        <s-text-field label="Welcome Heading" value={form.welcomeHeading} onInput={(e: CustomEvent) => updateField("welcomeHeading", (e.target as HTMLInputElement).value)} />
        <s-text-field label="Welcome Message" value={form.welcomeMessage} onInput={(e: CustomEvent) => updateField("welcomeMessage", (e.target as HTMLInputElement).value)} multiline="4" />
        <s-text-field label="Terms & Conditions" value={form.termsText} onInput={(e: CustomEvent) => updateField("termsText", (e.target as HTMLInputElement).value)} multiline="6" helpText="Displayed during affiliate signup" />
      </s-card>

      {/* Signup Settings */}
      <s-card>
        <s-text variant="headingMd">Signup Settings</s-text>
        <s-checkbox checked={form.signupsEnabled ? true : undefined} onChange={(e: CustomEvent) => updateField("signupsEnabled", (e.target as HTMLInputElement).checked)}>
          Allow new affiliate signups
        </s-checkbox>
        <s-checkbox checked={form.requireApproval ? true : undefined} onChange={(e: CustomEvent) => updateField("requireApproval", (e.target as HTMLInputElement).checked)}>
          Require manual approval for new affiliates
        </s-checkbox>
      </s-card>

      {/* Field Visibility */}
      <s-card>
        <s-text variant="headingMd">Signup Form Fields</s-text>
        <s-text tone="subdued">Choose which optional fields to show during affiliate signup</s-text>
        <s-checkbox checked={form.showPhone ? true : undefined} onChange={(e: CustomEvent) => updateField("showPhone", (e.target as HTMLInputElement).checked)}>Phone Number</s-checkbox>
        <s-checkbox checked={form.showUpi ? true : undefined} onChange={(e: CustomEvent) => updateField("showUpi", (e.target as HTMLInputElement).checked)}>UPI ID</s-checkbox>
        <s-checkbox checked={form.showPan ? true : undefined} onChange={(e: CustomEvent) => updateField("showPan", (e.target as HTMLInputElement).checked)}>PAN Number</s-checkbox>
        <s-checkbox checked={form.showGstin ? true : undefined} onChange={(e: CustomEvent) => updateField("showGstin", (e.target as HTMLInputElement).checked)}>GSTIN</s-checkbox>
      </s-card>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
