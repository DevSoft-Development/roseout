import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const PASSWORD_SETUP_TOKEN_TTL_MS = 2 * 60 * 60 * 1000;
export const PASSWORD_SETUP_RESEND_COOLDOWN_MS = 5 * 60 * 1000;
export const PASSWORD_SETUP_PURPOSE = "create_password";

export function createPasswordSetupToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashPasswordSetupToken(token: string) {
  return crypto.createHash("sha256").update(token.trim()).digest("hex");
}

export function getPasswordSetupExpiry() {
  return new Date(Date.now() + PASSWORD_SETUP_TOKEN_TTL_MS).toISOString();
}

export function isPasswordSetupExpired(expiresAt: string) {
  const expiresMs = new Date(expiresAt).getTime();
  return Number.isNaN(expiresMs) || expiresMs <= Date.now();
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
  }).format(date).replace(",", "");
}

export function normalizePasswordSetupRole(role?: string | null) {
  const value = String(role || "user").toLowerCase().replace(/[_-]/g, " ");

  if (value.includes("super") || value.includes("admin")) return "admin";
  if (value.includes("owner") || value.includes("location") || value.includes("business")) {
    return "location_owner";
  }

  return "user";
}

export function getPublicSiteUrl() {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.SITE_URL ||
    "https://theouthaven.com";

  return siteUrl.replace(/\/$/, "");
}

export function buildPasswordSetupUrl(rawToken: string) {
  return `${getPublicSiteUrl()}/auth/create-password?token=${encodeURIComponent(rawToken.trim())}`;
}

export async function findPasswordSetupToken(rawToken: string) {
  const token = rawToken.trim();
  const tokenHash = hashPasswordSetupToken(token);

  const hashLookup = await supabaseAdmin
    .from("password_setup_tokens")
    .select("id,user_id,email,role,purpose,expires_at,used_at,created_at")
    .eq("token_hash", tokenHash)
    .eq("purpose", PASSWORD_SETUP_PURPOSE)
    .maybeSingle();

  if (hashLookup.data || hashLookup.error?.code !== "PGRST204") {
    return { ...hashLookup, tokenHash, source: "token_hash" as const };
  }

  const rawFallback = await supabaseAdmin
    .from("password_setup_tokens")
    .select("id,user_id,email,role,purpose,expires_at,used_at,created_at")
    .eq("token", token)
    .eq("purpose", PASSWORD_SETUP_PURPOSE)
    .maybeSingle();

  return { ...rawFallback, tokenHash, source: "token" as const };
}
