# Coding Agent Brief — AfflowIndia Pre-Review HIGH Fixes

## Context

AfflowIndia is a Shopify embedded affiliate marketing app (React Router v7 + Polaris + Prisma) targeting India. We are days away from submitting to Shopify App Review and want the **"Built for Shopify" (BFS) badge** on the first attempt. A pre-submission audit surfaced three HIGH-priority issues that are likely to be flagged by reviewers or cause production bugs. Your job is to fix all three.

You **must** read `/home/user/AfflowIndia/CLAUDE.md` before starting. Key hard-limits from it:

- This is a Shopify app — Polaris React components ONLY in admin routes (`app/routes/app.*.tsx`). No custom CSS. No `<s-*>` web components. No Tailwind in admin.
- Bug fixes ≤ 50 lines per session. One fix = one commit. Three fixes here ⇒ three commits.
- Never claim "done" without running `npm run typecheck` and showing the output.
- Never modify `auth.*` routes, `lib/billing.server.ts`, `lib/encryption.server.ts`, or `lib/pii.server.ts` without explicit human confirmation. (Fix 1 below touches a *consumer* of `lib/billing.server.ts` — the billing settings *route* — not the billing lib itself; that's allowed.)
- Browser/runtime testing is unavailable — use static analysis + typecheck + build only.

**Branch**: develop on `claude/shopify-review-prep-1I4lD` (create from current branch if it doesn't exist). Push and open a PR when done.

---

## Fix 1 — Replace raw `window.open(_top)` with App Bridge redirect for billing confirmation

**File**: `app/routes/app.settings.billing.tsx`
**Lines**: 75–90 (the `useEffect` block that handles `fetcher.data.confirmationUrl`)

**Current code** (line 85):
```tsx
window.open(data.confirmationUrl as string, "_top");
```

**Why this matters**: Shopify reviewers expect navigation out of the embedded iframe to use App Bridge primitives, not raw `window.open`. Raw `window.open(_top)` works but signals "doesn't understand the embedded model" and invites scrutiny. Use the global `shopify` App Bridge instance that's already available in this app (it's used a few lines below at `:87` for `shopify.toast.show`).

**What to do**:

1. Replace line 85 with the App Bridge redirect API. The recommended call shape is:
   ```tsx
   open(data.confirmationUrl as string, "_top");
   ```
   …where `open` is the global App Bridge function. **OR** use:
   ```tsx
   window.open(data.confirmationUrl as string, "_top");
   ```
   wrapped via `shopify.environment` checks. **The cleanest fix** is to use `<RemixForm>`/`fetcher` redirect server-side: change the `action` at `:52-73` to **return a Shopify-compatible redirect** rather than returning `{ confirmationUrl }`, but that's out of scope.

   **Recommended minimal change**: use App Bridge's `redirect.dispatch` via the global `shopify` object:
   ```tsx
   if (data.confirmationUrl) {
     // Use App Bridge to redirect outside the embedded iframe
     // shopify is the global App Bridge instance available in admin routes
     window.top!.location.href = data.confirmationUrl as string;
   }
   ```
   Verify which API the codebase already uses elsewhere — search for `shopify.redirect`, `useAppBridge`, `Redirect.create`, or `app.dispatch` in `app/routes/app.*.tsx` to match the existing convention. If the codebase already imports App Bridge in another file (e.g. `app/routes/app.tsx` root), follow that exact pattern.

2. **Before editing**: grep for existing patterns:
   ```bash
   grep -rn "shopify\.redirect\|window\.top\|useAppBridge\|Redirect\." app/routes/
   ```
   Match whatever pattern is already in use. If nothing comparable exists, `window.top!.location.href = url` is the safest, fully-supported, App-Bridge-compatible escape from the iframe.

3. Keep the fix to ≤ 5 lines changed. Do not refactor the surrounding loader/action.

**Verify**: `npm run typecheck` + `npm run build` clean. Commit message: `fix(billing): use App Bridge redirect instead of window.open for confirmation URL`.

---

## Fix 2 — Defense-in-depth plan gating in auto-payout cron

**File**: `app/lib/cron.server.ts`
**Function**: `processAutoPayouts()` at `:55-83`, and inside the per-shop loop in `processShopPayouts()` at `:88-181`

**Why this matters**: `app/routes/app.settings.payout.tsx:44` already prevents FREE-plan shops from saving `payoutMode: "RAZORPAY_X"` — *but the cron job has no plan check*. If a shop downgrades from PREMIUM → FREE while still configured for RAZORPAY_X (today there's no auto-revert), the next 1st-of-month cron run will execute Razorpay payouts for a FREE shop. That's a billing/compliance landmine and Shopify reviewers test downgrade paths.

**What to do**:

1. Add plan gating at the cron query level. In `processAutoPayouts()` at `:58-68`, change the `db.shop.findMany` filter so only PREMIUM-and-above shops are returned. The current filter is:
   ```ts
   where: {
     isActive: true,
     payoutMode: "RAZORPAY_X",
     razorpayXConfig: { not: null },
   },
   ```
   Add `plan: "PREMIUM"` to that `where` clause. (The schema currently has only FREE/PREMIUM — verify in `prisma/schema.prisma` `Shop.plan` enum/field.)

2. **Belt-and-braces**: also add a runtime check inside `processShopPayouts()` (right after the function entry at `:99`, before fetching affiliates). Import `planHasFeature` from `./plan-features.server` and skip the shop with a console warning if `!planHasFeature(shop.plan, "razorpay_payouts")`. This means widening `processShopPayouts`'s shop type to include `plan` — adjust the type at `:88-98` accordingly.

3. **Do not** change the cron schedule, advisory-lock logic, or the per-affiliate Razorpay flow in this commit.

**Constraint**: ≤ 25 lines changed. Pure additive/filter change.

**Verify**: `npm run typecheck` clean. Commit message: `fix(cron): gate auto-payouts on PREMIUM plan to prevent post-downgrade Razorpay calls`.

---

## Fix 3 — Idempotency guard on Razorpay payout creation

**File**: `app/lib/cron.server.ts`
**Function**: `initiateRazorpayPayoutForAffiliate()` at `:192-270`

**Why this matters**: The function is self-flagged at `:165-166` ("A failure here must not abort the loop") but there's no guard against double-firing. If the cron container restarts mid-run, or if the advisory lock at `:31` is released early due to an error path, the next invocation will re-process Payout rows that are already in `APPROVED` state and call Razorpay's `POST /v1/contacts` + `/v1/fund_accounts` + `/v1/payouts` *again* — creating duplicate contacts and potentially duplicate payouts at Razorpay (Razorpay's idempotency on these endpoints is weak; same `reference_id` can produce a 400 but contacts/fund-accounts will duplicate).

**What to do**:

1. At the top of `initiateRazorpayPayoutForAffiliate()` (after the existing early returns at `:207-219`), fetch the current Payout row and bail out if it's already been sent:
   ```ts
   const existing = await db.payout.findUnique({
     where: { id: payoutId },
     select: { status: true, externalReference: true },
   });
   if (!existing) {
     console.warn(`[cron] Payout ${payoutId} not found, skipping Razorpay call`);
     return;
   }
   if (existing.externalReference) {
     console.log(
       `[cron] Payout ${payoutId} already has externalReference=${existing.externalReference}, skipping duplicate Razorpay call`
     );
     return;
   }
   if (existing.status !== "APPROVED") {
     console.warn(
       `[cron] Payout ${payoutId} is in status=${existing.status}, skipping Razorpay call (expected APPROVED)`
     );
     return;
   }
   ```

2. **Also**: pass `payoutId` as Razorpay's `reference_id` (already done at `:237`) — confirm `app/lib/razorpay.server.ts:147 createPayout` plumbs `referenceId` to the `reference_id` field of the Razorpay `/v1/payouts` body. If it doesn't, that's a separate fix — note it as a follow-up but don't expand scope.

3. **Do not** change the failure path at `:253-269` or the success path at `:241-248`.

**Constraint**: ≤ 25 lines added. Pure guard logic at the top of the function.

**Verify**: `npm run typecheck` clean. Commit message: `fix(cron): add idempotency guard on Razorpay payout creation`.

---

## Workflow

1. `git checkout -b claude/shopify-review-prep-1I4lD` (or `git switch` if it already exists locally; `git fetch origin && git switch claude/shopify-review-prep-1I4lD` if it exists remotely).
2. Read `CLAUDE.md` and confirm the hard-limits.
3. Apply Fix 1 → `npm run typecheck` → commit.
4. Apply Fix 2 → `npm run typecheck` → commit.
5. Apply Fix 3 → `npm run typecheck` → commit.
6. After all three: `npm run build` (full production build) — must succeed cleanly.
7. `git push -u origin claude/shopify-review-prep-1I4lD`.
8. Open a PR via the GitHub MCP tools (NOT `gh` CLI — it's not available). Title: `Pre-review HIGH fixes: billing redirect, cron plan gate, payout idempotency`. Body should summarize the three fixes with file:line refs and link to BFS / review-blocker rationale. Mark as **ready for review**, not draft.

## Hard rules

- **Do NOT** touch `app/routes/auth.*`, `app/lib/billing.server.ts`, `app/lib/encryption.server.ts`, `app/lib/pii.server.ts`, `app/shopify.server.ts`, or `prisma/schema.prisma` without stopping and asking the human first.
- **Do NOT** add error handling, retries, fallbacks, or refactors beyond the three scoped changes above.
- **Do NOT** add comments unless they explain a non-obvious *why*.
- **Do NOT** introduce new dependencies.
- If a fix exceeds its line budget or you find that a fix can't be applied as described (e.g. the codebase already does X differently), STOP and report back instead of expanding scope.

## What "done" looks like

Three commits on `claude/shopify-review-prep-1I4lD`, all with passing `npm run typecheck`, full `npm run build` green, pushed, PR opened, and a one-paragraph summary back to the user listing the three commit SHAs and the PR URL.
