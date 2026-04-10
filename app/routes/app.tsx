import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticate } from "../shopify.server";

import { NavMenu } from "@shopify/app-bridge-react";
import { AppProvider as PolarisProvider } from "@shopify/polaris";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <PolarisProvider i18n={{}}>
        <NavMenu>
          <a href="/app" rel="home">Dashboard</a>
          <a href="/app/affiliates">Affiliates</a>
          <a href="/app/referrals">Referral Tracking</a>
          <a href="/app/payouts">Payouts</a>
          <a href="/app/settings">Settings</a>
        </NavMenu>
        <Outlet />
      </PolarisProvider>
    </AppProvider>
  );
}

// Error boundary to prevent white screens (BFS requirement)
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
