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
import { useLoaderData, useFetcher, useSearchParams } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";
import { checkAffiliateLimit, PLAN_CONFIGS } from "../lib/billing.server";

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
        createdAt: true,
      },
    }),
    db.affiliate.count({ where }),
    Promise.all([
      db.affiliate.count({ where: { shopId: shop.id } }),
      db.affiliate.count({ where: { shopId: shop.id, status: "PENDING" } }),
      db.affiliate.count({ where: { shopId: shop.id, status: "ACTIVE" } }),
      db.affiliate.count({ where: { shopId: shop.id, status: "SUSPENDED" } }),
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
    },
    limitInfo: {
      ...limitInfo,
      planName: PLAN_CONFIGS[shop.plan].name,
    },
    shopPlan: shop.plan,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shopDomain = session.shop;

  const shop = await db.shop.findUnique({ where: { shopDomain } });
  if (!shop) throw new Response("Shop not found", { status: 404 });

  const formData = await request.formData();
  const actionType = formData.get("_action") as string;
  const affiliateId = formData.get("affiliateId") as string;

  if (!actionType || !affiliateId) {
    return { error: "Missing action or affiliate ID" };
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

    default:
      return { error: "Unknown action" };
  }
};

export default function Affiliates() {
  const { affiliates, totalCount, hasMore, nextCursor, statusCounts, limitInfo } =
    useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const fetcher = useFetcher<typeof action>();
  const shopify = useAppBridge();

  const currentStatus = searchParams.get("status") || "ALL";
  const currentSearch = searchParams.get("search") || "";

  const [searchValue, setSearchValue] = useState(currentSearch);
  const [confirmAction, setConfirmAction] = useState<{
    type: string;
    affiliateId: string;
    name: string;
  } | null>(null);

  // Show toast on action complete
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
    { id: "ALL", label: `All (${statusCounts.all})` },
    { id: "PENDING", label: `Pending (${statusCounts.pending})` },
    { id: "ACTIVE", label: `Active (${statusCounts.active})` },
    { id: "SUSPENDED", label: `Suspended (${statusCounts.suspended})` },
  ];

  return (
    <s-page heading="Affiliates">
      <s-badge slot="title-metadata">{totalCount} total</s-badge>

      {/* Limit warning */}
      {!limitInfo.allowed && (
        <s-banner tone="critical">
          You&apos;ve reached the affiliate limit ({limitInfo.limit}) for the {limitInfo.planName} plan.
          Upgrade to add more affiliates.
          <s-button href="/app/settings/billing" variant="primary">
            Upgrade Plan
          </s-button>
        </s-banner>
      )}

      {/* Tabs */}
      <s-tabs>
        {tabs.map((tab) => (
          <s-tab
            key={tab.id}
            id={tab.id}
            selected={currentStatus === tab.id ? true : undefined}
            onClick={() => handleTabChange(tab.id)}
          >
            {tab.label}
          </s-tab>
        ))}
      </s-tabs>

      {/* Search */}
      <s-card>
        <s-stack direction="inline" gap="base" align="end">
          <s-text-field
            label="Search affiliates"
            value={searchValue}
            placeholder="Search by name, email, or code..."
            onInput={(e: CustomEvent) => setSearchValue((e.target as HTMLInputElement).value)}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "Enter") handleSearch();
            }}
          />
          <s-button onClick={handleSearch}>Search</s-button>
        </s-stack>
      </s-card>

      {/* Affiliate List */}
      <s-card>
        {affiliates.length === 0 ? (
          <s-empty-state
            heading={
              currentSearch
                ? "No affiliates match your search"
                : "No affiliates yet"
            }
            image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
          >
            <s-text>
              {currentSearch
                ? "Try a different search term."
                : "Share your affiliate portal link to start recruiting affiliates."}
            </s-text>
          </s-empty-state>
        ) : (
          <s-data-table>
            <s-data-table-head>
              <s-data-table-header-cell>Name</s-data-table-header-cell>
              <s-data-table-header-cell>Code</s-data-table-header-cell>
              <s-data-table-header-cell>Status</s-data-table-header-cell>
              <s-data-table-header-cell>Clicks</s-data-table-header-cell>
              <s-data-table-header-cell>Sales</s-data-table-header-cell>
              <s-data-table-header-cell>Pending</s-data-table-header-cell>
              <s-data-table-header-cell>Actions</s-data-table-header-cell>
            </s-data-table-head>
            <s-data-table-body>
              {affiliates.map((affiliate) => (
                <s-data-table-row key={affiliate.id}>
                  <s-data-table-cell>
                    <s-stack direction="block" gap="tight">
                      <s-text variant="bodyMd" fontWeight="semibold">{affiliate.name}</s-text>
                      <s-text variant="bodySm" tone="subdued">{affiliate.email}</s-text>
                    </s-stack>
                  </s-data-table-cell>
                  <s-data-table-cell>
                    <s-badge>{affiliate.code}</s-badge>
                  </s-data-table-cell>
                  <s-data-table-cell>
                    <s-badge
                      tone={
                        affiliate.status === "ACTIVE"
                          ? "success"
                          : affiliate.status === "PENDING"
                          ? "warning"
                          : "critical"
                      }
                    >
                      {affiliate.status}
                    </s-badge>
                  </s-data-table-cell>
                  <s-data-table-cell>{affiliate.totalClicks}</s-data-table-cell>
                  <s-data-table-cell>{formatINR(affiliate.totalSales)}</s-data-table-cell>
                  <s-data-table-cell>{formatINR(affiliate.pendingCommission)}</s-data-table-cell>
                  <s-data-table-cell>
                    <s-stack direction="inline" gap="tight">
                      {affiliate.status === "PENDING" && (
                        <>
                          <s-button
                            variant="primary"
                            size="slim"
                            onClick={() => handleAction("approve", affiliate.id)}
                          >
                            Approve
                          </s-button>
                          <s-button
                            tone="critical"
                            size="slim"
                            onClick={() =>
                              setConfirmAction({
                                type: "reject",
                                affiliateId: affiliate.id,
                                name: affiliate.name,
                              })
                            }
                          >
                            Reject
                          </s-button>
                        </>
                      )}
                      {affiliate.status === "ACTIVE" && (
                        <s-button
                          tone="critical"
                          size="slim"
                          onClick={() =>
                            setConfirmAction({
                              type: "suspend",
                              affiliateId: affiliate.id,
                              name: affiliate.name,
                            })
                          }
                        >
                          Suspend
                        </s-button>
                      )}
                      {affiliate.status === "SUSPENDED" && (
                        <s-button
                          size="slim"
                          onClick={() => handleAction("reactivate", affiliate.id)}
                        >
                          Reactivate
                        </s-button>
                      )}
                    </s-stack>
                  </s-data-table-cell>
                </s-data-table-row>
              ))}
            </s-data-table-body>
          </s-data-table>
        )}

        {/* Pagination */}
        {(hasMore || searchParams.has("cursor")) && (
          <s-stack direction="inline" gap="base" align="center">
            {searchParams.has("cursor") && (
              <s-button
                onClick={() => {
                  const params = new URLSearchParams(searchParams);
                  params.delete("cursor");
                  setSearchParams(params);
                }}
              >
                ← Previous
              </s-button>
            )}
            {hasMore && nextCursor && (
              <s-button
                onClick={() => {
                  const params = new URLSearchParams(searchParams);
                  params.set("cursor", nextCursor);
                  setSearchParams(params);
                }}
              >
                Next →
              </s-button>
            )}
          </s-stack>
        )}
      </s-card>

      {/* Confirmation Modal */}
      {confirmAction && (
        <s-modal
          open
          heading={`${confirmAction.type === "suspend" ? "Suspend" : "Reject"} ${confirmAction.name}?`}
          onClose={() => setConfirmAction(null)}
        >
          <s-text>
            Are you sure you want to {confirmAction.type} {confirmAction.name}?
            {confirmAction.type === "suspend"
              ? " Their discount code will be deactivated."
              : " They will not be able to use the affiliate portal."}
          </s-text>
          <s-stack direction="inline" gap="base" slot="footer">
            <s-button onClick={() => setConfirmAction(null)}>Cancel</s-button>
            <s-button
              variant="primary"
              tone="critical"
              onClick={() =>
                handleAction(confirmAction.type, confirmAction.affiliateId)
              }
            >
              {confirmAction.type === "suspend" ? "Suspend" : "Reject"}
            </s-button>
          </s-stack>
        </s-modal>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
