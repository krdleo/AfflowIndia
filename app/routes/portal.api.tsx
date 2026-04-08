/**
 * Affiliate Portal API
 *
 * All portal API endpoints under /portal/*
 * These are NOT embedded in Shopify admin.
 * They use JWT auth (not Shopify session auth).
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import db from "../db.server";
import bcrypt from "bcryptjs";
import { signToken, authenticatePortalRequest } from "../lib/jwt.server";
import {
  affiliateSignupSchema,
  affiliateLoginSchema,
  affiliateProfileUpdateSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  payoutRequestSchema,
} from "../lib/validation.server";
import { encryptAffiliatePII, decryptAffiliatePII } from "../lib/pii.server";
import { generateToken, generateUrlSafeCode } from "../lib/encryption.server";
import { sendVerificationEmail, sendPasswordResetEmail } from "../lib/email.server";

function jsonResponse(data: unknown, status: number = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Portal API Router ──────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // Path: /portal/action or /portal/action/param
  const action = pathParts[1] || "";
  const param = pathParts[2] || "";

  switch (action) {
    case "branding": {
      // GET /portal/branding/:shopDomain — public
      if (!param) return jsonResponse({ error: "Shop domain required" }, 400);
      const shop = await db.shop.findUnique({
        where: { shopDomain: param },
        select: { portalCustomization: true, shopDomain: true },
      });
      if (!shop) return jsonResponse({ error: "Shop not found" }, 404);
      return jsonResponse({
        shopDomain: shop.shopDomain,
        customization: shop.portalCustomization || {},
      });
    }

    case "stats": {
      // GET /portal/stats — authenticated
      const payload = authenticatePortalRequest(request);
      const affiliate = await db.affiliate.findUnique({
        where: { id: payload.affiliateId },
        select: {
          id: true, name: true, code: true, referralCode: true,
          totalClicks: true, totalSales: true, pendingCommission: true,
          commissionRate: true, discountPercent: true, status: true,
          shop: { select: { shopDomain: true } },
        },
      });
      if (!affiliate) return jsonResponse({ error: "Affiliate not found" }, 404);

      const recentReferrals = await db.referral.findMany({
        where: { affiliateId: affiliate.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, orderId: true, orderAmount: true, commissionAmount: true, createdAt: true },
      });

      const recentPayouts = await db.payout.findMany({
        where: { affiliateId: affiliate.id },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, amount: true, status: true, paidAt: true, createdAt: true },
      });

      const referralLink = `https://${affiliate.shop.shopDomain}/a/ref/${affiliate.referralCode}`;
      const whatsappLink = `https://wa.me/?text=${encodeURIComponent(`Check out this store! Use my code ${affiliate.code} for ${Number(affiliate.discountPercent)}% off: ${referralLink}`)}`;

      return jsonResponse({
        affiliate: {
          ...affiliate,
          totalSales: Number(affiliate.totalSales),
          pendingCommission: Number(affiliate.pendingCommission),
          commissionRate: Number(affiliate.commissionRate),
          discountPercent: Number(affiliate.discountPercent),
        },
        referralLink,
        whatsappLink,
        recentReferrals: recentReferrals.map((r) => ({
          ...r, orderAmount: Number(r.orderAmount), commissionAmount: Number(r.commissionAmount),
        })),
        recentPayouts: recentPayouts.map((p) => ({
          ...p, amount: Number(p.amount),
        })),
      });
    }

    case "profile": {
      // GET /portal/profile — authenticated
      const payload = authenticatePortalRequest(request);
      const affiliate = await db.affiliate.findUnique({
        where: { id: payload.affiliateId },
      });
      if (!affiliate) return jsonResponse({ error: "Affiliate not found" }, 404);

      const pii = decryptAffiliatePII(affiliate);

      return jsonResponse({
        id: affiliate.id,
        name: affiliate.name,
        email: affiliate.email,
        phone: affiliate.phone,
        upiId: affiliate.upiId,
        code: affiliate.code,
        referralCode: affiliate.referralCode,
        panLast4: pii.panLast4,
        gstin: pii.gstin,
        legalName: pii.legalName,
        city: affiliate.city,
        state: affiliate.state,
        pincode: affiliate.pincode,
      });
    }

    default:
      return jsonResponse({ error: "Not found" }, 404);
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const url = new URL(request.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const actionName = pathParts[1] || "";

  const body = await request.json().catch(() => ({}));

  switch (actionName) {
    case "signup": {
      const result = affiliateSignupSchema.safeParse(body);
      if (!result.success) {
        return jsonResponse({ error: "Validation failed", details: result.error.flatten() }, 400);
      }
      const data = result.data;

      const shop = await db.shop.findUnique({ where: { shopDomain: data.shopDomain } });
      if (!shop || !shop.isActive) return jsonResponse({ error: "Shop not found" }, 404);

      // Check if email already registered
      const existing = await db.affiliate.findFirst({
        where: { shopId: shop.id, email: data.email },
      });
      if (existing) return jsonResponse({ error: "Email already registered" }, 409);

      const portalConfig = (shop.portalCustomization as Record<string, unknown>) || {};
      if (portalConfig.signupsEnabled === false) {
        return jsonResponse({ error: "Signups are currently disabled" }, 403);
      }

      const passwordHash = await bcrypt.hash(data.password, 12);
      const verificationToken = generateToken();
      const referralCode = generateUrlSafeCode(8);
      const affiliateCode = data.code || data.name.replace(/\s+/g, "").toUpperCase().slice(0, 10) + Math.floor(Math.random() * 100);

      const requireApproval = portalConfig.requireApproval !== false;

      const affiliate = await db.affiliate.create({
        data: {
          shopId: shop.id,
          name: data.name,
          email: data.email,
          phone: data.phone || null,
          upiId: data.upiId || null,
          code: affiliateCode.toUpperCase(),
          referralCode,
          passwordHash,
          commissionRate: Number(shop.defaultCommissionRate),
          status: requireApproval ? "PENDING" : "ACTIVE",
          verificationToken,
          verificationTokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        },
      });

      // Send verification email
      try {
        const verificationUrl = `${process.env.SHOPIFY_APP_URL}/portal/verify-email?token=${verificationToken}`;
        await sendVerificationEmail(data.email, data.name, verificationUrl, data.shopDomain);
      } catch (err) {
        console.error("Failed to send verification email:", err);
      }

      return jsonResponse({
        success: true,
        message: requireApproval
          ? "Signup successful! Please verify your email and wait for approval."
          : "Signup successful! Please verify your email to get started.",
        affiliateId: affiliate.id,
      }, 201);
    }

    case "login": {
      const result = affiliateLoginSchema.safeParse(body);
      if (!result.success) {
        return jsonResponse({ error: "Validation failed", details: result.error.flatten() }, 400);
      }
      const data = result.data;

      const shop = await db.shop.findUnique({ where: { shopDomain: data.shopDomain } });
      if (!shop) return jsonResponse({ error: "Invalid credentials" }, 401);

      const affiliate = await db.affiliate.findFirst({
        where: { shopId: shop.id, email: data.email },
      });
      if (!affiliate) return jsonResponse({ error: "Invalid credentials" }, 401);

      const passwordMatch = await bcrypt.compare(data.password, affiliate.passwordHash);
      if (!passwordMatch) return jsonResponse({ error: "Invalid credentials" }, 401);

      if (affiliate.status === "SUSPENDED") {
        return jsonResponse({ error: "Your account has been suspended" }, 403);
      }

      // Update last login
      await db.affiliate.update({
        where: { id: affiliate.id },
        data: { lastLogin: new Date() },
      });

      const token = signToken({
        affiliateId: affiliate.id,
        shopId: shop.id,
        email: affiliate.email,
      });

      return jsonResponse({
        token,
        affiliate: {
          id: affiliate.id,
          name: affiliate.name,
          email: affiliate.email,
          status: affiliate.status,
          emailVerified: affiliate.emailVerified,
        },
      });
    }

    case "verify-email": {
      const result = verifyEmailSchema.safeParse(body);
      if (!result.success) return jsonResponse({ error: "Invalid token" }, 400);

      const affiliate = await db.affiliate.findFirst({
        where: {
          verificationToken: result.data.token,
          verificationTokenExpiry: { gte: new Date() },
        },
      });

      if (!affiliate) return jsonResponse({ error: "Invalid or expired token" }, 400);

      await db.affiliate.update({
        where: { id: affiliate.id },
        data: {
          emailVerified: true,
          verificationToken: null,
          verificationTokenExpiry: null,
        },
      });

      return jsonResponse({ success: true, message: "Email verified successfully" });
    }

    case "forgot-password": {
      const result = forgotPasswordSchema.safeParse(body);
      if (!result.success) return jsonResponse({ error: "Validation failed" }, 400);

      const shop = await db.shop.findUnique({ where: { shopDomain: result.data.shopDomain } });
      if (!shop) return jsonResponse({ success: true, message: "If the email exists, a reset link has been sent" });

      const affiliate = await db.affiliate.findFirst({
        where: { shopId: shop.id, email: result.data.email },
      });

      if (affiliate) {
        const resetToken = generateToken();
        await db.affiliate.update({
          where: { id: affiliate.id },
          data: {
            resetPasswordToken: resetToken,
            resetPasswordExpiry: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
          },
        });

        try {
          const resetUrl = `${process.env.SHOPIFY_APP_URL}/portal/reset-password?token=${resetToken}`;
          await sendPasswordResetEmail(affiliate.email, affiliate.name, resetUrl);
        } catch (err) {
          console.error("Failed to send reset email:", err);
        }
      }

      // Always return success to prevent email enumeration
      return jsonResponse({ success: true, message: "If the email exists, a reset link has been sent" });
    }

    case "reset-password": {
      const result = resetPasswordSchema.safeParse(body);
      if (!result.success) return jsonResponse({ error: "Validation failed" }, 400);

      const affiliate = await db.affiliate.findFirst({
        where: {
          resetPasswordToken: result.data.token,
          resetPasswordExpiry: { gte: new Date() },
        },
      });

      if (!affiliate) return jsonResponse({ error: "Invalid or expired reset token" }, 400);

      const passwordHash = await bcrypt.hash(result.data.password, 12);

      await db.affiliate.update({
        where: { id: affiliate.id },
        data: {
          passwordHash,
          resetPasswordToken: null,
          resetPasswordExpiry: null,
        },
      });

      return jsonResponse({ success: true, message: "Password reset successfully" });
    }

    case "profile": {
      // PUT /portal/profile — authenticated
      const payload = authenticatePortalRequest(request);
      const updateResult = affiliateProfileUpdateSchema.safeParse(body);
      if (!updateResult.success) {
        return jsonResponse({ error: "Validation failed", details: updateResult.error.flatten() }, 400);
      }

      const updateData: Record<string, unknown> = {};
      const d = updateResult.data;

      if (d.name) updateData.name = d.name;
      if (d.phone !== undefined) updateData.phone = d.phone || null;
      if (d.upiId !== undefined) updateData.upiId = d.upiId || null;
      if (d.city !== undefined) updateData.city = d.city || null;
      if (d.state !== undefined) updateData.state = d.state || null;
      if (d.pincode !== undefined) updateData.pincode = d.pincode || null;

      // Encrypt PII fields
      const piiData = encryptAffiliatePII({
        pan: d.pan || null,
        gstin: d.gstin || null,
        legalName: d.legalName || null,
        address: d.address || null,
      });

      Object.assign(updateData, piiData);

      await db.affiliate.update({
        where: { id: payload.affiliateId },
        data: updateData,
      });

      return jsonResponse({ success: true, message: "Profile updated" });
    }

    case "payout": {
      // POST /portal/payout/request — authenticated
      const payload = authenticatePortalRequest(request);
      const payoutResult = payoutRequestSchema.safeParse(body);
      if (!payoutResult.success) {
        return jsonResponse({ error: "Validation failed", details: payoutResult.error.flatten() }, 400);
      }

      const affiliate = await db.affiliate.findUnique({
        where: { id: payload.affiliateId },
        include: { shop: { include: { gstSetting: true, tdsSetting: true } } },
      });

      if (!affiliate) return jsonResponse({ error: "Affiliate not found" }, 404);

      const requestedAmount = payoutResult.data.amount;
      if (requestedAmount > Number(affiliate.pendingCommission)) {
        return jsonResponse({ error: "Insufficient pending commission" }, 400);
      }

      // Calculate GST and TDS
      let gstAmount = 0;
      let tdsAmount = 0;
      const baseAmount = requestedAmount;

      if (affiliate.shop.gstSetting?.isEnabled) {
        gstAmount = baseAmount * (Number(affiliate.shop.gstSetting.gstRate) / 100);
      }

      if (affiliate.shop.tdsSetting?.isEnabled) {
        // Check cumulative payouts for this financial year
        const fyStart = getFinancialYearStart();
        const cumulativePayouts = await db.payout.aggregate({
          where: {
            affiliateId: affiliate.id,
            status: { in: ["APPROVED", "PAID"] },
            createdAt: { gte: fyStart },
          },
          _sum: { baseAmount: true },
        });

        const cumulative = Number(cumulativePayouts._sum.baseAmount || 0);
        if (cumulative + baseAmount > Number(affiliate.shop.tdsSetting.annualThreshold)) {
          tdsAmount = (baseAmount + gstAmount) * (Number(affiliate.shop.tdsSetting.tdsRate) / 100);
        }
      }

      // Create payout and deduct from pending
      const [payout] = await db.$transaction([
        db.payout.create({
          data: {
            shopId: affiliate.shopId,
            affiliateId: affiliate.id,
            amount: baseAmount + gstAmount - tdsAmount,
            baseAmount,
            gstAmount,
            tdsAmount,
            mode: affiliate.shop.payoutMode === "RAZORPAY_X" ? "RAZORPAY_X" : "MANUAL",
            status: "PENDING",
          },
        }),
        db.affiliate.update({
          where: { id: affiliate.id },
          data: { pendingCommission: { decrement: baseAmount } },
        }),
      ]);

      return jsonResponse({
        success: true,
        message: "Payout requested",
        payout: {
          id: payout.id,
          amount: Number(payout.amount),
          baseAmount,
          gstAmount,
          tdsAmount,
          netAmount: baseAmount + gstAmount - tdsAmount,
        },
      }, 201);
    }

    default:
      return jsonResponse({ error: "Not found" }, 404);
  }
};

// ─── Helpers ─────────────────────────────────────────────────

function getFinancialYearStart(): Date {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return new Date(year, 3, 1); // April 1st
}
