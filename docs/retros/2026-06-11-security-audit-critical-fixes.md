# Retro — Security audit & critical fixes (2026-06-11)

## What was built

Full-codebase security audit + BFS submission readiness review, then PR #35:

1. **Reinstall reactivation** (`app._index.tsx`) — `app/uninstalled` set
   `isActive=false` permanently; reinstalls left webhooks/click-tracking/portal
   dead. Dashboard loader now reactivates and stores the fresh token.
2. **Cross-tenant portal login** (`portal.login.tsx`) — form login matched by
   email across ALL shops and skipped lockout. Now requires store domain
   (pre-filled from `?shop=`), scopes by `shopId`, enforces 5-attempt/15-min
   lockout.
3. **Payout double-spend race** — fixed in BOTH `portal.api.tsx` and
   `portal.payouts.tsx` (logic is duplicated): conditional decrement
   (`pendingCommission >= amount`) inside the transaction is now the
   authoritative balance check.
4. **Cron payout failure lost money** (`cron.server.ts`) — FAILED Razorpay
   payouts now restore `pendingCommission` (base amount) transactionally.
5. **CI repairs** — Zod v4 `error.issues` in `env.server.ts`; all 26
   pre-existing ESLint errors; `DATABASE_URL` dummy env for the
   `prisma validate` CI step. CI was red on main for all three reasons.

## Decisions

- **Keep fraud detection; request Level 2 Protected Customer Data** — see
  `docs/decisions/2026-06-11-keep-fraud-detection-request-level-2-pcd.md`.
  Level 1 PCD is needed for order webhooks regardless; competitors all ship
  fraud protection.

## Open issues (high-priority, NOT yet fixed)

- **No refund/cancellation handling** — subscribe to `refunds/create` +
  `orders/cancelled` and reverse referrals. Fraud vector + competitor parity.
- **`orders/create` returns 200 on unexpected errors** — transient DB failures
  permanently lose commissions; should return 500 so Shopify retries
  (idempotency guard makes retries safe).
- **Signup/login logic duplicated** between `portal.signup.tsx`/`portal.login.tsx`
  (form) and `portal.api.tsx` (JSON) — extract shared `lib/affiliate-auth.server.ts`.
- **Email verification is decorative** — `emailVerified` never enforced.
- **`Shop.accessTokenEncrypted` is write-only** — never read; session table
  stores the live token in plaintext. Remove columns or encrypt session storage.
- **TDS computed on (base + GST)** — confirm with CA whether 194H TDS should
  exclude GST when separately invoiced.
- Cron recreates Razorpay Contact/Fund Account each run; persist IDs.
- `app.affiliates.tsx` at ~940 lines (limit 500) — extract modals.
- CLAUDE.md says Fly.io; repo actually deploys Railway — update docs.

## Submission readiness notes

- Request Protected Customer Data (Level 1 + email field, purpose: fraud
  prevention) in Partner Dashboard BEFORE submitting — has its own review lag.
- BFS badge is earned post-launch (install counts + Web Vitals over 30 days);
  first submission only establishes eligibility.
