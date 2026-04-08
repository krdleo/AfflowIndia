/**
 * PII Encryption/Decryption Helpers
 *
 * Handles encryption of personally identifiable information:
 * - PAN numbers (stores panLast4 unencrypted for display)
 * - GSTIN
 * - Legal name
 * - Address
 * - Bank details
 *
 * All PII fields use per-field AES-256-GCM encryption with unique IVs.
 */

import { encrypt, decrypt } from "./encryption.server";

export interface EncryptedField {
  encrypted: string;
  iv: string;
  tag: string;
}

/**
 * Encrypt a PII field value
 */
export function encryptPII(value: string): EncryptedField {
  const result = encrypt(value);
  return {
    encrypted: result.ciphertext,
    iv: result.iv,
    tag: result.tag,
  };
}

/**
 * Decrypt a PII field value
 */
export function decryptPII(field: EncryptedField): string {
  return decrypt(field.encrypted, field.iv, field.tag);
}

/**
 * Encrypt PAN number and extract last 4 digits for display
 */
export function encryptPAN(pan: string): EncryptedField & { last4: string } {
  const result = encryptPII(pan.toUpperCase().trim());
  return {
    ...result,
    last4: pan.slice(-4),
  };
}

/**
 * Encrypt an affiliate's PII fields for database storage
 * Returns Prisma-compatible field names
 */
export function encryptAffiliatePII(data: {
  pan?: string | null;
  gstin?: string | null;
  legalName?: string | null;
  address?: string | null;
  bankDetails?: string | null;
}): Record<string, string | null> {
  const result: Record<string, string | null> = {};

  if (data.pan) {
    const panData = encryptPAN(data.pan);
    result.panEncrypted = panData.encrypted;
    result.panIv = panData.iv;
    result.panTag = panData.tag;
    result.panLast4 = panData.last4;
  }

  if (data.gstin) {
    const gstinData = encryptPII(data.gstin.toUpperCase().trim());
    result.gstinEncrypted = gstinData.encrypted;
    result.gstinIv = gstinData.iv;
    result.gstinTag = gstinData.tag;
  }

  if (data.legalName) {
    const legalNameData = encryptPII(data.legalName);
    result.legalNameEncrypted = legalNameData.encrypted;
    result.legalNameIv = legalNameData.iv;
    result.legalNameTag = legalNameData.tag;
  }

  if (data.address) {
    const addressData = encryptPII(data.address);
    result.addressEncrypted = addressData.encrypted;
    result.addressIv = addressData.iv;
    result.addressTag = addressData.tag;
  }

  if (data.bankDetails) {
    const bankData = encryptPII(data.bankDetails);
    result.bankDetailsEncrypted = bankData.encrypted;
    result.bankDetailsIv = bankData.iv;
    result.bankDetailsTag = bankData.tag;
  }

  return result;
}

/**
 * Decrypt an affiliate's PII fields from database storage
 */
export function decryptAffiliatePII(affiliate: {
  panEncrypted?: string | null;
  panIv?: string | null;
  panTag?: string | null;
  panLast4?: string | null;
  gstinEncrypted?: string | null;
  gstinIv?: string | null;
  gstinTag?: string | null;
  legalNameEncrypted?: string | null;
  legalNameIv?: string | null;
  legalNameTag?: string | null;
  addressEncrypted?: string | null;
  addressIv?: string | null;
  addressTag?: string | null;
  bankDetailsEncrypted?: string | null;
  bankDetailsIv?: string | null;
  bankDetailsTag?: string | null;
}): {
  pan: string | null;
  panLast4: string | null;
  gstin: string | null;
  legalName: string | null;
  address: string | null;
  bankDetails: string | null;
} {
  return {
    pan:
      affiliate.panEncrypted && affiliate.panIv && affiliate.panTag
        ? decryptPII({
            encrypted: affiliate.panEncrypted,
            iv: affiliate.panIv,
            tag: affiliate.panTag,
          })
        : null,
    panLast4: affiliate.panLast4 ?? null,
    gstin:
      affiliate.gstinEncrypted && affiliate.gstinIv && affiliate.gstinTag
        ? decryptPII({
            encrypted: affiliate.gstinEncrypted,
            iv: affiliate.gstinIv,
            tag: affiliate.gstinTag,
          })
        : null,
    legalName:
      affiliate.legalNameEncrypted &&
      affiliate.legalNameIv &&
      affiliate.legalNameTag
        ? decryptPII({
            encrypted: affiliate.legalNameEncrypted,
            iv: affiliate.legalNameIv,
            tag: affiliate.legalNameTag,
          })
        : null,
    address:
      affiliate.addressEncrypted &&
      affiliate.addressIv &&
      affiliate.addressTag
        ? decryptPII({
            encrypted: affiliate.addressEncrypted,
            iv: affiliate.addressIv,
            tag: affiliate.addressTag,
          })
        : null,
    bankDetails:
      affiliate.bankDetailsEncrypted &&
      affiliate.bankDetailsIv &&
      affiliate.bankDetailsTag
        ? decryptPII({
            encrypted: affiliate.bankDetailsEncrypted,
            iv: affiliate.bankDetailsIv,
            tag: affiliate.bankDetailsTag,
          })
        : null,
  };
}
