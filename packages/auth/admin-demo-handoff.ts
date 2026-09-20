import "server-only";

import crypto from "node:crypto";

export const ADMIN_DEMO_HANDOFF_COOKIE = "theouthaven_admin_demo_handoff";
const TOKEN_VERSION = 1;
const DEFAULT_TTL_SECONDS = 15 * 60;

export type AdminDemoHandoffPayload = {
  v: number;
  userId: string;
  role: string;
  locationId: string;
  type: "restaurant" | "activity";
  exp: number;
};

function secret() {
  const value = String(
    process.env.ADMIN_BUSINESS_DEMO_HANDOFF_SECRET ||
      process.env.WORKER_INTERNAL_SECRET ||
      "",
  ).trim();
  if (!value) throw new Error("ADMIN_DEMO_HANDOFF_SECRET_MISSING");
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

export function signAdminDemoHandoff(
  input: Omit<AdminDemoHandoffPayload, "v" | "exp">,
  ttlSeconds = DEFAULT_TTL_SECONDS,
) {
  const payload: AdminDemoHandoffPayload = {
    v: TOKEN_VERSION,
    ...input,
    exp: Math.floor(Date.now() / 1000) + Math.max(60, ttlSeconds),
  };
  const body = encode(JSON.stringify(payload));
  return `${body}.${signature(body)}`;
}

export function verifyAdminDemoHandoff(token: string | null | undefined) {
  const raw = String(token || "").trim();
  const [body, suppliedSignature, extra] = raw.split(".");
  if (!body || !suppliedSignature || extra || !safeEqual(signature(body), suppliedSignature)) return null;

  try {
    const payload = JSON.parse(decode(body)) as AdminDemoHandoffPayload;
    if (
      payload.v !== TOKEN_VERSION ||
      !payload.userId ||
      !payload.role ||
      !payload.locationId ||
      !["restaurant", "activity"].includes(payload.type) ||
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
