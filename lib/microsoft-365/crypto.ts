import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function getKey(): Buffer {
  const raw = process.env.M365_TOKEN_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("M365_TOKEN_ENCRYPTION_KEY_MISSING");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("M365_TOKEN_ENCRYPTION_KEY_INVALID");
  return key;
}

export function encryptMicrosoftToken(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function decryptMicrosoftToken(value: string): string {
  const [version, ivPart, tagPart, encryptedPart] = value.split(".");
  if (version !== "v1" || !ivPart || !tagPart || !encryptedPart) throw new Error("M365_TOKEN_FORMAT_INVALID");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedPart, "base64url")), decipher.final()]).toString("utf8");
}
