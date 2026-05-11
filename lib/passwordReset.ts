import crypto from "crypto";

export const PASSWORD_RESET_PUBLIC_MESSAGE =
  "If an account exists, we sent a reset link.";

export const PASSWORD_RESET_TOKEN_BYTES = 64;
export const PASSWORD_RESET_TOKEN_HEX_LENGTH = PASSWORD_RESET_TOKEN_BYTES * 2;
export const PASSWORD_RESET_EXPIRY_MINUTES = 30;
export const PASSWORD_RESET_ACCOUNT_ATTEMPTS_PER_HOUR = 5;
export const PASSWORD_RESET_IP_ATTEMPTS_PER_HOUR = 20;

export function normalizeResetEmail(email: unknown) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function generatePasswordResetToken() {
  return crypto.randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString("hex");
}

export function hashPasswordResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function getPasswordResetExpiresAt() {
  return new Date(
    Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000
  ).toISOString();
}

export function isValidPasswordResetToken(token: unknown) {
  return (
    typeof token === "string" &&
    token.length === PASSWORD_RESET_TOKEN_HEX_LENGTH &&
    /^[a-f0-9]+$/i.test(token)
  );
}

export function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return realIp || "unknown";
}
