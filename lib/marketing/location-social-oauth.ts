import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import {
  completeSocialOauth,
  socialAuthorizeUrl,
  socialOauthConfigured,
  type SocialProvider,
} from "./social-oauth";

export type LocationSocialProvider = Exclude<SocialProvider, "instagram">;

type LocationSocialOauthState = {
  provider: LocationSocialProvider;
  userId: string;
  locationId: string;
  issuedAt: number;
  returnTo: string;
};

function stateSecret() {
  const secret = process.env.SOCIAL_OAUTH_STATE_SECRET || process.env.SOCIAL_TOKEN_ENCRYPTION_KEY || "";
  if (!secret) throw new Error("SOCIAL_OAUTH_STATE_SECRET is not configured.");
  return secret;
}

function sign(value: string) {
  return createHmac("sha256", stateSecret()).update(value).digest("base64url");
}

function safeReturnTo(value: unknown, locationId: string) {
  const raw = String(value || "").trim();
  if (raw.startsWith("/locations/dashboard/")) return raw;
  return `/locations/dashboard/social-accounts?locationId=${encodeURIComponent(locationId)}`;
}

export function isLocationSocialProvider(value: unknown): value is LocationSocialProvider {
  return value === "facebook" || value === "tiktok" || value === "youtube";
}

export function locationSocialConfigured(provider: LocationSocialProvider) {
  return socialOauthConfigured(provider);
}

export function createLocationSocialOauthState(input: {
  provider: LocationSocialProvider;
  userId: string;
  locationId: string;
  returnTo?: string | null;
}) {
  const payload = Buffer.from(JSON.stringify({
    provider: input.provider,
    userId: input.userId,
    locationId: input.locationId,
    issuedAt: Date.now(),
    returnTo: safeReturnTo(input.returnTo, input.locationId),
  } satisfies LocationSocialOauthState)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyLocationSocialOauthState(value: string, provider: LocationSocialProvider) {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) throw new Error("Invalid social OAuth state.");
  const expected = sign(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    throw new Error("Invalid social OAuth state signature.");
  }
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as LocationSocialOauthState;
  if (parsed.provider !== provider) throw new Error("Social OAuth provider mismatch.");
  if (!parsed.userId || !parsed.locationId || !parsed.issuedAt) throw new Error("Invalid social OAuth state payload.");
  if (Date.now() - parsed.issuedAt > 20 * 60 * 1000) throw new Error("Social OAuth session expired. Please connect again.");
  parsed.returnTo = safeReturnTo(parsed.returnTo, parsed.locationId);
  return parsed;
}

export function locationSocialAuthorizeUrl(input: {
  provider: LocationSocialProvider;
  state: string;
  redirectUri: string;
}) {
  if (!locationSocialConfigured(input.provider)) {
    throw new Error(`${input.provider} OAuth is not configured.`);
  }
  return socialAuthorizeUrl(input.provider, input.state, input.redirectUri);
}

export async function completeLocationSocialOauth(input: {
  provider: LocationSocialProvider;
  code: string;
  userId: string;
  locationId: string;
  redirectUri: string;
}) {
  return completeSocialOauth(input.provider, input.code, input.userId, {
    redirectUri: input.redirectUri,
    scope: "location",
    locationId: input.locationId,
  });
}
