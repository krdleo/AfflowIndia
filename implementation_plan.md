# AfflowIndia — Complete Rebuild Implementation Plan

> **Goal**: Build a production-ready Shopify embedded affiliate marketing app targeting Indian e-commerce merchants, optimized for the "Built for Shopify" badge.

## User Review Required

> [!IMPORTANT]
> **Massive scope**: This prompt describes ~50+ files and 18 feature areas. I propose building this in **8 sequential phases**, committing after each. This means multiple work sessions. Please confirm you're ready for this multi-session build.

> [!WARNING]  
> **Shopify CLI requirement**: Phase 1 requires `shopify app init` which is an interactive CLI command. You'll need to run it manually (or I can guide you through it step by step). The scaffold generates OAuth, session management, App Bridge, and CSRF automatically — we build *on top* of it.

> [!IMPORTANT]
> **Database**: The prompt specifies PostgreSQL for production. For local development, should I keep SQLite (simpler setup) and make Postgres configurable via `DATABASE_URL`, or do you want PostgreSQL from day one? I recommend SQLite for dev + Postgres for prod.

> [!IMPORTANT]
> **API Keys needed**: Before Phase 3+, you'll need:
> - Resend API key (for emails)
> - Razorpay X credentials (for payouts — can be deferred)
> - Encryption key (I'll generate a secure one)

---

## Phase Overview (Midway Transition)

| Phase | Focus | Status |
|-------|-------|--------|
| **0** | Fix Build Errors | 🔴 **PENDING**: Refactor all UI components to use the standard `@shopify/polaris` React package instead of App Bridge web components (`<s-*>`) to resolve 120+ TS errors. |
| **1** | Scaffold & Data Model | ✅ **COMPLETE** |
| **2** | Core Backend | ✅ **COMPLETE** |
| **3** | Billing & Plan Gating | ✅ **COMPLETE** |
| **4** | Embedded Admin UI | 🟡 **NEEDS REFACTOR**: Components built, but needs transition to `@shopify/polaris`. |
| **5** | Settings Hub | 🟡 **NEEDS REFACTOR**: Components built, but needs transition to `@shopify/polaris`. |
| **6** | Affiliate Portal | 🟡 **IN PROGRESS**: API/Auth built (6.1-6.3). Frontend Tailwind pages (6.4-6.5) pending. |
| **7** | India-Specific Features | ✅ **COMPLETE** (Excluding WhatsApp UI from Phase 6) |
| **8** | Second-Wave Features | 🟡 **IN PROGRESS**: Fraud detection & auto payouts built. Remaining: analytics, prod commissions, milestones, assets. |

---

## Phase 1: Scaffold & Data Model

### Step 1.1 — Scaffold the app
Run `shopify app init` and select "Build a React Router app". This generates the full project with:
- React Router v7 + `@shopify/shopify-app-react-router`
- App Bridge + Polaris scripts pre-wired
- OAuth + session management
- Prisma + SQLite default database
- Webhook skeleton

### Step 1.2 — Configure `shopify.app.toml`

#### [MODIFY] [shopify.app.toml](file:///c:/Users/super/AfflowV2/shopify.app.toml)
- Set `embedded = true`
- Scopes: `read_orders, write_discounts, write_app_proxy`
- Webhooks API version: `2026-04`
- Add webhook subscriptions: `orders/create`, `app/uninstalled`
- Add GDPR webhook URIs: `customers/data_request`, `customers/redact`, `shop/redact`
- Add app proxy config: `prefix = "a"`, `subpath = "ref"`, `url = "/proxy"`

### Step 1.3 — Prisma Schema (PostgreSQL-ready)

#### [MODIFY] [schema.prisma](file:///c:/Users/super/AfflowV2/prisma/schema.prisma)
Define all 6 models exactly as specified in the prompt:
- **Shop** — shopDomain, encrypted access token, plan enum, payoutMode, commissionMode, portalCustomization JSON, razorpayXConfig
- **Affiliate** — code, referralCode, passwordHash, status enum, commissionRate, encrypted PII, discount code GIDs, click/sales counters
- **Referral** — orderId, orderAmount, commissionAmount, commissionRate snapshot, idempotency index
- **Payout** — amount, GST/TDS breakdown, status enum, external reference
- **GstSetting** — per-shop GST config
- **TdsSetting** — per-shop TDS config

Key indexes:
- `@@unique([shopId, code])` on Affiliate
- `@@unique([shopId, orderId])` on Referral (idempotency guard)
- Performance indexes on `(shopId, status)`, `(affiliateId, status)`

### Step 1.4 — Environment setup

#### [NEW] [.env.example](file:///c:/Users/super/AfflowV2/.env.example)
Document all environment variables: `DATABASE_URL`, `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `JWT_SECRET`, `ENCRYPTION_KEY`, `RESEND_API_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`

---

## Phase 2: Core Backend Libraries

### Step 2.1 — Encryption utilities

#### [NEW] [lib/encryption.server.ts](file:///c:/Users/super/AfflowV2/app/lib/encryption.server.ts)
- AES-256-GCM encryption/decryption functions
- Per-field IV generation
- Stores ciphertext + IV + auth tag as a single serialized string
- Used for: access tokens, PII fields, Razorpay secrets

### Step 2.2 — PII encryption helpers

#### [NEW] [lib/pii.server.ts](file:///c:/Users/super/AfflowV2/app/lib/pii.server.ts)
- `encryptPII(field, value)` / `decryptPII(field, ciphertext)`
- Handles PAN (stores `panLast4` unencrypted), GSTIN, bank details
- Batch encrypt/decrypt for affiliate profile operations

### Step 2.3 — Validation schemas

#### [NEW] [lib/validation.server.ts](file:///c:/Users/super/AfflowV2/app/lib/validation.server.ts)
- Zod schemas for: affiliate signup, profile update, payout request, portal settings, commission settings, GST/TDS settings
- GSTIN regex validation: `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$`
- Input sanitization helpers (XSS prevention)
- Max length enforcement on all string fields

### Step 2.4 — Commission calculation engine

#### [NEW] [lib/commission.server.ts](file:///c:/Users/super/AfflowV2/app/lib/commission.server.ts)
- `calculateCommission(shop, affiliate, orderAmount)` — handles FLAT and TIERED modes
- Tiered mode: determines rate based on affiliate's `totalSales` and shop's tier brackets
- Returns `{ commissionAmount, commissionRate, tierName }`
- Pure function with full unit test coverage

### Step 2.5 — Email service

#### [NEW] [lib/email.server.ts](file:///c:/Users/super/AfflowV2/app/lib/email.server.ts)
- Resend integration
- Templates: verification email, password reset, payout confirmation, new affiliate alert
- Sender: `onboarding@resend.dev` for dev, `noreply@afflowindia.com` for prod

### Step 2.6 — Webhook handlers

#### [MODIFY] [routes/webhooks.tsx](file:///c:/Users/super/AfflowV2/app/routes/webhooks.tsx)
- **`orders/create`**: Parse discount_codes → normalize → lookup affiliate → check idempotency → calculate commission → create Referral → atomic increment totalSales/pendingCommission
- **`app/uninstalled`**: Set `shop.isActive = false` (don't delete data)
- **GDPR handlers**: `customers/data_request`, `customers/redact`, `shop/redact` — return 200

### Step 2.7 — Discount code management

#### [NEW] [lib/discount.server.ts](file:///c:/Users/super/AfflowV2/app/lib/discount.server.ts)
- `createAffiliateDiscount(admin, affiliate)` — uses `discountCodeBasicCreate` GraphQL mutation
- `deleteAffiliateDiscount(admin, discountId)` — uses `discountCodeDelete` mutation
- Creates percentage-off discount with `appliesOncePerCustomer: true`

---

## Phase 3: Billing & Plan Gating

### Step 3.1 — Billing utilities

#### [NEW] [lib/billing.server.ts](file:///c:/Users/super/AfflowV2/app/lib/billing.server.ts)
- Three plans: FREE (₹0), STARTER (₹999/mo ≈ $12), PRO (₹2,999/mo ≈ $36)
- `resolvePlan(admin)` — checks active Shopify subscription, caches for 5 minutes
- `createSubscription(admin, plan, returnUrl)` — uses `appSubscriptionCreate` mutation
- 14-day free trial on paid tiers

### Step 3.2 — Feature gating

#### [NEW] [lib/plan-features.server.ts](file:///c:/Users/super/AfflowV2/app/lib/plan-features.server.ts)
- `planHasFeature(plan, featureKey)` — centralized feature flag map
- Feature keys: `tiered_commissions`, `custom_codes`, `portal_customization`, `razorpay_payouts`, `gst_invoicing`, `tds_compliance`, `fraud_detection`, `whatsapp_sharing`, `realtime_analytics`, `product_commissions`, `milestone_bonuses`
- Affiliate count limits: FREE=20, STARTER=200, PRO=unlimited
- Middleware to enforce limits on affiliate creation

### Step 3.3 — Billing settings page route

#### [NEW] [routes/app.settings.billing.tsx](file:///c:/Users/super/AfflowV2/app/routes/app.settings.billing.tsx)
- Display current plan, usage, upgrade/downgrade CTAs
- Show INR pricing on UI, bill in USD through Shopify

---

## Phase 4: Embedded Admin UI (Polaris Web Components)

All admin pages use `<s-page>`, `<s-card>`, `<s-data-table>`, `<s-button>`, `<s-badge>`, `<s-banner>`, `<s-modal>`, `<s-text>`, `<s-layout>`, etc. No custom CSS in admin.

### Step 4.1 — App layout & navigation

#### [MODIFY] [routes/app.tsx](file:///c:/Users/super/AfflowV2/app/routes/app.tsx)
- Configure `<ui-nav-menu>` with: Dashboard, Affiliates, Referral Tracking, Payouts, Settings
- Error boundary for white-screen prevention
- Skeleton loading states

### Step 4.2 — Dashboard

#### [MODIFY] [routes/app._index.tsx](file:///c:/Users/super/AfflowV2/app/routes/app._index.tsx)
- Overview stats: total affiliates, total sales, pending commissions, recent activity
- 4 stat cards using `<s-card>` + `<s-text>`
- Recent activity list with `<s-data-table>`
- Empty state with CTA to add first affiliate

### Step 4.3 — Affiliates management

#### [NEW] [routes/app.affiliates.tsx](file:///c:/Users/super/AfflowV2/app/routes/app.affiliates.tsx)
- Tabbed list: All, Pending, Active, Suspended
- Search and filter by name, code, email
- Bulk actions: approve, suspend
- Detail modal with approve/reject/suspend actions
- Paginated (`cursor-based`)
- Confirmation modals for destructive actions
- Toast notifications for feedback

### Step 4.4 — Referral tracking

#### [NEW] [routes/app.referrals.tsx](file:///c:/Users/super/AfflowV2/app/routes/app.referrals.tsx)
- Table of affiliates with: click counts, sales, codes, commission earned
- Editable discount codes (inline edit → delete old + create new Shopify discount)
- Sortable columns, search
- Paginated

### Step 4.5 — Payout management

#### [NEW] [routes/app.payouts.tsx](file:///c:/Users/super/AfflowV2/app/routes/app.payouts.tsx)
- List of payouts with status badges (Pending, Approved, Paid, Failed)
- Approve/reject actions
- Manual "mark as paid" action
- GST/TDS breakdown display
- Paginated, filterable by status

---

## Phase 5: Settings Hub

### Step 5.1 — Settings hub layout

#### [NEW] [routes/app.settings.tsx](file:///c:/Users/super/AfflowV2/app/routes/app.settings.tsx)
- Card-based navigation to 6 sub-pages
- Each card shows current config summary

### Step 5.2 — Payout settings

#### [NEW] [routes/app.settings.payout.tsx](file:///c:/Users/super/AfflowV2/app/routes/app.settings.payout.tsx)
- Toggle: Manual vs Razorpay X
- Razorpay X credential input (keyId, keySecret — encrypted)
- Test connection button
- Plan-gated: Razorpay X requires PRO

### Step 5.3 — Portal customization

#### [NEW] [routes/app.settings.portal.tsx](file:///c:/Users/super/AfflowV2/app/routes/app.settings.portal.tsx)
- Program name, logo URL, banner URL
- Primary color, accent color pickers
- Welcome heading, welcome message
- Terms text
- Signup enabled toggle, require approval toggle
- Field visibility toggles (phone, UPI, PAN, GSTIN)
- Plan-gated: requires STARTER+

### Step 5.4 — Commission settings

#### [NEW] [routes/app.settings.commission.tsx](file:///c:/Users/super/AfflowV2/app/routes/app.settings.commission.tsx)
- Toggle: Flat vs Tiered
- Flat mode: global commission rate
- Tiered mode: dynamic tier bracket editor (threshold → rate)
- Plan-gated: Tiered requires STARTER+

### Step 5.5 — GST settings

#### [NEW] [routes/app.settings.gst.tsx](file:///c:/Users/super/AfflowV2/app/routes/app.settings.gst.tsx)
- Enable/disable toggle
- GST rate input (default 18%)
- Plan-gated: requires PRO

### Step 5.6 — TDS settings

#### [NEW] [routes/app.settings.tds.tsx](file:///c:/Users/super/AfflowV2/app/routes/app.settings.tds.tsx)
- Enable/disable toggle
- TDS rate input (default 10%)
- Annual threshold input (default ₹20,000)
- Plan-gated: requires PRO

---

## Phase 6: Affiliate Portal (App Proxy)

This is a standalone, mobile-first web interface — NOT embedded in Shopify admin. Uses **Tailwind CSS**, NOT Polaris.

### Step 6.1 — Portal API endpoints

#### [NEW] [routes/portal.api.tsx](file:///c:/Users/super/AfflowV2/app/routes/portal.api.tsx)
- All portal API endpoints under `/portal/*`:
  - `GET /portal/branding/:shopDomain` — public, returns portal customization
  - `POST /portal/signup` — affiliate registration with Zod validation
  - `POST /portal/login` — JWT authentication
  - `POST /portal/verify-email` — email verification
  - `POST /portal/forgot-password` — password reset request
  - `POST /portal/reset-password` — password reset execution
  - `GET /portal/stats` — authenticated, dashboard data
  - `GET /portal/profile` — authenticated, profile data
  - `PUT /portal/profile` — authenticated, update profile
  - `POST /portal/payout/request` — authenticated, request payout

### Step 6.2 — JWT authentication middleware

#### [NEW] [lib/jwt.server.ts](file:///c:/Users/super/AfflowV2/app/lib/jwt.server.ts)
- Issue JWTs on login (email + password verified)
- Verify JWT on protected routes
- Token expiry: 7 days
- Separate from Shopify session auth entirely

### Step 6.3 — Click tracking (App Proxy)

#### [NEW] [routes/proxy.$.tsx](file:///c:/Users/super/AfflowV2/app/routes/proxy.$.tsx)
- Handles `GET /proxy/:code`
- Verify Shopify HMAC signature
- Look up affiliate by referral code
- Atomically increment `totalClicks`
- Redirect to shop homepage

### Step 6.4 — Portal frontend pages
Built as server-rendered React Router pages with Tailwind CSS:

#### [NEW] Portal pages (5 files):
- `app/routes/portal.login.tsx` — Login form
- `app/routes/portal.signup.tsx` — Registration form
- `app/routes/portal.dashboard.tsx` — Stats, referral link, WhatsApp share, recent activity
- `app/routes/portal.profile.tsx` — Profile edit form
- `app/routes/portal.payouts.tsx` — Payout history, request payout

### Step 6.5 — Portal layout & components

#### [NEW] [routes/portal.tsx](file:///c:/Users/super/AfflowV2/app/routes/portal.tsx)
- Portal layout with Tailwind styling
- Mobile-first responsive design
- Shop branding applied dynamically

#### [NEW] Portal components (in `app/components/portal/`):
- `PortalNav.tsx` — navigation header
- `StatCard.tsx` — dashboard stat display
- `PayoutCard.tsx` — payout history item

---

## Phase 7: India-Specific Features

### Step 7.1 — GST compliance

#### [NEW] [lib/gst.server.ts](file:///c:/Users/super/AfflowV2/app/lib/gst.server.ts)
- GST calculation: `payoutAmount = commission + (commission × gstRate)`
- GSTIN format validation
- Track GST amount on each Payout record

### Step 7.2 — TDS compliance

#### [NEW] [lib/tds.server.ts](file:///c:/Users/super/AfflowV2/app/lib/tds.server.ts)
- TDS calculation: deduct when cumulative payouts exceed threshold
- `tdsAmount = payoutAmount × tdsRate`
- Net payout = `baseAmount + gstAmount - tdsAmount`
- Financial year tracking (April-March)

### Step 7.3 — Razorpay X integration

#### [NEW] [lib/razorpay.server.ts](file:///c:/Users/super/AfflowV2/app/lib/razorpay.server.ts)
- Create Contact (affiliate)
- Create Fund Account (UPI VPA or bank account)
- Create Payout to fund account
- Track `externalReference` (Razorpay payout ID)
- Handle Razorpay X webhooks for status updates

### Step 7.4 — WhatsApp sharing

- Generate `https://wa.me/?text=...` links
- Customizable message template
- Prominent share button in portal dashboard (already included in Phase 6.4)

---

## Phase 8: Second-Wave Features

### Step 8.1 — Fraud detection

#### [NEW] [lib/fraud.server.ts](file:///c:/Users/super/AfflowV2/app/lib/fraud.server.ts)
- Heuristics: same IP multiple clicks, high conversion rates, self-referral detection
- Flag suspicious affiliates
- Fraud alert banner in admin dashboard

### Step 8.2 — Real-time analytics dashboard
- Enhance dashboard (Phase 4.2) with live-updating charts
- SSE or 30s polling for near-real-time updates
- Charts: sales over time, top affiliates, conversion rates, click-to-sale funnel

### Step 8.3 — Product-level commission rules
- Product/collection-specific commission rates
- Blended commission calculation across order line items

### Step 8.4 — Milestone/tier bonuses
- Merchant-defined milestones (e.g., "₹50,000 → 2% bump")
- Auto-upgrade affiliate rate on milestone achievement

### Step 8.5 — Auto monthly payouts

#### [NEW] [lib/cron.server.ts](file:///c:/Users/super/AfflowV2/app/lib/cron.server.ts)
- node-cron: 1st of month, 9:00 AM IST
- Aggregate pending commissions, apply GST/TDS, create Payouts
- Initiate Razorpay X payouts if configured
- Send email notifications

### Step 8.6 — Creative asset delivery
- Merchant uploads banners/images
- Affiliates browse and download from portal

---

## Security Implementation (Cross-Cutting)

Applied throughout all phases:

| Concern | Implementation |
|---------|---------------|
| Access token encryption | AES-256-GCM, key from `ENCRYPTION_KEY` env var |
| PII encryption | Per-field AES-256-GCM with unique IVs |
| Password hashing | bcrypt, 12 rounds |
| App Proxy HMAC | Verify on every proxy request |
| Webhook HMAC | Handled by `@shopify/shopify-app-react-router` |
| CSRF | Handled by React Router template |
| Rate limiting | `express-rate-limit`: login 10/15min, clicks 30/min, webhooks 60/min, general 100/min |
| Security headers | `helmet` middleware with strict CSP |
| Input validation | Zod schemas on ALL inputs |
| XSS prevention | String sanitization on user inputs |

---

## Open Questions

> [!IMPORTANT]
> 1. **Should I scaffold the app now using `shopify app init`?** This is interactive and requires your input (app name, template selection). I can guide you through it, or if you have Shopify CLI installed, you can run it yourself. Alternatively, I can manually create the project structure without the CLI scaffold and configure everything by hand.

> [!IMPORTANT]
> 2. **Database for local dev**: SQLite (default, simpler) or PostgreSQL from day one? The prompt says Postgres for production — I recommend SQLite for dev with a switchable `DATABASE_URL`.

> [!IMPORTANT]
> 3. **Do you have Shopify CLI installed?** If not, I'll include installation steps. Run `shopify version` to check.

> [!IMPORTANT]
> 4. **Do you have a Shopify Partner account and dev store ready?** The app needs to be installed on a dev store for testing.

> [!IMPORTANT]
> 5. **Implementation order**: The prompt says "Start with the data model and billing, then webhooks, then admin UI, then affiliate portal, then India features, then second-wave features." My phases follow this order. Confirm or suggest changes.

---

## Verification Plan

### Automated Tests
- Unit tests for commission calculation (flat, tiered, with GST, with TDS)
- Integration tests for webhook processing (idempotency, race conditions)
- Zod validation schema tests with edge cases
- JWT auth flow tests
- App Proxy signature verification tests

### Manual Verification
- Run `shopify app dev` and test embedded admin in dev store
- Test affiliate portal flow: signup → verify → login → dashboard
- Test webhook processing with test orders
- Test billing flow: free → upgrade → downgrade
- Mobile responsiveness check in Shopify mobile app
- Browser recording of key user flows

### BFS Compliance Check
- Polaris-only admin UI (no custom CSS)
- FCP under 2 seconds
- No storefront script injection
- All webhooks respond < 5 seconds
- Pagination on all lists
- Error boundaries on all pages
