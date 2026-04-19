/**
 * Affiliates Management Page
 *
 * - Tabbed list: All, Pending, Active, Suspended
 * - Search and filter
 * - Approve/reject/suspend actions
 * - Paginated with cursor-based pagination
 */

import { useState, useCallback, useEffect } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher, useSearchParams, useNavigate, useRouteError } from "react-router";
import bcrypt from "bcryptjs";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { checkAffiliateLimit, PLAN_CONFIGS } from "../lib/billing.server";
import { planHasFeature } from "../lib/plan-features.server";
import { adminAddAffiliateSchema, bulkEmailSchema } from "../lib/validation.server";
import {
  Page,
  Badge,
  Banner,
  Tabs,
  Card,
  TextField,
  Button,
  InlineStack,
  BlockStack,
  EmptyState,
  IndexTable,
  Text,
  Modal,
  FormLayout,
  Divider,
} from "@shopify/polaris";

const PAGE_SIZE = 20;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const shop = await db.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Response("Shop not found", { status: 404 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "ALL";
  const search = url.searchParams.get("search") || "";
  const cursor = url.searchParams.get("cursor") || undefined;

  const where: Record<string, unknown> = { shopId: shop.id };
  if (status !== "ALL") {
    where.status = status;
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { code: { contains: search, mode: "insensitive" } },
    ];
  }

  const [affiliates, totalCount, statusCounts] = await Promise.all([
    db.affiliate.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1, // Fetch one extra to know if there's more
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        name: true,
        email: true,
        code: true,
        referralCode: true,
        status: true,
        commissionRate: true,
        discountPercent: true,
        totalClicks: true,
        totalSales: true,
        pendingCommission: true,
        fraudFlags: true,
        createdAt: true,
      },
    }),
    db.affiliate.count({ where }),
    Promise.all([
      db.affiliate.count({ where: { shopId: shop.id } }),
      db.affiliate.count({ where: { shopId: shop.id, status: "PENDING" } }),
      db.affiliate.count({ where: { shopId: shop.id, status: "ACTIVE" } }),
      db.affiliate.count({ where: { shopId: shop.id, status: "SUSPENDED" } }),
      db.affiliate.count({ where: { shopId: shop.id, status: "FLAGGED" } }),
    ]),
  ]);

  const hasMore = affiliates.length > PAGE_SIZE;
  const items = hasMore ? affiliates.slice(0, PAGE_SIZE) : affiliates;
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;

  // Check affiliate limit
  const limitInfo = await checkAffiliateLimit(shop.id, shop.plan);

  return {
    affiliates: items.map((a) => ({
      ...a,
      totalSales: Number(a.totalSales),
      pendingCommission: Number(a.pendingCommission),
      commissionRate: Number(a.commissionRate),
      discountPercent: Number(a.discountPercent),
      createdAt: a.createdAt.toISOString(),
    })),
    totalCount,
    hasMore,
    nextCursor,
    statusCounts: {
      all: statusCounts[0],
      pending: statusCounts[1],
      active: statusCounts[2],
      suspended: statusCounts[3],
      flagged: statusCounts[4],
    },
    limitInfo: {
      ...limitInfo,
      planName: PLAN_CONFIGS[shop.plan].name,
    },
    shopPlan: shop.plan,
    shopDomain: shop.shopDomain,
    defaultCommissionRate: Number(shop.defaultCommissionRate),
    canSendEmail: planHasFeature(shop.plan, "email_notifications"),
    hasFraudDetection: planHasFeature(shop.plan, "fraud_detection"),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const shop = await db.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Response("Shop not found", { status: 404 });

  const formData = await request.formData();
  const actionType = formData.get("_action") as string;

  if (!actionType) {
    return { error: "Missing action" };
  }

  // ── Add affiliate manually ──────────────────────────────────
  if (actionType === "add_affiliate") {
    const limitInfo = await checkAffiliateLimit(shop.id, shop.plan);
    if (!limitInfo.allowed) {
      return { error: `Affiliate limit reached for the ${PLAN_CONFIGS[shop.plan].name} plan. Upgrade to add more.` };
    }

    const parsed = adminAddAffiliateSchema.safeParse({
      name: (formData.get("name") as string) ?? "",
      email: (formData.get("email") as string) ?? "",
      commissionRate: parseFloat((formData.get("commissionRate") as string) || "10"),
      discountPercent: parseFloat((formData.get("discountPercent") as string) || "10"),
      code: ((formData.get("code") as string) || "").trim(),
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message || "Invalid affiliate data" };
    }

    const { name, commissionRate, discountPercent } = parsed.data;
    const email = parsed.data.email.toLowerCase();
    let code = parsed.data.code || "";

    if (!code) {
      const base = name.replace(/[^A-Za-z]/g, "").toUpperCase().substring(0, 5) || "AFF";
      const suffix = Math.floor(10 + Math.random() * 90);
      code = `${base}${suffix}`;
    }

    const existingEmail = await db.affiliate.findFirst({ where: { shopId: shop.id, email } });
    if (existingEmail) return { error: "An affiliate with this email already exists" };

    const existingCode = await db.affiliate.findFirst({ where: { shopId: shop.id, code } });
    if (existingCode) return { error: `Code "${code}" is already in use. Choose a different one.` };

    const { generateUrlSafeCode } = await import("../lib/encryption.server");
    const referralCode = generateUrlSafeCode(8);
    const tempPassword = generateUrlSafeCode(12);
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    await db.affiliate.create({
      data: {
        shopId: shop.id,
        name,
        email,
        code,
        referralCode,
        commissionRate,
        discountPercent,
        passwordHash,
        status: "ACTIVE",
      },
    });

    return {
      success: true,
      message: `${name} added as an active affiliate`,
      tempPassword,
      affiliateName: name,
      affiliateEmail: email,
      affiliateCode: code,
    };
  }

  // ── Bulk email to all active affiliates ─────────────────────
  if (actionType === "bulk_email") {
    if (!planHasFeature(shop.plan, "email_notifications")) {
      return { error: "Bulk email requires the Premium plan." };
    }

    const parsed = bulkEmailSchema.safeParse({
      subject: (formData.get("subject") as string) ?? "",
      message: (formData.get("message") as string) ?? "",
    });

    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message || "Invalid email content" };
    }

    const { subject, message } = parsed.data;

    const activeAffiliates = await db.affiliate.findMany({
      where: { shopId: shop.id, status: "ACTIVE" },
      select: { email: true, name: true },
    });

    if (activeAffiliates.length === 0) {
      return { error: "No active affiliates to email." };
    }

    const { sendBulkAnnouncementEmail } = await import("../lib/email.server");
    let sentCount = 0;
    let failCount = 0;

    for (const aff of activeAffiliates) {
      try {
        await sendBulkAnnouncementEmail(
          aff.email,
          aff.name,
          subject,
          message,
          shop.shopDomain
        );
        sentCount++;
      } catch (err) {
        console.error(`Failed to send email to ${aff.email}:`, err);
        failCount++;
      }
    }

    const resultMessage = failCount > 0
      ? `Email sent to ${sentCount} affiliates (${failCount} failed)`
      : `Email sent to ${sentCount} affiliates`;
    return { success: true, message: resultMessage };
  }

  // ── Export affiliates as CSV ───────────────────────────────
  if (actionType === "export_csv") {
    const { generateCSV, csvResponse } = await import("../lib/csv.server");

    const allAffiliates = await db.affiliate.findMany({
      where: { shopId: shop.id },
      select: {
        name: true,
        email: true,
        code: true,
        status: true,
        totalClicks: true,
        totalSales: true,
        pendingCommission: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const headers = [
      "Name",
      "Email",
      "Code",
      "Status",
      "Total Clicks",
      "Total Sales (INR)",
      "Pending Commission (INR)",
      "Joined",
    ];
    const rows = allAffiliates.map((a) => [
      a.name,
      a.email,
      a.code,
      a.status,
      a.totalClicks,
      Number(a.totalSales).toFixed(2),
      Number(a.pendingCommission).toFixed(2),
      a.createdAt.toISOString().split("T")[0],
    ]);

    const csv = generateCSV(headers, rows);
    const date = new Date().toISOString().split("T")[0];
    return csvResponse(csv, `affiliates-${date}.csv`);
  }

  // ── Existing affiliate actions (all need affiliateId) ───────
  const affiliateId = formData.get("affiliateId") as string;
  if (!affiliateId) {
    return { error: "Missing affiliate ID" };
  }

  const affiliate = await db.affiliate.findFirst({
    where: { id: affiliateId, shopId: shop.id },
  });

  if (!affiliate) {
    return { error: "Affiliate not found" };
  }

  switch (actionType) {
    case "approve": {
      // Create discount code on Shopify
      const { createAffiliateDiscount } = await import("../lib/discount.server");
      try {
        const discountResult = await createAffiliateDiscount(
          admin,
          affiliate.code,
          Number(affiliate.discountPercent)
        );

        await db.affiliate.update({
          where: { id: affiliateId },
          data: {
            status: "ACTIVE",
            ...(discountResult
              ? {
                  discountCodeId: discountResult.discountCodeId,
                  priceRuleId: discountResult.priceRuleId,
                }
              : {}),
          },
        });

        return { success: true, message: `${affiliate.name} approved and discount code created` };
      } catch (error) {
        // Approve anyway even if discount creation fails
        await db.affiliate.update({
          where: { id: affiliateId },
          data: { status: "ACTIVE" },
        });
        return { success: true, message: `${affiliate.name} approved (discount code creation may have failed)` };
      }
    }

    case "reject": {
      await db.affiliate.update({
        where: { id: affiliateId },
        data: { status: "SUSPENDED" },
      });
      return { success: true, message: `${affiliate.name} rejected` };
    }

    case "suspend": {
      // Delete discount code if exists
      if (affiliate.priceRuleId) {
        const { deleteAffiliateDiscount } = await import("../lib/discount.server");
        await deleteAffiliateDiscount(admin, affiliate.priceRuleId);
      }

      await db.affiliate.update({
        where: { id: affiliateId },
        data: { status: "SUSPENDED" },
      });
      return { success: true, message: `${affiliate.name} suspended` };
    }

    case "reactivate": {
      const { createAffiliateDiscount } = await import("../lib/discount.server");
      try {
        const discountResult = await createAffiliateDiscount(
          admin,
          affiliate.code,
          Number(affiliate.discountPercent)
        );

        await db.affiliate.update({
          where: { id: affiliateId },
          data: {
            status: "ACTIVE",
            ...(discountResult
              ? {
                  discountCodeId: discountResult.discountCodeId,
                  priceRuleId: discountResult.priceRuleId,
                }
              : {}),
          },
        });
        return { success: true, message: `${affiliate.name} reactivated` };
      } catch {
        await db.affiliate.update({
          where: { id: affiliateId },
          data: { status: "ACTIVE" },
        });
        return { success: true, message: `${affiliate.name} reactivated` };
      }
    }

    case "unflag": {
      await db.affiliate.update({
        where: { id: affiliateId },
        data: { status: "ACTIVE", fraudFlags: null },
      });
      return { success: true, message: `${affiliate.name} reviewed and unflagged` };
    }

    default:
      return { error: "Unknown action" };
  }
};

export default function Affiliates() {
  const {
    affiliates, totalCount, hasMore, nextCursor, statusCounts,
    limitInfo, defaultCommissionRate, canSendEmail, hasFraudDetection,
  } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher<typeof action>();
  const navigate = useNavigate();

  const currentStatus = searchParams.get("status") || "ALL";
  const currentSearch = searchParams.get("search") || "";

  const [searchValue, setSearchValue] = useState(currentSearch);
  const [confirmAction, setConfirmAction] = useState<{
    type: string;
    affiliateId: string;
    name: string;
  } | null>(null);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    email: "",
    commissionRate: String(defaultCommissionRate),
    discountPercent: "10",
    code: "",
  });
  const [createdCredentials, setCreatedCredentials] = useState<{
    name: string;
    email: string;
    code: string;
    tempPassword: string;
  } | null>(null);

  // Bulk email state
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailForm, setEmailForm] = useState({ subject: "", message: "" });

  useEffect(() => {
    if (fetcher.data) {
      const data = fetcher.data as Record<string, unknown>;
      if (data.tempPassword) {
        setCreatedCredentials({
          name: data.affiliateName as string,
          email: data.affiliateEmail as string,
          code: data.affiliateCode as string,
          tempPassword: data.tempPassword as string,
        });
        setAddModalOpen(false);
        setAddForm({ name: "", email: "", commissionRate: String(defaultCommissionRate), discountPercent: "10", code: "" });
      } else if (data.success) {
        shopify.toast.show(data.message as string);
      } else if (data.error) {
        shopify.toast.show(data.error as string, { isError: true });
      }
    }
  }, [fetcher.data, defaultCommissionRate]);

  const handleSearch = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    if (searchValue) {
      params.set("search", searchValue);
    } else {
      params.delete("search");
    }
    params.delete("cursor");
    setSearchParams(params);
  }, [searchValue, searchParams, setSearchParams]);

  const handleTabChange = useCallback(
    (status: string) => {
      const params = new URLSearchParams();
      if (status !== "ALL") params.set("status", status);
      if (searchValue) params.set("search", searchValue);
      setSearchParams(params);
    },
    [searchValue, setSearchParams]
  );

  const handleAction = useCallback(
    (type: string, affiliateId: string) => {
      fetcher.submit(
        { _action: type, affiliateId },
        { method: "POST" }
      );
      setConfirmAction(null);
    },
    [fetcher]
  );

  const formatINR = (amount: number) =>
    `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  const tabs = [
    { id: "ALL", content: `All (${statusCounts.all})` },
    { id: "PENDING", content: `Pending (${statusCounts.pending})` },
    { id: "ACTIVE", content: `Active (${statusCounts.active})` },
    { id: "SUSPENDED", content: `Suspended (${statusCounts.suspended})` },
    ...(hasFraudDetection
      ? [{ id: "FLAGGED", content: `Flagged (${statusCounts.flagged})` }]
      : []),
  ];
  const selectedTab = Math.max(tabs.findIndex(t => t.id === currentStatus), 0);

  const rowMarkup = affiliates.map((affiliate, index) => (
    <IndexTable.Row key={affiliate.id} id={affiliate.id} position={index}>
      <IndexTable.Cell>
        <BlockStack gap="0">
          <Text as="span" variant="bodyMd" fontWeight="bold">{affiliate.name}</Text>
          <Text as="span" variant="bodySm" tone="subdued">{affiliate.email}</Text>
        </BlockStack>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge>{affiliate.code}</Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <BlockStack gap="100">
          <Badge
            tone={
              affiliate.status === "ACTIVE"
                ? "success"
                : affiliate.status === "PENDING"
                ? "warning"
                : affiliate.status === "FLAGGED"
                ? "attention"
                : "critical"
            }
          >
            {affiliate.status}
          </Badge>
          {affiliate.status === "FLAGGED" && affiliate.fraudFlags && (
            <Text as="span" variant="bodySm" tone="caution">
              {affiliate.fraudFlags}
            </Text>
          )}
        </BlockStack>
      </IndexTable.Cell>
      <IndexTable.Cell>{affiliate.totalClicks}</IndexTable.Cell>
      <IndexTable.Cell>{formatINR(affiliate.totalSales)}</IndexTable.Cell>
      <IndexTable.Cell>{formatINR(affiliate.pendingCommission)}</IndexTable.Cell>
      <IndexTable.Cell>
        <InlineStack gap="200">
          {affiliate.status === "PENDING" && (
            <>
              <Button
                variant="primary"
                size="micro"
                onClick={() => handleAction("approve", affiliate.id)}
              >
                Approve
              </Button>
              <Button
                tone="critical"
                size="micro"
                onClick={() =>
                  setConfirmAction({
                    type: "reject",
                    affiliateId: affiliate.id,
                    name: affiliate.name,
                  })
                }
              >
                Reject
              </Button>
            </>
          )}
          {affiliate.status === "ACTIVE" && (
            <Button
              tone="critical"
              size="micro"
              onClick={() =>
                setConfirmAction({
                  type: "suspend",
                  affiliateId: affiliate.id,
                  name: affiliate.name,
                })
              }
            >
              Suspend
            </Button>
          )}
          {affiliate.status === "SUSPENDED" && (
            <Button
              size="micro"
              onClick={() => handleAction("reactivate", affiliate.id)}
            >
              Reactivate
            </Button>
          )}
          {affiliate.status === "FLAGGED" && (
            <>
              <Button
                variant="primary"
                size="micro"
                onClick={() => handleAction("unflag", affiliate.id)}
              >
                Unflag
              </Button>
              <Button
                tone="critical"
                size="micro"
                onClick={() =>
                  setConfirmAction({
                    type: "suspend",
                    affiliateId: affiliate.id,
                    name: affiliate.name,
                  })
                }
              >
                Suspend
              </Button>
            </>
          )}
        </InlineStack>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      title="Affiliates"
      titleMetadata={<Badge>{`${totalCount} total`}</Badge>}
      primaryAction={{
        content: "Add affiliate",
        disabled: !limitInfo.allowed,
        onAction: () => setAddModalOpen(true),
      }}
      secondaryActions={[
        ...(canSendEmail
          ? [{
              content: "Send email",
              onAction: () => setEmailModalOpen(true),
            }]
          : []),
        {
          content: "Export CSV",
          onAction: () =>
            fetcher.submit({ _action: "export_csv" }, { method: "POST" }),
        },
      ]}
    >
      <BlockStack gap="400">
        {/* Limit warning */}
        {!limitInfo.allowed && (
          <Banner tone="critical" action={{content: "Upgrade Plan", url: "/app/settings/billing"}}>
            <p>
              You&apos;ve reached the affiliate limit ({limitInfo.limit}) for the {limitInfo.planName} plan.
              Upgrade to add more affiliates.
            </p>
          </Banner>
        )}

        <Card padding="0">
          <Tabs tabs={tabs} selected={selectedTab} onSelect={(index) => handleTabChange(tabs[index].id)} />

          <div style={{ padding: "16px" }}>
            <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }}>
              <InlineStack gap="300" align="start">
                <TextField
                  label="Search affiliates"
                  labelHidden
                  value={searchValue}
                  placeholder="Search by name, email, or code..."
                  onChange={(val) => setSearchValue(val)}
                  autoComplete="off"
                />
                <Button submit>Search</Button>
              </InlineStack>
            </form>
          </div>

          {affiliates.length === 0 ? (
            <div style={{ padding: "16px" }}>
              <EmptyState
                heading={
                  currentSearch
                    ? "No affiliates match your search"
                    : "No affiliates yet"
                }
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  {currentSearch
                    ? "Try a different search term."
                    : "Share your affiliate portal link to start recruiting affiliates."}
                </p>
              </EmptyState>
            </div>
          ) : (
            <IndexTable
              resourceName={{ singular: "affiliate", plural: "affiliates" }}
              itemCount={affiliates.length}
              headings={[
                { title: "Name" },
                { title: "Code" },
                { title: "Status" },
                { title: "Clicks" },
                { title: "Sales" },
                { title: "Pending" },
                { title: "Actions" },
              ]}
              selectable={false}
            >
              {rowMarkup}
            </IndexTable>
          )}

          {/* Pagination */}
          {(hasMore || searchParams.has("cursor")) && (
            <div style={{ padding: "16px", display: "flex", justifyContent: "center" }}>
              <InlineStack gap="300" align="center">
                {searchParams.has("cursor") && (
                  <Button
                    onClick={() => {
                      const params = new URLSearchParams(searchParams);
                      params.delete("cursor");
                      setSearchParams(params);
                    }}
                  >
                    &larr; Previous
                  </Button>
                )}
                {hasMore && nextCursor && (
                  <Button
                    onClick={() => {
                      const params = new URLSearchParams(searchParams);
                      params.set("cursor", nextCursor);
                      setSearchParams(params);
                    }}
                  >
                    Next &rarr;
                  </Button>
                )}
              </InlineStack>
            </div>
          )}
        </Card>
      </BlockStack>

      {/* Add Affiliate Modal */}
      <Modal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add affiliate manually"
        primaryAction={{
          content: "Add affiliate",
          loading: fetcher.state !== "idle",
          onAction: () =>
            fetcher.submit(
              { _action: "add_affiliate", ...addForm },
              { method: "POST" }
            ),
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setAddModalOpen(false) }]}
      >
        <Modal.Section>
          <FormLayout>
            <TextField
              label="Full name"
              value={addForm.name}
              onChange={(val) => setAddForm((f) => ({ ...f, name: val }))}
              autoComplete="off"
            />
            <TextField
              label="Email"
              type="email"
              value={addForm.email}
              onChange={(val) => setAddForm((f) => ({ ...f, email: val }))}
              autoComplete="off"
            />
            <FormLayout.Group>
              <TextField
                label="Commission rate (%)"
                type="number"
                value={addForm.commissionRate}
                onChange={(val) => setAddForm((f) => ({ ...f, commissionRate: val }))}
                autoComplete="off"
              />
              <TextField
                label="Customer discount (%)"
                type="number"
                value={addForm.discountPercent}
                onChange={(val) => setAddForm((f) => ({ ...f, discountPercent: val }))}
                autoComplete="off"
              />
            </FormLayout.Group>
            <TextField
              label="Affiliate code"
              helpText="Leave blank to auto-generate from their name (e.g. PRIYA42)"
              value={addForm.code}
              onChange={(val) => setAddForm((f) => ({ ...f, code: val.toUpperCase() }))}
              autoComplete="off"
            />
          </FormLayout>
        </Modal.Section>
      </Modal>

      {/* Credentials Modal — shown once after affiliate is created */}
      {createdCredentials && (
        <Modal
          open={!!createdCredentials}
          onClose={() => setCreatedCredentials(null)}
          title={`${createdCredentials.name} added`}
          primaryAction={{ content: "Done", onAction: () => setCreatedCredentials(null) }}
        >
          <Modal.Section>
            <BlockStack gap="400">
              <Text as="p">
                Share these login credentials with the affiliate. The password is shown only once.
              </Text>
              <Banner tone="warning">
                <BlockStack gap="200">
                  <Text as="p"><strong>Portal login:</strong> {createdCredentials.email}</Text>
                  <Text as="p"><strong>Temp password:</strong> {createdCredentials.tempPassword}</Text>
                  <Text as="p"><strong>Affiliate code:</strong> {createdCredentials.code}</Text>
                </BlockStack>
              </Banner>
            </BlockStack>
          </Modal.Section>
        </Modal>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <Modal
          open={!!confirmAction}
          onClose={() => setConfirmAction(null)}
          title={`${confirmAction.type === "suspend" ? "Suspend" : "Reject"} ${confirmAction.name}?`}
          primaryAction={{
            content: confirmAction.type === "suspend" ? "Suspend" : "Reject",
            destructive: true,
            onAction: () => handleAction(confirmAction.type, confirmAction.affiliateId)
          }}
          secondaryActions={[
            { content: "Cancel", onAction: () => setConfirmAction(null) }
          ]}
        >
          <Modal.Section>
            <Text as="p">
              Are you sure you want to {confirmAction.type} {confirmAction.name}?
              {confirmAction.type === "suspend"
                ? " Their discount code will be deactivated."
                : " They will not be able to use the affiliate portal."}
            </Text>
          </Modal.Section>
        </Modal>
      )}

      {/* Bulk Email Modal */}
      <Modal
        open={emailModalOpen}
        onClose={() => setEmailModalOpen(false)}
        title="Send email to all active affiliates"
        primaryAction={{
          content: "Send email",
          loading: fetcher.state !== "idle",
          onAction: () => {
            fetcher.submit(
              { _action: "bulk_email", ...emailForm },
              { method: "POST" }
            );
            setEmailModalOpen(false);
            setEmailForm({ subject: "", message: "" });
          },
        }}
        secondaryActions={[
          { content: "Cancel", onAction: () => setEmailModalOpen(false) },
        ]}
      >
        <Modal.Section>
          <FormLayout>
            <Banner tone="info">
              <p>
                This will send an email to all {statusCounts.active} active affiliates.
              </p>
            </Banner>
            <TextField
              label="Subject"
              value={emailForm.subject}
              onChange={(val) => setEmailForm((f) => ({ ...f, subject: val }))}
              maxLength={200}
              showCharacterCount
              autoComplete="off"
            />
            <TextField
              label="Message"
              value={emailForm.message}
              onChange={(val) => setEmailForm((f) => ({ ...f, message: val }))}
              multiline={6}
              maxLength={5000}
              showCharacterCount
              helpText="Plain text. Line breaks will be preserved in the email."
              autoComplete="off"
            />
          </FormLayout>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
