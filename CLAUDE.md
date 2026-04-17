# AfflowIndia

Shopify embedded affiliate marketing app for Indian e-commerce merchants.

## Debugging Strategy

- When a fix doesn't resolve the reported issue, stop and investigate root cause across layers (env vars, encryption, API versions) instead of making further speculative edits
- For Shopify app dev errors, check in order: Prisma migrations, duplicate web config (worktrees), stuck advisory locks, API version mismatches

## Testing Constraints

- Browser/runtime testing is not available in this environment — default to static analysis, type checks, and build verification instead of suggesting manual browser tests

## Built for Shopify — First-Attempt Review Pass

**This is the #1 priority of this project.** Every line of code, every architectural decision, and every change must be made with the goal of earning the "Built for Shopify" (BFS) badge and passing Shopify's app review on the first attempt.

- The current architecture was specifically selected for BFS compliance. **Do NOT refactor or change architecture unless Shopify's official recommendations change.**
- Before making any change, consider whether it could jeopardize BFS compliance.
- When in doubt, follow Shopify's documented best practices exactly.

### BFS Compliance Rules

- **Polaris only** in admin UI — use `@shopify/polaris` React components exclusively. Zero custom CSS in the embedded admin.
- **No `<s-*>` web components** — use Polaris React components (`<Card>`, `<Page>`, `<Button>`, `<Text>`, etc.)
- **FCP under 2 seconds**
- **No storefront script injection**
- **All webhooks respond in < 5 seconds**
- **Cursor-based pagination** on every list view
- **Error boundaries** on every page
- **GDPR webhooks** implemented: `customers/data_request`, `customers/redact`, `shop/redact`
- **Minimum required scopes only**: `read_orders`, `write_discounts`, `write_app_proxy`
- **Embedded app** — must remain embedded, not standalone
- **App Proxy** for affiliate portal: `store.myshopify.com/a/ref/...`

## Tech Stack

- **Framework**: React Router v7 + Vite + TypeScript
- **Shopify**: `@shopify/shopify-app-react-router`, App Bridge React, Polaris v13
- **Database**: Prisma ORM — SQLite (dev), PostgreSQL (prod)
- **Portal styling**: Tailwind CSS (affiliate portal only, NOT admin)
- **Auth**: Shopify OAuth (admin), JWT (affiliate portal)
- **Email**: Resend
- **Payouts**: Razorpay X (India)
- **Validation**: Zod
- **Node**: >= 20.0.0

## Project Structure

```
app/
  routes/
    app.*.tsx          — Admin pages (Polaris UI, embedded in Shopify)
    portal.*.tsx       — Affiliate portal pages (Tailwind, served via App Proxy)
    webhooks.*.tsx     — Webhook handlers (orders/create, app/uninstalled, GDPR)
    proxy.$.tsx        — Click tracking endpoint (App Proxy)
    auth.*/            — Shopify OAuth flow
  lib/
    billing.server.ts       — Plan subscription, caching, appSubscriptionCreate
    commission.server.ts    — Flat + tiered commission calculation
    encryption.server.ts    — AES-256-GCM encrypt/decrypt
    pii.server.ts           — PII field encryption helpers (PAN, GSTIN, bank)
    jwt.server.ts           — Affiliate portal JWT auth (separate from Shopify auth)
    validation.server.ts    — Zod schemas for all inputs
    email.server.ts         — Resend email templates
    fraud.server.ts         — Fraud detection heuristics
    razorpay.server.ts      — Razorpay X payout integration
    gst.server.ts           — GST calculation
    tds.server.ts           — TDS calculation
    cron.server.ts          — Scheduled tasks (auto payouts, cleanup)
    discount.server.ts      — Shopify discount code GraphQL mutations
    plan-features.server.ts — Feature gating by plan tier
  types/                    — TypeScript type definitions
prisma/
  schema.prisma             — Data model (Shop, Affiliate, Referral, Payout, GstSetting, TdsSetting)
  migrations/               — Prisma migrations
extensions/                 — Shopify app extensions workspace
```

## Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (`shopify app dev`) |
| `npm run build` | Production build (`react-router build`) |
| `npm run start` | Serve production build |
| `npm run setup` | Generate Prisma client + run migrations |
| `npm run lint` | ESLint |
| `npm run typecheck` | React Router typegen + `tsc --noEmit` |
| `npm run deploy` | Deploy to Shopify (`shopify app deploy`) |

## Shopify Development

- Always run `npm run typecheck` after editing Polaris/React components to catch invalid component names (e.g., Callout vs Banner)
- When editing auth/session code, make minimal changes and verify with the user before modifying schema or auth callbacks
- Before committing 'for a PR', verify there are actual code changes staged (`git status`) — don't create empty commits

## Architecture Conventions

- **`.server.ts` suffix** — all server-only modules in `app/lib/` use this suffix so Vite tree-shakes them from client bundles
- **Admin UI** — Polaris React components ONLY. No custom CSS. No Tailwind. No `<s-*>` web components.
- **Affiliate Portal** — Tailwind CSS for styling. Mobile-first. Served through Shopify App Proxy, not inside admin.
- **Two separate auth systems**:
  - Shopify OAuth for merchant admin (handled by `@shopify/shopify-app-react-router`)
  - JWT for affiliate portal (issued on login, verified on protected routes, 7-day expiry)
- **Route naming**:
  - `app._index.tsx` = Dashboard
  - `app.affiliates.tsx` = Affiliate management
  - `app.referrals.tsx` = Referral tracking
  - `app.payouts.tsx` = Payout management
  - `app.settings.*.tsx` = Settings sub-pages (commission, payout, portal, gst, tds, billing)

## Key Patterns

### PII Encryption
All sensitive affiliate data (PAN, GSTIN, bank account, UPI) is encrypted at rest using AES-256-GCM with per-field unique IVs. Use `lib/pii.server.ts` for encrypt/decrypt. PAN last 4 digits stored unencrypted for display.

### Plan Gating
Three tiers: FREE, STARTER (₹999/mo), PRO (₹2,999/mo). Use `planHasFeature(plan, featureKey)` from `lib/plan-features.server.ts` to gate features. Affiliate count limits: FREE=20, STARTER=200, PRO=unlimited. 14-day free trial on paid tiers.

### Commission Calculation
Two modes: FLAT (global rate) and TIERED (rate based on affiliate's total sales and shop's tier brackets). Always use `lib/commission.server.ts` for calculation.

### India Tax Compliance
- **GST**: Added on top of commission (`payout = commission + commission * gstRate`). See `lib/gst.server.ts`.
- **TDS**: Deducted when cumulative payouts exceed threshold. See `lib/tds.server.ts`. Financial year = April–March.

### Webhook Idempotency
`orders/create` webhook uses `@@unique([shopId, orderId])` on Referral to prevent duplicate commission attribution.

### Input Validation
All user inputs validated with Zod schemas defined in `lib/validation.server.ts`. GSTIN regex: `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Database connection string (SQLite for dev, PostgreSQL for prod) |
| `SHOPIFY_API_KEY` | Shopify app API key |
| `SHOPIFY_API_SECRET` | Shopify app API secret |
| `JWT_SECRET` | Secret for affiliate portal JWT signing |
| `ENCRYPTION_KEY` | AES-256 key for PII and token encryption |
| `RESEND_API_KEY` | Resend email service API key |
| `RAZORPAY_KEY_ID` | Razorpay X key ID (for automated payouts) |
| `RAZORPAY_KEY_SECRET` | Razorpay X key secret |

## Database

- **Dev**: SQLite (`prisma/dev.sqlite`) — zero setup
- **Prod**: PostgreSQL via `DATABASE_URL`
- **ORM**: Prisma v6 — schema at `prisma/schema.prisma`
- **Migrations**: `npx prisma migrate dev` (dev), `npx prisma migrate deploy` (prod)
- **Models**: Shop, Affiliate, Referral, Payout, GstSetting, TdsSetting


