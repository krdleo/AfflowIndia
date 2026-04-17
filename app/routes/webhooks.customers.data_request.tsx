/**
 * GDPR Webhook: customers/data_request
 *
 * Shopify forwards a customer's request for the data we store about them.
 * We must respond within 30 days. For this app, affiliates are the only
 * PII we store — if the customer email or phone matches an affiliate,
 * we return the (decrypted) record so the merchant can forward it.
 *
 * Respond 200 with JSON. Keep under 5 seconds.
 */

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { decrypt } from "../lib/encryption.server";

type CustomersDataRequestPayload = {
  shop_id?: number;
  shop_domain?: string;
  customer?: {
    id?: number;
    email?: string | null;
    phone?: string | null;
  };
  orders_requested?: number[];
};

function tryDecrypt(cipher: string | null, iv: string | null, tag: string | null) {
  if (!cipher || !iv || !tag) return null;
  try {
    return decrypt(cipher, iv, tag);
  } catch {
    return null;
  }
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const body = payload as CustomersDataRequestPayload;

  const email = body.customer?.email?.toLowerCase().trim() || null;
  const phone = body.customer?.phone?.trim() || null;

  const shopRecord = await db.shop.findUnique({ where: { shopDomain: shop } });

  const matches = shopRecord && (email || phone)
    ? await db.affiliate.findMany({
        where: {
          shopId: shopRecord.id,
          OR: [
            ...(email ? [{ email }] : []),
            ...(phone ? [{ phone }] : []),
          ],
        },
      })
    : [];

  const data = matches.map((a) => ({
    id: a.id,
    name: a.name,
    email: a.email,
    phone: a.phone,
    upiId: a.upiId,
    code: a.code,
    referralCode: a.referralCode,
    status: a.status,
    city: a.city,
    state: a.state,
    pincode: a.pincode,
    panLast4: a.panLast4,
    pan: tryDecrypt(a.panEncrypted, a.panIv, a.panTag),
    gstin: tryDecrypt(a.gstinEncrypted, a.gstinIv, a.gstinTag),
    legalName: tryDecrypt(a.legalNameEncrypted, a.legalNameIv, a.legalNameTag),
    address: tryDecrypt(a.addressEncrypted, a.addressIv, a.addressTag),
    bankDetails: tryDecrypt(a.bankDetailsEncrypted, a.bankDetailsIv, a.bankDetailsTag),
    createdAt: a.createdAt.toISOString(),
  }));

  return new Response(JSON.stringify({ shop, data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
