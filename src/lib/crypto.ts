// src/lib/crypto.ts
import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

// derive key from environment key or fallback to a standard development key
const getSecretKey = (): Buffer => {
  const rawKey = process.env.ENCRYPTION_KEY || "ira-resume-screening-default-secret-key-12345";
  return crypto.scryptSync(rawKey, "ira-salt-value", 32);
};

export function encrypt(text: string): string {
  if (!text) return "";
  const key = getSecretKey();
  const iv = crypto.randomBytes(12); // GCM standard IV is 12 bytes
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decrypt(text: string): string {
  if (!text) return "";
  try {
    const parts = text.split(":");
    if (parts.length === 2) {
      // Compatibility fallback: previous CBC format (iv:ciphertext)
      const [ivHex, encryptedText] = parts;
      const key = getSecretKey();
      const iv = Buffer.from(ivHex, "hex");
      const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
      let decrypted = decipher.update(encryptedText, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    }
    if (parts.length !== 3) {
      // If it doesn't match either, it might be unencrypted legacy data
      return text;
    }
    const [ivHex, authTagHex, encryptedText] = parts;
    const key = getSecretKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("Decryption failed, returning original text:", err);
    return text;
  }
}
