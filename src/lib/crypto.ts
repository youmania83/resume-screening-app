// src/lib/crypto.ts
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

// derive key from environment key — NO FALLBACK (security requirement)
const getSecretKey = (salt: Buffer): Buffer => {
  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error("FATAL: ENCRYPTION_KEY environment variable is required. Refusing to use insecure defaults.");
  }
  return crypto.scryptSync(rawKey, salt, 32);
};

// Legacy key derivation for decrypting data encrypted with the old static salt
const getLegacySecretKey = (): Buffer => {
  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error("FATAL: ENCRYPTION_KEY environment variable is required.");
  }
  return crypto.scryptSync(rawKey, "ira-salt-value", 32);
};

export function encrypt(text: string): string {
  if (!text) return "";
  const salt = crypto.randomBytes(16);
  const key = getSecretKey(salt);
  const iv = crypto.randomBytes(12); // GCM standard IV is 12 bytes
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  // New format: salt:iv:authTag:ciphertext (4 parts)
  return `${salt.toString("hex")}:${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decrypt(text: string): string {
  if (!text) return "";
  try {
    const parts = text.split(":");

    if (parts.length === 4) {
      // New format: salt:iv:authTag:ciphertext
      const [saltHex, ivHex, authTagHex, encryptedText] = parts;
      const salt = Buffer.from(saltHex, "hex");
      const key = getSecretKey(salt);
      const iv = Buffer.from(ivHex, "hex");
      const authTag = Buffer.from(authTagHex, "hex");
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedText, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    }

    if (parts.length === 3) {
      // Legacy GCM format with static salt: iv:authTag:ciphertext
      const [ivHex, authTagHex, encryptedText] = parts;
      const key = getLegacySecretKey();
      const iv = Buffer.from(ivHex, "hex");
      const authTag = Buffer.from(authTagHex, "hex");
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encryptedText, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    }

    if (parts.length === 2) {
      // Legacy CBC format with static salt: iv:ciphertext
      const [ivHex, encryptedText] = parts;
      const key = getLegacySecretKey();
      const iv = Buffer.from(ivHex, "hex");
      const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
      let decrypted = decipher.update(encryptedText, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    }

    // Unrecognized format — return as-is (possibly unencrypted legacy data)
    return text;
  } catch (err) {
    console.error("Decryption failed, returning original text:", err);
    return text;
  }
}
