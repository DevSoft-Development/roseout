import crypto from "crypto";

export function generatePasswordInviteToken() {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
  return { rawToken, tokenHash };
}

export function hashPasswordInviteToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
