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
import { useLoaderData, useFetcher, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";

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
  const shopify = useAppBridge();

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
  }, [fetcher.data, shopify]);

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
    { id: "ALL", label: `All (${statusCounts.all})` },
    { id: "PENDING", label: `Pending (${statusCounts.pending})` },
    { id: "APPROVED", label: `Approved (${statusCounts.approved})` },
    { id: "PAID", label: `Paid (${statusCounts.paid})` },
    { id: "FAILED", label: `Failed (${statusCounts.failed})` },
  ];

  return (
    <s-page heading="Payouts">
      <s-badge slot="title-metadata">{totalCount} total</s-badge>
      <s-badge slot="title-metadata" tone="info">
        Mode: {shopPayoutMode === "RAZORPAY_X" ? "Razorpay X" : "Manual"}
      </s-badge>

      {/* Tabs */}
      <s-tabs>
        {tabs.map((tab) => (
          <s-tab
            key={tab.id}
            id={tab.id}
            selected={currentStatus === tab.id ? true : undefined}
            onClick={() => {
              const params = new URLSearchParams();
              if (tab.id !== "ALL") params.set("status", tab.id);
              setSearchParams(params);
            }}
          >
            {tab.label}
          </s-tab>
        ))}
      </s-tabs>

      {/* Payouts Table */}
      <s-card>
        {payouts.length === 0 ? (
          <s-empty-state
            heading="No payouts yet"
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <s-text>
              Payouts will appear here when affiliates request commission withdrawals.
            </s-text>
          </s-empty-state>
        ) : (
          <s-data-table>
            <s-data-table-head>
              <s-data-table-header-cell>Affiliate</s-data-table-header-cell>
              <s-data-table-header-cell>Amount</s-data-table-header-cell>
              <s-data-table-header-cell>GST</s-data-table-header-cell>
              <s-data-table-header-cell>TDS</s-data-table-header-cell>
              <s-data-table-header-cell>Net</s-data-table-header-cell>
              <s-data-table-header-cell>Status</s-data-table-header-cell>
              <s-data-table-header-cell>Date</s-data-table-header-cell>
              <s-data-table-header-cell>Actions</s-data-table-header-cell>
            </s-data-table-head>
            <s-data-table-body>
              {payouts.map((payout) => {
                const netAmount = payout.baseAmount + payout.gstAmount - payout.tdsAmount;
                return (
                  <s-data-table-row key={payout.id}>
                    <s-data-table-cell>
                      <s-stack direction="block" gap="tight">
                        <s-text fontWeight="semibold">{payout.affiliateName}</s-text>
                        <s-text variant="bodySm" tone="subdued">
                          {payout.affiliateUpi || payout.affiliateEmail}
                        </s-text>
                      </s-stack>
                    </s-data-table-cell>
                    <s-data-table-cell>{formatINR(payout.baseAmount)}</s-data-table-cell>
                    <s-data-table-cell>
                      {payout.gstAmount > 0 ? `+${formatINR(payout.gstAmount)}` : "—"}
                    </s-data-table-cell>
                    <s-data-table-cell>
                      {payout.tdsAmount > 0 ? `-${formatINR(payout.tdsAmount)}` : "—"}
                    </s-data-table-cell>
                    <s-data-table-cell>
                      <s-text fontWeight="semibold">{formatINR(netAmount)}</s-text>
                    </s-data-table-cell>
                    <s-data-table-cell>
                      <s-badge tone={statusTone(payout.status)}>{payout.status}</s-badge>
                    </s-data-table-cell>
                    <s-data-table-cell>
                      {new Date(payout.createdAt).toLocaleDateString("en-IN")}
                    </s-data-table-cell>
                    <s-data-table-cell>
                      <s-stack direction="inline" gap="tight">
                        {payout.status === "PENDING" && (
                          <>
                            <s-button
                              variant="primary"
                              size="slim"
                              onClick={() => handleAction("approve", payout.id)}
                            >
                              Approve
                            </s-button>
                            <s-button
                              tone="critical"
                              size="slim"
                              onClick={() => handleAction("reject", payout.id)}
                            >
                              Reject
                            </s-button>
                          </>
                        )}
                        {payout.status === "APPROVED" && (
                          <s-button
                            variant="primary"
                            size="slim"
                            onClick={() => handleAction("mark_paid", payout.id)}
                          >
                            Mark Paid
                          </s-button>
                        )}
                      </s-stack>
                    </s-data-table-cell>
                  </s-data-table-row>
                );
              })}
            </s-data-table-body>
          </s-data-table>
        )}

        {/* Pagination */}
        {hasMore && nextCursor && (
          <s-stack direction="inline" gap="base" align="center">
            <s-button
              onClick={() => {
                const params = new URLSearchParams(searchParams);
                params.set("cursor", nextCursor);
                setSearchParams(params);
              }}
            >
              Load More →
            </s-button>
          </s-stack>
        )}
      </s-card>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
