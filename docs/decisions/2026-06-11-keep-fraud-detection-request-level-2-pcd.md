# ADR: Keep fraud detection; request Level 2 Protected Customer Data

**Date:** 2026-06-11
**Status:** Accepted

## Context

The fraud detection feature (`lib/fraud.server.ts`, invoked from the
`orders/create` webhook) uses the **customer email** from the order payload for
its self-referral check. Under Shopify's Protected Customer Data (PCD) policy,
using customer name/address/email/phone requires **Level 2** approval in the
Partner Dashboard. The question was whether to drop fraud detection so the app
could avoid the Level 2 request before app store submission.

## Decision

**Keep fraud detection. Request Level 2 PCD access with "fraud prevention" as
the stated purpose for the email field.**

## Rationale

1. **Level 1 PCD approval is unavoidable anyway.** Commission attribution — the
   core of the app — requires `read_orders` and the `orders/create` webhook.
   Order data is protected customer data even without PII fields, so the app
   must complete the Partner Dashboard data-protection process regardless.
   Dropping fraud detection only avoids requesting one extra field (email),
   not the process itself.

2. **Fraud protection is table stakes for the category.** Both major
   competitors ship it: GoAffPro and UpPromote both offer self-referral
   detection, coupon-leak protection, and IP blocklists; UpPromote additionally
   markets signup-side fraud screening. Shipping without it would be a
   competitive gap, and it is one of AfflowIndia's PREMIUM plan selling points.

3. **"Fraud prevention" is an explicitly accepted purpose** in Shopify's PCD
   framework for requesting customer fields, so the incremental approval risk
   of Level 2 over Level 1 is small.

## Consequences

- Before submission, complete the Protected Customer Data section in the
  Partner Dashboard: request order data (Level 1) + customer email (Level 2),
  purpose "fraud prevention" — and implement/attest the data-protection
  requirements (encryption at rest ✓ already done, retention limits, customer
  consent passthrough where applicable).
- The self-referral check must remain the **only** consumer of customer email.
  The webhook handler must not persist customer email — today it is used
  transiently in `runFraudChecks()` and never stored, which keeps the data
  minimization story clean. Preserve this property.
- The other fraud heuristics (conversion-rate, rapid-order) do not use PCD and
  would survive even if Level 2 were ever declined; only the self-referral
  check would need to be feature-flagged off in that scenario.
