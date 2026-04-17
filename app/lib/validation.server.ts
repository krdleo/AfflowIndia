/**
 * Zod Validation Schemas
 *
 * Input validation for all user-facing operations.
 * All inputs are validated before processing.
 */

import { z } from "zod";

// ─── Common Validators ──────────────────────────────────────

const sanitizeString = (val: string) =>
  val.replace(/[<>]/g, "").trim();

const email = z.string().email().max(255).transform(sanitizeString);
const code = z
  .string()
  .min(3, "Code must be at least 3 characters")
  .max(30, "Code must be at most 30 characters")
  .regex(
    /^[A-Za-z0-9_-]+$/,
    "Code can only contain letters, numbers, hyphens, and underscores"
  )
  .transform((v) => v.toUpperCase().trim());
const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters");

// GSTIN format: 2 digits + 5 uppercase letters + 4 digits + 1 uppercase letter + 1 alphanumeric + Z + 1 alphanumeric
const gstin = z
  .string()
  .regex(
    /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
    "Invalid GSTIN format"
  )
  .optional()
  .or(z.literal(""));

// PAN format: 5 uppercase letters + 4 digits + 1 uppercase letter
const pan = z
  .string()
  .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, "Invalid PAN format")
  .optional()
  .or(z.literal(""));

// UPI VPA format: username@provider
const upiId = z
  .string()
  .regex(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$/, "Invalid UPI ID format")
  .max(100)
  .optional()
  .or(z.literal(""));

const phone = z
  .string()
  .regex(/^[+]?[0-9]{10,15}$/, "Invalid phone number")
  .optional()
  .or(z.literal(""));

// ─── Affiliate Signup ────────────────────────────────────────

export const affiliateSignupSchema = z.object({
  shopDomain: z.string().min(1).max(255),
  name: z.string().min(2, "Name must be at least 2 characters").max(100).transform(sanitizeString),
  email,
  phone,
  password,
  code: code.optional(),
  upiId,
});

export type AffiliateSignupInput = z.infer<typeof affiliateSignupSchema>;

// ─── Affiliate Login ─────────────────────────────────────────

export const affiliateLoginSchema = z.object({
  shopDomain: z.string().min(1).max(255),
  email,
  password: z.string().min(1),
});

export type AffiliateLoginInput = z.infer<typeof affiliateLoginSchema>;

// ─── Affiliate Profile Update ────────────────────────────────

export const affiliateProfileUpdateSchema = z.object({
  name: z.string().min(2).max(100).transform(sanitizeString).optional(),
  phone,
  upiId,
  pan,
  gstin,
  legalName: z.string().max(200).transform(sanitizeString).optional().or(z.literal("")),
  address: z.string().max(500).transform(sanitizeString).optional().or(z.literal("")),
  city: z.string().max(100).transform(sanitizeString).optional().or(z.literal("")),
  state: z.string().max(100).transform(sanitizeString).optional().or(z.literal("")),
  pincode: z
    .string()
    .regex(/^[0-9]{6}$/, "Invalid pincode (must be 6 digits)")
    .optional()
    .or(z.literal("")),
});

export type AffiliateProfileUpdateInput = z.infer<typeof affiliateProfileUpdateSchema>;

// ─── Password Reset ─────────────────────────────────────────

export const forgotPasswordSchema = z.object({
  shopDomain: z.string().min(1).max(255),
  email,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password,
});

// ─── Email Verification ─────────────────────────────────────

export const verifyEmailSchema = z.object({
  token: z.string().min(1).max(128),
});

// ─── Payout Request ──────────────────────────────────────────

export const payoutRequestSchema = z.object({
  amount: z.number().positive("Payout amount must be positive").max(10000000, "Payout amount exceeds maximum"),
});

// ─── Portal Customization ────────────────────────────────────

export const portalCustomizationSchema = z.object({
  programName: z.string().max(100).transform(sanitizeString).optional(),
  logoUrl: z.string().url().max(500).optional().or(z.literal("")),
  bannerUrl: z.string().url().max(500).optional().or(z.literal("")),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color")
    .optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex color")
    .optional(),
  welcomeHeading: z.string().max(200).transform(sanitizeString).optional(),
  welcomeMessage: z.string().max(1000).transform(sanitizeString).optional(),
  termsText: z.string().max(5000).transform(sanitizeString).optional(),
  signupsEnabled: z.boolean().optional(),
  requireApproval: z.boolean().optional(),
  showPhone: z.boolean().optional(),
  showUpi: z.boolean().optional(),
  showPan: z.boolean().optional(),
  showGstin: z.boolean().optional(),
});

export type PortalCustomizationInput = z.infer<typeof portalCustomizationSchema>;

// ─── Commission Settings ─────────────────────────────────────

export const commissionSettingsSchema = z.object({
  commissionMode: z.enum(["FLAT", "TIERED"]),
  defaultCommissionRate: z
    .number()
    .min(0, "Commission rate must be at least 0%")
    .max(100, "Commission rate must be at most 100%"),
  commissionTiers: z
    .array(
      z.object({
        thresholdAmount: z.number().min(0),
        ratePercent: z.number().min(0).max(100),
      })
    )
    .optional(),
});

export type CommissionSettingsInput = z.infer<typeof commissionSettingsSchema>;

// ─── GST Settings ────────────────────────────────────────────

export const gstSettingsSchema = z.object({
  isEnabled: z.boolean(),
  gstRate: z.number().min(0).max(100).optional(),
});

// ─── TDS Settings ────────────────────────────────────────────

export const tdsSettingsSchema = z.object({
  isEnabled: z.boolean(),
  tdsRate: z.number().min(0).max(100).optional(),
  annualThreshold: z.number().min(0).optional(),
});

// ─── Discount Code ───────────────────────────────────────────

export const discountCodeSchema = z.object({
  code,
  discountPercent: z
    .number()
    .min(1, "Discount must be at least 1%")
    .max(100, "Discount must be at most 100%"),
});

// ─── Bulk Email ─────────────────────────────────────────────

export const bulkEmailSchema = z.object({
  subject: z
    .string()
    .min(1, "Subject is required")
    .max(200, "Subject must be at most 200 characters")
    .transform(sanitizeString),
  message: z
    .string()
    .min(1, "Message is required")
    .max(5000, "Message must be at most 5,000 characters"),
});

export type BulkEmailInput = z.infer<typeof bulkEmailSchema>;

// ─── Payout Settings ─────────────────────────────────────────

export const payoutSettingsSchema = z.object({
  payoutMode: z.enum(["MANUAL", "RAZORPAY_X"]),
  razorpayKeyId: z.string().max(100).optional().or(z.literal("")),
  razorpayKeySecret: z.string().max(100).optional().or(z.literal("")),
  razorpayAccountNumber: z.string().max(50).optional().or(z.literal("")),
});
