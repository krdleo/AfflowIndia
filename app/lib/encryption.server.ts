/**
 * AES-256-GCM Encryption Utilities
 *
 * Used for encrypting sensitive data at rest:
 * - Shopify access tokens
 * - PII fields (PAN, GSTIN, bank details)
 * - Razorpay X credentials
 *
 * Each encryption generates a unique IV (initialization vector).
 * Returns ciphertext + IV + auth tag as separate fields for storage.
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 128-bit IV for GCM
const TAG_LENGTH = 16; // 128-bit auth tag

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY environment variable is required. Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  const buf = Buffer.from(key, "hex");
  if (buf.length !== 32) {
    throw new Error(
      `ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Got ${buf.length} bytes from a ${key.length}-character string. Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
    );
  }
  return buf;
}

/**
 * Encrypt a plaintext string using AES-256-GCM
 * @returns Object with ciphertext, iv, and tag (all hex-encoded)
 */
export function encrypt(plaintext: string): {
  ciphertext: string;
  iv: string;
  tag: string;
} {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();

  return {
    ciphertext: encrypted,
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
  };
}

/**
 * Decrypt ciphertext using AES-256-GCM
 * @param ciphertext Hex-encoded ciphertext
 * @param iv Hex-encoded initialization vector
 * @param tag Hex-encoded authentication tag
 * @returns Decrypted plaintext string
 */
export function decrypt(
  ciphertext: string,
  iv: string,
  tag: string
): string {
  const key = getEncryptionKey();

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Encrypt to a single combined string for easier storage
 * Format: iv:tag:ciphertext (all hex-encoded, colon-separated)
 */
export function encryptToString(plaintext: string): string {
  const { ciphertext, iv, tag } = encrypt(plaintext);
  return `${iv}:${tag}:${ciphertext}`;
}

/**
 * Decrypt from a single combined string
 * @param combined String in format iv:tag:ciphertext
 */
export function decryptFromString(combined: string): string {
  const parts = combined.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted string format. Expected iv:tag:ciphertext");
  }
  const [iv, tag, ciphertext] = parts;
  return decrypt(ciphertext, iv, tag);
}

/**
 * Hash a value using SHA-256 (for non-reversible lookups)
 */
export function hash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Generate a cryptographically secure random token
 * @param length Length in bytes (default 32 = 64 hex chars)
 */
export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

/**
 * Generate a URL-safe random code
 * @param length Length of the resulting string
 */
export function generateUrlSafeCode(length: number = 8): string {
  return crypto
    .randomBytes(Math.ceil((length * 3) / 4))
    .toString("base64url")
    .substring(0, length);
}
