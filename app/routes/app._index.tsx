/**
 * Dashboard — App Home (Landing Page)
 *
 * Overview stats: total affiliates, total sales, pending commissions, recent activity
 * Uses Polaris web components exclusively.
 */

import { useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  // Find or create shop record
  let shop = await db.shop.findUnique({
    where: { shopDomain },
  });

  if (!shop) {
    // First time loading — create shop record
    const { encrypt } = await import("../lib/encryption.server");
    const tokenData = encrypt(session.accessToken || "");
    shop = await db.shop.create({
      data: {
        shopDomain,
        accessTokenEncrypted: tokenData.ciphertext,
        accessTokenIv: tokenData.iv,
        accessTokenTag: tokenData.tag,
        scope: session.scope || "",
        isActive: true,
      },
    });
  }

  // Fetch dashboard stats
  const [
    totalAffiliates,
    activeAffiliates,
    pendingAffiliates,
    totalReferrals,
    recentReferrals,
  ] = await Promise.all([
    db.affiliate.count({ where: { shopId: shop.id } }),
    db.affiliate.count({ where: { shopId: shop.id, status: "ACTIVE" } }),
    db.affiliate.count({ where: { shopId: shop.id, status: "PENDING" } }),
    db.referral.count({ where: { shopId: shop.id } }),
    db.referral.findMany({
      where: { shopId: shop.id },
      include: { affiliate: { select: { name: true, code: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  // Aggregate stats
  const salesAgg = await db.referral.aggregate({
    where: { shopId: shop.id },
    _sum: { orderAmount: true, commissionAmount: true },
  });

  const pendingCommissionAgg = await db.affiliate.aggregate({
    where: { shopId: shop.id },
    _sum: { pendingCommission: true },
  });

  return {
    shop: {
      id: shop.id,
      plan: shop.plan,
      shopDomain,
    },
    stats: {
      totalAffiliates,
      activeAffiliates,
      pendingAffiliates,
      totalReferrals,
      totalSales: Number(salesAgg._sum.orderAmount || 0),
      totalCommissions: Number(salesAgg._sum.commissionAmount || 0),
      pendingCommissions: Number(pendingCommissionAgg._sum.pendingCommission || 0),
    },
    recentReferrals: recentReferrals.map((r) => ({
      id: r.id,
      affiliateName: r.affiliate.name,
      affiliateCode: r.affiliate.code,
      orderId: r.orderId,
      orderAmount: Number(r.orderAmount),
      commissionAmount: Number(r.commissionAmount),
      createdAt: r.createdAt.toISOString(),
    })),
  };
};

export default function Dashboard() {
  const { stats, recentReferrals, shop } = useLoaderData<typeof loader>();
  const shopify = useAppBridge();

  useEffect(() => {
    document.title = "AfflowIndia — Dashboard";
  }, []);

  const formatINR = (amount: number) =>
    `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  return (
    <s-page heading="Dashboard">
      <s-badge slot="title-metadata" tone={shop.plan === "FREE" ? "warning" : "success"}>
        {shop.plan} Plan
      </s-badge>

      {stats.pendingAffiliates > 0 && (
        <s-banner tone="warning" dismissible>
          You have {stats.pendingAffiliates} affiliate{stats.pendingAffiliates > 1 ? "s" : ""} waiting for approval.{" "}
          <s-link href="/app/affiliates">Review now →</s-link>
        </s-banner>
      )}

      {/* Stats Cards */}
      <s-layout>
        <s-layout-section variant="oneThird">
          <s-card>
            <s-text variant="headingMd">Total Affiliates</s-text>
            <s-text variant="heading2xl">{stats.totalAffiliates}</s-text>
            <s-text variant="bodySm" tone="subdued">
              {stats.activeAffiliates} active · {stats.pendingAffiliates} pending
            </s-text>
          </s-card>
        </s-layout-section>

        <s-layout-section variant="oneThird">
          <s-card>
            <s-text variant="headingMd">Total Sales</s-text>
            <s-text variant="heading2xl">{formatINR(stats.totalSales)}</s-text>
            <s-text variant="bodySm" tone="subdued">
              {stats.totalReferrals} referral orders
            </s-text>
          </s-card>
        </s-layout-section>

        <s-layout-section variant="oneThird">
          <s-card>
            <s-text variant="headingMd">Pending Commissions</s-text>
            <s-text variant="heading2xl">{formatINR(stats.pendingCommissions)}</s-text>
            <s-text variant="bodySm" tone="subdued">
              {formatINR(stats.totalCommissions)} total earned
            </s-text>
          </s-card>
        </s-layout-section>
      </s-layout>

      {/* Recent Referrals */}
      <s-card>
        <s-text variant="headingMd">Recent Referrals</s-text>

        {recentReferrals.length === 0 ? (
          <s-empty-state
            heading="No referrals yet"
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <s-text>
              Once your affiliates start sharing their codes and driving sales,
              you&apos;ll see referral activity here.
            </s-text>
          </s-empty-state>
        ) : (
          <s-data-table>
            <s-data-table-head>
              <s-data-table-header-cell>Affiliate</s-data-table-header-cell>
              <s-data-table-header-cell>Code</s-data-table-header-cell>
              <s-data-table-header-cell>Order Amount</s-data-table-header-cell>
              <s-data-table-header-cell>Commission</s-data-table-header-cell>
              <s-data-table-header-cell>Date</s-data-table-header-cell>
            </s-data-table-head>
            <s-data-table-body>
              {recentReferrals.map((referral) => (
                <s-data-table-row key={referral.id}>
                  <s-data-table-cell>{referral.affiliateName}</s-data-table-cell>
                  <s-data-table-cell>
                    <s-badge>{referral.affiliateCode}</s-badge>
                  </s-data-table-cell>
                  <s-data-table-cell>{formatINR(referral.orderAmount)}</s-data-table-cell>
                  <s-data-table-cell>{formatINR(referral.commissionAmount)}</s-data-table-cell>
                  <s-data-table-cell>
                    {new Date(referral.createdAt).toLocaleDateString("en-IN")}
                  </s-data-table-cell>
                </s-data-table-row>
              ))}
            </s-data-table-body>
          </s-data-table>
        )}
      </s-card>

      {/* Quick Actions */}
      <s-card>
        <s-text variant="headingMd">Quick Actions</s-text>
        <s-stack direction="inline" gap="base">
          <s-button href="/app/affiliates" variant="primary">
            Manage Affiliates
          </s-button>
          <s-button href="/app/settings">
            Settings
          </s-button>
          <s-button href="/app/payouts">
            View Payouts
          </s-button>
        </s-stack>
      </s-card>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
