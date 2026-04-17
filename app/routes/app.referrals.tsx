/**
 * Referral Tracking Page
 *
 * Table of affiliates with click counts, sales, codes, commission earned.
 * Paginated, sortable.
 */

import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import {
  Page,
  Badge,
  Layout,
  Card,
  Text,
  EmptyState,
  IndexTable,
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

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const shop = await db.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Response("Shop not found", { status: 404 });

  const formData = await request.formData();
  const actionType = formData.get("_action") as string;

  if (actionType === "export_csv") {
    const { generateCSV, csvResponse } = await import("../lib/csv.server");

    const allReferrals = await db.referral.findMany({
      where: { shopId: shop.id },
      include: {
        affiliate: { select: { name: true, code: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const headers = [
      "Affiliate Name",
      "Affiliate Email",
      "Code",
      "Order ID",
      "Order Amount (INR)",
      "Commission Rate (%)",
      "Commission (INR)",
      "Date",
    ];
    const rows = allReferrals.map((r) => [
      r.affiliate.name,
      r.affiliate.email,
      r.affiliate.code,
      r.orderId,
      Number(r.orderAmount).toFixed(2),
      Number(r.commissionRate),
      Number(r.commissionAmount).toFixed(2),
      r.createdAt.toISOString().split("T")[0],
    ]);

    const csv = generateCSV(headers, rows);
    const date = new Date().toISOString().split("T")[0];
    return csvResponse(csv, `referrals-${date}.csv`);
  }

  return { error: "Unknown action" };
};

export default function Referrals() {
  const { referrals, totalCount, hasMore, nextCursor, totals } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher<typeof action>();

  const formatINR = (amount: number) =>
    `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;

  const rowMarkup = referrals.map((referral, index) => (
    <IndexTable.Row key={referral.id} id={referral.id} position={index}>
      <IndexTable.Cell>
        <Text as="span" variant="bodyMd" fontWeight="semibold">
          {referral.affiliateName}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Badge tone="info">{referral.affiliateCode}</Badge>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodySm" tone="subdued">
          #{referral.orderId}
        </Text>
      </IndexTable.Cell>
      <IndexTable.Cell>{formatINR(referral.orderAmount)}</IndexTable.Cell>
      <IndexTable.Cell>{referral.commissionRate}%</IndexTable.Cell>
      <IndexTable.Cell>{formatINR(referral.commissionAmount)}</IndexTable.Cell>
      <IndexTable.Cell>
        {new Date(referral.createdAt).toLocaleDateString("en-IN")}
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  return (
    <Page
      title="Referral Tracking"
      titleMetadata={<Badge>{`${totalCount} referrals`}</Badge>}
      secondaryActions={[
        {
          content: "Export CSV",
          onAction: () =>
            fetcher.submit({ _action: "export_csv" }, { method: "POST" }),
        },
      ]}
    >
      <BlockStack gap="400">
        {/* Summary Stats */}
        <Layout>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Total Orders</Text>
                <Text as="p" variant="heading2xl">{totals.totalOrders}</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Total Sales</Text>
                <Text as="p" variant="heading2xl">{formatINR(totals.totalSales)}</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Total Commissions</Text>
                <Text as="p" variant="heading2xl">{formatINR(totals.totalCommissions)}</Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {/* Referrals Table */}
        <Card padding="0">
          {referrals.length === 0 ? (
            <div style={{ padding: "16px" }}>
              <EmptyState
                heading="No referrals yet"
                image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
              >
                <p>
                  Referrals will appear here when customers use affiliate discount codes.
                </p>
              </EmptyState>
            </div>
          ) : (
            <IndexTable
              resourceName={{ singular: "referral", plural: "referrals" }}
              itemCount={referrals.length}
              headings={[
                { title: "Affiliate" },
                { title: "Code" },
                { title: "Order ID" },
                { title: "Order Amount" },
                { title: "Commission Rate" },
                { title: "Commission" },
                { title: "Date" },
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

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
