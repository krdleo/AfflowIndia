/**
 * Payout Management Page
 *
 * - List of payouts with status badges
 * - Approve/reject/mark-as-paid actions
 * - GST/TDS breakdown display
 * - Paginated, filterable by status
 */

import { useState, useEffect, useCallback } from "react";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher, useSearchParams, useNavigate, useRouteError } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import {
  Page,
  Badge,
  Tabs,
  Card,
  EmptyState,
  IndexTable,
  Text,
  Button,
  InlineStack,
  BlockStack,
} from "@shopify/polaris";

const PAGE_SIZE = 20;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const shop = await db.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Response("Shop not found", { status: 404 });

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "ALL";
  const cursor = url.searchParams.get("cursor") || undefined;

  const where: Record<string, unknown> = { shopId: shop.id };
  if (status !== "ALL") {
    where.status = status;
  }

  const [payouts, totalCount, statusCounts] = await Promise.all([
    db.payout.findMany({
      where,
      include: {
        affiliate: { select: { name: true, email: true, code: true, upiId: true } },
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
    db.payout.count({ where }),
    Promise.all([
      db.payout.count({ where: { shopId: shop.id } }),
      db.payout.count({ where: { shopId: shop.id, status: "PENDING" } }),
      db.payout.count({ where: { shopId: shop.id, status: "APPROVED" } }),
      db.payout.count({ where: { shopId: shop.id, status: "PAID" } }),
      db.payout.count({ where: { shopId: shop.id, status: "FAILED" } }),
    ]),
  ]);

  const hasMore = payouts.length > PAGE_SIZE;
  const items = hasMore ? payouts.slice(0, PAGE_SIZE) : payouts;
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;

  return {
    payouts: items.map((p) => ({
      id: p.id,
      affiliateName: p.affiliate.name,
      affiliateEmail: p.affiliate.email,
      affiliateCode: p.affiliate.code,
      affiliateUpi: p.affiliate.upiId,
      amount: Number(p.amount),
      baseAmount: Number(p.baseAmount),
      gstAmount: Number(p.gstAmount),
      tdsAmount: Number(p.tdsAmount),
      currency: p.currency,
      mode: p.mode,
      status: p.status,
      reference: p.reference,
      externalReference: p.externalReference,
      paidAt: p.paidAt?.toISOString() || null,
      createdAt: p.createdAt.toISOString(),
    })),
    totalCount,
    hasMore,
    nextCursor,
    statusCounts: {
      all: statusCounts[0],
      pending: statusCounts[1],
      approved: statusCounts[2],
      paid: statusCounts[3],
      failed: statusCounts[4],
    },
    shopPayoutMode: shop.payoutMode,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const shop = await db.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Response("Shop not found", { status: 404 });

  const formData = await request.formData();
  const actionType = formData.get("_action") as string;
  const payoutId = formData.get("payoutId") as string;

  if (!actionType || !payoutId) {
    return { error: "Missing action or payout ID" };
  }

  const payout = await db.payout.findFirst({
    where: { id: payoutId, shopId: shop.id },
    include: { affiliate: true },
  });

  if (!payout) return { error: "Payout not found" };

  switch (actionType) {
    case "approve":
      await db.payout.update({
        where: { id: payoutId },
        data: { status: "APPROVED" },
      });
      return { success: true, message: "Payout approved" };

    case "reject":
      // Return commission back to pending
      await db.$transaction([
        db.payout.update({
          where: { id: payoutId },
          data: { status: "FAILED" },
        }),
        db.affiliate.update({
          where: { id: payout.affiliateId },
          data: {
            pendingCommission: { increment: Number(payout.baseAmount) },
          },
        }),
      ]);
      return { success: true, message: "Payout rejected, commission returned to pending" };

    case "mark_paid":
      await db.payout.update({
        where: { id: payoutId },
        data: { status: "PAID", paidAt: new Date() },
      });
      return { success: true, message: "Payout marked as paid" };

    default:
      return { error: "Unknown action" };
  }
};

export default function Payouts() {
  const { payouts, totalCount, hasMore, nextCursor, statusCounts, shopPayoutMode } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher<typeof action>();

  const currentStatus = searchParams.get("status") || "ALL";

  useEffect(() => {
    if (fetcher.data) {
      const data = fetcher.data as Record<string, unknown>;
      if (data.success) {
        shopify.toast.show(data.message as string);
      } else if (data.error) {
        shopify.toast.show(data.error as string, { isError: true });
      }
    }
  }, [fetcher.data]);

  const handleAction = useCallback(
    (type: string, payoutId: string) => {
      fetcher.submit({ _action: type, payoutId }, { method: "POST" });
    },
    [fetcher]
  );

  const formatINR = (amount: number) =>
    `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  const statusTone = (status: string) => {
    switch (status) {
      case "PENDING": return "warning";
      case "APPROVED": return "info";
      case "PAID": return "success";
      case "FAILED": return "critical";
      default: return undefined;
    }
  };

  const tabs = [
    { id: "ALL", content: `All (${statusCounts.all})` },
    { id: "PENDING", content: `Pending (${statusCounts.pending})` },
    { id: "APPROVED", content: `Approved (${statusCounts.approved})` },
    { id: "PAID", content: `Paid (${statusCounts.paid})` },
    { id: "FAILED", content: `Failed (${statusCounts.failed})` },
  ];
  const selectedTab = Math.max(tabs.findIndex(t => t.id === currentStatus), 0);

  const rowMarkup = payouts.map((payout, index) => {
    const netAmount = payout.baseAmount + payout.gstAmount - payout.tdsAmount;
    return (
      <IndexTable.Row key={payout.id} id={payout.id} position={index}>
        <IndexTable.Cell>
          <BlockStack gap="0">
            <Text as="span" variant="bodyMd" fontWeight="semibold">{payout.affiliateName}</Text>
            <Text as="span" variant="bodySm" tone="subdued">
              {payout.affiliateUpi || payout.affiliateEmail}
            </Text>
          </BlockStack>
        </IndexTable.Cell>
        <IndexTable.Cell>{formatINR(payout.baseAmount)}</IndexTable.Cell>
        <IndexTable.Cell>
          {payout.gstAmount > 0 ? `+${formatINR(payout.gstAmount)}` : "—"}
        </IndexTable.Cell>
        <IndexTable.Cell>
          {payout.tdsAmount > 0 ? `-${formatINR(payout.tdsAmount)}` : "—"}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Text as="span" fontWeight="semibold">{formatINR(netAmount)}</Text>
        </IndexTable.Cell>
        <IndexTable.Cell>
          <Badge tone={statusTone(payout.status)}>{payout.status}</Badge>
        </IndexTable.Cell>
        <IndexTable.Cell>
          {new Date(payout.createdAt).toLocaleDateString("en-IN")}
        </IndexTable.Cell>
        <IndexTable.Cell>
          <InlineStack gap="200">
            {payout.status === "PENDING" && (
              <>
                <Button
                  variant="primary"
                  size="micro"
                  onClick={() => handleAction("approve", payout.id)}
                >
                  Approve
                </Button>
                <Button
                  tone="critical"
                  size="micro"
                  onClick={() => handleAction("reject", payout.id)}
                >
                  Reject
                </Button>
              </>
            )}
            {payout.status === "APPROVED" && (
              <Button
                variant="primary"
                size="micro"
                onClick={() => handleAction("mark_paid", payout.id)}
              >
                Mark Paid
              </Button>
            )}
          </InlineStack>
        </IndexTable.Cell>
      </IndexTable.Row>
    );
  });

  return (
    <Page
      title="Payouts"
      titleMetadata={
        <InlineStack gap="200">
          <Badge>{`${totalCount} total`}</Badge>
          <Badge tone="info">{`Mode: ${shopPayoutMode === "RAZORPAY_X" ? "Razorpay X" : "Manual"}`}</Badge>
        </InlineStack>
      }
    >
      <BlockStack gap="400">
        <Card padding="0">
          <Tabs
            tabs={tabs}
            selected={selectedTab}
            onSelect={(idx) => {
              const tab = tabs[idx];
              const params = new URLSearchParams(searchParams);
              if (tab.id !== "ALL") params.set("status", tab.id);
              else params.delete("status");
              params.delete("cursor");
              setSearchParams(params);
            }}
          />

          {payouts.length === 0 ? (
            <div style={{ padding: "16px" }}>
              <EmptyState
                heading="No payouts yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Payouts will appear here when affiliates request commission withdrawals.
                </p>
              </EmptyState>
            </div>
          ) : (
            <IndexTable
              resourceName={{ singular: "payout", plural: "payouts" }}
              itemCount={payouts.length}
              headings={[
                { title: "Affiliate" },
                { title: "Amount" },
                { title: "GST" },
                { title: "TDS" },
                { title: "Net" },
                { title: "Status" },
                { title: "Date" },
                { title: "Actions" },
              ]}
              selectable={false}
            >
              {rowMarkup}
            </IndexTable>
          )}

          {/* Pagination */}
          {hasMore && nextCursor && (
            <div style={{ padding: "16px", display: "flex", justifyContent: "center" }}>
              <InlineStack gap="300" align="center">
                <Button
                  onClick={() => {
                    const params = new URLSearchParams(searchParams);
                    params.set("cursor", nextCursor);
                    setSearchParams(params);
                  }}
                >
                  Load More &rarr;
                </Button>
              </InlineStack>
            </div>
          )}
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
