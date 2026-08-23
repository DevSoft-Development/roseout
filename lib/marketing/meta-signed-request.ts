import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  return Buffer.from(padded, "base64");
}

export function verifyMetaSignedRequest(value: string) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) throw new Error("META_APP_SECRET is not configured.");

  const [encodedSignature, encodedPayload] = value.split(".");
  if (!encodedSignature || !encodedPayload) throw new Error("Invalid Meta signed request.");

  const signature = decodeBase64Url(encodedSignature);
  const expected = createHmac("sha256", appSecret).update(encodedPayload).digest();
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
    throw new Error("Invalid Meta signed request signature.");
  }

  const payload = JSON.parse(decodeBase64Url(encodedPayload).toString("utf8")) as Record<string, unknown>;
  const algorithm = String(payload.algorithm || "HMAC-SHA256").toUpperCase();
  if (algorithm !== "HMAC-SHA256") throw new Error("Unsupported Meta signed request algorithm.");
  return payload;
}
