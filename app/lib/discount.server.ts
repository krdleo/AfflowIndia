/**
 * Discount Code Management
 *
 * Creates, updates, and deletes Shopify discount codes
 * for affiliates using the Admin GraphQL API.
 *
 * Uses discountCodeBasicCreate mutation to create percentage-off
 * discounts applied once per customer.
 */

/**
 * Create a percentage-off discount code for an affiliate
 */
export async function createAffiliateDiscount(
  admin: {
    graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
  },
  code: string,
  discountPercent: number,
  title?: string
): Promise<{ discountCodeId: string; priceRuleId: string } | null> {
  const response = await admin.graphql(
    `#graphql
    mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
      discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
        codeDiscountNode {
          id
          codeDiscount {
            ... on DiscountCodeBasic {
              codes(first: 1) {
                nodes {
                  id
                  code
                }
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        basicCodeDiscount: {
          title: title || `Affiliate: ${code}`,
          code,
          startsAt: new Date().toISOString(),
          customerGets: {
            value: {
              percentage: discountPercent / 100,
            },
            items: {
              all: true,
            },
          },
          appliesOncePerCustomer: true,
        },
      },
    }
  );

  const json = await response.json();
  const data = json.data?.discountCodeBasicCreate;

  if (data?.userErrors?.length > 0) {
    console.error("Discount creation errors:", data.userErrors);
    throw new Error(
      `Failed to create discount: ${data.userErrors.map((e: { message: string }) => e.message).join(", ")}`
    );
  }

  const node = data?.codeDiscountNode;
  if (!node) return null;

  const codeId = node.codeDiscount?.codes?.nodes?.[0]?.id;

  return {
    discountCodeId: codeId || "",
    priceRuleId: node.id,
  };
}

/**
 * Delete a discount code
 */
export async function deleteAffiliateDiscount(
  admin: {
    graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
  },
  discountId: string
): Promise<boolean> {
  const response = await admin.graphql(
    `#graphql
    mutation discountCodeDelete($id: ID!) {
      discountCodeDelete(id: $id) {
        deletedCodeDiscountId
        userErrors {
          field
          message
        }
      }
    }`,
    {
      variables: {
        id: discountId,
      },
    }
  );

  const json = await response.json();
  const data = json.data?.discountCodeDelete;

  if (data?.userErrors?.length > 0) {
    console.error("Discount deletion errors:", data.userErrors);
    return false;
  }

  return true;
}

/**
 * Update a discount code by deleting the old one and creating a new one
 */
export async function updateAffiliateDiscount(
  admin: {
    graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
  },
  oldDiscountId: string | null,
  newCode: string,
  discountPercent: number
): Promise<{ discountCodeId: string; priceRuleId: string } | null> {
  // Delete old discount if it exists
  if (oldDiscountId) {
    await deleteAffiliateDiscount(admin, oldDiscountId);
  }

  // Create new discount
  return createAffiliateDiscount(admin, newCode, discountPercent);
}
