import crypto from "crypto";

export const PASSWORD_SETUP_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
export const PASSWORD_SETUP_RESEND_COOLDOWN_MS = 5 * 60 * 1000;

export function createPasswordSetupToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashPasswordSetupToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function getPasswordSetupExpiry() {
  return new Date(Date.now() + PASSWORD_SETUP_TOKEN_TTL_MS).toISOString();
}

export function isPasswordSetupExpired(expiresAt: string) {
  const expiryTime = new Date(expiresAt).getTime();
  return Number.isNaN(expiryTime) || expiryTime <= Date.now();
}

export function formatPasswordSetupExpiry(expiresAt: string) {
  const date = new Date(expiresAt);

  if (Number.isNaN(date.getTime())) {
    return "2 hours from when this email was sent";
  }

  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZoneName: "short",
  })
    .format(date)
    .replace(",", "");
}

export function normalizeInviteRole(role?: string | null) {
  const value = String(role || "user")
    .toLowerCase()
    .replace(/[_-]/g, " ");

  if (value.includes("super") || value.includes("admin")) return "admin";
  if (
    value.includes("owner") ||
    value.includes("location") ||
    value.includes("business")
  ) {
    return "location_owner";
  }

  return "user";
}
