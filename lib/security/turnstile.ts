import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { TurnstileVerifyResult } from "@/types/beta";

type VerifyInput = { token: string | null | undefined; remoteIp?: string | null; expectedAction?: string; source?: string; metadata?: Record<string, unknown> };
type BypassInput = { isAuthenticated?: boolean; isAdmin?: boolean; isBetaTester?: boolean };

export function isTurnstileEnabled() { return String(process.env.TURNSTILE_ENABLED ?? "true").toLowerCase() !== "false"; }
export function getTurnstileSiteKey() { return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""; }
export function shouldBypassTurnstileForUser(input: BypassInput) {
  if (input.isAdmin && String(process.env.TURNSTILE_BYPASS_FOR_ADMIN ?? "true").toLowerCase() === "true") return true;
  if ((input.isAuthenticated || input.isBetaTester) && String(process.env.TURNSTILE_BYPASS_FOR_AUTHENTICATED ?? "true").toLowerCase() === "true") return true;
  return false;
}

async function logTurnstile(input: { source?: string; action?: string | null; hostname?: string | null; remoteIp?: string | null; success: boolean; errorCodes?: string[]; challengeTs?: string | null; metadata?: Record<string, unknown> }) {
  try {
    await supabaseAdmin.from("turnstile_verification_logs").insert({
      source: input.source || "unknown",
      action: input.action ?? null,
      hostname: input.hostname ?? null,
      remote_ip: input.remoteIp ?? null,
      success: input.success,
      error_codes: input.errorCodes ?? [],
      challenge_ts: input.challengeTs ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    if (process.env.NODE_ENV === "development") console.warn("Turnstile log insert failed", error);
  }
}

export async function verifyTurnstileToken(input: VerifyInput): Promise<TurnstileVerifyResult> {
  if (!isTurnstileEnabled()) return { success: true, bypassed: true, bypassReason: "turnstile_disabled" };
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      await logTurnstile({ source: input.source, remoteIp: input.remoteIp, success: false, errorCodes: ["missing_secret"], metadata: input.metadata });
      return { success: false, errorCodes: ["missing_secret"] };
    }
    return { success: true, bypassed: true, bypassReason: "missing_secret_development" };
  }
  const token = input.token?.trim();
  if (!token) {
    await logTurnstile({ source: input.source, remoteIp: input.remoteIp, success: false, errorCodes: ["missing_token"], metadata: input.metadata });
    return { success: false, errorCodes: ["missing_token"] };
  }
  try {
    const form = new FormData();
    form.set("secret", secret);
    form.set("response", token);
    if (input.remoteIp) form.set("remoteip", input.remoteIp);
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const json = (await response.json().catch(() => ({}))) as { success?: boolean; challenge_ts?: string; hostname?: string; action?: string; cdata?: string; "error-codes"?: string[] };
    const actionMismatch = Boolean(input.expectedAction && json.action && json.action !== input.expectedAction);
    const success = Boolean(json.success) && !actionMismatch;
    const errorCodes = [...(json["error-codes"] ?? []), ...(actionMismatch ? ["action_mismatch"] : [])];
    await logTurnstile({ source: input.source, action: json.action, hostname: json.hostname, remoteIp: input.remoteIp, success, errorCodes, challengeTs: json.challenge_ts, metadata: { ...(input.metadata ?? {}), expectedAction: input.expectedAction, cdata: json.cdata } });
    return { success, action: json.action, hostname: json.hostname, challengeTs: json.challenge_ts, errorCodes };
  } catch {
    await logTurnstile({ source: input.source, remoteIp: input.remoteIp, success: false, errorCodes: ["verification_request_failed"], metadata: input.metadata });
    return { success: false, errorCodes: ["verification_request_failed"] };
  }
}

export const TURNSTILE_FRIENDLY_MESSAGES = {
  missing: "Please complete the quick verification before submitting.",
  failed: "We could not verify this request. Please refresh the page and try again.",
  config: "We could not submit this form right now. Please try again in a moment.",
} as const;

export function getClientIpHash(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("cf-connecting-ip") || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`${ip}:${process.env.IP_HASH_SALT || "theouthaven"}`).digest("hex");
}

export async function requireTurnstile({ request, token, action }: { request: Request; token?: string | null; action?: string }) {
  if (!token?.trim()) return { success: false, error: TURNSTILE_FRIENDLY_MESSAGES.missing, status: 400 } as const;
  const remoteIp = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const result = await verifyTurnstileToken({ token, remoteIp, expectedAction: action, source: action || "growth_pro_public_form" });
  if (!result.success) {
    const configError = result.errorCodes?.includes("missing_secret") || result.errorCodes?.includes("verification_request_failed");
    return { success: false, error: configError ? TURNSTILE_FRIENDLY_MESSAGES.config : TURNSTILE_FRIENDLY_MESSAGES.failed, status: 400 } as const;
  }
  return { success: true, ipHash: getClientIpHash(request) } as const;
}
