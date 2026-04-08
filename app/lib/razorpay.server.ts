/**
 * Razorpay X Integration
 *
 * Handles automated payouts via Razorpay X:
 * - Create Contact (affiliate)
 * - Create Fund Account (UPI VPA or bank account)
 * - Create Payout to fund account
 * - Track external reference (Razorpay payout ID)
 */

import { decryptFromString } from "./encryption.server";

interface RazorpayXConfig {
  keyId: string;
  keySecret: string;
  accountNumber: string;
}

interface RazorpayContact {
  id: string;
  entity: string;
  name: string;
  email: string;
}

interface RazorpayFundAccount {
  id: string;
  entity: string;
  contact_id: string;
}

interface RazorpayPayout {
  id: string;
  entity: string;
  fund_account_id: string;
  amount: number;
  status: string;
}

/**
 * Decrypt and parse Razorpay X config from encrypted storage
 */
function getConfig(encryptedConfig: string): RazorpayXConfig {
  const decrypted = decryptFromString(encryptedConfig);
  return JSON.parse(decrypted);
}

/**
 * Make an authenticated request to Razorpay X API
 */
async function razorpayRequest(
  config: RazorpayXConfig,
  endpoint: string,
  method: string = "POST",
  body?: Record<string, unknown>
): Promise<unknown> {
  const auth = Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64");

  const response = await fetch(`https://api.razorpay.com/v1/${endpoint}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Razorpay X API error (${response.status}): ${error}`);
  }

  return response.json();
}

/**
 * Create a contact (affiliate) on Razorpay X
 */
export async function createContact(
  encryptedConfig: string,
  name: string,
  email: string,
  phone?: string
): Promise<RazorpayContact> {
  const config = getConfig(encryptedConfig);
  return razorpayRequest(config, "contacts", "POST", {
    name,
    email,
    contact_type: "vendor",
    type: "vendor",
    ...(phone ? { phone } : {}),
  }) as Promise<RazorpayContact>;
}

/**
 * Create a UPI fund account for a contact
 */
export async function createUPIFundAccount(
  encryptedConfig: string,
  contactId: string,
  upiVpa: string
): Promise<RazorpayFundAccount> {
  const config = getConfig(encryptedConfig);
  return razorpayRequest(config, "fund_accounts", "POST", {
    contact_id: contactId,
    account_type: "vpa",
    vpa: {
      address: upiVpa,
    },
  }) as Promise<RazorpayFundAccount>;
}

/**
 * Create a bank account fund account for a contact
 */
export async function createBankFundAccount(
  encryptedConfig: string,
  contactId: string,
  accountNumber: string,
  ifsc: string,
  name: string
): Promise<RazorpayFundAccount> {
  const config = getConfig(encryptedConfig);
  return razorpayRequest(config, "fund_accounts", "POST", {
    contact_id: contactId,
    account_type: "bank_account",
    bank_account: {
      name,
      ifsc,
      account_number: accountNumber,
    },
  }) as Promise<RazorpayFundAccount>;
}

/**
 * Create a payout to a fund account
 * @param amount Amount in INR (will be converted to paise for Razorpay)
 */
export async function createPayout(
  encryptedConfig: string,
  fundAccountId: string,
  amount: number,
  referenceId: string,
  narration?: string
): Promise<RazorpayPayout> {
  const config = getConfig(encryptedConfig);
  return razorpayRequest(config, "payouts", "POST", {
    account_number: config.accountNumber,
    fund_account_id: fundAccountId,
    amount: Math.round(amount * 100), // Convert to paise
    currency: "INR",
    mode: "UPI", // Default to UPI
    purpose: "payout",
    queue_if_low_balance: true,
    reference_id: referenceId,
    narration: narration || "AfflowIndia affiliate payout",
  }) as Promise<RazorpayPayout>;
}

/**
 * Get payout status from Razorpay X
 */
export async function getPayoutStatus(
  encryptedConfig: string,
  payoutId: string
): Promise<RazorpayPayout> {
  const config = getConfig(encryptedConfig);
  return razorpayRequest(config, `payouts/${payoutId}`, "GET") as Promise<RazorpayPayout>;
}
