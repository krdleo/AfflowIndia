import type { ActionFunctionArgs } from "react-router";
import { destroyAffiliateSession } from "../lib/jwt.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  return destroyAffiliateSession(request);
};

export const loader = async () => {
  return new Response("Not Found", { status: 404 });
};
