/**
 * Email Service — Resend Integration
 *
 * Transactional emails for AfflowIndia:
 * - Affiliate email verification
 * - Password reset
 * - Payout confirmation
 * - Merchant new-affiliate alert
 */

import { Resend } from "resend";

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("RESEND_API_KEY environment variable is required");
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

const FROM_EMAIL = process.env.EMAIL_FROM || "onboarding@resend.dev";
const APP_NAME = "AfflowIndia";

// ─── Email Templates ─────────────────────────────────────────

export async function sendVerificationEmail(
  to: string,
  name: string,
  verificationUrl: string,
  shopName?: string
): Promise<void> {
  const resend = getResend();

  await resend.emails.send({
    from: `${APP_NAME} <${FROM_EMAIL}>`,
    to,
    subject: `Verify your email — ${shopName || APP_NAME} Affiliate Program`,
    html: `
      <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a1a;">Welcome, ${escapeHtml(name)}! 🎉</h2>
        <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
          Thank you for signing up for the ${escapeHtml(shopName || APP_NAME)} affiliate program.
          Please verify your email address to activate your account.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${verificationUrl}" style="background-color: #4f46e5; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
            Verify Email
          </a>
        </div>
        <p style="color: #8a8a8a; font-size: 14px;">
          This link expires in 24 hours. If you didn't sign up, please ignore this email.
        </p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  resetUrl: string
): Promise<void> {
  const resend = getResend();

  await resend.emails.send({
    from: `${APP_NAME} <${FROM_EMAIL}>`,
    to,
    subject: `Reset your password — ${APP_NAME}`,
    html: `
      <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a1a;">Password Reset</h2>
        <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
          Hi ${escapeHtml(name)}, we received a request to reset your password. Click the button below to set a new password.
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${resetUrl}" style="background-color: #4f46e5; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
            Reset Password
          </a>
        </div>
        <p style="color: #8a8a8a; font-size: 14px;">
          This link expires in 1 hour. If you didn't request a reset, please ignore this email.
        </p>
      </div>
    `,
  });
}

export async function sendPayoutConfirmationEmail(
  to: string,
  name: string,
  amount: number,
  currency: string = "INR"
): Promise<void> {
  const resend = getResend();

  await resend.emails.send({
    from: `${APP_NAME} <${FROM_EMAIL}>`,
    to,
    subject: `Payout Confirmed — ₹${amount.toLocaleString("en-IN")}`,
    html: `
      <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a1a;">Payout Confirmed 💰</h2>
        <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
          Hi ${escapeHtml(name)}, your payout of <strong>₹${amount.toLocaleString("en-IN")}</strong> has been processed.
        </p>
        <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
          The amount will be credited to your registered UPI/bank account shortly.
        </p>
        <p style="color: #8a8a8a; font-size: 14px;">
          Check your affiliate dashboard for more details.
        </p>
      </div>
    `,
  });
}

export async function sendNewAffiliateAlertEmail(
  to: string,
  merchantName: string,
  affiliateName: string,
  affiliateEmail: string,
  requiresApproval: boolean
): Promise<void> {
  const resend = getResend();

  await resend.emails.send({
    from: `${APP_NAME} <${FROM_EMAIL}>`,
    to,
    subject: `New Affiliate Signup — ${affiliateName}`,
    html: `
      <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a1a;">New Affiliate Signup 🆕</h2>
        <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
          Hi ${escapeHtml(merchantName)}, a new affiliate has signed up for your program:
        </p>
        <div style="background: #f7f7f7; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Name:</strong> ${escapeHtml(affiliateName)}</p>
          <p style="margin: 4px 0;"><strong>Email:</strong> ${escapeHtml(affiliateEmail)}</p>
          <p style="margin: 4px 0;"><strong>Status:</strong> ${requiresApproval ? "⏳ Pending Approval" : "✅ Auto-Approved"}</p>
        </div>
        ${
          requiresApproval
            ? '<p style="color: #4a4a4a; font-size: 16px;">Please review and approve this affiliate in your Shopify admin.</p>'
            : ""
        }
      </div>
    `,
  });
}

// ─── Bulk Announcement Email ─────────────────────────────────

export async function sendBulkAnnouncementEmail(
  to: string,
  affiliateName: string,
  subject: string,
  messageText: string,
  shopName: string
): Promise<void> {
  const resend = getResend();

  // Convert plain text line breaks to HTML paragraphs
  const messageHtml = escapeHtml(messageText)
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => `<p style="color: #4a4a4a; font-size: 16px; line-height: 1.6; margin: 8px 0;">${line}</p>`)
    .join("");

  await resend.emails.send({
    from: `${shopName} via ${APP_NAME} <${FROM_EMAIL}>`,
    to,
    subject,
    html: `
      <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a1a;">${escapeHtml(subject)}</h2>
        <p style="color: #4a4a4a; font-size: 16px; line-height: 1.6;">
          Hi ${escapeHtml(affiliateName)},
        </p>
        ${messageHtml}
        <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
        <p style="color: #8a8a8a; font-size: 13px;">
          Sent by ${escapeHtml(shopName)} affiliate program, powered by ${APP_NAME}.
        </p>
      </div>
    `,
  });
}

// ─── Helpers ─────────────────────────────────────────────────

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
  };
  return text.replace(/[&<>"']/g, (char) => map[char] || char);
}
