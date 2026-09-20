import "server-only";

import crypto from "node:crypto";

export const BUSINESS_RESERVE_HANDOFF_COOKIE = "theouthaven_business_reserve_handoff";
const TOKEN_VERSION = 1;
const DEFAULT_TTL_SECONDS = 5 * 60;

export type BusinessReserveHandoffPayload = {
  v: number;
  userId: string;
  email: string | null;
  locationId: string;
  exp: number;
};

function secret() {
  const value = String(
    process.env.BUSINESS_RESERVE_HANDOFF_SECRET ||
      process.env.WORKER_INTERNAL_SECRET ||
      "",
  ).trim();
  if (!value) throw new Error("BUSINESS_RESERVE_HANDOFF_SECRET_MISSING");
  return value;
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signature(body: string) {
  return crypto.createHmac("sha256", secret()).update(body).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export function signBusinessReserveHandoff(
  input: Omit<BusinessReserveHandoffPayload, "v" | "exp">,
  ttlSeconds = DEFAULT_TTL_SECONDS,
) {
  const payload: BusinessReserveHandoffPayload = {
    v: TOKEN_VERSION,
    ...input,
    exp: Math.floor(Date.now() / 1000) + Math.max(60, ttlSeconds),
  };
  const body = encode(JSON.stringify(payload));
  return `${body}.${signature(body)}`;
}

export function verifyBusinessReserveHandoff(token: string | null | undefined) {
  const raw = String(token || "").trim();
  const [body, suppliedSignature, extra] = raw.split(".");
  if (!body || !suppliedSignature || extra || !safeEqual(signature(body), suppliedSignature)) return null;

  try {
    const payload = JSON.parse(decode(body)) as BusinessReserveHandoffPayload;
    if (
      payload.v !== TOKEN_VERSION ||
      !payload.userId ||
      !payload.locationId ||
      !Number.isFinite(payload.exp) ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
