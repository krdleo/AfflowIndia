/**
 * GDPR Webhook: customers/redact
 *
 * Shopify delivers this 10 days after a customer requests redaction.
 * For this app, the only customer-linked PII is affiliate records matching
 * the customer's email or phone. We anonymize those rows rather than delete
 * them outright, so referral/payout history stays intact for the merchant
 * (legal requirement for accounting) while PII is scrubbed.
 *
 * Respond 200 with JSON. Keep under 5 seconds.
 */

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

type CustomersRedactPayload = {
  shop_id?: number;
  shop_domain?: string;
  customer?: {
    id?: number;
    email?: string | null;
    phone?: string | null;
  };
  orders_to_redact?: number[];
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const body = payload as CustomersRedactPayload;

  const email = body.customer?.email?.toLowerCase().trim() || null;
  const phone = body.customer?.phone?.trim() || null;

  if (!email && !phone) {
    return new Response(JSON.stringify({ redacted: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const shopRecord = await db.shop.findUnique({ where: { shopDomain: shop } });
  if (!shopRecord) {
    return new Response(JSON.stringify({ redacted: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const matches = await db.affiliate.findMany({
    where: {
      shopId: shopRecord.id,
      OR: [
        ...(email ? [{ email }] : []),
        ...(phone ? [{ phone }] : []),
      ],
    },
    select: { id: true },
  });

  if (matches.length === 0) {
    return new Response(JSON.stringify({ redacted: 0 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const anonEmail = `redacted+${Date.now()}@redacted.invalid`;
  await db.affiliate.updateMany({
    where: { id: { in: matches.map((a) => a.id) } },
    data: {
      name: "Redacted",
      email: anonEmail,
      phone: null,
      upiId: null,
      panEncrypted: null,
      panIv: null,
      panTag: null,
      panLast4: null,
      gstinEncrypted: null,
      gstinIv: null,
      gstinTag: null,
      legalNameEncrypted: null,
      legalNameIv: null,
      legalNameTag: null,
      addressEncrypted: null,
      addressIv: null,
      addressTag: null,
      bankDetailsEncrypted: null,
      bankDetailsIv: null,
      bankDetailsTag: null,
      city: null,
      state: null,
      pincode: null,
      status: "SUSPENDED",
    },
  });

  return new Response(JSON.stringify({ redacted: matches.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
