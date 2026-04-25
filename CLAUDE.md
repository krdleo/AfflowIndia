
## Built for Shopify — First-Attempt Review Pass

**This is the #1 priority of this project.** Every line of code, every architectural decision, and every change must be made with the goal of earning the "Built for Shopify" (BFS) badge and passing Shopify's app review on the first attempt.

- The current architecture was specifically selected for BFS compliance. **Do NOT refactor or change architecture unless Shopify's official recommendations change.**
- Before making any change, consider whether it could jeopardize BFS compliance.
- When in doubt, follow Shopify's documented best practices exactly.

# AfflowIndia — Claude Code Master Context

Shopify embedded affiliate marketing app for Indian e-commerce merchants. India-first differentiators: UPI/Razorpay X automated payouts, GST/TDS compliance, INR pricing, WhatsApp sharing.

---

## 1. Platform & Mission

- **Domain:** Shopify Affiliate Marketing SaaS — India-first, targeting D2C merchants.
- **Core Value:** Automated INR payouts via Razorpay X, GST/TDS compliance, WhatsApp sharing — features no direct competitor (GoAffPro, UpPromote, Social Snowball) offers.
- **Tech Stack:**
  - **Frontend (Admin):** React Router v7 + Vite + TypeScript + Polaris v13 (Shopify-embedded)
  - **Frontend (Portal):** React Router v7 + Tailwind CSS (affiliate self-service, App Proxy)
  - **Backend:** Node.js >= 20, `@shopify/shopify-app-react-router`, Zod validation
  - **Database:** Prisma v6 + SQLite (dev) / PostgreSQL (prod)
  - **Payments:** Razorpay X (payouts) + Shopify Billing API (subscriptions, billed in USD, displayed in INR)
  - **Email:** Resend
  - **Auth:** Shopify OAuth (admin), JWT 7-day expiry (affiliate portal)
- **Goal:** Earn the **"Built for Shopify" (BFS) badge** and pass Shopify's app review on the first attempt. Every architectural decision flows from this.

---

## 2. Subagent Ownership Matrix

Each subagent has a strict scope. Cross-zone edits require explicit human confirmation.

| Zone | Subagent Scope | Mandatory Workflow |
|------|---------------|-------------------|
| `app/routes/app.*.tsx` | **Admin UI Agent** — Polaris-only pages, embedded admin | `npm run typecheck` after every component change |
| `app/routes/portal.*.tsx` | **Portal Agent** — Tailwind affiliate portal, App Proxy routes | Verify JWT auth is applied on all protected routes |
| `app/routes/webhooks.*.tsx` | **Webhook Agent** — order processing, GDPR, app lifecycle | Must respond < 5s; idempotency check on every handler |
| `app/lib/*.server.ts` | **Logic Agent** — billing, commission, GST/TDS, fraud, payouts | `npm run typecheck` + no client-side imports in `.server.ts` files |
| `prisma/` | **DB Agent** — schema changes, migrations | Never modify schema without running `npx prisma migrate dev`; confirm with human before any destructive migration |
| `app/routes/auth.*/` | **Auth Agent** — Shopify OAuth flow | Minimal changes only; always verify with human before editing session/callback logic |

**Hard rule:** No subagent touches `middleware`, auth callbacks, or payment handlers without explicit human-in-the-loop confirmation.

---

## 3. The Harness — Execution Hard-Limits

These rules prevent scope drift and keep Claude Code outputs reviewable.

- **Bug fixes:** ≤ 50 lines changed per session. One fix = one commit.
- **New features:** ≤ 300 lines per session.
- **File hygiene:** Max 500 lines per file. Extract to `lib/` or `components/` if exceeded.
- **Validation:** Never claim a task is "done" without running `npm run typecheck` and showing output.
- **High-stakes changes** (auth, billing, encryption, migrations): Use human confirmation before committing.
- **Testing constraint:** Browser/runtime testing is unavailable — default to static analysis, type checks (`npm run typecheck`), and build verification (`npm run build`).

---

## 4. Built for Shopify — First-Attempt Review Pass

**This is the #1 priority.** Every line of code must target BFS compliance.

- The current architecture was selected specifically for BFS. **Do NOT refactor unless Shopify's official recommendations change.**
- Before any change, ask: *Could this jeopardize BFS compliance?*

### BFS Compliance Checklist

| Rule | Requirement |
|------|------------|
| **UI** | Polaris React components ONLY in admin. Zero custom CSS. No `<s-*>` web components. |
| **Performance** | FCP < 2 seconds |
| **Webhooks** | All handlers respond < 5 seconds |
| **Pagination** | Cursor-based on every list view |
| **Error handling** | Error boundaries on every page |
| **GDPR** | `customers/data_request`, `customers/redact`, `shop/redact` implemented |
| **Scopes** | Minimum required only: `read_orders`, `write_discounts`, `write_app_proxy` |
| **Storefront** | No script injection |
| **Embedding** | Must remain embedded — never standalone |
| **App Proxy** | Affiliate portal served via `store.myshopify.com/a/ref/...` |

---

## 5. Deployment Strategy

- **Hosting:** Fly.io, Mumbai region (`lhr` → `bom`), auto-sleep **disabled** (required for BFS performance audits)
- **Dev tunnel:** ngrok (local development)
- **Deployment pattern:** Edit local → `npm run typecheck` → `npm run build` → commit → `npm run deploy` (Shopify CLI) → Fly.io deploy
- **SSH discipline:** Server access for status checks only. Never edit files directly on server.
- **Environment:** Set `NODE_ENV=production` on all hosted environments.
- **Domain:** `afflowindia.com` (intended, not yet purchased). Resend DNS (SPF, DKIM, DMARC) pending post-domain setup.

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server (`shopify app dev`) |
| `npm run build` | Production build (`react-router build`) |
| `npm run start` | Serve production build |
| `npm run setup` | Generate Prisma client + run migrations |
| `npm run lint` | ESLint |
| `npm run typecheck` | React Router typegen + `tsc --noEmit` |
| `npm run deploy` | Deploy to Shopify (`shopify app deploy`) |

---

## 6. India-Specific Features & Business Logic

### Commission Calculation
Two modes: **FLAT** (global rate) and **TIERED** (rate based on affiliate's cumulative sales vs. shop's bracket config). Always use `lib/commission.server.ts`.

### GST Compliance
`payout = commission + (commission × gstRate)`. GSTIN validation regex: `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`. See `lib/gst.server.ts`.

### TDS Compliance
Deducted when cumulative payouts exceed threshold: `net = commission + gst - tds`. Financial year = April–March. See `lib/tds.server.ts`.

### Razorpay X Payouts
Automated INR payouts via UPI VPA or bank account. Creates Contact → Fund Account → Payout. Tracks `externalReference` (Razorpay payout ID). PREMIUM plan feature only. See `lib/razorpay.server.ts`.

### PII Encryption
All sensitive affiliate data (PAN, GSTIN, bank account, UPI) encrypted at rest using AES-256-GCM with per-field unique IVs. PAN last 4 digits stored unencrypted for display. Use `lib/pii.server.ts` for all encrypt/decrypt operations.

### Plan Gating
Two tiers: **FREE** and **PREMIUM** (₹999/mo, billed in USD via Shopify). Use `planHasFeature(plan, featureKey)` from `lib/plan-features.server.ts`. Affiliate count is **unlimited on both tiers**. PREMIUM unlocks: tiered commissions, portal customization, email notifications, Razorpay X, GST/TDS, fraud detection, WhatsApp sharing. 14-day free trial on PREMIUM.

### Webhook Idempotency
`orders/create` uses `@@unique([shopId, orderId])` on the Referral model to prevent duplicate commission attribution.

### Input Validation
All user inputs validated with Zod schemas in `lib/validation.server.ts`.

---

## 7. Architecture Conventions

- **`.server.ts` suffix** — all server-only modules use this so Vite tree-shakes them from client bundles. Never import `.server.ts` files in client-side components.
- **Admin UI** — Polaris React components ONLY. No custom CSS. No Tailwind. No `<s-*>` tags.
- **Affiliate Portal** — Tailwind CSS. Mobile-first. Served through App Proxy, not inside admin.
- **Two separate auth systems:**
  - Shopify OAuth → merchant admin (handled by `@shopify/shopify-app-react-router`)
  - JWT (7-day expiry) → affiliate portal (`lib/jwt.server.ts`)
- **GraphQL only** for Shopify Admin API. No REST calls.
- **Billing redirect interceptor warning:** The `return new Promise(() => {})` pattern is a known silent failure risk — can swallow responses if middleware incorrectly flags free-tier shops as requiring billing.

### Project Structure

```
app/
  routes/
    app.*.tsx          — Admin pages (Polaris UI, embedded in Shopify)
    portal.*.tsx       — Affiliate portal pages (Tailwind, App Proxy)
    webhooks.*.tsx     — Webhook handlers (orders/create, app/uninstalled, GDPR)
    proxy.$.tsx        — Click tracking endpoint (App Proxy)
    auth.*/            — Shopify OAuth flow
  lib/
    billing.server.ts       — Plan subscription, caching, appSubscriptionCreate
    commission.server.ts    — Flat + tiered commission calculation
    encryption.server.ts    — AES-256-GCM encrypt/decrypt
    pii.server.ts           — PII field encryption (PAN, GSTIN, bank, UPI)
    jwt.server.ts           — Affiliate portal JWT auth
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
  migrations/               — Prisma migration history
extensions/                 — Shopify app extensions workspace
```

### Route Naming

| Route file | Page |
|---|---|
| `app._index.tsx` | Dashboard |
| `app.affiliates.tsx` | Affiliate management |
| `app.referrals.tsx` | Referral tracking |
| `app.payouts.tsx` | Payout management |
| `app.settings.*.tsx` | Settings sub-pages (commission, payout, portal, gst, tds, billing) |

---

## 8. Environment & Security Hygiene

- **Secret masking:** Claude may read `.env` for context but must mask values in output: `sed -E 's/=.{10,}/=<redacted>/g'`
- **No-commit rule:** Never `git add` any `.env`, secret JSON files, or local data directories.
- **Boundary rule:** Never modify auth configuration, billing handlers, or PII encryption logic without explicit human confirmation.

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string (prod) |
| `SHOPIFY_API_KEY` | Shopify app API key |
| `SHOPIFY_API_SECRET` | Shopify app API secret |
| `JWT_SECRET` | Secret for affiliate portal JWT signing |
| `ENCRYPTION_KEY` | AES-256 key for PII and token encryption |
| `RESEND_API_KEY` | Resend email service API key |
| `RAZORPAY_KEY_ID` | Razorpay X key ID |
| `RAZORPAY_KEY_SECRET` | Razorpay X key secret |

---

## 9. Database Rules

- **Dev:** SQLite (`prisma/dev.sqlite`) — zero setup
- **Prod:** PostgreSQL via `DATABASE_URL`
- **ORM:** Prisma v6 — schema at `prisma/schema.prisma`
- **Migrations:** `npx prisma migrate dev` (dev), `npx prisma migrate deploy` (prod)
- **Models:** Shop, Affiliate, Referral, Payout, GstSetting, TdsSetting
- **Timezone:** All timestamps stored in UTC. Display conversion handled at the UI layer.
- **Append-only tables:** Referral and Payout records are never deleted — only status-updated. Raw historical data must be preserved.
- **Idempotency:** `@@unique([shopId, orderId])` on Referral prevents duplicate webhook processing.

### Debugging Order for DB Issues
Check in this sequence: Prisma migrations → duplicate web config (worktrees) → stuck advisory locks → API version mismatches.

---

## 10. Memory, Continuity & Retros

- **Retro habit:** After any non-trivial session, generate `docs/retros/YYYY-MM-DD-[topic].md` covering: what was built, what broke, decisions made, open questions.
- **Session start:** Load the latest retro file before beginning work to resume context.
- **Memory index:** `docs/MEMORY.md` — tracks key architectural decisions and learnings to avoid re-litigating settled choices.
- **File prefixes:** `docs/retros/` for session retros, `docs/decisions/` for ADRs (Architecture Decision Records).
- **Context file:** `architecture_and_structure_context.md` — kept in repo root for Claude Code access (contains intent/rationale not visible in source code). Exclude from repomix via `.claudeignore`.

# AfflowIndia

Shopify embedded affiliate marketing app for Indian e-commerce merchants.

## Debugging Strategy

- When a fix doesn't resolve the reported issue, stop and investigate root cause across layers (env vars, encryption, API versions) instead of making further speculative edits
- For Shopify app dev errors, check in order: Prisma migrations, duplicate web config (worktrees), stuck advisory locks, API version mismatches
