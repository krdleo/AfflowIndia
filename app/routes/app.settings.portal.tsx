/**
 * Portal Customization Settings
 */

import { useState, useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useFetcher, useNavigate, useRouteError } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { planHasFeature } from "../lib/plan-features.server";
import { Prisma } from "@prisma/client";
import {
  Page,
  Banner,
  Button,
  Card,
  TextField,
  Text,
  Checkbox,
  BlockStack,
} from "@shopify/polaris";

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

  const config = (shop.portalCustomization as unknown as PortalConfig) || DEFAULT_CONFIG;

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
    data: { portalCustomization: config as unknown as Prisma.InputJsonValue },
  });

  return { success: true, message: "Portal customization saved" };
};

export default function PortalSettings() {
  const { config, canCustomize } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();

  const [form, setForm] = useState(config);

  useEffect(() => {
    if (fetcher.data) {
      const data = fetcher.data as Record<string, unknown>;
      // toast removed
    }
  }, [fetcher.data]);

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
      <Page
        title="Portal Customization"
        backAction={{ content: "Settings", onAction: () => navigate("/app/settings") }}
      >
        <Banner tone="warning">
          <p>
            Portal customization requires the Premium plan.{" "}
            <Button variant="primary" onClick={() => navigate("/app/settings/billing")}>
              Upgrade Plan
            </Button>
          </p>
        </Banner>
      </Page>
    );
  }

  return (
    <Page
      title="Portal Customization"
      backAction={{ content: "Settings", onAction: () => navigate("/app/settings") }}
      primaryAction={{
        content: "Save",
        onAction: handleSave,
      }}
    >
      <BlockStack gap="400">
        {/* Branding */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Branding</Text>
            <TextField label="Program Name" value={form.programName} onChange={(value) => updateField("programName", value)} autoComplete="off" />
            <TextField label="Logo URL" value={form.logoUrl} onChange={(value) => updateField("logoUrl", value)} helpText="URL to your program logo" autoComplete="off" />
            <TextField label="Banner URL" value={form.bannerUrl} onChange={(value) => updateField("bannerUrl", value)} helpText="URL to your portal banner image" autoComplete="off" />
            <TextField label="Primary Color" value={form.primaryColor} onChange={(value) => updateField("primaryColor", value)} helpText="Hex color code (e.g., #4f46e5)" autoComplete="off" />
            <TextField label="Accent Color" value={form.accentColor} onChange={(value) => updateField("accentColor", value)} autoComplete="off" />
          </BlockStack>
        </Card>

        {/* Welcome Content */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Welcome Content</Text>
            <TextField label="Welcome Heading" value={form.welcomeHeading} onChange={(value) => updateField("welcomeHeading", value)} autoComplete="off" />
            <TextField label="Welcome Message" value={form.welcomeMessage} onChange={(value) => updateField("welcomeMessage", value)} multiline={4} autoComplete="off" />
            <TextField label="Terms & Conditions" value={form.termsText} onChange={(value) => updateField("termsText", value)} multiline={6} helpText="Displayed during affiliate signup" autoComplete="off" />
          </BlockStack>
        </Card>

        {/* Signup Settings */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Signup Settings</Text>
            <Checkbox label="Allow new affiliate signups" checked={form.signupsEnabled} onChange={(checked) => updateField("signupsEnabled", checked)} />
            <Checkbox label="Require manual approval for new affiliates" checked={form.requireApproval} onChange={(checked) => updateField("requireApproval", checked)} />
          </BlockStack>
        </Card>

        {/* Field Visibility */}
        <Card>
          <BlockStack gap="400">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">Signup Form Fields</Text>
              <Text as="p" tone="subdued">Choose which optional fields to show during affiliate signup</Text>
            </BlockStack>
            <Checkbox label="Phone Number" checked={form.showPhone} onChange={(checked) => updateField("showPhone", checked)} />
            <Checkbox label="UPI ID" checked={form.showUpi} onChange={(checked) => updateField("showUpi", checked)} />
            <Checkbox label="PAN Number" checked={form.showPan} onChange={(checked) => updateField("showPan", checked)} />
            <Checkbox label="GSTIN" checked={form.showGstin} onChange={(checked) => updateField("showGstin", checked)} />
          </BlockStack>
        </Card>
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
