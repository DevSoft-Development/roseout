import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

function runtimeJsonValue(key: string) {
  const raw = process.env.RUNTIME_ENV_JSON;
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const value = parsed?.[key];
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

export function getMicrosoft365EncryptionKey(): Buffer {
  const raw =
    process.env.M365_TOKEN_ENCRYPTION_KEY?.trim() ||
    runtimeJsonValue("M365_TOKEN_ENCRYPTION_KEY");
  if (!raw) throw new Error("M365_TOKEN_ENCRYPTION_KEY_MISSING");

  const base64 = Buffer.from(raw, "base64");
  if (base64.length === 32) return base64;

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    const hex = Buffer.from(raw, "hex");
    if (hex.length === 32) return hex;
  }

  const utf8 = Buffer.from(raw, "utf8");
  if (utf8.length === 32) return utf8;

  throw new Error("M365_TOKEN_ENCRYPTION_KEY_INVALID");
}

export function encryptMicrosoftToken(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getMicrosoft365EncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export function decryptMicrosoftToken(value: string): string {
  const [version, ivPart, tagPart, encryptedPart] = value.split(".");
  if (version !== "v1" || !ivPart || !tagPart || !encryptedPart) {
    throw new Error("M365_TOKEN_FORMAT_INVALID");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getMicrosoft365EncryptionKey(),
    Buffer.from(ivPart, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedPart, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
