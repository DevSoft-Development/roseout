import crypto from "crypto";

function base64Url(bytes: Buffer) {
  return bytes.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function createSecureToken(byteLength = 32) {
  return base64Url(crypto.randomBytes(byteLength));
}

export function generatePlanAccessToken() {
  return `plan_${createSecureToken(32)}`;
}

export function generateConfirmToken() {
  return `confirm_${createSecureToken(32)}`;
}

export function generateReviewToken() {
  return `review_${createSecureToken(32)}`;
}

// TODO: migrate persisted tokens to hashed-at-rest values before long-term launch.
