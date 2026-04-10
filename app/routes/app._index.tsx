/**
 * Dashboard — App Home (Landing Page)
 *
 * Overview stats: total affiliates, total sales, pending commissions, recent activity
 * Uses Polaris web components exclusively.
 */

import { useEffect } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useRevalidator } from "react-router";
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

  // Fetch last 7 days sales data for chart
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  sevenDaysAgo.setHours(0, 0, 0, 0);

  const dailyReferrals = await db.referral.findMany({
    where: { 
      shopId: shop.id,
      createdAt: { gte: sevenDaysAgo }
    },
    select: { orderAmount: true, createdAt: true },
  });

  // Group by day
  const salesByDayMap = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    salesByDayMap.set(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), 0);
  }

  dailyReferrals.forEach(ref => {
    const dayStr = ref.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (salesByDayMap.has(dayStr)) {
      salesByDayMap.set(dayStr, salesByDayMap.get(dayStr)! + Number(ref.orderAmount));
    }
  });

  const chartData = Array.from(salesByDayMap.entries()).map(([date, sales]) => ({
    date,
    sales
  }));

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
    chartData,
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
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export default function Dashboard() {
  const { stats, recentReferrals, shop, chartData } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  // Polling for real-time updates every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      if (revalidator.state === "idle") {
        revalidator.revalidate();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [revalidator]);

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

        {/* Real-time Sales Chart */}
        <Card padding="0">
          <div style={{ padding: "16px", borderBottom: "1px solid #ebebeb", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Text as="h2" variant="headingMd">Sales Over Time (Last 7 Days)</Text>
            {revalidator.state === "loading" && <Badge tone="info">Live Updating...</Badge>}
          </div>
          <div style={{ padding: "20px", height: "300px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E1E3E5" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#6D7175', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6D7175', fontSize: 12 }} dx={-10} tickFormatter={(val) => `₹${val}`} />
                <Tooltip 
                  formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, "Sales"]}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                />
                <Line type="monotone" dataKey="sales" stroke="#008060" strokeWidth={3} activeDot={{ r: 6 }} dot={{ r: 4, fill: '#008060', strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

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
