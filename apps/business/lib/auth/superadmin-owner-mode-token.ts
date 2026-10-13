import "server-only";
import crypto from "node:crypto";

const TTL_SECONDS = 30 * 60;
const VERSION = 1;

type Payload = { v: number; actorId: string; locationId: string; exp: number };
function signingKey() {
  const key = process.env.ADMIN_BUSINESS_DEMO_HANDOFF_SECRET || process.env.WORKER_INTERNAL_SECRET;
  if (!key || key.length < 32) throw new Error("OWNER_MODE_SIGNING_KEY_UNAVAILABLE");
  return key;
}
function mac(encoded: string) {
  return crypto.createHmac("sha256", signingKey()).update(encoded).digest("base64url");
}
export function issueSuperadminOwnerModeToken(actorId: string, locationId: string, now = Date.now()) {
  const payload: Payload = { v: VERSION, actorId, locationId, exp: Math.floor(now / 1000) + TTL_SECONDS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${mac(encoded)}`;
}
export function verifySuperadminOwnerModeToken(token: string | undefined, actorId: string, now = Date.now()): string | null {
  if (!token || token.length > 3000) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = Buffer.from(mac(parts[0]));
  const actual = Buffer.from(parts[1]);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as Payload;
    if (p.v !== VERSION || p.actorId !== actorId || typeof p.locationId !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(p.locationId) ||
        !Number.isSafeInteger(p.exp) || p.exp <= Math.floor(now / 1000) ||
        p.exp > Math.floor(now / 1000) + TTL_SECONDS) return null;
    return p.locationId;
  } catch { return null; }
}
