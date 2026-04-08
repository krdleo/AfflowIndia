/**
 * Webhook: app/uninstalled
 *
 * Set shop.isActive = false
 * Do NOT delete data — merchants may reinstall
 */

import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Mark shop as inactive (don't delete data)
  await db.shop.updateMany({
    where: { shopDomain: shop },
    data: { isActive: false },
  });

  // Clean up Shopify sessions
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  return new Response();
};
