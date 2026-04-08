/**
 * Referral Tracking Page
 *
 * Table of affiliates with click counts, sales, codes, commission earned.
 * Paginated, sortable.
 */

import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";
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
  const cursor = url.searchParams.get("cursor") || undefined;
  const search = url.searchParams.get("search") || "";

  const where: Record<string, unknown> = { shopId: shop.id };
  if (search) {
    where.OR = [
      { affiliate: { name: { contains: search, mode: "insensitive" } } },
      { affiliate: { code: { contains: search, mode: "insensitive" } } },
      { orderId: { contains: search } },
    ];
  }

  const referrals = await db.referral.findMany({
    where,
    include: {
      affiliate: {
        select: { name: true, code: true, email: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = referrals.length > PAGE_SIZE;
  const items = hasMore ? referrals.slice(0, PAGE_SIZE) : referrals;
  const nextCursor = hasMore ? items[items.length - 1]?.id : null;

  const totalCount = await db.referral.count({ where });

  // Aggregate stats
  const agg = await db.referral.aggregate({
    where: { shopId: shop.id },
    _sum: { orderAmount: true, commissionAmount: true },
    _count: true,
  });

  return {
    referrals: items.map((r) => ({
      id: r.id,
      affiliateName: r.affiliate.name,
      affiliateCode: r.affiliate.code,
      affiliateEmail: r.affiliate.email,
      orderId: r.orderId,
      orderAmount: Number(r.orderAmount),
      commissionAmount: Number(r.commissionAmount),
      commissionRate: Number(r.commissionRate),
      createdAt: r.createdAt.toISOString(),
    })),
    totalCount,
    hasMore,
    nextCursor,
    totals: {
      totalOrders: agg._count,
      totalSales: Number(agg._sum.orderAmount || 0),
      totalCommissions: Number(agg._sum.commissionAmount || 0),
    },
  };
};

export default function Referrals() {
  const { referrals, totalCount, hasMore, nextCursor, totals } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const formatINR = (amount: number) =>
    `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  return (
    <s-page heading="Referral Tracking">
      <s-badge slot="title-metadata">{totalCount} referrals</s-badge>

      {/* Summary Stats */}
      <s-layout>
        <s-layout-section variant="oneThird">
          <s-card>
            <s-text variant="headingMd">Total Orders</s-text>
            <s-text variant="heading2xl">{totals.totalOrders}</s-text>
          </s-card>
        </s-layout-section>
        <s-layout-section variant="oneThird">
          <s-card>
            <s-text variant="headingMd">Total Sales</s-text>
            <s-text variant="heading2xl">{formatINR(totals.totalSales)}</s-text>
          </s-card>
        </s-layout-section>
        <s-layout-section variant="oneThird">
          <s-card>
            <s-text variant="headingMd">Total Commissions</s-text>
            <s-text variant="heading2xl">{formatINR(totals.totalCommissions)}</s-text>
          </s-card>
        </s-layout-section>
      </s-layout>

      {/* Referrals Table */}
      <s-card>
        {referrals.length === 0 ? (
          <s-empty-state
            heading="No referrals yet"
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <s-text>
              Referrals will appear here when customers use affiliate discount codes.
            </s-text>
          </s-empty-state>
        ) : (
          <s-data-table>
            <s-data-table-head>
              <s-data-table-header-cell>Affiliate</s-data-table-header-cell>
              <s-data-table-header-cell>Code</s-data-table-header-cell>
              <s-data-table-header-cell>Order ID</s-data-table-header-cell>
              <s-data-table-header-cell>Order Amount</s-data-table-header-cell>
              <s-data-table-header-cell>Commission Rate</s-data-table-header-cell>
              <s-data-table-header-cell>Commission</s-data-table-header-cell>
              <s-data-table-header-cell>Date</s-data-table-header-cell>
            </s-data-table-head>
            <s-data-table-body>
              {referrals.map((referral) => (
                <s-data-table-row key={referral.id}>
                  <s-data-table-cell>
                    <s-text variant="bodyMd" fontWeight="semibold">
                      {referral.affiliateName}
                    </s-text>
                  </s-data-table-cell>
                  <s-data-table-cell>
                    <s-badge>{referral.affiliateCode}</s-badge>
                  </s-data-table-cell>
                  <s-data-table-cell>
                    <s-text variant="bodySm" tone="subdued">
                      #{referral.orderId}
                    </s-text>
                  </s-data-table-cell>
                  <s-data-table-cell>{formatINR(referral.orderAmount)}</s-data-table-cell>
                  <s-data-table-cell>{referral.commissionRate}%</s-data-table-cell>
                  <s-data-table-cell>{formatINR(referral.commissionAmount)}</s-data-table-cell>
                  <s-data-table-cell>
                    {new Date(referral.createdAt).toLocaleDateString("en-IN")}
                  </s-data-table-cell>
                </s-data-table-row>
              ))}
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
