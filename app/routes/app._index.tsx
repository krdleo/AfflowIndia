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

import {
  Page,
  Layout,
  Card,
  Text,
  Badge,
  Banner,
  IndexTable,
  EmptyState,
  Button,
  InlineStack,
  BlockStack,
  Link,
} from "@shopify/polaris";

export default function Dashboard() {
  const { stats, recentReferrals, shop } = useLoaderData<typeof loader>();

  useEffect(() => {
    document.title = "AfflowIndia — Dashboard";
  }, []);

  const formatINR = (amount: number) =>
    `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  const rowMarkup = recentReferrals.map((referral, index) => (
    <IndexTable.Row id={referral.id} key={referral.id} position={index}>
      <IndexTable.Cell>{referral.affiliateName}</IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone="info">{referral.affiliateCode}</Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>{formatINR(referral.orderAmount)}</IndexTable.Cell>
      <IndexTable.Cell>{formatINR(referral.commissionAmount)}</IndexTable.Cell>
      <IndexTable.Cell>
        {new Date(referral.createdAt).toLocaleDateString("en-IN")}
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      title="Dashboard"
      titleMetadata={<Badge tone={shop.plan === "FREE" ? "warning" : "success"}>{`${shop.plan} Plan`}</Badge>}
    >
      <BlockStack gap="400">
        {stats.pendingAffiliates > 0 && (
          <Banner tone="warning" onDismiss={() => {}}>
            <p>
              You have {stats.pendingAffiliates} affiliate{stats.pendingAffiliates > 1 ? "s" : ""} waiting for approval.{" "}
              <Link url="/app/affiliates">Review now →</Link>
            </p>
          </Banner>
        )}

        {/* Stats Cards */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Total Affiliates</Text>
                <Text as="p" variant="heading3xl">{stats.totalAffiliates}</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {stats.activeAffiliates} active · {stats.pendingAffiliates} pending
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Total Sales</Text>
                <Text as="p" variant="heading3xl">{formatINR(stats.totalSales)}</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {stats.totalReferrals} referral orders
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Pending Commissions</Text>
                <Text as="p" variant="heading3xl">{formatINR(stats.pendingCommissions)}</Text>
                <Text as="p" variant="bodySm" tone="subdued">
                  {formatINR(stats.totalCommissions)} total earned
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Recent Referrals */}
        <Card padding="0">
          <div style={{ padding: "16px" }}>
            <Text as="h2" variant="headingMd">Recent Referrals</Text>
          </div>

          {recentReferrals.length === 0 ? (
            <div style={{ padding: "0 16px 16px" }}>
              <EmptyState
                heading="No referrals yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Once your affiliates start sharing their codes and driving sales,
                  you&apos;ll see referral activity here.
                </p>
              </EmptyState>
            </div>
          ) : (
            <IndexTable
              resourceName={{ singular: "referral", plural: "referrals" }}
              itemCount={recentReferrals.length}
              headings={[
                { title: "Affiliate" },
                { title: "Code" },
                { title: "Order Amount" },
                { title: "Commission" },
                { title: "Date" },
              ]}
              selectable={false}
            >
              {rowMarkup}
            </IndexTable>
          )}
        </Card>

        {/* Quick Actions */}
        <Card>
          <BlockStack gap="400">
            <Text as="h2" variant="headingMd">Quick Actions</Text>
            <InlineStack gap="300">
              <Button url="/app/affiliates" variant="primary">
                Manage Affiliates
              </Button>
              <Button url="/app/settings">
                Settings
              </Button>
              <Button url="/app/payouts">
                View Payouts
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
