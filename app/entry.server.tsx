import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { type EntryContext } from "react-router";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";
import { initCronJobs } from "./lib/cron.server";
import "./env.server";

// NOTE: helmet and express-rate-limit were removed from package.json because
// the app is served by @react-router/serve, which has no middleware layer we
// can hook into. If a custom Express server is ever introduced (e.g. a root
// server.ts using @react-router/express), wire them back in there:
//   - helmet() for security headers (disable its CSP/frameguard — Shopify
//     adds its own via addDocumentResponseHeaders below)
//   - rateLimit({ windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX }) on
//     /api/* with defaults of 100 requests / 15 minutes per IP.

const globalAny = globalThis as unknown as { __afflowCronInitialized?: boolean };
if (process.env.NODE_ENV === "production" && !globalAny.__afflowCronInitialized) {
  globalAny.__afflowCronInitialized = true;
  initCronJobs();
  console.log("[server] Cron jobs registered successfully");
}

export const streamTimeout = 5000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext
) {
  addDocumentResponseHeaders(request, responseHeaders);
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? '')
    ? "onAllReady"
    : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter
        context={reactRouterContext}
        url={request.url}
      />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        },
      }
    );

    // Automatically timeout the React renderer after 6 seconds, which ensures
    // React has enough time to flush down the rejected boundary contents
    setTimeout(abort, streamTimeout + 1000);
  });
}
