import "server-only";

import { createHash, randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

export type AuthEmailTokenPurpose = "signup_verify" | "password_reset" | "password_setup";
const PURPOSES = new Set<AuthEmailTokenPurpose>(["signup_verify", "password_reset", "password_setup"]);

export function normalizeAuthEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export function hashAuthEmailToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function assertPurpose(purpose: string): asserts purpose is AuthEmailTokenPurpose {
  if (!PURPOSES.has(purpose as AuthEmailTokenPurpose)) throw new Error("Unsupported auth email token purpose.");
}

function requestMeta(request?: Request) {
  if (!request) return {};
  return {
    ip_address: request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    user_agent: request.headers.get("user-agent") || null,
  };
}

export async function createAuthEmailToken(input: { email: string; userId?: string | null; purpose: AuthEmailTokenPurpose; metadata?: Record<string, unknown>; expiresInMinutes: number; createdBy?: string | null; request?: Request }) {
  assertPurpose(input.purpose);
  const email = normalizeAuthEmail(input.email);
  if (!email) throw new Error("Email is required.");
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashAuthEmailToken(token);
  const expiresAt = new Date(Date.now() + Math.max(1, input.expiresInMinutes) * 60 * 1000).toISOString();
  const meta = requestMeta(input.request);
  await supabaseAdmin.from("auth_email_tokens").update({ used_at: new Date().toISOString() }).eq("email", email).eq("purpose", input.purpose).is("used_at", null);
  const { error } = await supabaseAdmin.from("auth_email_tokens").insert({
    user_id: input.userId || null,
    email,
    token_hash: tokenHash,
    purpose: input.purpose,
    metadata: input.metadata || {},
    expires_at: expiresAt,
    created_by: input.createdBy || null,
    ...meta,
  });
  if (error) throw new Error(error.message);
  return { token, expiresAt };
}

export async function verifyAuthEmailToken(input: { token: string; purpose: AuthEmailTokenPurpose }) {
  assertPurpose(input.purpose);
  const tokenHash = hashAuthEmailToken(String(input.token || ""));
  if (!tokenHash) return { valid: false as const, error: "missing_token" };
  const { data, error } = await supabaseAdmin.from("auth_email_tokens").select("*").eq("token_hash", tokenHash).eq("purpose", input.purpose).maybeSingle();
  if (error || !data) return { valid: false as const, error: "invalid_token" };
  if (data.used_at) return { valid: false as const, error: "used_token", token: data };
  if (new Date(data.expires_at).getTime() <= Date.now()) return { valid: false as const, error: "expired_token", token: data };
  return { valid: true as const, token: data };
}

export async function consumeAuthEmailToken(input: { token: string; purpose: AuthEmailTokenPurpose }) {
  const verified = await verifyAuthEmailToken(input);
  if (!verified.valid) return verified;
  const usedAt = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from("auth_email_tokens").update({ used_at: usedAt }).eq("id", verified.token.id).is("used_at", null).select("*").single();
  if (error || !data) return { valid: false as const, error: "consume_failed" };
  return { valid: true as const, token: data };
}
