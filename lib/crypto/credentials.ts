import crypto from "crypto";

/**
 * AES-256-GCM credential encryption for server-side secrets.
 *
 * SECURITY ARCHITECTURE:
 * - All new credentials are encrypted with AES-256-GCM before storage
 * - Encryption is REQUIRED - app will refuse to store credentials without a key
 * - Decryption supports legacy plaintext for migration only (read-only)
 *
 * Env var:
 * - CREDENTIALS_ENCRYPTION_KEY: base64 32 bytes (recommended), or hex 32 bytes
 * - Generate: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Ciphertext format:
 * - "enc:<base64(iv(12) || tag(16) || ciphertext)>"
 *
 * IMPORTANT: Keep your encryption key secure and backed up!
 * If you lose it, users will need to re-enter their API credentials.
 */

const PREFIX_ENC = "enc:";
const PREFIX_PLAIN = "plain:";

function getKeyBytes(): Buffer | null {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) return null;

  // base64 (preferred)
  try {
    const b64 = Buffer.from(raw, "base64");
    if (b64.length === 32) return b64;
  } catch {
    // ignore
  }

  // hex
  try {
    const hex = Buffer.from(raw, "hex");
    if (hex.length === 32) return hex;
  } catch {
    // ignore
  }

  return null;
}

/**
 * Check if encryption is properly configured.
 * CRITICAL: This must return true before storing any credentials.
 */
export function isEncryptionConfigured(): boolean {
  return getKeyBytes() !== null;
}

/**
 * Require encryption to be configured.
 * Throws an error if not configured - use this at app startup or before storing secrets.
 */
export function requireEncryption(): void {
  if (!isEncryptionConfigured()) {
    const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL;
    const instructions = isProduction
      ? "Set CREDENTIALS_ENCRYPTION_KEY in your Vercel environment variables."
      : "Run: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\" and add CREDENTIALS_ENCRYPTION_KEY to .env.local";

    throw new Error(
      `SECURITY ERROR: Encryption key not configured. Cannot store credentials securely. ${instructions}`
    );
  }
}

export function encryptCredential(plaintext: string): string {
  const key = getKeyBytes();

  // SECURITY: Never store credentials in plaintext
  if (!key) {
    const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL;
    throw new Error(
      `SECURITY ERROR: Cannot encrypt credentials - CREDENTIALS_ENCRYPTION_KEY is not configured. ` +
      (isProduction
        ? "Add CREDENTIALS_ENCRYPTION_KEY to your Vercel environment variables and redeploy."
        : "Add CREDENTIALS_ENCRYPTION_KEY to your .env.local file. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"")
    );
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const packed = Buffer.concat([iv, tag, ciphertext]).toString("base64");
  return `${PREFIX_ENC}${packed}`;
}

export function decryptCredential(stored: string): string {
  if (!stored) throw new Error("Missing credential material");
  if (stored.startsWith(PREFIX_PLAIN)) return stored.slice(PREFIX_PLAIN.length);
  if (!stored.startsWith(PREFIX_ENC)) {
    // Backward-compatible: treat as plaintext for MVP, but do NOT return to client anywhere.
    return stored;
  }

  const key = getKeyBytes();
  if (!key) {
    // Graceful fallback: if no encryption key is configured, warn but don't crash
    console.warn("⚠️  CREDENTIALS_ENCRYPTION_KEY not set. Encrypted credentials cannot be decrypted.");
    console.warn("⚠️  Generate a key with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"");
    console.warn("⚠️  Then add CREDENTIALS_ENCRYPTION_KEY=<key> to your .env.local file");
    throw new Error("Cannot decrypt credentials: CREDENTIALS_ENCRYPTION_KEY not configured. See server logs for setup instructions.");
  }

  const packed = Buffer.from(stored.slice(PREFIX_ENC.length), "base64");
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);

  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    return plaintext;
  } catch (error: any) {
    // Decryption failed - likely wrong key or corrupted data
    throw new Error(
      `⚠️ This API key was encrypted with a different encryption key and cannot be decrypted. ` +
      `Please delete this saved key and add it again with your current API key.`
    );
  }
}

