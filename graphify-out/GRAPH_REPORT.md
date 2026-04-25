# Graph Report - c:/Users/super/AfflowV2  (2026-04-25)

## Corpus Check
- Corpus is ~41,049 words - fits in a single context window. You may not need a graph.

## Summary
- 281 nodes · 445 edges · 30 communities detected
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 69 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]

## God Nodes (most connected - your core abstractions)
1. `planHasFeature()` - 15 edges
2. `action()` - 13 edges
3. `action()` - 11 edges
4. `requireAffiliateAuth()` - 8 edges
5. `getConfig()` - 8 edges
6. `processShopPayouts()` - 7 edges
7. `getResend()` - 7 edges
8. `escapeHtml()` - 7 edges
9. `razorpayRequest()` - 7 edges
10. `sendVerificationEmail()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `processShopPayouts()` --calls--> `getFinancialYearStart()`  [INFERRED]
  C:\Users\super\AfflowV2\app\lib\cron.server.ts → C:\Users\super\AfflowV2\app\routes\portal.api.tsx
- `processShopPayouts()` --calls--> `calculateTds()`  [INFERRED]
  C:\Users\super\AfflowV2\app\lib\cron.server.ts → C:\Users\super\AfflowV2\app\lib\tds.server.ts
- `initiateRazorpayPayoutForAffiliate()` --calls--> `createContact()`  [INFERRED]
  C:\Users\super\AfflowV2\app\lib\cron.server.ts → C:\Users\super\AfflowV2\app\lib\razorpay.server.ts
- `initiateRazorpayPayoutForAffiliate()` --calls--> `createUPIFundAccount()`  [INFERRED]
  C:\Users\super\AfflowV2\app\lib\cron.server.ts → C:\Users\super\AfflowV2\app\lib\razorpay.server.ts
- `action()` --calls--> `sendVerificationEmail()`  [INFERRED]
  C:\Users\super\AfflowV2\app\routes\portal.api.tsx → C:\Users\super\AfflowV2\app\lib\email.server.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.13
Nodes (17): authenticatePortalRequest(), createAffiliateSession(), destroyAffiliateSession(), extractToken(), getAffiliateSession(), getJWTSecret(), isAffiliateAuthed(), requireAffiliateAuth() (+9 more)

### Community 1 - "Community 1"
Cohesion: 0.13
Nodes (16): action(), addTier(), handleSave(), loader(), removeTier(), updateTier(), action(), loader() (+8 more)

### Community 2 - "Community 2"
Cohesion: 0.16
Nodes (13): action(), formatINR(), loader(), action(), formatINR(), loader(), checkAffiliateLimit(), csvResponse() (+5 more)

### Community 3 - "Community 3"
Cohesion: 0.21
Nodes (15): decrypt(), decryptFromString(), encrypt(), encryptToString(), generateToken(), generateUrlSafeCode(), getEncryptionKey(), hash() (+7 more)

### Community 4 - "Community 4"
Cohesion: 0.24
Nodes (10): calculateCommission(), checkTierUpgrade(), formatIndianNumber(), roundToTwo(), checkConversionRate(), checkRapidOrders(), checkSelfReferral(), flagAffiliate() (+2 more)

### Community 5 - "Community 5"
Cohesion: 0.22
Nodes (9): action(), loader(), cancelSubscription(), createSubscription(), getShopCurrency(), invalidatePlanCache(), resolvePlan(), action() (+1 more)

### Community 6 - "Community 6"
Cohesion: 0.33
Nodes (7): initCronJobs(), initiateRazorpayPayoutForAffiliate(), processAutoPayouts(), processShopPayouts(), calculateGst(), roundToTwo(), validateGstin()

### Community 7 - "Community 7"
Cohesion: 0.36
Nodes (7): decryptAffiliatePII(), decryptPII(), encryptAffiliatePII(), encryptPAN(), encryptPII(), action(), loader()

### Community 8 - "Community 8"
Cohesion: 0.25
Nodes (5): loginErrorMessage(), action(), App(), Auth(), loader()

### Community 9 - "Community 9"
Cohesion: 0.67
Nodes (7): createBankFundAccount(), createContact(), createPayout(), createUPIFundAccount(), getConfig(), getPayoutStatus(), razorpayRequest()

### Community 10 - "Community 10"
Cohesion: 0.67
Nodes (7): escapeHtml(), getResend(), sendBulkAnnouncementEmail(), sendNewAffiliateAlertEmail(), sendPasswordResetEmail(), sendPayoutConfirmationEmail(), sendVerificationEmail()

### Community 11 - "Community 11"
Cohesion: 0.31
Nodes (5): formatINR(), loader(), action(), loader(), toLocaleDateString()

### Community 12 - "Community 12"
Cohesion: 0.57
Nodes (5): calculateNetPayout(), calculateTds(), getFinancialYearEnd(), getFinancialYearStart(), roundToTwo()

### Community 13 - "Community 13"
Cohesion: 0.48
Nodes (5): action(), ErrorBoundary(), headers(), loader(), PortalSettings()

### Community 14 - "Community 14"
Cohesion: 0.48
Nodes (5): App(), ErrorBoundary(), headers(), links(), loader()

### Community 15 - "Community 15"
Cohesion: 0.53
Nodes (4): ErrorBoundary(), headers(), loader(), SettingsIndex()

### Community 16 - "Community 16"
Cohesion: 0.53
Nodes (4): action(), formatINR(), loader(), statusTone()

### Community 17 - "Community 17"
Cohesion: 0.6
Nodes (3): ErrorBoundary(), headers(), SettingsLayout()

### Community 18 - "Community 18"
Cohesion: 0.67
Nodes (2): headers(), loader()

### Community 19 - "Community 19"
Cohesion: 0.83
Nodes (2): loader(), redirectToShop()

### Community 20 - "Community 20"
Cohesion: 0.67
Nodes (2): action(), tryDecrypt()

### Community 21 - "Community 21"
Cohesion: 0.67
Nodes (1): handleRequest()

### Community 22 - "Community 22"
Cohesion: 0.67
Nodes (1): SalesChart()

### Community 23 - "Community 23"
Cohesion: 0.67
Nodes (1): sanitizeString()

### Community 24 - "Community 24"
Cohesion: 0.67
Nodes (1): loader()

### Community 25 - "Community 25"
Cohesion: 0.67
Nodes (1): meta()

### Community 26 - "Community 26"
Cohesion: 0.67
Nodes (1): action()

### Community 27 - "Community 27"
Cohesion: 0.67
Nodes (1): action()

### Community 28 - "Community 28"
Cohesion: 0.67
Nodes (1): action()

### Community 29 - "Community 29"
Cohesion: 0.67
Nodes (1): action()

## Knowledge Gaps
- **Thin community `Community 18`** (4 nodes): `auth.$.tsx`, `headers()`, `loader()`, `auth.$.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 19`** (4 nodes): `proxy.$.tsx`, `proxy.$.tsx`, `loader()`, `redirectToShop()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (4 nodes): `webhooks.customers.data_request.tsx`, `webhooks.customers.data_request.tsx`, `action()`, `tryDecrypt()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (3 nodes): `entry.server.tsx`, `entry.server.tsx`, `handleRequest()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (3 nodes): `SalesChart.tsx`, `SalesChart.tsx`, `SalesChart()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (3 nodes): `validation.server.ts`, `validation.server.ts`, `sanitizeString()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (3 nodes): `health.tsx`, `health.tsx`, `loader()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (3 nodes): `privacy.tsx`, `privacy.tsx`, `meta()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (3 nodes): `webhooks.app.scopes_update.tsx`, `webhooks.app.scopes_update.tsx`, `action()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (3 nodes): `webhooks.app.uninstalled.tsx`, `webhooks.app.uninstalled.tsx`, `action()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (3 nodes): `webhooks.customers.redact.tsx`, `webhooks.customers.redact.tsx`, `action()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (3 nodes): `webhooks.shop.redact.tsx`, `webhooks.shop.redact.tsx`, `action()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `action()` connect `Community 2` to `Community 1`, `Community 10`, `Community 3`?**
  _High betweenness centrality (0.246) - this node is a cross-community bridge._
- **Why does `action()` connect `Community 3` to `Community 0`, `Community 10`, `Community 7`?**
  _High betweenness centrality (0.198) - this node is a cross-community bridge._
- **Why does `planHasFeature()` connect `Community 1` to `Community 2`, `Community 4`, `Community 13`?**
  _High betweenness centrality (0.195) - this node is a cross-community bridge._
- **Are the 12 inferred relationships involving `planHasFeature()` (e.g. with `loader()` and `action()`) actually correct?**
  _`planHasFeature()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **Are the 8 inferred relationships involving `action()` (e.g. with `hash()` and `generateToken()`) actually correct?**
  _`action()` has 8 INFERRED edges - model-reasoned connections that need verification._
- **Are the 9 inferred relationships involving `action()` (e.g. with `checkAffiliateLimit()` and `generateUrlSafeCode()`) actually correct?**
  _`action()` has 9 INFERRED edges - model-reasoned connections that need verification._
- **Are the 5 inferred relationships involving `requireAffiliateAuth()` (e.g. with `loader()` and `loader()`) actually correct?**
  _`requireAffiliateAuth()` has 5 INFERRED edges - model-reasoned connections that need verification._